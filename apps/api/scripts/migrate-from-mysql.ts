/**
 * One-time migration: copy mockup/watermark settings from old XAMPP MySQL → new SQLite.
 *
 * - Match mockups by NAME → update designArea + watermarkArea
 * - Copy watermarks (insert if not exists)
 * - File references in storage/ are preserved if file exists
 * - Skip generations (just history, not needed)
 */
import '../src/env.js';
import mysql from 'mysql2/promise';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { prisma } from '../src/services/db.js';
import { STORAGE_DIR } from '../src/services/storage.js';

const MYSQL_HOST = process.env.MIGRATE_MYSQL_HOST || 'localhost';
const MYSQL_PORT = Number(process.env.MIGRATE_MYSQL_PORT || 3306);
const MYSQL_USER = process.env.MIGRATE_MYSQL_USER || 'root';
const MYSQL_PASSWORD = process.env.MIGRATE_MYSQL_PASSWORD || '';
const MYSQL_DB = process.env.MIGRATE_MYSQL_DB || 'genmockup';

interface OldMockup {
  id: string;
  name: string;
  filePath: string;
  width: number;
  height: number;
  designX: number;
  designY: number;
  designWidth: number;
  designHeight: number;
  designRotation: number;
  watermarkX: number | null;
  watermarkY: number | null;
  watermarkWidth: number | null;
  watermarkHeight: number | null;
  watermarkRotation: number | null;
}

interface OldWatermark {
  id: string;
  name: string;
  filePath: string;
  width: number;
  height: number;
}

function fileExists(rel: string): boolean {
  return existsSync(path.join(STORAGE_DIR, rel));
}

async function main() {
  console.log(`Connecting to MySQL ${MYSQL_USER}@${MYSQL_HOST}:${MYSQL_PORT}/${MYSQL_DB}...`);
  const conn = await mysql.createConnection({
    host: MYSQL_HOST,
    port: MYSQL_PORT,
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: MYSQL_DB,
  });
  console.log('Connected.\n');

  // ===== Mockups =====
  const [mockupRows] = await conn.query<any[]>('SELECT * FROM mockups');
  const oldMockups = mockupRows as OldMockup[];
  console.log(`Found ${oldMockups.length} mockup(s) in old MySQL.\n`);

  let updated = 0;
  let inserted = 0;
  let skipped = 0;

  for (const old of oldMockups) {
    const existing = await prisma.mockup.findFirst({ where: { name: old.name } });
    const data = {
      designX: old.designX,
      designY: old.designY,
      designWidth: old.designWidth,
      designHeight: old.designHeight,
      designRotation: old.designRotation,
      watermarkX: old.watermarkX,
      watermarkY: old.watermarkY,
      watermarkWidth: old.watermarkWidth,
      watermarkHeight: old.watermarkHeight,
      watermarkRotation: old.watermarkRotation,
    };

    if (existing) {
      await prisma.mockup.update({ where: { id: existing.id }, data });
      console.log(`  ✓ updated  ${old.name}  (design ${data.designX},${data.designY} ${data.designWidth}×${data.designHeight}${old.watermarkX !== null ? ' + watermark' : ''})`);
      updated++;
    } else {
      if (!fileExists(old.filePath)) {
        console.log(`  ⊘ skip     ${old.name}  (file missing: ${old.filePath})`);
        skipped++;
        continue;
      }
      await prisma.mockup.create({
        data: {
          name: old.name,
          filePath: old.filePath,
          width: old.width,
          height: old.height,
          ...data,
        },
      });
      console.log(`  + inserted ${old.name}  (new in SQLite, file ${old.filePath})`);
      inserted++;
    }
  }

  // ===== Watermarks =====
  const [wmRows] = await conn.query<any[]>('SELECT * FROM watermarks');
  const oldWatermarks = wmRows as OldWatermark[];
  console.log(`\nFound ${oldWatermarks.length} watermark(s) in old MySQL.\n`);

  let wmAdded = 0;
  let wmSkipped = 0;

  for (const old of oldWatermarks) {
    const existing = await prisma.watermark.findFirst({ where: { name: old.name } });
    if (existing) {
      console.log(`  ⊘ skip     ${old.name}  (already in SQLite)`);
      wmSkipped++;
      continue;
    }
    if (!fileExists(old.filePath)) {
      console.log(`  ⊘ skip     ${old.name}  (file missing: ${old.filePath})`);
      wmSkipped++;
      continue;
    }
    await prisma.watermark.create({
      data: {
        name: old.name,
        filePath: old.filePath,
        width: old.width,
        height: old.height,
      },
    });
    console.log(`  + inserted ${old.name}`);
    wmAdded++;
  }

  console.log('\n=========================');
  console.log(`Mockups   : ${updated} updated, ${inserted} inserted, ${skipped} skipped`);
  console.log(`Watermarks: ${wmAdded} added, ${wmSkipped} skipped`);
  console.log('=========================');

  await conn.end();
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
