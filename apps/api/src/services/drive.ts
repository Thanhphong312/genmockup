import { google, drive_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { Readable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSetting, setSetting } from './settings.js';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const DRIVE_TOKEN_KEY = 'drive_token';

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || '';
const REDIRECT_URI =
  process.env.GOOGLE_OAUTH_REDIRECT_URI || 'http://localhost:3000/api/drive/oauth/callback';

const SCOPES = ['https://www.googleapis.com/auth/drive'];

type DriveToken = {
  refresh_token?: string;
  access_token?: string;
  expiry_date?: number;
  // Khi user tự tạo Google Cloud OAuth client riêng, refresh_token gắn với
  // client_id/client_secret của họ -> lưu kèm để refresh đúng credentials.
  client_id?: string;
  client_secret?: string;
};

export function isOAuthConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

/** Tạo OAuth client từ credentials của user (nếu có), fallback về env global. */
function makeClient(clientId?: string, clientSecret?: string): OAuth2Client {
  const id = clientId || CLIENT_ID;
  const secret = clientSecret || CLIENT_SECRET;
  if (!id || !secret) throw new Error('oauth_not_configured');
  return new google.auth.OAuth2(id, secret, REDIRECT_URI);
}

// ---- Token per-user (lưu trong AppSetting của user) ----
async function loadUserToken(userId: string): Promise<DriveToken | null> {
  const raw = await getSetting(userId, DRIVE_TOKEN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DriveToken;
  } catch {
    return null;
  }
}

async function saveUserToken(userId: string, token: DriveToken): Promise<void> {
  await setSetting(userId, DRIVE_TOKEN_KEY, JSON.stringify(token));
}

/** OAuth client đã nạp token của user (tự lưu lại khi Google refresh token). */
async function getUserClient(userId: string): Promise<OAuth2Client | null> {
  const token = await loadUserToken(userId);
  if (!token?.refresh_token) return null;
  const client = makeClient(token.client_id, token.client_secret);
  client.setCredentials({
    refresh_token: token.refresh_token,
    access_token: token.access_token,
    expiry_date: token.expiry_date,
  });
  client.on('tokens', (t) => {
    const merged: DriveToken = { ...token };
    if (t.refresh_token) merged.refresh_token = t.refresh_token;
    if (t.access_token) merged.access_token = t.access_token;
    if (t.expiry_date) merged.expiry_date = t.expiry_date;
    void saveUserToken(userId, merged);
  });
  return client;
}

export async function isAuthenticated(userId: string): Promise<boolean> {
  const token = await loadUserToken(userId);
  if (!token?.refresh_token) return false;
  // Cần credentials để refresh: token tự mang theo, hoặc env global đã cấu hình.
  return Boolean((token.client_id && token.client_secret) || isOAuthConfigured());
}

export function buildAuthUrl(state?: string): string {
  return makeClient().generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    state,
  });
}

export async function exchangeCode(userId: string, code: string): Promise<void> {
  const client = makeClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error('no_refresh_token_returned');
  }
  await saveUserToken(userId, {
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token ?? undefined,
    expiry_date: tokens.expiry_date ?? undefined,
  });
}

export async function disconnect(userId: string): Promise<void> {
  await setSetting(userId, DRIVE_TOKEN_KEY, '');
}

export interface ImportTokenInput {
  refresh_token?: string;
  client_id?: string;
  client_secret?: string;
  access_token?: string;
  expiry_date?: number;
}

/**
 * Nạp token thủ công từ JSON user dán vào (mỗi user tự tạo Google Cloud OAuth
 * client riêng). Bắt buộc có refresh_token; client_id/secret lấy từ JSON nếu có,
 * nếu không thì fallback env global. Trước khi lưu sẽ thử refresh để chắc chắn token hợp lệ.
 */
export async function importToken(userId: string, input: ImportTokenInput): Promise<void> {
  const refresh_token = input.refresh_token?.trim();
  if (!refresh_token) throw new Error('missing_refresh_token');

  const client_id = input.client_id?.trim() || CLIENT_ID;
  const client_secret = input.client_secret?.trim() || CLIENT_SECRET;
  if (!client_id || !client_secret) throw new Error('missing_client_credentials');

  // Xác minh token bằng cách thử lấy access_token mới.
  const client = new google.auth.OAuth2(client_id, client_secret, REDIRECT_URI);
  client.setCredentials({ refresh_token });
  let expiry_date: number | undefined;
  let access_token: string | undefined;
  try {
    const res = await client.getAccessToken();
    access_token = res.token ?? undefined;
    expiry_date = client.credentials.expiry_date ?? undefined;
  } catch (err: any) {
    throw new Error(`token_verification_failed: ${err?.message || String(err)}`);
  }

  const token: DriveToken = {
    refresh_token,
    access_token,
    expiry_date,
    // Chỉ lưu client creds khi user tự cung cấp (khác env), để refresh đúng.
    client_id: input.client_id?.trim() || undefined,
    client_secret: input.client_secret?.trim() || undefined,
  };
  await saveUserToken(userId, token);
}

/**
 * Migrate token global cũ (secrets/drive-token.json) sang 1 user (admin) 1 lần,
 * để không phải kết nối lại sau khi chuyển per-user.
 */
export async function importLegacyDriveToken(userId: string): Promise<boolean> {
  const rawPath = process.env.GOOGLE_OAUTH_TOKEN_FILE || './secrets/drive-token.json';
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(__dirname, '../../../..');
  const legacy = path.isAbsolute(rawPath) ? rawPath : path.resolve(repoRoot, rawPath);
  if (!existsSync(legacy)) return false;
  if ((await loadUserToken(userId))?.refresh_token) return false; // đã có token
  try {
    const tok = JSON.parse(await readFile(legacy, 'utf8')) as DriveToken;
    if (tok?.refresh_token) {
      await saveUserToken(userId, tok);
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

async function getDrive(userId: string): Promise<drive_v3.Drive> {
  const client = await getUserClient(userId);
  if (!client) throw new Error('not_authenticated');
  return google.drive({ version: 'v3', auth: client });
}

export interface DriveFolder {
  id: string;
  name: string;
  createdTime?: string;
  webViewLink?: string;
}

export async function listFolders(userId: string, parentId?: string): Promise<DriveFolder[]> {
  const drive = await getDrive(userId);
  const parentClause = parentId ? `'${parentId}' in parents and ` : `'root' in parents and `;
  const q = `${parentClause}mimeType = '${FOLDER_MIME}' and trashed = false`;
  const res = await drive.files.list({
    q,
    fields: 'files(id, name, createdTime, webViewLink)',
    orderBy: 'createdTime desc',
    pageSize: 200,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return (res.data.files || []).map((f) => ({
    id: f.id!,
    name: f.name!,
    createdTime: f.createdTime ?? undefined,
    webViewLink: f.webViewLink ?? undefined,
  }));
}

export async function findFolder(userId: string, name: string, parentId: string): Promise<DriveFolder | null> {
  const drive = await getDrive(userId);
  const escaped = name.replace(/'/g, "\\'");
  const q = `'${parentId}' in parents and mimeType = '${FOLDER_MIME}' and name = '${escaped}' and trashed = false`;
  const res = await drive.files.list({
    q,
    fields: 'files(id, name, createdTime, webViewLink)',
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const f = res.data.files?.[0];
  if (!f) return null;
  return {
    id: f.id!,
    name: f.name!,
    createdTime: f.createdTime ?? undefined,
    webViewLink: f.webViewLink ?? undefined,
  };
}

export async function ensureFolder(userId: string, name: string, parentId: string): Promise<DriveFolder> {
  const existing = await findFolder(userId, name, parentId);
  if (existing) return existing;
  return createFolder(userId, name, parentId);
}

export async function createFolder(userId: string, name: string, parentId?: string): Promise<DriveFolder> {
  const drive = await getDrive(userId);
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: FOLDER_MIME,
      parents: parentId ? [parentId] : undefined,
    },
    fields: 'id, name, createdTime, webViewLink',
    supportsAllDrives: true,
  });
  const f = res.data;
  return {
    id: f.id!,
    name: f.name!,
    createdTime: f.createdTime ?? undefined,
    webViewLink: f.webViewLink ?? undefined,
  };
}

export interface UploadedDriveFile {
  id: string;
  name: string;
  webViewLink?: string;
  webContentLink?: string;
}

export async function uploadFile(
  userId: string,
  buffer: Buffer,
  filename: string,
  folderId: string,
  mimeType = 'image/png',
): Promise<UploadedDriveFile> {
  const drive = await getDrive(userId);
  const stream = Readable.from(buffer);
  const res = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [folderId],
    },
    media: { mimeType, body: stream },
    fields: 'id, name, webViewLink, webContentLink',
    supportsAllDrives: true,
  });
  const f = res.data;
  return {
    id: f.id!,
    name: f.name!,
    webViewLink: f.webViewLink ?? undefined,
    webContentLink: f.webContentLink ?? undefined,
  };
}
