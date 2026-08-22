import '../src/env.js'; // MUST be first
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { prisma } from '../src/services/db.js';

/**
 * Chuyển dữ liệu từ SQLite cũ sang MySQL (một lần, khi đổi database).
 *
 *   pnpm --filter api exec tsx scripts/migrate-sqlite-to-mysql.ts [--sqlite <path>] [--dry-run] [--force]
 *
 * DATABASE_URL trong .env phải đã trỏ sang MySQL và schema đã được tạo
 * (`prisma migrate deploy`) trước khi chạy.
 *
 * Script chỉ đụng vào DATABASE — file ảnh trong storage/ copy riêng bằng rsync.
 * Đường dẫn lưu trong DB là tương đối so với STORAGE_DIR nên không cần sửa gì.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const FORCE = argv.includes('--force');
const BATCH = 500;

function argValue(flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

const SQLITE_PATH = path.resolve(
  argValue('--sqlite') ?? process.env.SQLITE_DB ?? path.join(REPO_ROOT, 'storage/genmockup.db'),
);

/**
 * Thứ tự là thứ tự khoá ngoại — bảng cha trước bảng con. Đừng sắp xếp lại.
 *
 * `dates`  : cột SQLite lưu epoch-ms (Prisma/SQLite lưu DateTime kiểu INTEGER) → Date
 * `bools`  : cột SQLite lưu 0/1 → boolean
 * `fks`    : [cột, bảng cha, bắt buộc?] để dò bản ghi mồ côi trước khi ghi
 */
type TableSpec = {
  table: string;
  model: string;
  dates: string[];
  bools?: string[];
  fks?: Array<{ column: string; parent: string; required: boolean }>;
};

const TABLES: TableSpec[] = [
  { table: 'users', model: 'user', dates: ['createdAt'] },
  { table: 'app_settings', model: 'appSetting', dates: ['updatedAt'] },
  { table: 'watermarks', model: 'watermark', dates: ['createdAt'] },
  { table: 'mockups', model: 'mockup', dates: ['createdAt', 'updatedAt'] },
  {
    table: 'mockup_shares',
    model: 'mockupShare',
    dates: ['createdAt'],
    fks: [{ column: 'mockupId', parent: 'mockups', required: true }],
  },
  { table: 'shirt_sets', model: 'shirtSet', dates: ['createdAt', 'updatedAt'] },
  {
    table: 'shirt_variants',
    model: 'shirtVariant',
    dates: ['createdAt'],
    fks: [{ column: 'setId', parent: 'shirt_sets', required: true }],
  },
  {
    table: 'shirt_set_shares',
    model: 'shirtSetShare',
    dates: ['createdAt'],
    fks: [{ column: 'setId', parent: 'shirt_sets', required: true }],
  },
  {
    table: 'skin_scenes',
    model: 'skinScene',
    dates: ['createdAt', 'updatedAt'],
    bools: ['calibrated'],
  },
  {
    table: 'skin_scene_shares',
    model: 'skinSceneShare',
    dates: ['createdAt'],
    fks: [{ column: 'sceneId', parent: 'skin_scenes', required: true }],
  },
  { table: 'idea_generations', model: 'ideaGeneration', dates: ['createdAt'] },
  {
    table: 'idea_images',
    model: 'ideaImage',
    dates: ['createdAt'],
    bools: ['saved'],
    fks: [{ column: 'generationId', parent: 'idea_generations', required: false }],
  },
  {
    table: 'generations',
    model: 'generation',
    dates: ['createdAt'],
    bools: ['designIsUrl'],
    fks: [{ column: 'watermarkId', parent: 'watermarks', required: false }],
  },
  {
    table: 'generation_items',
    model: 'generationItem',
    dates: ['createdAt'],
    fks: [
      { column: 'generationId', parent: 'generations', required: true },
      { column: 'mockupId', parent: 'mockups', required: false },
      { column: 'variantId', parent: 'shirt_variants', required: false },
      { column: 'sceneId', parent: 'skin_scenes', required: false },
    ],
  },
];

/**
 * MySQL 8 mặc định collation utf8mb4_unicode_ci — KHÔNG phân biệt hoa thường,
 * khác SQLite. Hai hàng chỉ khác hoa/thường ở SQLite sẽ đụng unique key ở MySQL.
 * Phải phát hiện trước, vì lỗi lúc ghi giữa chừng khó dọn hơn nhiều.
 */
const CASE_COLLISION_CHECKS: Array<{ label: string; sql: string }> = [
  {
    label: 'users.username',
    sql: `select group_concat(username, ' | ') hits from users
          group by lower(username) having count(*) > 1`,
  },
  {
    label: 'shirt_sets (ownerId, name)',
    sql: `select group_concat(name, ' | ') hits from shirt_sets
          group by ownerId, lower(name) having count(*) > 1`,
  },
];

function toDate(v: unknown): Date | null {
  if (v === null || v === undefined) return null;
  // Prisma/SQLite lưu DateTime kiểu INTEGER epoch-ms, nhưng DB đụng tay có thể là chuỗi ISO
  const d = typeof v === 'number' ? new Date(v) : new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new Error(`Giá trị ngày không hợp lệ: ${String(v)}`);
  return d;
}

function convertRow(row: Record<string, unknown>, spec: TableSpec) {
  const out: Record<string, unknown> = { ...row };
  for (const c of spec.dates) if (c in out) out[c] = toDate(out[c]);
  for (const c of spec.bools ?? []) if (c in out) out[c] = out[c] === null ? null : Boolean(out[c]);
  return out;
}

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  if (!url.startsWith('mysql://')) {
    throw new Error(
      `DATABASE_URL phải là mysql:// (đang là "${url.slice(0, 24)}..."). ` +
        'Sửa .env sang MySQL rồi chạy `prisma migrate deploy` trước.',
    );
  }
  if (!existsSync(SQLITE_PATH)) {
    throw new Error(`Không thấy file SQLite: ${SQLITE_PATH} (dùng --sqlite <path> để chỉ đường)`);
  }

  console.log(`SQLite nguồn : ${SQLITE_PATH}`);
  console.log(`MySQL đích   : ${url.replace(/:[^:@/]*@/, ':***@')}`);
  console.log(DRY_RUN ? 'Chế độ       : DRY RUN (không ghi gì)\n' : 'Chế độ       : GHI THẬT\n');

  const db = new Database(SQLITE_PATH, { readonly: true });
  db.pragma('query_only = true');

  const existingTables = new Set(
    db
      .prepare(`select name from sqlite_master where type = 'table'`)
      .all()
      .map((r) => (r as { name: string }).name),
  );

  // --- Tiền kiểm tra 1: bảng đích phải rỗng -------------------------------
  const nonEmpty: string[] = [];
  for (const spec of TABLES) {
    const count = await (prisma as any)[spec.model].count();
    if (count > 0) nonEmpty.push(`${spec.table} (${count})`);
  }
  if (nonEmpty.length && !FORCE) {
    throw new Error(
      `MySQL đã có dữ liệu ở: ${nonEmpty.join(', ')}.\n` +
        'Chạy trên DB rỗng, hoặc thêm --force để chèn thêm (bỏ qua bản ghi trùng id).',
    );
  }

  // --- Tiền kiểm tra 2: đụng hoa/thường do collation ----------------------
  let collisions = 0;
  for (const check of CASE_COLLISION_CHECKS) {
    const rows = db.prepare(check.sql).all() as Array<{ hits: string }>;
    for (const r of rows) {
      console.error(`  ✗ ĐỤNG HOA/THƯỜNG ở ${check.label}: ${r.hits}`);
      collisions++;
    }
  }
  if (collisions && !FORCE) {
    throw new Error(
      `${collisions} nhóm bản ghi chỉ khác nhau hoa/thường — MySQL sẽ coi là trùng và ` +
        'unique key sẽ nổ. Đổi tên ở SQLite trước rồi chạy lại.',
    );
  }

  // --- Tiền kiểm tra 3: khoá ngoại mồ côi ---------------------------------
  const orphans: Record<string, Record<string, number>> = {};
  for (const spec of TABLES) {
    if (!spec.fks || !existingTables.has(spec.table)) continue;
    for (const fk of spec.fks) {
      const nullClause = fk.required ? '' : `${fk.column} is not null and `;
      const { c } = db
        .prepare(
          `select count(*) c from ${spec.table}
           where ${nullClause}${fk.column} not in (select id from ${fk.parent})`,
        )
        .get() as { c: number };
      if (c > 0) {
        (orphans[spec.table] ??= {})[fk.column] = c;
        const action = fk.required ? 'BỎ HÀNG' : 'đặt NULL';
        console.warn(`  ! ${spec.table}.${fk.column}: ${c} bản ghi mồ côi → ${action}`);
      }
    }
  }

  // --- Chuyển dữ liệu ------------------------------------------------------
  const summary: Array<[string, number, number, number]> = [];

  for (const spec of TABLES) {
    if (!existingTables.has(spec.table)) {
      console.log(`- ${spec.table.padEnd(20)} không có ở SQLite, bỏ qua`);
      continue;
    }

    const rows = db.prepare(`select * from ${spec.table}`).all() as Array<Record<string, unknown>>;
    let skipped = 0;
    let nulled = 0;

    // Chỉ nạp id bảng cha cho đúng những cột mà tiền kiểm tra đã thấy có mồ côi.
    // Bảng sạch (trường hợp thường gặp) không tốn gì.
    const dirtyFks = (spec.fks ?? [])
      .filter((fk) => orphans[spec.table]?.[fk.column])
      .map((fk) => ({
        ...fk,
        ids: new Set(
          db
            .prepare(`select id from ${fk.parent}`)
            .all()
            .map((r) => (r as { id: string }).id),
        ),
      }));

    const payload: Array<Record<string, unknown>> = [];
    for (const raw of rows) {
      let drop = false;
      for (const fk of dirtyFks) {
        const v = raw[fk.column];
        if (v === null || v === undefined) continue;
        if (!fk.ids.has(String(v))) {
          if (fk.required) {
            drop = true;
            break;
          }
          raw[fk.column] = null;
          nulled++;
        }
      }
      if (drop) {
        skipped++;
        continue;
      }
      payload.push(convertRow(raw, spec));
    }

    if (!DRY_RUN) {
      for (let i = 0; i < payload.length; i += BATCH) {
        await (prisma as any)[spec.model].createMany({
          data: payload.slice(i, i + BATCH),
          skipDuplicates: true,
        });
      }
    }

    const written = DRY_RUN ? payload.length : await (prisma as any)[spec.model].count();
    summary.push([spec.table, rows.length, written, skipped]);
    const note = [skipped ? `bỏ ${skipped}` : '', nulled ? `null hoá ${nulled} FK` : '']
      .filter(Boolean)
      .join(', ');
    console.log(
      `✓ ${spec.table.padEnd(20)} ${String(rows.length).padStart(6)} → ${String(written).padStart(6)}${note ? '  (' + note + ')' : ''}`,
    );
  }

  db.close();

  // --- Đối chiếu -----------------------------------------------------------
  console.log('\n' + 'Bảng'.padEnd(22) + 'SQLite'.padStart(8) + 'MySQL'.padStart(8) + '  ');
  let mismatch = 0;
  for (const [table, src, dst, skipped] of summary) {
    // Với --force, MySQL có thể đã có sẵn dữ liệu nên count() không phải con số để đối chiếu
    const ok = FORCE ? dst >= src - skipped : dst === src - skipped;
    if (!ok) mismatch++;
    console.log(
      table.padEnd(22) +
        String(src).padStart(8) +
        String(dst).padStart(8) +
        (ok ? '  ok' : '  ✗ LỆCH'),
    );
  }

  if (DRY_RUN) {
    console.log('\nDRY RUN — chưa ghi gì vào MySQL.');
  } else if (mismatch) {
    throw new Error(`${mismatch} bảng có số dòng lệch — kiểm tra lại trước khi mở app.`);
  } else {
    console.log('\nXong. Số dòng khớp hết.');
  }
}

main()
  .catch((e) => {
    console.error('\nLỖI:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
