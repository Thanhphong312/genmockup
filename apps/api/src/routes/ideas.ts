import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { prisma } from '../services/db.js';
import { saveFile, deleteFile, extFromMime } from '../services/storage.js';
import { analyzeAndIdeate, generateIdeaImage, generateListingTitle, type TrademarkMode } from '../services/openai.js';
import { ideaGenerationToDto, ideaImageToDto } from '../services/dto.js';
import { requireUserId } from '../services/auth.js';
import { isIdeasEnabled } from '../services/settings.js';

/**
 * Chạy nền: phân tích + sinh N ảnh SONG SONG. Lưu từng ảnh khi xong.
 * Không throw ra ngoài (tự cập nhật status/error của generation).
 */
async function processIdeaGeneration(
  app: FastifyInstance,
  ownerId: string,
  genId: string,
  buffer: Buffer,
  mime: string,
  title: string,
  keyword: string,
  count: number,
  trademark: TrademarkMode,
): Promise<void> {
  try {
    const { analysis, ideas } = await analyzeAndIdeate({ userId: ownerId, imageBuffer: buffer, mime, title, keyword, n: count, trademark });
    await prisma.ideaGeneration.update({ where: { id: genId }, data: { analysis } });

    const results = await Promise.allSettled(
      ideas.map(async (idea) => {
        const imgBuf = await generateIdeaImage({ userId: ownerId, sourceBuffer: buffer, mime, prompt: idea.prompt, trademark });
        const meta = await sharp(imgBuf).metadata();
        const saved = await saveFile(imgBuf, `ideas/gen/${genId}`, 'png');
        await prisma.ideaImage.create({
          data: {
            ownerId,
            generationId: genId,
            filePath: saved.relativePath,
            prompt: idea.prompt,
            ideaTitle: idea.title,
            sellingPoints: idea.sellingPoints ?? null,
            keyword: keyword || null,
            title: idea.listingTitle ?? null,
            width: meta.width ?? 0,
            height: meta.height ?? 0,
            saved: false,
          },
        });
      }),
    );

    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const firstErr = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
    if (ok === 0) {
      throw firstErr?.reason ?? new Error('all_image_gen_failed');
    }
    await prisma.ideaGeneration.update({
      where: { id: genId },
      data: {
        status: 'done',
        error: firstErr ? `partial: ${ok}/${ideas.length} ảnh; lỗi: ${firstErr.reason?.message || firstErr.reason}` : null,
      },
    });
  } catch (err: any) {
    app.log.error({ err, genId }, 'idea_generation_failed');
    await prisma.ideaGeneration
      .update({ where: { id: genId }, data: { status: 'error', error: err?.message || String(err) } })
      .catch(() => {});
  }
}

export async function ideasRoutes(app: FastifyInstance) {
  // Tạo ý tưởng: trả về NGAY (status pending), xử lý nền + poll để tránh timeout tunnel.
  app.post(
    '/api/ideas/generate',
    { schema: { tags: ['Ideas'], summary: 'Bắt đầu tạo ý tưởng (async)', consumes: ['multipart/form-data'] } },
    async (req, reply) => {
      const ownerId = requireUserId(req);
      if (!isIdeasEnabled()) {
        return reply
          .code(423)
          .send({ error: 'ideas_disabled', message: 'Tính năng phân tích & tạo ý tưởng đang tạm khóa.' });
      }
      let buffer: Buffer | null = null;
      let mime = 'image/png';
      let title = '';
      let keyword = '';
      let count = 4;
      let trademark: TrademarkMode = 'avoid';

      const parts = req.parts();
      for await (const part of parts) {
        if (part.type === 'file' && part.fieldname === 'sourceImage') {
          buffer = await part.toBuffer();
          mime = part.mimetype || mime;
        } else if (part.type === 'field') {
          const v = String(part.value);
          if (part.fieldname === 'title') title = v;
          else if (part.fieldname === 'keyword') keyword = v;
          else if (part.fieldname === 'count') count = parseInt(v, 10) || 4;
          else if (part.fieldname === 'trademark') {
            trademark = v === 'keep' || v === 'default' ? v : 'avoid';
          }
        }
      }

      if (!buffer) return reply.code(400).send({ error: 'missing_source_image' });
      if (!title.trim() && !keyword.trim()) {
        return reply.code(400).send({ error: 'missing_title_keyword' });
      }

      const savedSource = await saveFile(buffer, `ideas/source/${ownerId}`, extFromMime(mime));
      const generation = await prisma.ideaGeneration.create({
        data: {
          ownerId,
          title: title || '(no title)',
          keyword: keyword || '',
          sourceImagePath: savedSource.relativePath,
          status: 'pending',
        },
      });

      // Fire-and-forget (buffer đã nằm trong RAM, an toàn dùng sau khi response)
      void processIdeaGeneration(app, ownerId, generation.id, buffer, mime, title, keyword, count, trademark);

      return reply.code(202).send({ id: generation.id, status: 'pending' });
    },
  );

  // Poll trạng thái + ảnh đã sinh
  app.get(
    '/api/ideas/generations/:id',
    { schema: { tags: ['Ideas'], summary: 'Trạng thái tạo ý tưởng' } },
    async (req, reply) => {
      const ownerId = requireUserId(req);
      const { id } = req.params as { id: string };
      const g = await prisma.ideaGeneration.findFirst({
        where: { id, ownerId },
        include: { images: { orderBy: { createdAt: 'asc' } } },
      });
      if (!g) return reply.code(404).send({ error: 'not_found' });
      return ideaGenerationToDto(g);
    },
  );

  // Lưu các ảnh được chọn; xoá các ảnh còn lại của cùng generation
  app.post('/api/ideas/save', { schema: { tags: ['Ideas'], summary: 'Lưu ảnh ý tưởng đã chọn' } }, async (req, reply) => {
    const ownerId = requireUserId(req);
    const body = (req.body || {}) as { imageIds?: string[] };
    const imageIds = body.imageIds || [];
    if (!imageIds.length) return reply.code(400).send({ error: 'missing_image_ids' });

    const chosen = await prisma.ideaImage.findMany({ where: { id: { in: imageIds }, ownerId } });
    if (!chosen.length) return reply.code(404).send({ error: 'not_found' });
    const chosenIds = chosen.map((c) => c.id);

    // Xoá các ảnh chưa lưu khác cùng generation (không được chọn), chỉ của user
    const genIds = [...new Set(chosen.map((c) => c.generationId).filter(Boolean))] as string[];
    if (genIds.length) {
      const others = await prisma.ideaImage.findMany({
        where: { ownerId, generationId: { in: genIds }, saved: false, id: { notIn: chosenIds } },
      });
      for (const o of others) await deleteFile(o.filePath);
      await prisma.ideaImage.deleteMany({
        where: { ownerId, generationId: { in: genIds }, saved: false, id: { notIn: chosenIds } },
      });
    }

    await prisma.ideaImage.updateMany({ where: { id: { in: chosenIds } }, data: { saved: true } });
    const saved = await prisma.ideaImage.findMany({
      where: { id: { in: chosenIds } },
      orderBy: { createdAt: 'desc' },
    });
    return saved.map(ideaImageToDto);
  });

  // Import 1 ảnh ngoài (vd từ ChatGPT qua Chrome extension) thẳng vào thư viện ý tưởng (saved=true).
  // Không phụ thuộc FEATURE_IDEAS vì chỉ lưu ảnh, không gọi OpenAI.
  app.post('/api/ideas/import', { schema: { tags: ['Ideas'], summary: 'Import ảnh ngoài vào thư viện ý tưởng' } }, async (req, reply) => {
    const ownerId = requireUserId(req);

    let buffer: Buffer | null = null;
    let mime = 'image/png';
    let title = '';
    let keyword = '';
    let ideaTitle: string | null = null;
    let prompt: string | null = null;

    const ct = String(req.headers['content-type'] || '');
    if (ct.includes('multipart/form-data')) {
      for await (const part of req.parts()) {
        if (part.type === 'file' && ['image', 'sourceImage', 'file'].includes(part.fieldname)) {
          buffer = await part.toBuffer();
          mime = part.mimetype || mime;
        } else if (part.type === 'field') {
          const v = String(part.value);
          if (part.fieldname === 'title') title = v;
          else if (part.fieldname === 'keyword') keyword = v;
          else if (part.fieldname === 'ideaTitle') ideaTitle = v || null;
          else if (part.fieldname === 'prompt') prompt = v || null;
        }
      }
    } else {
      const body = (req.body || {}) as {
        imageUrl?: string;
        imageBase64?: string;
        title?: string;
        keyword?: string;
        ideaTitle?: string;
        prompt?: string;
      };
      title = body.title || '';
      keyword = body.keyword || '';
      ideaTitle = body.ideaTitle || null;
      prompt = body.prompt || null;

      if (body.imageBase64) {
        const m = /^data:([^;]+);base64,(.*)$/s.exec(body.imageBase64.trim());
        if (m) {
          mime = m[1];
          buffer = Buffer.from(m[2], 'base64');
        } else {
          buffer = Buffer.from(body.imageBase64, 'base64');
        }
      } else if (body.imageUrl) {
        const r = await fetch(body.imageUrl);
        if (!r.ok) return reply.code(400).send({ error: 'fetch_image_failed', message: `HTTP ${r.status}` });
        mime = r.headers.get('content-type') || mime;
        buffer = Buffer.from(await r.arrayBuffer());
      }
    }

    if (!buffer || !buffer.length) return reply.code(400).send({ error: 'missing_image' });

    let meta: sharp.Metadata;
    try {
      meta = await sharp(buffer).metadata();
    } catch {
      return reply.code(400).send({ error: 'invalid_image' });
    }
    if (!meta.width || !meta.height) return reply.code(400).send({ error: 'invalid_image' });

    const saved = await saveFile(buffer, `ideas/imported/${ownerId}`, extFromMime(mime));
    const img = await prisma.ideaImage.create({
      data: {
        ownerId,
        generationId: null,
        filePath: saved.relativePath,
        prompt,
        ideaTitle,
        sellingPoints: null,
        keyword: keyword || null,
        title: title || null,
        width: meta.width,
        height: meta.height,
        saved: true,
      },
    });
    return reply.code(201).send(ideaImageToDto(img));
  });

  app.get('/api/ideas', { schema: { tags: ['Ideas'], summary: 'Thư viện ảnh ý tưởng đã lưu' } }, async (req) => {
    const ownerId = requireUserId(req);
    const list = await prisma.ideaImage.findMany({
      where: { ownerId, saved: true },
      orderBy: { createdAt: 'desc' },
    });
    return list.map(ideaImageToDto);
  });

  // Gen title đăng bán cho 1 ảnh ý tưởng theo template + keyword
  app.post('/api/ideas/:id/title', { schema: { tags: ['Ideas'], summary: 'Gen title theo template + keyword' } }, async (req, reply) => {
    const ownerId = requireUserId(req);
    const { id } = req.params as { id: string };
    const body = (req.body || {}) as { template?: string; keyword?: string };
    const img = await prisma.ideaImage.findFirst({ where: { id, ownerId } });
    if (!img) return reply.code(404).send({ error: 'not_found' });

    const context = [img.ideaTitle, img.sellingPoints, img.prompt].filter(Boolean).join(' — ').slice(0, 1500);
    try {
      const title = await generateListingTitle({
        userId: ownerId,
        context,
        template: body.template,
        keyword: body.keyword,
      });
      const updated = await prisma.ideaImage.update({ where: { id }, data: { title } });
      return ideaImageToDto(updated);
    } catch (err: any) {
      app.log.error(err);
      return reply.code(500).send({ error: 'title_failed', message: err?.message || String(err) });
    }
  });

  app.delete('/api/ideas/:id', { schema: { tags: ['Ideas'], summary: 'Xoá ảnh ý tưởng' } }, async (req, reply) => {
    const ownerId = requireUserId(req);
    const { id } = req.params as { id: string };
    const img = await prisma.ideaImage.findFirst({ where: { id, ownerId } });
    if (!img) return reply.code(404).send({ error: 'not_found' });
    await deleteFile(img.filePath);
    await prisma.ideaImage.delete({ where: { id } });
    return { ok: true };
  });
}
