import { prisma } from './db.js';

/**
 * Chuyển quyền sở hữu nội dung giữa các user (chỉ admin gọi).
 *
 * File KHÔNG bị di chuyển: đường dẫn nằm sẵn trong DB nên vẫn đọc được, dù thư mục
 * còn mang id chủ cũ (`skinscenes/<ownerId>/…`). Đổi lại, xoá chủ cũ sau này không
 * đụng tới file đã chuyển đi — đúng thứ ta muốn.
 */

export type ContentType = 'mockup' | 'shirtSet' | 'skinScene' | 'watermark' | 'idea' | 'generation';

export const CONTENT_TYPES: ContentType[] = [
  'mockup',
  'shirtSet',
  'skinScene',
  'watermark',
  'idea',
  'generation',
];

/** Những loại chọn được từng item trên trang danh sách (idea/generation chỉ chuyển hàng loạt). */
export const ITEM_TYPES: ContentType[] = ['mockup', 'shirtSet', 'skinScene', 'watermark'];

export const CONTENT_LABELS: Record<ContentType, string> = {
  mockup: 'Mockup card',
  shirtSet: 'Bộ áo',
  skinScene: 'Mockup card skin / pass sleeve',
  watermark: 'Watermark',
  idea: 'Ảnh ý tưởng',
  generation: 'Lịch sử generate',
};

export function isContentType(v: unknown): v is ContentType {
  return typeof v === 'string' && (CONTENT_TYPES as string[]).includes(v);
}

export async function countContent(ownerId: string): Promise<Record<ContentType, number>> {
  const [mockup, shirtSet, skinScene, watermark, ideaImage, ideaGen, generation] = await Promise.all([
    prisma.mockup.count({ where: { ownerId } }),
    prisma.shirtSet.count({ where: { ownerId } }),
    prisma.skinScene.count({ where: { ownerId } }),
    prisma.watermark.count({ where: { ownerId } }),
    prisma.ideaImage.count({ where: { ownerId } }),
    prisma.ideaGeneration.count({ where: { ownerId } }),
    prisma.generation.count({ where: { ownerId } }),
  ]);
  return { mockup, shirtSet, skinScene, watermark, idea: ideaImage + ideaGen, generation };
}

export interface TransferResult {
  moved: number;
  /** số bộ áo phải đổi tên vì chủ mới đã có bộ trùng tên (ShirtSet unique [ownerId, name]) */
  renamed: number;
}

interface TransferOpts {
  type: ContentType;
  toUserId: string;
  /** giới hạn theo chủ cũ — bắt buộc khi chuyển hàng loạt theo user */
  fromUserId?: string;
  /** giới hạn theo id cụ thể — dùng khi đổi chủ từng item */
  ids?: string[];
}

/** Chủ mới không cần nằm trong danh sách được chia sẻ nữa. */
async function dropSharesTo(type: ContentType, ids: string[], userId: string): Promise<void> {
  if (!ids.length) return;
  if (type === 'mockup') await prisma.mockupShare.deleteMany({ where: { mockupId: { in: ids }, userId } });
  else if (type === 'shirtSet') await prisma.shirtSetShare.deleteMany({ where: { setId: { in: ids }, userId } });
  else if (type === 'skinScene') await prisma.skinSceneShare.deleteMany({ where: { sceneId: { in: ids }, userId } });
}

export async function transferContent(opts: TransferOpts): Promise<TransferResult> {
  const { type, toUserId, fromUserId, ids } = opts;
  if (ids && !ids.length) return { moved: 0, renamed: 0 };

  const where: { ownerId?: string; id?: { in: string[] } } = {};
  if (fromUserId) where.ownerId = fromUserId;
  if (ids) where.id = { in: ids };
  // Không có điều kiện nào ⇒ sẽ chuyển sạch DB. Chặn từ đây cho chắc.
  if (!fromUserId && !ids) throw new Error('transfer_scope_required');

  if (type === 'idea') {
    const [imgs, gens] = await Promise.all([
      prisma.ideaImage.updateMany({ where, data: { ownerId: toUserId } }),
      prisma.ideaGeneration.updateMany({ where, data: { ownerId: toUserId } }),
    ]);
    return { moved: imgs.count + gens.count, renamed: 0 };
  }

  if (type === 'generation') {
    const { count } = await prisma.generation.updateMany({ where, data: { ownerId: toUserId } });
    return { moved: count, renamed: 0 };
  }

  if (type === 'watermark') {
    const { count } = await prisma.watermark.updateMany({ where, data: { ownerId: toUserId } });
    return { moved: count, renamed: 0 };
  }

  if (type === 'mockup') {
    const rows = await prisma.mockup.findMany({ where, select: { id: true } });
    const movedIds = rows.map((r) => r.id);
    const { count } = await prisma.mockup.updateMany({
      where: { id: { in: movedIds } },
      data: { ownerId: toUserId },
    });
    await dropSharesTo('mockup', movedIds, toUserId);
    return { moved: count, renamed: 0 };
  }

  if (type === 'skinScene') {
    const rows = await prisma.skinScene.findMany({ where, select: { id: true } });
    const movedIds = rows.map((r) => r.id);
    const { count } = await prisma.skinScene.updateMany({
      where: { id: { in: movedIds } },
      data: { ownerId: toUserId },
    });
    await dropSharesTo('skinScene', movedIds, toUserId);
    return { moved: count, renamed: 0 };
  }

  // shirtSet: unique [ownerId, name] ⇒ trùng tên bên chủ mới thì đổi tên thay vì bỏ qua.
  const sets = await prisma.shirtSet.findMany({ where, select: { id: true, name: true, ownerId: true } });
  if (!sets.length) return { moved: 0, renamed: 0 };
  const targetNames = new Set(
    (
      await prisma.shirtSet.findMany({ where: { ownerId: toUserId }, select: { name: true } })
    ).map((s) => s.name),
  );

  let renamed = 0;
  const updates = sets.map((s) => {
    let name = s.name;
    if (targetNames.has(name)) {
      const base = name;
      let i = 2;
      while (targetNames.has(name)) name = `${base} (${i++})`;
      renamed++;
    }
    targetNames.add(name);
    return prisma.shirtSet.update({
      where: { id: s.id },
      data: { ownerId: toUserId, ...(name === s.name ? {} : { name }) },
    });
  });
  await prisma.$transaction(updates);
  await dropSharesTo(
    'shirtSet',
    sets.map((s) => s.id),
    toUserId,
  );
  return { moved: sets.length, renamed };
}
