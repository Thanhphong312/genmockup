import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { DESIGN_RATIO } from '@genmockup/shared';
import { prisma } from './db.js';
import { REPO_ROOT, saveFile, extFromMime } from './storage.js';

// Thư mục nguồn (chỉ để import) — không phục vụ trực tiếp.
const SHIRT_SOURCE_DIR = path.join(REPO_ROOT, 'mockup', 'shirt');

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

function mimeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    default:
      return 'image/png';
  }
}

/**
 * Default design area cho bộ mới: ô giữa ngực, lock tỉ lệ 5:7.
 */
export function defaultDesignArea(w: number, h: number) {
  const width = Math.round(w * 0.35);
  const height = Math.round(width / DESIGN_RATIO);
  return {
    designX: Math.round((w - width) / 2),
    designY: Math.round(h * 0.22),
    designWidth: width,
    designHeight: height,
    designRotation: 0,
  };
}

export interface ScanResult {
  scannedSets: number;
  createdSets: number;
  addedVariants: number;
}

/**
 * Quét mockup/shirt/<set>/<color>.<ext>, copy ảnh vào storage/shirtsets/<ownerId>/<set>,
 * upsert ShirtSet (theo ownerId+name) + ShirtVariant (theo setId+color). Idempotent per user.
 */
export async function scanShirtSets(ownerId: string): Promise<ScanResult> {
  const result: ScanResult = { scannedSets: 0, createdSets: 0, addedVariants: 0 };

  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(SHIRT_SOURCE_DIR, { withFileTypes: true });
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      throw new Error(`shirt_source_not_found: ${SHIRT_SOURCE_DIR}`);
    }
    throw err;
  }

  const setDirs = entries.filter((e) => e.isDirectory());

  for (const dir of setDirs) {
    const setName = dir.name;
    const setSourcePath = path.join(SHIRT_SOURCE_DIR, setName);
    const files = (await readdir(setSourcePath, { withFileTypes: true }))
      .filter((f) => f.isFile() && IMAGE_EXT.has(path.extname(f.name).toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (files.length === 0) continue;
    result.scannedSets += 1;

    let set = await prisma.shirtSet.findFirst({ where: { name: setName, ownerId } });

    // Copy variants vào storage + upsert
    const colorsAdded: string[] = [];
    for (const file of files) {
      const ext = path.extname(file.name).toLowerCase();
      const color = path.basename(file.name, ext);
      const buffer = await readFile(path.join(setSourcePath, file.name));
      const meta = await sharp(buffer).metadata();
      if (!meta.width || !meta.height) continue;

      // Bộ chưa tồn tại → tạo với design area default dựa trên ảnh đầu tiên.
      if (!set) {
        set = await prisma.shirtSet.create({
          data: {
            ownerId,
            name: setName,
            ...defaultDesignArea(meta.width, meta.height),
            representativeColor: color,
          },
        });
        result.createdSets += 1;
      }

      const existing = await prisma.shirtVariant.findUnique({
        where: { setId_color: { setId: set.id, color } },
      });
      if (existing) continue;

      const saved = await saveFile(
        buffer,
        path.posix.join('shirtsets', ownerId, setName),
        extFromMime(mimeFromExt(ext)),
        `${color}.${extFromMime(mimeFromExt(ext))}`,
      );

      await prisma.shirtVariant.create({
        data: {
          setId: set.id,
          color,
          filePath: saved.relativePath,
          width: meta.width,
          height: meta.height,
        },
      });
      result.addedVariants += 1;
      colorsAdded.push(color);
    }

    // Nếu bộ đã tồn tại nhưng chưa có representativeColor, set màu đầu.
    if (set && !set.representativeColor) {
      const first = await prisma.shirtVariant.findFirst({
        where: { setId: set.id },
        orderBy: { color: 'asc' },
      });
      if (first) {
        await prisma.shirtSet.update({
          where: { id: set.id },
          data: { representativeColor: first.color },
        });
      }
    }
  }

  return result;
}
