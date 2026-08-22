import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import { prisma } from '../services/db.js';
import { requireUserId, signState, verifyState } from '../services/auth.js';
import { readStoredFile, fetchDesign } from '../services/composer.js';
import {
  buildAuthUrl,
  createFolder,
  disconnect,
  ensureFolder,
  exchangeCode,
  importToken,
  isAuthenticated,
  isOAuthConfigured,
  listFolders,
  uploadFile,
} from '../services/drive.js';

interface CreateFolderBody {
  name: string;
  parentId?: string;
}

interface UploadBody {
  generationId: string;
  folderId: string;
}

function sanitizeName(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
}

function errorPage(title: string, msg: string, back: string): string {
  return `<html><body style="font-family: sans-serif; padding: 40px; text-align: center;">
    <h2 style="color:#dc2626">${title}</h2>
    <p>${msg}</p>
    <a href="${back}">Quay lại</a>
  </body></html>`;
}

function extFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const ext = path.extname(u.pathname).replace('.', '').toLowerCase();
    if (/^(png|jpe?g|webp|gif)$/.test(ext)) return ext === 'jpeg' ? 'jpg' : ext;
  } catch {
    // not a URL, treat as path
  }
  const ext = path.extname(url).replace('.', '').toLowerCase();
  if (/^(png|jpe?g|webp|gif)$/.test(ext)) return ext === 'jpeg' ? 'jpg' : ext;
  return 'png';
}

function mimeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    default:
      return 'image/png';
  }
}

export async function driveRoutes(app: FastifyInstance) {
  app.get('/api/drive/status', async (req) => {
    const uid = requireUserId(req);
    const authenticated = await isAuthenticated(uid);
    return {
      // configured = có thể dùng Drive: OAuth env sẵn, hoặc user đã tự import token.
      configured: isOAuthConfigured() || authenticated,
      authenticated,
      parentFolderId: null,
    };
  });

  // Nạp token thủ công (user tự tạo Google Cloud OAuth và lấy refresh_token).
  // Body: { json: "<nội dung JSON>" } hoặc trực tiếp các field token.
  app.post('/api/drive/token-import', async (req, reply) => {
    const uid = requireUserId(req);
    const body = req.body as { json?: string } & Record<string, unknown>;

    let parsed: any = body;
    if (typeof body?.json === 'string' && body.json.trim()) {
      try {
        parsed = JSON.parse(body.json);
      } catch {
        return reply.code(400).send({ error: 'invalid_json', message: 'JSON không hợp lệ' });
      }
    }

    // Hỗ trợ nhiều dạng: file client_secret của Google ({installed:{...}} / {web:{...}})
    // gộp cùng refresh_token, hoặc object phẳng.
    const creds = parsed?.installed ?? parsed?.web ?? parsed ?? {};
    const input = {
      refresh_token: parsed?.refresh_token ?? creds?.refresh_token,
      client_id: creds?.client_id,
      client_secret: creds?.client_secret,
      access_token: parsed?.access_token,
      expiry_date: parsed?.expiry_date,
    };

    try {
      await importToken(uid, input);
    } catch (err: any) {
      app.log.error({ err }, 'drive_token_import_failed');
      return reply.code(400).send({ error: 'import_failed', message: err?.message || String(err) });
    }
    return { ok: true, authenticated: true };
  });

  app.get('/api/drive/oauth/start', async (req, reply) => {
    if (!isOAuthConfigured()) {
      return reply.code(503).send({ error: 'oauth_not_configured' });
    }
    const uid = requireUserId(req);
    const { redirect } = req.query as { redirect?: string };
    // Gắn userId (đã ký) vào state để callback biết đang kết nối cho ai
    const state = signState({ uid, redirect: redirect || '' });
    return reply.redirect(buildAuthUrl(state));
  });

  app.get('/api/drive/oauth/callback', async (req, reply) => {
    const { code, state, error } = req.query as {
      code?: string;
      state?: string;
      error?: string;
    };
    const decoded = state ? verifyState<{ uid: string; redirect?: string }>(state) : null;
    const back = decoded?.redirect || 'http://localhost:5173/settings?drive=connected';

    if (error) {
      return reply.type('text/html').send(errorPage('OAuth bị từ chối', error, back));
    }
    if (!code) return reply.code(400).send({ error: 'missing_code' });
    if (!decoded?.uid) {
      return reply.type('text/html').send(errorPage('State không hợp lệ', 'Vui lòng thử kết nối lại', back));
    }
    try {
      await exchangeCode(decoded.uid, code);
    } catch (err: any) {
      app.log.error(err);
      return reply.type('text/html').send(errorPage('Lỗi exchange token', err?.message || String(err), back));
    }
    return reply.redirect(back);
  });

  app.post('/api/drive/oauth/disconnect', async (req) => {
    const uid = requireUserId(req);
    await disconnect(uid);
    return { ok: true };
  });

  app.get('/api/drive/folders', async (req, reply) => {
    const uid = requireUserId(req);
    if (!(await isAuthenticated(uid))) {
      return reply.code(401).send({ error: 'not_authenticated' });
    }
    const { parentId } = req.query as { parentId?: string };
    return listFolders(uid, parentId);
  });

  app.post('/api/drive/folders', async (req, reply) => {
    const uid = requireUserId(req);
    if (!(await isAuthenticated(uid))) {
      return reply.code(401).send({ error: 'not_authenticated' });
    }
    const body = req.body as CreateFolderBody;
    if (!body?.name) return reply.code(400).send({ error: 'missing_name' });
    return createFolder(uid, body.name, body.parentId);
  });

  app.post('/api/drive/upload', async (req, reply) => {
    const uid = requireUserId(req);
    if (!(await isAuthenticated(uid))) {
      return reply.code(401).send({ error: 'not_authenticated' });
    }
    const body = req.body as UploadBody;
    if (!body?.generationId || !body?.folderId) {
      return reply.code(400).send({ error: 'missing_params' });
    }

    const gen = await prisma.generation.findFirst({
      where: { id: body.generationId, ownerId: uid },
      include: { items: { include: { mockup: true, variant: { include: { set: true } } } } },
    });
    if (!gen) return reply.code(404).send({ error: 'generation_not_found' });

    const uploaded = [];
    for (const item of gen.items) {
      const buf = await readStoredFile(item.outputPath);
      const displayName =
        item.label ??
        item.mockup?.name ??
        (item.variant ? `${item.variant.set.name}_${item.variant.color}` : null) ??
        'output';
      const refId = item.mockupId ?? item.variantId ?? item.id;
      const filename = `${gen.id}_${sanitizeName(displayName)}${path.extname(item.outputPath) || '.png'}`;
      try {
        const file = await uploadFile(uid, buf, filename, body.folderId, 'image/png');
        uploaded.push({
          mockupId: refId,
          mockupName: displayName,
          driveFileId: file.id,
          driveName: file.name,
          driveUrl: file.webViewLink,
        });
      } catch (err: any) {
        app.log.error({ err, itemId: item.id }, 'drive_upload_failed');
        uploaded.push({
          mockupId: refId,
          mockupName: displayName,
          error: err?.message || String(err),
        });
      }
    }

    // Upload design file vào subfolder "design"
    let design: {
      name?: string;
      driveFileId?: string;
      driveUrl?: string;
      folderUrl?: string;
      error?: string;
    } | null = null;

    try {
      const designSubfolder = await ensureFolder(uid, 'design', body.folderId);
      const designBuf = await fetchDesign(gen.designPath, gen.designIsUrl);
      const ext = extFromUrl(gen.designPath);
      const designFilename = `${gen.id}_design.${ext}`;
      const file = await uploadFile(uid, designBuf, designFilename, designSubfolder.id, mimeFromExt(ext));
      design = {
        name: file.name,
        driveFileId: file.id,
        driveUrl: file.webViewLink,
        folderUrl: designSubfolder.webViewLink,
      };
    } catch (err: any) {
      app.log.error({ err }, 'drive_design_upload_failed');
      design = { error: err?.message || String(err) };
    }

    return {
      generationId: gen.id,
      folderId: body.folderId,
      uploaded,
      design,
    };
  });
}
