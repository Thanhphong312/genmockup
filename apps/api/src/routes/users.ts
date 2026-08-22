import type { FastifyInstance } from 'fastify';
import { prisma } from '../services/db.js';
import { deleteFile } from '../services/storage.js';
import { getSession, hashPassword, requireAdmin } from '../services/auth.js';
import {
  CONTENT_TYPES,
  ITEM_TYPES,
  countContent,
  isContentType,
  transferContent,
  type ContentType,
} from '../services/ownership.js';

interface CreateBody {
  username?: string;
  password?: string;
  role?: string;
}

function userToDto(u: { id: string; username: string; role: string; createdAt: Date }) {
  return { id: u.id, username: u.username, role: u.role, createdAt: u.createdAt.toISOString() };
}

/** Xoá toàn bộ dữ liệu + file thuộc về 1 user. */
async function deleteUserData(userId: string): Promise<void> {
  const [mockups, watermarks, sets, generations, ideaImages, ideaGens, skinScenes] = await Promise.all([
    prisma.mockup.findMany({ where: { ownerId: userId }, select: { filePath: true } }),
    prisma.watermark.findMany({ where: { ownerId: userId }, select: { filePath: true } }),
    prisma.shirtSet.findMany({ where: { ownerId: userId }, select: { variants: { select: { filePath: true } } } }),
    prisma.generation.findMany({
      where: { ownerId: userId },
      select: { designPath: true, designIsUrl: true, items: { select: { outputPath: true } } },
    }),
    prisma.ideaImage.findMany({ where: { ownerId: userId }, select: { filePath: true } }),
    prisma.ideaGeneration.findMany({ where: { ownerId: userId }, select: { sourceImagePath: true } }),
    prisma.skinScene.findMany({ where: { ownerId: userId }, select: { filePath: true } }),
  ]);

  const files: string[] = [];
  mockups.forEach((m) => files.push(m.filePath));
  watermarks.forEach((w) => files.push(w.filePath));
  sets.forEach((s) => s.variants.forEach((v) => files.push(v.filePath)));
  generations.forEach((g) => {
    if (!g.designIsUrl) files.push(g.designPath);
    g.items.forEach((it) => files.push(it.outputPath));
  });
  ideaImages.forEach((i) => files.push(i.filePath));
  ideaGens.forEach((g) => files.push(g.sourceImagePath));
  skinScenes.forEach((s) => files.push(s.filePath));
  for (const f of files) await deleteFile(f);

  // Xoá DB rows (variants/items cascade theo set/generation)
  await prisma.generation.deleteMany({ where: { ownerId: userId } });
  await prisma.shirtSet.deleteMany({ where: { ownerId: userId } });
  await prisma.mockup.deleteMany({ where: { ownerId: userId } });
  await prisma.skinScene.deleteMany({ where: { ownerId: userId } });
  await prisma.watermark.deleteMany({ where: { ownerId: userId } });
  await prisma.ideaImage.deleteMany({ where: { ownerId: userId } });
  await prisma.ideaGeneration.deleteMany({ where: { ownerId: userId } });
  await prisma.appSetting.deleteMany({ where: { userId } });
  // Thu hồi các chia sẻ mà user này là người được cấp (shares của mockup/set họ sở hữu đã cascade)
  await prisma.mockupShare.deleteMany({ where: { userId } });
  await prisma.shirtSetShare.deleteMany({ where: { userId } });
  await prisma.skinSceneShare.deleteMany({ where: { userId } });
}

export async function usersRoutes(app: FastifyInstance) {
  // Danh bạ user (id + username) để chọn khi chia sẻ — mọi user đã đăng nhập đều xem được
  app.get('/api/users/directory', { schema: { tags: ['Users'], summary: 'Danh bạ user để chia sẻ' } }, async (req) => {
    const me = getSession(req);
    const list = await prisma.user.findMany({ orderBy: { username: 'asc' }, select: { id: true, username: true } });
    return list.filter((u) => u.id !== me?.uid);
  });

  app.get('/api/users', { schema: { tags: ['Users'], summary: 'List user (admin)' } }, async (req, reply) => {
    if (requireAdmin(req, reply)) return;
    const list = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    return list.map(userToDto);
  });

  app.post('/api/users', { schema: { tags: ['Users'], summary: 'Tạo user (admin)' } }, async (req, reply) => {
    if (requireAdmin(req, reply)) return;
    const body = (req.body || {}) as CreateBody;
    const username = (body.username || '').trim();
    const password = body.password || '';
    const role = body.role === 'admin' ? 'admin' : 'user';
    if (!username || !password) return reply.code(400).send({ error: 'missing_fields' });
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) return reply.code(409).send({ error: 'username_taken' });
    const created = await prisma.user.create({
      data: { username, passwordHash: hashPassword(password), role },
    });
    return reply.code(201).send(userToDto(created));
  });

  app.put('/api/users/:id', { schema: { tags: ['Users'], summary: 'Đổi mật khẩu/role (admin)' } }, async (req, reply) => {
    if (requireAdmin(req, reply)) return;
    const { id } = req.params as { id: string };
    const body = (req.body || {}) as { password?: string; role?: string };
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return reply.code(404).send({ error: 'not_found' });

    const data: any = {};
    if (body.password && body.password.trim()) data.passwordHash = hashPassword(body.password.trim());
    if (body.role === 'admin' || body.role === 'user') {
      // Không cho hạ cấp admin cuối cùng
      if (target.role === 'admin' && body.role === 'user') {
        const admins = await prisma.user.count({ where: { role: 'admin' } });
        if (admins <= 1) return reply.code(400).send({ error: 'cannot_demote_last_admin' });
      }
      data.role = body.role;
    }
    const updated = await prisma.user.update({ where: { id }, data });
    return userToDto(updated);
  });

  app.delete('/api/users/:id', { schema: { tags: ['Users'], summary: 'Xoá user + dữ liệu (admin)' } }, async (req, reply) => {
    if (requireAdmin(req, reply)) return;
    const { id } = req.params as { id: string };
    const me = getSession(req);
    if (me?.uid === id) return reply.code(400).send({ error: 'cannot_delete_self' });
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return reply.code(404).send({ error: 'not_found' });
    if (target.role === 'admin') {
      const admins = await prisma.user.count({ where: { role: 'admin' } });
      if (admins <= 1) return reply.code(400).send({ error: 'cannot_delete_last_admin' });
    }
    await deleteUserData(id);
    await prisma.user.delete({ where: { id } });
    return { ok: true };
  });

  // ---- Đổi quyền sở hữu (admin) ----

  /**
   * Đổi chủ từng item từ trang danh sách. Đặt TRƯỚC các route `/api/users/:id/...`
   * không bắt buộc (Fastify ưu tiên segment tĩnh) nhưng để cạnh nhau cho dễ đọc.
   */
  app.post(
    '/api/users/transfer-items',
    { schema: { tags: ['Users'], summary: 'Đổi chủ sở hữu một số item cụ thể (admin)' } },
    async (req, reply) => {
      if (requireAdmin(req, reply)) return;
      const body = (req.body || {}) as { type?: string; ids?: unknown; toUserId?: string };
      const type = body.type;
      if (!isContentType(type) || !ITEM_TYPES.includes(type)) {
        return reply.code(400).send({ error: 'invalid_type' });
      }
      const ids = Array.isArray(body.ids)
        ? [...new Set(body.ids.map((v) => String(v ?? '').trim()).filter(Boolean))]
        : [];
      const toUserId = (body.toUserId || '').trim();
      if (!ids.length) return reply.code(400).send({ error: 'missing_ids' });
      if (!toUserId) return reply.code(400).send({ error: 'missing_to_user' });
      const target = await prisma.user.findUnique({ where: { id: toUserId } });
      if (!target) return reply.code(404).send({ error: 'user_not_found' });

      const res = await transferContent({ type, toUserId, ids });
      return { ok: true, type, toUsername: target.username, ...res };
    },
  );

  app.get(
    '/api/users/:id/content',
    { schema: { tags: ['Users'], summary: 'Đếm nội dung theo loại của 1 user (admin)' } },
    async (req, reply) => {
      if (requireAdmin(req, reply)) return;
      const { id } = req.params as { id: string };
      const target = await prisma.user.findUnique({ where: { id } });
      if (!target) return reply.code(404).send({ error: 'not_found' });
      return countContent(id);
    },
  );

  app.post(
    '/api/users/:id/transfer',
    { schema: { tags: ['Users'], summary: 'Chuyển toàn bộ nội dung của 1 user sang user khác (admin)' } },
    async (req, reply) => {
      if (requireAdmin(req, reply)) return;
      const { id } = req.params as { id: string };
      const body = (req.body || {}) as { toUserId?: string; types?: unknown };
      const toUserId = (body.toUserId || '').trim();
      if (!toUserId) return reply.code(400).send({ error: 'missing_to_user' });
      if (toUserId === id) return reply.code(400).send({ error: 'same_user' });

      const types = (Array.isArray(body.types) ? body.types : []).filter(isContentType);
      if (!types.length) return reply.code(400).send({ error: 'missing_types' });

      const [from, to] = await Promise.all([
        prisma.user.findUnique({ where: { id } }),
        prisma.user.findUnique({ where: { id: toUserId } }),
      ]);
      if (!from || !to) return reply.code(404).send({ error: 'user_not_found' });

      const moved: Partial<Record<ContentType, number>> = {};
      let renamed = 0;
      for (const type of CONTENT_TYPES.filter((t) => types.includes(t))) {
        const res = await transferContent({ type, toUserId, fromUserId: id });
        if (res.moved) moved[type] = res.moved;
        renamed += res.renamed;
      }
      const total = Object.values(moved).reduce((a, b) => a + (b ?? 0), 0);
      return { ok: true, from: from.username, to: to.username, total, moved, renamed };
    },
  );
}
