import type { FastifyInstance } from 'fastify';
import { prisma } from '../services/db.js';
import {
  COOKIE_NAME,
  comparePassword,
  getSession,
  hashPassword,
  requireUserId,
  signToken,
  verifyUser,
} from '../services/auth.js';

interface LoginBody {
  username: string;
  password: string;
}

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function authRoutes(app: FastifyInstance) {
  app.get(
    '/api/auth/me',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Lấy thông tin phiên hiện tại',
        response: {
          200: {
            type: 'object',
            properties: {
              username: { type: ['string', 'null'] },
              role: { type: ['string', 'null'] },
              authEnabled: { type: 'boolean' },
            },
          },
          401: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (req, reply) => {
      const session = getSession(req);
      if (!session) {
        return reply.code(401).send({ error: 'unauthenticated' });
      }
      return { username: session.u, role: session.role, authEnabled: true };
    },
  );

  app.post(
    '/api/auth/login',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Đăng nhập — set cookie session 30 ngày',
        body: {
          type: 'object',
          required: ['username', 'password'],
          properties: {
            username: { type: 'string' },
            password: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              username: { type: 'string' },
              token: { type: 'string' },
            },
          },
          400: { type: 'object', properties: { error: { type: 'string' } } },
          401: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (req, reply) => {
      const body = req.body as LoginBody;
      if (!body?.username || !body?.password) {
        return reply.code(400).send({ error: 'missing_credentials' });
      }
      const user = await verifyUser(body.username, body.password);
      if (!user) {
        return reply.code(401).send({ error: 'invalid_credentials' });
      }
      const token = signToken(user);
      reply.setCookie(COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: req.protocol === 'https',
        path: '/',
        maxAge: COOKIE_MAX_AGE,
      });
      // token cũng trả trong body để client không dùng cookie (vd Chrome extension) tự lưu.
      return { ok: true, username: user.username, token };
    },
  );

  app.put(
    '/api/profile',
    { schema: { tags: ['Auth'], summary: 'Cập nhật hồ sơ của tôi (username / mật khẩu)' } },
    async (req, reply) => {
      const uid = requireUserId(req);
      const body = (req.body || {}) as {
        username?: string;
        currentPassword?: string;
        newPassword?: string;
      };
      const user = await prisma.user.findUnique({ where: { id: uid } });
      if (!user) return reply.code(401).send({ error: 'unauthenticated' });

      const data: { username?: string; passwordHash?: string } = {};

      const newName = (body.username || '').trim();
      if (newName && newName !== user.username) {
        const existing = await prisma.user.findUnique({ where: { username: newName } });
        if (existing) return reply.code(409).send({ error: 'username_taken' });
        data.username = newName;
      }

      if (body.newPassword) {
        if (!comparePassword(body.currentPassword || '', user.passwordHash)) {
          return reply.code(400).send({ error: 'wrong_current_password' });
        }
        if (body.newPassword.length < 4) {
          return reply.code(400).send({ error: 'password_too_short' });
        }
        data.passwordHash = hashPassword(body.newPassword);
      }

      if (!data.username && !data.passwordHash) {
        return { username: user.username, role: user.role, unchanged: true };
      }

      const updated = await prisma.user.update({ where: { id: uid }, data });
      // Cấp lại cookie vì token chứa username/role
      const token = signToken(updated);
      reply.setCookie(COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: req.protocol === 'https',
        path: '/',
        maxAge: COOKIE_MAX_AGE,
      });
      return { username: updated.username, role: updated.role };
    },
  );

  app.post(
    '/api/auth/logout',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Đăng xuất — xoá cookie session',
      },
    },
    async (_req, reply) => {
      reply.clearCookie(COOKIE_NAME, { path: '/' });
      return { ok: true };
    },
  );
}
