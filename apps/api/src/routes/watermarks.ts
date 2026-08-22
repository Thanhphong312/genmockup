import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { prisma } from '../services/db.js';
import { saveFile, deleteFile, extFromMime } from '../services/storage.js';
import { watermarkToDto } from '../services/dto.js';
import { getSession, requireUserId } from '../services/auth.js';

export async function watermarksRoutes(app: FastifyInstance) {
  app.get(
    '/api/watermarks',
    { schema: { tags: ['Watermarks'], summary: 'List watermark (admin thêm ?all=1 để xem tất cả)' } },
    async (req) => {
      const ownerId = requireUserId(req);

      // ?all=1 (chỉ admin): xem watermark của mọi user để đổi chủ sở hữu — không sửa/xoá được.
      if (String((req.query as { all?: string })?.all ?? '') === '1' && getSession(req)?.role === 'admin') {
        const rows = await prisma.watermark.findMany({ orderBy: { createdAt: 'desc' } });
        const owners = await prisma.user.findMany({ select: { id: true, username: true } });
        const nameOf = (id: string | null) => owners.find((o) => o.id === id)?.username ?? null;
        return rows.map((w) => ({
          ...watermarkToDto(w),
          shared: w.ownerId !== ownerId,
          ownerName: nameOf(w.ownerId),
        }));
      }

      const list = await prisma.watermark.findMany({ where: { ownerId }, orderBy: { createdAt: 'desc' } });
      return list.map(watermarkToDto);
    },
  );

  app.get(
    '/api/watermarks/:id',
    { schema: { tags: ['Watermarks'], summary: 'Chi tiết watermark' } },
    async (req, reply) => {
      const ownerId = requireUserId(req);
      const { id } = req.params as { id: string };
      const w = await prisma.watermark.findFirst({ where: { id, ownerId } });
      if (!w) return reply.code(404).send({ error: 'not_found' });
      return watermarkToDto(w);
    },
  );

  app.post(
    '/api/watermarks',
    {
      schema: {
        tags: ['Watermarks'],
        summary: 'Upload watermark (multipart: file + name)',
        consumes: ['multipart/form-data'],
      },
    },
    async (req, reply) => {
    const ownerId = requireUserId(req);
    const parts = req.parts();
    let buffer: Buffer | null = null;
    let mime = 'image/png';
    let name = '';
    for await (const part of parts) {
      if (part.type === 'file') {
        buffer = await part.toBuffer();
        mime = part.mimetype || mime;
        if (!name) name = part.filename || 'watermark';
      } else if (part.type === 'field' && part.fieldname === 'name') {
        name = String(part.value);
      }
    }
    if (!buffer) return reply.code(400).send({ error: 'missing_file' });

    const meta = await sharp(buffer).metadata();
    if (!meta.width || !meta.height) {
      return reply.code(400).send({ error: 'invalid_image' });
    }

    const saved = await saveFile(buffer, 'watermarks', extFromMime(mime));
    const created = await prisma.watermark.create({
      data: {
        ownerId,
        name: name || 'Untitled watermark',
        filePath: saved.relativePath,
        width: meta.width,
        height: meta.height,
      },
    });
    return reply.code(201).send(watermarkToDto(created));
  });

  app.delete('/api/watermarks/:id', async (req, reply) => {
    const ownerId = requireUserId(req);
    const { id } = req.params as { id: string };
    const w = await prisma.watermark.findFirst({ where: { id, ownerId } });
    if (!w) return reply.code(404).send({ error: 'not_found' });
    await deleteFile(w.filePath);
    await prisma.watermark.delete({ where: { id } });
    return { ok: true };
  });
}
