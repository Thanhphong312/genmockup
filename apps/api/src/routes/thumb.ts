import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import crypto from 'node:crypto';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import sharp from 'sharp';
import { STORAGE_DIR, resolveAbsPath } from '../services/storage.js';

const THUMB_DIR = path.join(STORAGE_DIR, '.thumbs');

/**
 * GET /thumb?path=<relpath>&w=<width>
 * Trả ảnh WebP đã resize theo width — dùng cho lưới thumbnail để không tải ảnh gốc
 * (mockup áo ~2.5MB). Kết quả được cache ra đĩa (storage/.thumbs) nên sharp chỉ chạy
 * 1 lần/ảnh; các lần sau chỉ đọc file nhỏ → không dồn CPU gây origin 502.
 * Public như /files (không auth) để <img> load được từ extension.
 */
export async function thumbRoutes(app: FastifyInstance) {
  app.get('/thumb', async (req, reply) => {
    const q = req.query as { path?: string; w?: string };
    const rel = (q.path || '').replace(/^\/+/, '');
    if (!rel) return reply.code(400).send({ error: 'missing_path' });

    // Chống path traversal: abs phải nằm trong STORAGE_DIR.
    const abs = resolveAbsPath(rel);
    const root = path.resolve(STORAGE_DIR);
    if (!path.resolve(abs).startsWith(root)) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    let srcStat;
    try {
      srcStat = await stat(abs);
    } catch {
      return reply.code(404).send({ error: 'not_found' });
    }

    const width = Math.max(16, Math.min(parseInt(q.w || '240', 10) || 240, 1200));
    const key = crypto.createHash('sha1').update(`${rel}|${width}`).digest('hex') + '.webp';
    const cacheAbs = path.join(THUMB_DIR, key);

    const sendWebp = (buf: Buffer, cache: 'hit' | 'miss') =>
      reply
        .header('Cache-Control', 'public, max-age=604800')
        .header('X-Thumb-Cache', cache)
        .type('image/webp')
        .send(buf);

    // Cache còn mới hơn source → trả luôn.
    try {
      const cStat = await stat(cacheAbs);
      if (cStat.mtimeMs >= srcStat.mtimeMs) {
        return sendWebp(await readFile(cacheAbs), 'hit');
      }
    } catch {
      /* chưa có cache → tạo mới */
    }

    try {
      const buf = await sharp(abs).resize({ width, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
      await mkdir(THUMB_DIR, { recursive: true });
      await writeFile(cacheAbs, buf).catch(() => {});
      return sendWebp(buf, 'miss');
    } catch (err: any) {
      app.log.error(err);
      return reply.code(500).send({ error: 'thumb_failed', message: err?.message });
    }
  });
}
