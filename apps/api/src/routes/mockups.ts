import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { prisma } from '../services/db.js';
import { saveFile, deleteFile, extFromMime } from '../services/storage.js';
import { mockupToDto } from '../services/dto.js';
import { getSession, requireUserId } from '../services/auth.js';

interface AreaInput {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}

interface UpdateBody {
  name?: string;
  designArea?: AreaInput;
  watermarkArea?: AreaInput | null;
}

export async function mockupsRoutes(app: FastifyInstance) {
  app.get(
    '/api/mockups',
    { schema: { tags: ['Mockups'], summary: 'List mockup (của tôi + được chia sẻ; admin thêm ?all=1 để xem tất cả)' } },
    async (req) => {
      const uid = requireUserId(req);

      // ?all=1 (chỉ admin): xem mockup của mọi user để đổi chủ sở hữu. Item của người khác
      // vẫn đánh dấu shared ⇒ UI không cho sửa/xoá, đúng như quyền thật ở các route dưới.
      if (String((req.query as { all?: string })?.all ?? '') === '1' && getSession(req)?.role === 'admin') {
        const rows = await prisma.mockup.findMany({ orderBy: { createdAt: 'desc' } });
        const owners = await prisma.user.findMany({ select: { id: true, username: true } });
        const nameOf = (id: string | null) => owners.find((o) => o.id === id)?.username ?? null;
        return rows.map((m) => ({
          ...mockupToDto(m),
          shared: m.ownerId !== uid,
          ownerName: nameOf(m.ownerId),
        }));
      }

      const owned = await prisma.mockup.findMany({ where: { ownerId: uid }, orderBy: { createdAt: 'desc' } });

      const shares = await prisma.mockupShare.findMany({
        where: { userId: uid },
        include: { mockup: true },
        orderBy: { createdAt: 'desc' },
      });
      const sharedMockups = shares.map((s) => s.mockup).filter((m) => m && m.ownerId !== uid);
      const ownerIds = [...new Set(sharedMockups.map((m) => m.ownerId).filter(Boolean))] as string[];
      const owners = ownerIds.length
        ? await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, username: true } })
        : [];
      const ownerName = (id: string | null) => owners.find((o) => o.id === id)?.username ?? null;

      return [
        ...owned.map((m) => ({ ...mockupToDto(m), shared: false, ownerName: null as string | null })),
        ...sharedMockups.map((m) => ({ ...mockupToDto(m), shared: true, ownerName: ownerName(m.ownerId) })),
      ];
    },
  );

  app.get(
    '/api/mockups/:id',
    { schema: { tags: ['Mockups'], summary: 'Chi tiết 1 mockup (của tôi hoặc được chia sẻ)' } },
    async (req, reply) => {
      const uid = requireUserId(req);
      const { id } = req.params as { id: string };
      const m = await prisma.mockup.findFirst({
        where: { id, OR: [{ ownerId: uid }, { shares: { some: { userId: uid } } }] },
      });
      if (!m) return reply.code(404).send({ error: 'not_found' });
      const shared = m.ownerId !== uid;
      return { ...mockupToDto(m), shared };
    },
  );

  app.post('/api/mockups', { schema: { tags: ['Mockups'], summary: 'Upload mockup mới (multipart: file + name)', consumes: ['multipart/form-data'] } }, async (req, reply) => {
    const ownerId = requireUserId(req);
    let buffer: Buffer | null = null;
    let mime = 'image/png';
    let name = '';

    const ct = req.headers['content-type'] || '';
    if (ct.includes('multipart/form-data')) {
      const parts = req.parts();
      for await (const part of parts) {
        if (part.type === 'file') {
          buffer = await part.toBuffer();
          mime = part.mimetype || mime;
          if (!name) name = part.filename || 'mockup';
        } else if (part.type === 'field' && part.fieldname === 'name') {
          name = String(part.value);
        }
      }
    } else {
      // JSON { name, imageBase64 } — tránh multipart streaming (dễ đứt qua tunnel).
      const body = (req.body || {}) as { name?: string; imageBase64?: string };
      name = String(body.name || '');
      if (body.imageBase64) {
        const m = /^data:([^;]+);base64,(.*)$/s.exec(body.imageBase64);
        if (m) mime = m[1];
        buffer = Buffer.from(m ? m[2] : body.imageBase64, 'base64');
      }
    }
    if (!buffer || !buffer.length) return reply.code(400).send({ error: 'missing_file' });

    const meta = await sharp(buffer).metadata();
    if (!meta.width || !meta.height) {
      return reply.code(400).send({ error: 'invalid_image' });
    }

    const saved = await saveFile(buffer, 'mockups', extFromMime(mime));

    // designArea mặc định = full size; watermarkArea = null
    const created = await prisma.mockup.create({
      data: {
        ownerId,
        name: name || 'Untitled mockup',
        filePath: saved.relativePath,
        width: meta.width,
        height: meta.height,
        designX: 0,
        designY: 0,
        designWidth: meta.width,
        designHeight: meta.height,
        designRotation: 0,
      },
    });
    return reply.code(201).send(mockupToDto(created));
  });

  app.put(
    '/api/mockups/:id',
    {
      schema: {
        tags: ['Mockups'],
        summary: 'Cập nhật tên + designArea + watermarkArea',
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            designArea: {
              type: 'object',
              properties: {
                x: { type: 'number' },
                y: { type: 'number' },
                width: { type: 'number' },
                height: { type: 'number' },
                rotation: { type: 'number' },
              },
            },
            watermarkArea: {
              type: ['object', 'null'],
              properties: {
                x: { type: 'number' },
                y: { type: 'number' },
                width: { type: 'number' },
                height: { type: 'number' },
                rotation: { type: 'number' },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
    const ownerId = requireUserId(req);
    const { id } = req.params as { id: string };
    const body = req.body as UpdateBody;
    const existing = await prisma.mockup.findFirst({ where: { id, ownerId } });
    if (!existing) return reply.code(404).send({ error: 'not_found' });

    const data: any = {};
    if (body.name !== undefined) data.name = body.name;

    if (body.designArea) {
      data.designX = Math.round(body.designArea.x);
      data.designY = Math.round(body.designArea.y);
      data.designWidth = Math.round(body.designArea.width);
      data.designHeight = Math.round(body.designArea.height);
      data.designRotation = body.designArea.rotation ?? 0;
    }

    if (body.watermarkArea === null) {
      data.watermarkX = null;
      data.watermarkY = null;
      data.watermarkWidth = null;
      data.watermarkHeight = null;
      data.watermarkRotation = null;
    } else if (body.watermarkArea) {
      data.watermarkX = Math.round(body.watermarkArea.x);
      data.watermarkY = Math.round(body.watermarkArea.y);
      data.watermarkWidth = Math.round(body.watermarkArea.width);
      data.watermarkHeight = Math.round(body.watermarkArea.height);
      data.watermarkRotation = body.watermarkArea.rotation ?? 0;
    }

    const updated = await prisma.mockup.update({ where: { id }, data });
    return mockupToDto(updated);
  });

  app.post(
    '/api/mockups/:id/file',
    {
      schema: {
        tags: ['Mockups'],
        summary: 'Thay ảnh mockup (giữ designArea + watermarkArea)',
        consumes: ['multipart/form-data'],
      },
    },
    async (req, reply) => {
      const ownerId = requireUserId(req);
      const { id } = req.params as { id: string };
      const existing = await prisma.mockup.findFirst({ where: { id, ownerId } });
      if (!existing) return reply.code(404).send({ error: 'not_found' });

      const parts = req.parts();
      let buffer: Buffer | null = null;
      let mime = 'image/png';
      for await (const part of parts) {
        if (part.type === 'file') {
          buffer = await part.toBuffer();
          mime = part.mimetype || mime;
        }
      }
      if (!buffer) return reply.code(400).send({ error: 'missing_file' });

      const meta = await sharp(buffer).metadata();
      if (!meta.width || !meta.height) {
        return reply.code(400).send({ error: 'invalid_image' });
      }

      const saved = await saveFile(buffer, 'mockups', extFromMime(mime));

      // Xoá file cũ sau khi đã có file mới
      await deleteFile(existing.filePath);

      const updated = await prisma.mockup.update({
        where: { id },
        data: {
          filePath: saved.relativePath,
          width: meta.width,
          height: meta.height,
        },
      });
      return mockupToDto(updated);
    },
  );

  app.delete(
    '/api/mockups/:id',
    { schema: { tags: ['Mockups'], summary: 'Xoá mockup (cả file + DB row)' } },
    async (req, reply) => {
      const ownerId = requireUserId(req);
      const { id } = req.params as { id: string };
      const m = await prisma.mockup.findFirst({ where: { id, ownerId } });
      if (!m) return reply.code(404).send({ error: 'not_found' });
      await deleteFile(m.filePath);
      await prisma.mockup.delete({ where: { id } });
      return { ok: true };
    },
  );

  // ---- Chia sẻ quyền dùng mockup ----
  // Chỉ chủ sở hữu hoặc admin mới quản lý chia sẻ.
  async function loadManageable(req: any, reply: any, id: string) {
    const s = getSession(req);
    const m = await prisma.mockup.findUnique({ where: { id } });
    if (!m) {
      reply.code(404).send({ error: 'not_found' });
      return null;
    }
    if (m.ownerId !== s?.uid && s?.role !== 'admin') {
      reply.code(403).send({ error: 'forbidden' });
      return null;
    }
    return m;
  }

  app.get('/api/mockups/:id/shares', { schema: { tags: ['Mockups'], summary: 'Danh sách user được chia sẻ' } }, async (req, reply) => {
    requireUserId(req);
    const { id } = req.params as { id: string };
    if (!(await loadManageable(req, reply, id))) return;
    const shares = await prisma.mockupShare.findMany({ where: { mockupId: id } });
    const userIds = shares.map((s) => s.userId);
    const users = userIds.length
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true } })
      : [];
    return users;
  });

  app.post('/api/mockups/:id/shares', { schema: { tags: ['Mockups'], summary: 'Cấp quyền dùng cho 1 user' } }, async (req, reply) => {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const m = await loadManageable(req, reply, id);
    if (!m) return;
    const body = (req.body || {}) as { userId?: string };
    const userId = (body.userId || '').trim();
    if (!userId) return reply.code(400).send({ error: 'missing_user_id' });
    if (userId === m.ownerId) return reply.code(400).send({ error: 'cannot_share_with_owner' });
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) return reply.code(404).send({ error: 'user_not_found' });
    await prisma.mockupShare.upsert({
      where: { mockupId_userId: { mockupId: id, userId } },
      update: {},
      create: { mockupId: id, userId },
    });
    return { ok: true };
  });

  app.delete('/api/mockups/:id/shares/:userId', { schema: { tags: ['Mockups'], summary: 'Thu hồi quyền dùng' } }, async (req, reply) => {
    requireUserId(req);
    const { id, userId } = req.params as { id: string; userId: string };
    if (!(await loadManageable(req, reply, id))) return;
    await prisma.mockupShare.deleteMany({ where: { mockupId: id, userId } });
    return { ok: true };
  });
}
