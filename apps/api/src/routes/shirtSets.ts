import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import sharp from 'sharp';
import { prisma } from '../services/db.js';
import { deleteFile, saveFile, extFromMime } from '../services/storage.js';
import { shirtSetToDto } from '../services/dto.js';
import { scanShirtSets, defaultDesignArea } from '../services/shirtSets.js';
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
  representativeColor?: string;
  designArea?: AreaInput;
  watermarkArea?: AreaInput | null;
}

export async function shirtSetsRoutes(app: FastifyInstance) {
  app.post(
    '/api/shirt-sets/scan',
    { schema: { tags: ['ShirtSets'], summary: 'Quét mockup/shirt từ đĩa vào DB' } },
    async (req) => {
      const ownerId = requireUserId(req);
      const summary = await scanShirtSets(ownerId);
      const sets = await prisma.shirtSet.findMany({
        where: { ownerId },
        orderBy: { name: 'asc' },
        include: { variants: { orderBy: { color: 'asc' } } },
      });
      return { ...summary, sets: sets.map(shirtSetToDto) };
    },
  );

  app.get(
    '/api/shirt-sets',
    { schema: { tags: ['ShirtSets'], summary: 'List bộ áo (của tôi + được chia sẻ; admin thêm ?all=1 để xem tất cả)' } },
    async (req) => {
      const uid = requireUserId(req);

      // ?all=1 (chỉ admin): xem bộ áo của mọi user để đổi chủ sở hữu — xem thôi, không sửa được.
      if (String((req.query as { all?: string })?.all ?? '') === '1' && getSession(req)?.role === 'admin') {
        const rows = await prisma.shirtSet.findMany({
          orderBy: { name: 'asc' },
          include: { variants: { orderBy: { color: 'asc' } } },
        });
        const owners = await prisma.user.findMany({ select: { id: true, username: true } });
        const nameOf = (id: string | null) => owners.find((o) => o.id === id)?.username ?? null;
        return rows.map((s) => ({
          ...shirtSetToDto(s),
          shared: s.ownerId !== uid,
          ownerName: nameOf(s.ownerId),
        }));
      }

      const owned = await prisma.shirtSet.findMany({
        where: { ownerId: uid },
        orderBy: { name: 'asc' },
        include: { variants: { orderBy: { color: 'asc' } } },
      });

      const shares = await prisma.shirtSetShare.findMany({
        where: { userId: uid },
        include: { set: { include: { variants: { orderBy: { color: 'asc' } } } } },
        orderBy: { createdAt: 'desc' },
      });
      const sharedSets = shares.map((s) => s.set).filter((s) => s && s.ownerId !== uid);
      const ownerIds = [...new Set(sharedSets.map((s) => s.ownerId).filter(Boolean))] as string[];
      const owners = ownerIds.length
        ? await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, username: true } })
        : [];
      const ownerName = (id: string | null) => owners.find((o) => o.id === id)?.username ?? null;

      return [
        ...owned.map((s) => ({ ...shirtSetToDto(s), shared: false, ownerName: null as string | null })),
        ...sharedSets.map((s) => ({ ...shirtSetToDto(s), shared: true, ownerName: ownerName(s.ownerId) })),
      ];
    },
  );

  app.get(
    '/api/shirt-sets/:id',
    { schema: { tags: ['ShirtSets'], summary: 'Chi tiết bộ áo (của tôi hoặc được chia sẻ)' } },
    async (req, reply) => {
      const uid = requireUserId(req);
      const { id } = req.params as { id: string };
      const set = await prisma.shirtSet.findFirst({
        where: { id, OR: [{ ownerId: uid }, { shares: { some: { userId: uid } } }] },
        include: { variants: { orderBy: { color: 'asc' } } },
      });
      if (!set) return reply.code(404).send({ error: 'not_found' });
      return { ...shirtSetToDto(set), shared: set.ownerId !== uid };
    },
  );

  app.put(
    '/api/shirt-sets/:id',
    {
      schema: {
        tags: ['ShirtSets'],
        summary: 'Cập nhật tên + designArea + watermarkArea + representativeColor',
      },
    },
    async (req, reply) => {
      const ownerId = requireUserId(req);
      const { id } = req.params as { id: string };
      const body = req.body as UpdateBody;
      const existing = await prisma.shirtSet.findFirst({ where: { id, ownerId } });
      if (!existing) return reply.code(404).send({ error: 'not_found' });

      const data: any = {};
      if (body.name !== undefined) data.name = body.name;
      if (body.representativeColor !== undefined) {
        data.representativeColor = body.representativeColor;
      }

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

      const updated = await prisma.shirtSet.update({
        where: { id },
        data,
        include: { variants: { orderBy: { color: 'asc' } } },
      });
      return shirtSetToDto(updated);
    },
  );

  app.delete(
    '/api/shirt-sets/:id',
    { schema: { tags: ['ShirtSets'], summary: 'Xoá bộ áo (cả file + DB)' } },
    async (req, reply) => {
      const ownerId = requireUserId(req);
      const { id } = req.params as { id: string };
      const set = await prisma.shirtSet.findFirst({
        where: { id, ownerId },
        include: { variants: true },
      });
      if (!set) return reply.code(404).send({ error: 'not_found' });
      for (const v of set.variants) {
        await deleteFile(v.filePath);
      }
      await prisma.shirtSet.delete({ where: { id } });
      return { ok: true };
    },
  );

  // ---- Tạo bộ áo rỗng + upload từng variant màu (thay cho scan đĩa) ----
  app.post(
    '/api/shirt-sets',
    { schema: { tags: ['ShirtSets'], summary: 'Tạo bộ áo rỗng (chỉ tên) — upload variant sau' } },
    async (req, reply) => {
      const ownerId = requireUserId(req);
      const body = (req.body || {}) as { name?: string };
      const name = (body.name || '').trim();
      if (!name) return reply.code(400).send({ error: 'missing_name' });
      const dup = await prisma.shirtSet.findFirst({ where: { ownerId, name } });
      if (dup) return reply.code(409).send({ error: 'name_taken' });
      const set = await prisma.shirtSet.create({
        data: {
          ownerId,
          name,
          // Chưa có ảnh → designArea = 0, tự tính khi thêm variant đầu tiên.
          designX: 0,
          designY: 0,
          designWidth: 0,
          designHeight: 0,
          designRotation: 0,
        },
      });
      return reply.code(201).send(shirtSetToDto(set));
    },
  );

  app.post(
    '/api/shirt-sets/:id/variants',
    {
      schema: {
        tags: ['ShirtSets'],
        summary: 'Upload 1 variant màu (multipart: file + color)',
        consumes: ['multipart/form-data'],
      },
    },
    async (req, reply) => {
      const ownerId = requireUserId(req);
      const { id } = req.params as { id: string };
      const set = await prisma.shirtSet.findFirst({ where: { id, ownerId } });
      if (!set) return reply.code(404).send({ error: 'not_found' });

      let buffer: Buffer | null = null;
      let mime = 'image/png';
      let color = '';
      let fileBase = '';

      const ct = req.headers['content-type'] || '';
      if (ct.includes('multipart/form-data')) {
        const parts = req.parts();
        for await (const part of parts) {
          if (part.type === 'file') {
            buffer = await part.toBuffer();
            mime = part.mimetype || mime;
            fileBase = path.basename(part.filename || '', path.extname(part.filename || ''));
          } else if (part.type === 'field' && part.fieldname === 'color') {
            color = String(part.value).trim();
          }
        }
      } else {
        // JSON { color, imageBase64 } — tránh multipart streaming (dễ đứt qua tunnel).
        const body = (req.body || {}) as { color?: string; imageBase64?: string; filename?: string };
        color = (body.color || '').trim();
        fileBase = (body.filename || '').replace(/\.[^.]+$/, '');
        if (body.imageBase64) {
          const m = /^data:([^;]+);base64,(.*)$/s.exec(body.imageBase64);
          if (m) mime = m[1];
          buffer = Buffer.from(m ? m[2] : body.imageBase64, 'base64');
        }
      }
      if (!buffer || !buffer.length) return reply.code(400).send({ error: 'missing_file' });
      if (!color) color = fileBase || 'color';

      const meta = await sharp(buffer).metadata();
      if (!meta.width || !meta.height) return reply.code(400).send({ error: 'invalid_image' });

      const ext = extFromMime(mime);
      const saved = await saveFile(
        buffer,
        path.posix.join('shirtsets', ownerId, set.name),
        ext,
        `${color}.${ext}`,
      );

      // Upsert theo (setId,color): trùng màu → xoá file cũ, cập nhật.
      const existing = await prisma.shirtVariant.findUnique({
        where: { setId_color: { setId: set.id, color } },
      });
      if (existing) {
        if (existing.filePath !== saved.relativePath) await deleteFile(existing.filePath);
        await prisma.shirtVariant.update({
          where: { id: existing.id },
          data: { filePath: saved.relativePath, width: meta.width, height: meta.height },
        });
      } else {
        await prisma.shirtVariant.create({
          data: { setId: set.id, color, filePath: saved.relativePath, width: meta.width, height: meta.height },
        });
      }

      // Bộ mới (chưa có designArea) → tính default theo ảnh này + màu đại diện.
      const patch: Record<string, unknown> = {};
      if (!set.designWidth || !set.designHeight) Object.assign(patch, defaultDesignArea(meta.width, meta.height));
      if (!set.representativeColor) patch.representativeColor = color;
      if (Object.keys(patch).length) await prisma.shirtSet.update({ where: { id: set.id }, data: patch });

      const full = await prisma.shirtSet.findUnique({
        where: { id: set.id },
        include: { variants: { orderBy: { color: 'asc' } } },
      });
      return reply.code(201).send(shirtSetToDto(full!));
    },
  );

  app.delete(
    '/api/shirt-sets/:id/variants/:variantId',
    { schema: { tags: ['ShirtSets'], summary: 'Xoá 1 variant màu' } },
    async (req, reply) => {
      const ownerId = requireUserId(req);
      const { id, variantId } = req.params as { id: string; variantId: string };
      const set = await prisma.shirtSet.findFirst({ where: { id, ownerId } });
      if (!set) return reply.code(404).send({ error: 'not_found' });
      const v = await prisma.shirtVariant.findFirst({ where: { id: variantId, setId: id } });
      if (!v) return reply.code(404).send({ error: 'variant_not_found' });
      await deleteFile(v.filePath);
      await prisma.shirtVariant.delete({ where: { id: variantId } });
      // Xoá đúng màu đại diện → chọn màu khác làm đại diện.
      if (set.representativeColor === v.color) {
        const first = await prisma.shirtVariant.findFirst({ where: { setId: id }, orderBy: { color: 'asc' } });
        await prisma.shirtSet.update({ where: { id }, data: { representativeColor: first?.color ?? null } });
      }
      const full = await prisma.shirtSet.findUnique({
        where: { id },
        include: { variants: { orderBy: { color: 'asc' } } },
      });
      return shirtSetToDto(full!);
    },
  );

  // ---- Chia sẻ quyền dùng bộ áo (chỉ chủ sở hữu hoặc admin) ----
  async function loadManageable(req: any, reply: any, id: string) {
    const s = getSession(req);
    const set = await prisma.shirtSet.findUnique({ where: { id } });
    if (!set) {
      reply.code(404).send({ error: 'not_found' });
      return null;
    }
    if (set.ownerId !== s?.uid && s?.role !== 'admin') {
      reply.code(403).send({ error: 'forbidden' });
      return null;
    }
    return set;
  }

  app.get('/api/shirt-sets/:id/shares', { schema: { tags: ['ShirtSets'], summary: 'Danh sách user được chia sẻ' } }, async (req, reply) => {
    requireUserId(req);
    const { id } = req.params as { id: string };
    if (!(await loadManageable(req, reply, id))) return;
    const shares = await prisma.shirtSetShare.findMany({ where: { setId: id } });
    const userIds = shares.map((s) => s.userId);
    return userIds.length
      ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true } })
      : [];
  });

  app.post('/api/shirt-sets/:id/shares', { schema: { tags: ['ShirtSets'], summary: 'Cấp quyền dùng cho 1 user' } }, async (req, reply) => {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const set = await loadManageable(req, reply, id);
    if (!set) return;
    const body = (req.body || {}) as { userId?: string };
    const userId = (body.userId || '').trim();
    if (!userId) return reply.code(400).send({ error: 'missing_user_id' });
    if (userId === set.ownerId) return reply.code(400).send({ error: 'cannot_share_with_owner' });
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) return reply.code(404).send({ error: 'user_not_found' });
    await prisma.shirtSetShare.upsert({
      where: { setId_userId: { setId: id, userId } },
      update: {},
      create: { setId: id, userId },
    });
    return { ok: true };
  });

  app.delete('/api/shirt-sets/:id/shares/:userId', { schema: { tags: ['ShirtSets'], summary: 'Thu hồi quyền dùng' } }, async (req, reply) => {
    requireUserId(req);
    const { id, userId } = req.params as { id: string; userId: string };
    if (!(await loadManageable(req, reply, id))) return;
    await prisma.shirtSetShare.deleteMany({ where: { setId: id, userId } });
    return { ok: true };
  });
}
