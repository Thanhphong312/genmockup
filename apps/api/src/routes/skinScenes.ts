import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import path from 'node:path';
import sharp from 'sharp';
import { prisma } from '../services/db.js';
import { deleteFile, saveFile, extFromMime } from '../services/storage.js';
import { skinSceneToDto } from '../services/dto.js';
import { detectHole } from '../services/holeDetect.js';
import { composeSkinPreview } from '../services/skin.js';
import { readStoredFile } from '../services/composer.js';
import { quadSize, type Point } from '../services/perspective.js';
import { getSession, requireUserId } from '../services/auth.js';

type Pair = [number, number];

function parseQuad(raw: unknown): Point[] | null {
  const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!Array.isArray(arr) || arr.length !== 4) return null;
  const out: Point[] = [];
  for (const p of arr) {
    if (!Array.isArray(p) || p.length !== 2) return null;
    const x = Number(p[0]);
    const y = Number(p[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    out.push([x, y]);
  }
  return out;
}

export async function skinScenesRoutes(app: FastifyInstance) {
  /** Scene của tôi hoặc được chia sẻ (chia sẻ = chỉ dùng generate). */
  async function loadUsable(uid: string, id: string) {
    return prisma.skinScene.findFirst({
      where: { id, OR: [{ ownerId: uid }, { shares: { some: { userId: uid } } }] },
    });
  }

  async function loadManageable(req: FastifyRequest, reply: FastifyReply, id: string) {
    const s = getSession(req);
    const scene = await prisma.skinScene.findUnique({ where: { id } });
    if (!scene) {
      reply.code(404).send({ error: 'not_found' });
      return null;
    }
    if (scene.ownerId !== s?.uid && s?.role !== 'admin') {
      reply.code(403).send({ error: 'forbidden' });
      return null;
    }
    return scene;
  }

  app.get(
    '/api/skin-scenes',
    { schema: { tags: ['SkinScenes'], summary: 'List mockup card skin (của tôi + được chia sẻ; admin thêm ?all=1)' } },
    async (req) => {
      const uid = requireUserId(req);

      // ?all=1 (chỉ admin): xem scene của mọi user để đổi chủ sở hữu / chia sẻ hộ.
      if (String((req.query as { all?: string })?.all ?? '') === '1' && getSession(req)?.role === 'admin') {
        const rows = await prisma.skinScene.findMany({ orderBy: { createdAt: 'desc' } });
        const owners = await prisma.user.findMany({ select: { id: true, username: true } });
        const nameOf = (id: string | null) => owners.find((o) => o.id === id)?.username ?? null;
        return rows.map((s) => ({
          ...skinSceneToDto(s),
          shared: s.ownerId !== uid,
          ownerName: nameOf(s.ownerId),
        }));
      }

      const owned = await prisma.skinScene.findMany({
        where: { ownerId: uid },
        orderBy: { createdAt: 'desc' },
      });
      const shares = await prisma.skinSceneShare.findMany({
        where: { userId: uid },
        include: { scene: true },
        orderBy: { createdAt: 'desc' },
      });
      const sharedScenes = shares.map((s) => s.scene).filter((s) => s && s.ownerId !== uid);
      const ownerIds = [...new Set(sharedScenes.map((s) => s.ownerId).filter(Boolean))] as string[];
      const owners = ownerIds.length
        ? await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, username: true } })
        : [];
      const ownerName = (id: string | null) => owners.find((o) => o.id === id)?.username ?? null;

      return [
        ...owned.map((s) => ({ ...skinSceneToDto(s), shared: false, ownerName: null as string | null })),
        ...sharedScenes.map((s) => ({ ...skinSceneToDto(s), shared: true, ownerName: ownerName(s.ownerId) })),
      ];
    },
  );

  app.get(
    '/api/skin-scenes/:id',
    { schema: { tags: ['SkinScenes'], summary: 'Chi tiết 1 mockup card skin' } },
    async (req, reply) => {
      const uid = requireUserId(req);
      const { id } = req.params as { id: string };
      const scene = await loadUsable(uid, id);
      if (!scene) return reply.code(404).send({ error: 'not_found' });
      return { ...skinSceneToDto(scene), shared: scene.ownerId !== uid };
    },
  );

  /**
   * Upload mockup đã khoét rỗng mặt thẻ. Vùng dán được dò TỰ ĐỘNG ngay lúc upload,
   * người dùng chỉ cần vào trang calibrate xác nhận/chỉnh lại nếu lệch.
   */
  app.post(
    '/api/skin-scenes',
    { schema: { tags: ['SkinScenes'], summary: 'Upload mockup đã khoét lỗ (JSON base64 hoặc multipart)' } },
    async (req, reply) => {
      const ownerId = requireUserId(req);

      let buffer: Buffer | null = null;
      let mime = 'image/png';
      let name = '';

      const ct = String(req.headers['content-type'] || '');
      if (ct.includes('multipart/form-data')) {
        for await (const part of req.parts()) {
          if (part.type === 'file') {
            buffer = await part.toBuffer();
            mime = part.mimetype || mime;
            if (!name) name = path.basename(part.filename || '', path.extname(part.filename || ''));
          } else if (part.type === 'field' && part.fieldname === 'name') {
            name = String(part.value).trim();
          }
        }
      } else {
        const body = (req.body || {}) as { name?: string; imageBase64?: string; filename?: string };
        name = (body.name || body.filename || '').replace(/\.[^.]+$/, '').trim();
        if (body.imageBase64) {
          const m = /^data:([^;]+);base64,(.*)$/s.exec(body.imageBase64);
          if (m) mime = m[1];
          buffer = Buffer.from(m ? m[2] : body.imageBase64, 'base64');
        }
      }

      if (!buffer || !buffer.length) return reply.code(400).send({ error: 'missing_file' });
      if (!/png/i.test(mime)) {
        return reply.code(400).send({
          error: 'must_be_png',
          message: 'Mockup phải là PNG có vùng khoét trong suốt (JPG không lưu được alpha).',
        });
      }

      let geo;
      try {
        geo = await detectHole(buffer);
      } catch (err: any) {
        const messages: Record<string, string> = {
          no_transparent_hole: 'Không tìm thấy vùng trong suốt. Cần khoét rỗng mặt thẻ trước khi upload.',
          looks_like_design:
            'Đây là file design (4 góc ảnh trong suốt do bo góc thẻ), không phải ảnh mockup đã khoét lỗ.',
          hole_too_small:
            'Vùng trong suốt quá nhỏ so với khung hình — có thể mới chỉ khoét lỗ chip chứ chưa khoét mặt thẻ.',
          hole_shape_unclear: 'Không xác định được 4 cạnh của vùng khoét.',
        };
        return reply.code(400).send({
          error: err?.message || 'detect_failed',
          message: messages[err?.message] ?? 'Không xác định được hình dạng vùng khoét.',
        });
      }

      const saved = await saveFile(buffer, path.posix.join('skinscenes', ownerId), extFromMime(mime));
      const scene = await prisma.skinScene.create({
        data: {
          ownerId,
          name: name || 'scene',
          filePath: saved.relativePath,
          width: geo.width,
          height: geo.height,
          cornersJson: JSON.stringify(geo.corners),
          ctrlJson: JSON.stringify(geo.ctrl),
          ratio: geo.ratio,
          calibrated: false,
        },
      });
      return reply.code(201).send({ ...skinSceneToDto(scene), bend: geo.bend });
    },
  );

  app.post(
    '/api/skin-scenes/:id/redetect',
    { schema: { tags: ['SkinScenes'], summary: 'Dò lại vùng khoét tự động (bỏ chỉnh tay)' } },
    async (req, reply) => {
      const ownerId = requireUserId(req);
      const { id } = req.params as { id: string };
      const scene = await prisma.skinScene.findFirst({ where: { id, ownerId } });
      if (!scene) return reply.code(404).send({ error: 'not_found' });

      const buffer = await readStoredFile(scene.filePath);
      const geo = await detectHole(buffer);
      const updated = await prisma.skinScene.update({
        where: { id },
        data: {
          cornersJson: JSON.stringify(geo.corners),
          ctrlJson: JSON.stringify(geo.ctrl),
          ratio: geo.ratio,
          calibrated: false,
        },
      });
      return { ...skinSceneToDto(updated), bend: geo.bend };
    },
  );

  app.put(
    '/api/skin-scenes/:id',
    { schema: { tags: ['SkinScenes'], summary: 'Lưu tên + vùng dán đã chỉnh tay' } },
    async (req, reply) => {
      const ownerId = requireUserId(req);
      const { id } = req.params as { id: string };
      const scene = await prisma.skinScene.findFirst({ where: { id, ownerId } });
      if (!scene) return reply.code(404).send({ error: 'not_found' });

      const body = (req.body || {}) as { name?: string; corners?: Pair[]; ctrl?: Pair[] };
      const data: Record<string, unknown> = {};
      if (body.name !== undefined) data.name = String(body.name).trim() || scene.name;

      if (body.corners || body.ctrl) {
        const corners = parseQuad(body.corners ?? JSON.parse(scene.cornersJson));
        const ctrl = parseQuad(body.ctrl ?? JSON.parse(scene.ctrlJson));
        if (!corners || !ctrl) return reply.code(400).send({ error: 'invalid_quad' });
        data.cornersJson = JSON.stringify(corners);
        data.ctrlJson = JSON.stringify(ctrl);
        data.ratio = +quadSize(corners).ratio.toFixed(3);
        data.calibrated = true;
      }

      const updated = await prisma.skinScene.update({ where: { id }, data });
      return skinSceneToDto(updated);
    },
  );

  /**
   * Preview ghép thật — dùng ĐÚNG hàm compose lúc generate, nên thấy sao ra vậy.
   * Nhận corners/ctrl từ query để xem trước ngay khi kéo, chưa cần lưu.
   */
  app.post(
    '/api/skin-scenes/:id/preview',
    { schema: { tags: ['SkinScenes'], summary: 'Ghép thử 1 design vào vùng đang chỉnh (trả data URL)' } },
    async (req, reply) => {
      const uid = requireUserId(req);
      const { id } = req.params as { id: string };
      const body = (req.body || {}) as {
        designImageId?: string;
        imageBase64?: string;
        corners?: Pair[];
        ctrl?: Pair[];
      };

      const scene = await loadUsable(uid, id);
      if (!scene) return reply.code(404).send({ error: 'not_found' });

      let designBuffer: Buffer | null = null;
      if (body.imageBase64) {
        const m = /^data:[^;]+;base64,(.*)$/s.exec(body.imageBase64);
        designBuffer = Buffer.from(m ? m[1] : body.imageBase64, 'base64');
      } else if (body.designImageId) {
        const img = await prisma.ideaImage.findFirst({ where: { id: body.designImageId, ownerId: uid } });
        if (!img) return reply.code(404).send({ error: 'design_not_found' });
        designBuffer = await readStoredFile(img.filePath);
      }
      if (!designBuffer?.length) return reply.code(400).send({ error: 'missing_design' });

      const corners = parseQuad(body.corners ?? JSON.parse(scene.cornersJson));
      const ctrl = parseQuad(body.ctrl ?? JSON.parse(scene.ctrlJson));
      if (!corners || !ctrl) return reply.code(400).send({ error: 'invalid_quad' });

      const buffer = await composeSkinPreview({
        sceneBuffer: await readStoredFile(scene.filePath),
        designBuffer,
        corners,
        ctrl,
        width: scene.width,
        height: scene.height,
      });
      const srcMeta = await sharp(designBuffer).metadata();
      return {
        dataUrl: `data:image/jpeg;base64,${buffer.toString('base64')}`,
        designRatio: srcMeta.width && srcMeta.height ? +(srcMeta.width / srcMeta.height).toFixed(3) : null,
        holeRatio: +quadSize(corners).ratio.toFixed(3),
      };
    },
  );

  app.delete(
    '/api/skin-scenes/:id',
    { schema: { tags: ['SkinScenes'], summary: 'Xoá mockup card skin (cả file + DB)' } },
    async (req, reply) => {
      const ownerId = requireUserId(req);
      const { id } = req.params as { id: string };
      const scene = await prisma.skinScene.findFirst({ where: { id, ownerId } });
      if (!scene) return reply.code(404).send({ error: 'not_found' });
      await deleteFile(scene.filePath);
      await prisma.skinScene.delete({ where: { id } });
      return { ok: true };
    },
  );

  // ---- Chia sẻ quyền dùng ----
  app.get('/api/skin-scenes/:id/shares', { schema: { tags: ['SkinScenes'], summary: 'Danh sách user được chia sẻ' } }, async (req, reply) => {
    requireUserId(req);
    const { id } = req.params as { id: string };
    if (!(await loadManageable(req, reply, id))) return;
    const shares = await prisma.skinSceneShare.findMany({ where: { sceneId: id } });
    const userIds = shares.map((s) => s.userId);
    return userIds.length
      ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true } })
      : [];
  });

  app.post('/api/skin-scenes/:id/shares', { schema: { tags: ['SkinScenes'], summary: 'Cấp quyền dùng cho 1 user' } }, async (req, reply) => {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const scene = await loadManageable(req, reply, id);
    if (!scene) return;
    const body = (req.body || {}) as { userId?: string };
    const userId = (body.userId || '').trim();
    if (!userId) return reply.code(400).send({ error: 'missing_user_id' });
    if (userId === scene.ownerId) return reply.code(400).send({ error: 'cannot_share_with_owner' });
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) return reply.code(404).send({ error: 'user_not_found' });
    await prisma.skinSceneShare.upsert({
      where: { sceneId_userId: { sceneId: id, userId } },
      update: {},
      create: { sceneId: id, userId },
    });
    return { ok: true };
  });

  app.delete('/api/skin-scenes/:id/shares/:userId', { schema: { tags: ['SkinScenes'], summary: 'Thu hồi quyền dùng' } }, async (req, reply) => {
    requireUserId(req);
    const { id, userId } = req.params as { id: string; userId: string };
    if (!(await loadManageable(req, reply, id))) return;
    await prisma.skinSceneShare.deleteMany({ where: { sceneId: id, userId } });
    return { ok: true };
  });

  // ---- Chia sẻ hàng loạt (chọn nhiều mockup → 1 danh sách user) ----

  function idList(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return [...new Set(raw.map((v) => String(v ?? '').trim()).filter(Boolean))];
  }

  /** Lọc ra những scene người gọi có quyền quản lý; id lạ/của người khác bị bỏ qua (không lỗi). */
  async function loadManageableMany(req: FastifyRequest, ids: string[]) {
    const s = getSession(req);
    if (!ids.length) return [];
    return prisma.skinScene.findMany({
      where: s?.role === 'admin' ? { id: { in: ids } } : { id: { in: ids }, ownerId: s?.uid },
      select: { id: true, ownerId: true },
    });
  }

  /**
   * Tình trạng chia sẻ của nhiều scene cùng lúc: mỗi user kèm số scene (trong danh sách đã chọn)
   * đang được chia sẻ — để UI hiện "tất cả / một phần / chưa".
   */
  app.post(
    '/api/skin-scenes/shares/summary',
    { schema: { tags: ['SkinScenes'], summary: 'Tình trạng chia sẻ của nhiều mockup đã chọn' } },
    async (req) => {
      requireUserId(req);
      const ids = idList((req.body as { sceneIds?: unknown })?.sceneIds);
      const scenes = await loadManageableMany(req, ids);
      const sceneIds = scenes.map((s) => s.id);
      const shares = sceneIds.length
        ? await prisma.skinSceneShare.findMany({ where: { sceneId: { in: sceneIds } } })
        : [];
      const counts = new Map<string, number>();
      for (const sh of shares) counts.set(sh.userId, (counts.get(sh.userId) ?? 0) + 1);
      return {
        total: sceneIds.length,
        skipped: ids.length - sceneIds.length,
        counts: [...counts].map(([userId, count]) => ({ userId, count })),
      };
    },
  );

  app.post(
    '/api/skin-scenes/shares/bulk',
    { schema: { tags: ['SkinScenes'], summary: 'Cấp/thu quyền dùng cho nhiều mockup × nhiều user' } },
    async (req, reply) => {
      requireUserId(req);
      const body = (req.body || {}) as { sceneIds?: unknown; userIds?: unknown; mode?: string };
      const mode = body.mode === 'remove' ? 'remove' : 'add';
      const wantedScenes = idList(body.sceneIds);
      const wantedUsers = idList(body.userIds);
      if (!wantedScenes.length) return reply.code(400).send({ error: 'missing_scene_ids' });
      if (!wantedUsers.length) return reply.code(400).send({ error: 'missing_user_ids' });

      const scenes = await loadManageableMany(req, wantedScenes);
      if (!scenes.length) return reply.code(403).send({ error: 'no_manageable_scene' });

      const users = await prisma.user.findMany({
        where: { id: { in: wantedUsers } },
        select: { id: true },
      });
      if (!users.length) return reply.code(404).send({ error: 'user_not_found' });
      const userIds = users.map((u) => u.id);
      const sceneIds = scenes.map((s) => s.id);

      if (mode === 'remove') {
        const { count } = await prisma.skinSceneShare.deleteMany({
          where: { sceneId: { in: sceneIds }, userId: { in: userIds } },
        });
        return { ok: true, mode, scenes: sceneIds.length, users: userIds.length, changed: count };
      }

      // Không tự chia sẻ cho chính chủ scene (admin thao tác hộ người khác vẫn đúng).
      const pairs = scenes.flatMap((s) =>
        userIds.filter((uid) => uid !== s.ownerId).map((userId) => ({ sceneId: s.id, userId })),
      );
      const existing = await prisma.skinSceneShare.findMany({
        where: { sceneId: { in: sceneIds }, userId: { in: userIds } },
        select: { sceneId: true, userId: true },
      });
      const has = new Set(existing.map((e) => `${e.sceneId}:${e.userId}`));
      const missing = pairs.filter((p) => !has.has(`${p.sceneId}:${p.userId}`));
      if (missing.length) {
        await prisma.$transaction(
          missing.map((p) =>
            prisma.skinSceneShare.upsert({
              where: { sceneId_userId: p },
              update: {},
              create: p,
            }),
          ),
        );
      }
      return {
        ok: true,
        mode,
        scenes: sceneIds.length,
        users: userIds.length,
        changed: missing.length,
        skipped: wantedScenes.length - sceneIds.length,
      };
    },
  );
}
