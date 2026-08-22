import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from './db.js';

const SECRET = process.env.AUTH_SECRET || randomBytes(32).toString('hex');
export const COOKIE_NAME = 'genmockup_session';
const TOKEN_TTL = '30d';

export interface SessionPayload {
  uid: string;
  u: string;
  role: string;
}

export function hashPassword(pw: string): string {
  return bcrypt.hashSync(pw, 10);
}

export function comparePassword(pw: string, hash: string): boolean {
  try {
    return bcrypt.compareSync(pw, hash);
  } catch {
    return false;
  }
}

export function signToken(user: { id: string; username: string; role: string }): string {
  return jwt.sign(
    { uid: user.id, u: user.username, role: user.role } satisfies SessionPayload,
    SECRET,
    { expiresIn: TOKEN_TTL },
  );
}

export function verifyToken(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, SECRET) as SessionPayload;
  } catch {
    return null;
  }
}

/** State ký ngắn hạn dùng cho OAuth (gắn userId qua Google redirect). */
export function signState(data: Record<string, unknown>): string {
  return jwt.sign(data, SECRET, { expiresIn: '1h' });
}

export function verifyState<T = any>(token: string): T | null {
  try {
    return jwt.verify(token, SECRET) as T;
  } catch {
    return null;
  }
}

/** Multi-user: auth luôn bật. */
export function isAuthEnabled(): boolean {
  return true;
}

/** Kiểm tra đăng nhập theo DB (bcrypt). */
export async function verifyUser(username: string, password: string) {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) return null;
  if (!comparePassword(password, user.passwordHash)) return null;
  return user;
}

export function getSession(req: FastifyRequest): SessionPayload | null {
  return ((req as any).session as SessionPayload) ?? null;
}

/** Trả session.uid; ném lỗi nếu thiếu (không nên xảy ra do preHandler đã chặn). */
export function requireUserId(req: FastifyRequest): string {
  const s = getSession(req);
  if (!s?.uid) throw new Error('unauthenticated');
  return s.uid;
}

/** Chặn nếu không phải admin. Trả true nếu đã reply lỗi. */
export function requireAdmin(req: FastifyRequest, reply: FastifyReply): boolean {
  const s = getSession(req);
  if (s?.role !== 'admin') {
    reply.code(403).send({ error: 'forbidden' });
    return true;
  }
  return false;
}

/** Tạo admin đầu tiên từ env nếu chưa có user nào. Trả về id admin. */
export async function ensureAdminUser(): Promise<string> {
  const existingAdmin = await prisma.user.findFirst({ where: { role: 'admin' } });
  if (existingAdmin) return existingAdmin.id;

  const count = await prisma.user.count();
  if (count > 0) {
    // Có user nhưng chưa admin → nâng người đầu tiên lên admin
    const first = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
    if (first) {
      await prisma.user.update({ where: { id: first.id }, data: { role: 'admin' } });
      return first.id;
    }
  }

  const username = process.env.AUTH_USERNAME || 'admin';
  const password = process.env.AUTH_PASSWORD || 'admin';
  const admin = await prisma.user.create({
    data: { username, passwordHash: hashPassword(password), role: 'admin' },
  });
  return admin.id;
}

/** Gán mọi dữ liệu chưa có chủ (ownerId null) cho admin. */
export async function backfillOwnership(adminId: string): Promise<void> {
  const where = { ownerId: null } as const;
  await Promise.all([
    prisma.mockup.updateMany({ where, data: { ownerId: adminId } }),
    prisma.watermark.updateMany({ where, data: { ownerId: adminId } }),
    prisma.shirtSet.updateMany({ where, data: { ownerId: adminId } }),
    prisma.generation.updateMany({ where, data: { ownerId: adminId } }),
    prisma.ideaGeneration.updateMany({ where, data: { ownerId: adminId } }),
    prisma.ideaImage.updateMany({ where, data: { ownerId: adminId } }),
  ]);
}

export async function bootstrapUsers(): Promise<void> {
  const adminId = await ensureAdminUser();
  await backfillOwnership(adminId);
  // Giữ kết nối Drive cũ cho admin (token global → per-user)
  try {
    const { importLegacyDriveToken } = await import('./drive.js');
    await importLegacyDriveToken(adminId);
  } catch {
    // ignore
  }
}
