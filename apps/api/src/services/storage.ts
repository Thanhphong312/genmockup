import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// storage.ts is at apps/api/src/services/storage.ts → 4 levels up = repo root
export const REPO_ROOT = path.resolve(__dirname, '../../../..');

const rawDir = process.env.STORAGE_DIR || './storage';
export const STORAGE_DIR = path.isAbsolute(rawDir)
  ? rawDir
  : path.resolve(REPO_ROOT, rawDir);

export const PUBLIC_URL = (process.env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '');

await mkdir(STORAGE_DIR, { recursive: true });
for (const sub of ['mockups', 'watermarks', 'designs', 'outputs']) {
  await mkdir(path.join(STORAGE_DIR, sub), { recursive: true });
}

export function resolveAbsPath(relativePath: string): string {
  return path.join(STORAGE_DIR, relativePath);
}

export function buildPublicUrl(relativePath: string): string {
  const normalized = relativePath.split(path.sep).join('/');
  return `${PUBLIC_URL}/files/${normalized}`;
}

export interface SavedFile {
  relativePath: string;
  absPath: string;
  url: string;
  size: number;
}

export async function saveFile(
  buffer: Buffer,
  subdir: 'mockups' | 'watermarks' | 'designs' | string,
  ext: string,
  filename?: string,
): Promise<SavedFile> {
  const dir = path.join(STORAGE_DIR, subdir);
  await mkdir(dir, { recursive: true });
  const cleanExt = ext.startsWith('.') ? ext : `.${ext}`;
  const name = filename ?? `${randomUUID()}${cleanExt}`;
  const absPath = path.join(dir, name);
  await writeFile(absPath, buffer);
  const relativePath = path.posix.join(subdir, name);
  return {
    relativePath,
    absPath,
    url: buildPublicUrl(relativePath),
    size: buffer.length,
  };
}

export async function saveOutput(
  buffer: Buffer,
  generationId: string,
  mockupId: string,
): Promise<SavedFile> {
  return saveFile(buffer, path.posix.join('outputs', generationId), 'png', `${mockupId}.png`);
}

export async function deleteFile(relativePath: string): Promise<void> {
  try {
    await unlink(resolveAbsPath(relativePath));
  } catch (err: any) {
    if (err?.code !== 'ENOENT') throw err;
  }
}

export async function fileExists(relativePath: string): Promise<boolean> {
  try {
    await stat(resolveAbsPath(relativePath));
    return true;
  } catch {
    return false;
  }
}

export function extFromMime(mime: string): string {
  switch (mime.toLowerCase()) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    default:
      return 'png';
  }
}
