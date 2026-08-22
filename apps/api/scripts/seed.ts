import '../src/env.js'; // MUST be first
import { readFile, copyFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { prisma } from '../src/services/db.js';
import { STORAGE_DIR } from '../src/services/storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../../..');
const SRC_DIR = path.join(ROOT, 'mockup');

async function main() {
  const files = (await readdir(SRC_DIR)).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
  if (!files.length) {
    console.log('No mockup files found in', SRC_DIR);
    return;
  }

  console.log(`Scanning ${files.length} file(s) in ${SRC_DIR}\n`);

  await mkdir(path.join(STORAGE_DIR, 'mockups'), { recursive: true });

  let added = 0;
  let skipped = 0;

  for (const file of files) {
    const displayName = path.basename(file, path.extname(file));

    // Check DB first — skip without copying nếu đã tồn tại
    const exists = await prisma.mockup.findFirst({ where: { name: displayName } });
    if (exists) {
      console.log(`  ⊘ skip   ${displayName} (already in DB)`);
      skipped++;
      continue;
    }

    const src = path.join(SRC_DIR, file);
    const ext = path.extname(file).toLowerCase().replace('.', '') || 'png';
    const buf = await readFile(src);
    const meta = await sharp(buf).metadata();
    if (!meta.width || !meta.height) {
      console.warn(`  ✗ error  ${displayName}: no metadata`);
      continue;
    }

    const destName = `${randomUUID()}.${ext}`;
    const destRel = path.posix.join('mockups', destName);
    const destAbs = path.join(STORAGE_DIR, destRel);
    await copyFile(src, destAbs);

    // designArea mặc định: căn giữa, rộng 60% bề ngang, ratio 5:7
    const dw = Math.round(meta.width * 0.6);
    const dh = Math.round((dw * 7) / 5);
    const dx = Math.round((meta.width - dw) / 2);
    const dy = Math.round((meta.height - dh) / 2);

    await prisma.mockup.create({
      data: {
        name: displayName,
        filePath: destRel,
        width: meta.width,
        height: meta.height,
        designX: dx,
        designY: dy,
        designWidth: dw,
        designHeight: dh,
        designRotation: 0,
      },
    });

    console.log(`  + added  ${displayName} (${meta.width}×${meta.height}) → ${destRel}`);
    added++;
  }

  console.log(`\nDone. Added ${added}, skipped ${skipped} (total ${files.length}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
