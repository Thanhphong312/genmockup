import './env.js'; // MUST be first — loads dotenv before any other module reads process.env

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import Fastify, { type FastifyError, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';
import cookie from '@fastify/cookie';
import { STORAGE_DIR } from './services/storage.js';
import { mockupsRoutes } from './routes/mockups.js';
import { shirtSetsRoutes } from './routes/shirtSets.js';
import { skinScenesRoutes } from './routes/skinScenes.js';
import { watermarksRoutes } from './routes/watermarks.js';
import { generateRoutes } from './routes/generate.js';
import { thumbRoutes } from './routes/thumb.js';
import { settingsRoutes } from './routes/settings.js';
import { ideasRoutes } from './routes/ideas.js';
import { driveRoutes } from './routes/drive.js';
import { authRoutes } from './routes/auth.js';
import { usersRoutes } from './routes/users.js';
import { COOKIE_NAME, bootstrapUsers, isAuthEnabled, verifyToken } from './services/auth.js';
import { registerSwagger } from './swagger.js';
import { existsSync } from 'node:fs';

const WEB_DIST = path.resolve(__dirname, '../../web/dist');

const PORT = Number(process.env.PORT || 3000);
const CORS_ORIGINS = (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
const API_KEY = process.env.API_KEY || '';

const app = Fastify({
  logger: { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } },
  bodyLimit: 50 * 1024 * 1024,
  trustProxy: true,
});

await app.register(cors, {
  origin: CORS_ORIGINS.length ? CORS_ORIGINS : true,
  credentials: true,
});

await app.register(cookie);

await app.register(multipart, {
  limits: { fileSize: 50 * 1024 * 1024 },
});

await app.register(staticPlugin, {
  root: STORAGE_DIR,
  prefix: '/files/',
  decorateReply: false,
});

// Serve FE build (apps/web/dist) at root nếu đã build
if (existsSync(WEB_DIST)) {
  await app.register(staticPlugin, {
    root: WEB_DIST,
    prefix: '/',
    decorateReply: false,
  });
  app.log.info(`Serving FE from ${WEB_DIST}`);
}

// Optional API key check (skip /health, /files/*)
if (API_KEY) {
  app.addHook('preHandler', async (req, reply) => {
    const url = req.url;
    if (url.startsWith('/health') || url.startsWith('/files/') || url.startsWith('/thumb')) return;
    const key = req.headers['x-api-key'];
    if (key !== API_KEY) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  });
}

// Auth middleware — gắn req.session từ cookie, kiểm tra cho /api/*
const PUBLIC_API_PREFIXES = [
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/me',
  '/api/drive/oauth/callback',
  '/api/documentation',
];

function bearerToken(req: FastifyRequest): string | undefined {
  const h = req.headers['authorization'];
  if (typeof h === 'string' && h.toLowerCase().startsWith('bearer ')) {
    return h.slice(7).trim() || undefined;
  }
  return undefined;
}

app.addHook('preHandler', async (req: FastifyRequest, reply) => {
  const url = req.url.split('?')[0];
  // Cookie (web) hoặc Authorization: Bearer (extension / API client)
  const token = req.cookies?.[COOKIE_NAME] || bearerToken(req);
  if (token) {
    const session = verifyToken(token);
    if (session) {
      (req as any).session = session;
    }
  }
  if (!isAuthEnabled()) return;
  if (!url.startsWith('/api/')) return;
  if (PUBLIC_API_PREFIXES.some((p) => url.startsWith(p))) return;
  if (!(req as any).session) {
    return reply.code(401).send({ error: 'unauthenticated' });
  }
});

await registerSwagger(app);

app.get(
  '/health',
  {
    schema: {
      tags: ['System'],
      summary: 'Health check',
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            version: { type: 'string' },
            storageDir: { type: 'string' },
          },
        },
      },
    },
  },
  async () => ({ ok: true, version: '0.1.0', storageDir: STORAGE_DIR }),
);

await app.register(authRoutes);
await app.register(usersRoutes);
await app.register(mockupsRoutes);
await app.register(shirtSetsRoutes);
await app.register(skinScenesRoutes);
await app.register(watermarksRoutes);
await app.register(generateRoutes);
await app.register(thumbRoutes);
await app.register(driveRoutes);
await app.register(settingsRoutes);
await app.register(ideasRoutes);

// SPA fallback — bất kỳ route nào không phải /api, /files, /health → trả index.html
if (existsSync(WEB_DIST)) {
  const { readFile } = await import('node:fs/promises');
  const indexHtmlPath = path.join(WEB_DIST, 'index.html');
  app.setNotFoundHandler(async (req, reply) => {
    if (req.url.startsWith('/api') || req.url.startsWith('/files') || req.url.startsWith('/health')) {
      return reply.code(404).send({ error: 'not_found' });
    }
    const html = await readFile(indexHtmlPath, 'utf8');
    return reply.type('text/html').send(html);
  });
}

app.setErrorHandler((err: FastifyError, _req, reply) => {
  app.log.error(err);
  reply.code(err.statusCode || 500).send({
    error: err.name || 'internal_error',
    message: err.message,
  });
});

try {
  await bootstrapUsers();
  app.log.info('Users bootstrapped (admin ensured, ownership backfilled)');
  await app.listen({ port: PORT, host: '0.0.0.0' });
  app.log.info(`API ready: http://localhost:${PORT}`);
  app.log.info(`Storage:   ${STORAGE_DIR}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
