import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { SceneKind } from '@genmockup/shared';
import { prisma } from '../services/db.js';
import { saveFile, saveOutput, extFromMime } from '../services/storage.js';
import { compose, fetchDesign, readStoredFile } from '../services/composer.js';
import { composeSkin } from '../services/skin.js';
import { generationToDto } from '../services/dto.js';
import { requireUserId } from '../services/auth.js';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function parseStringArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
    return [String(parsed)];
  } catch {
    return [raw];
  }
}

interface AreaInput {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}

interface ParsedGenerate {
  designBuffer: Buffer | null;
  designPath: string | null;
  designIsUrl: boolean;
  mockupIds: string[];
  setIds: string[];
  /** id các mockup card skin (đã khoét lỗ) được chọn. */
  sceneIds: string[];
  watermarkId?: string;
  count?: number;
  /** Override designArea theo từng setId (chọn ngay ở Generate). */
  designAreas?: Record<string, AreaInput>;
  /** Màu được chọn thủ công theo từng setId. Có giá trị → bỏ qua random theo count. */
  colors?: Record<string, string[]>;
  /** id ảnh ý tưởng (New Idea) được dùng làm design, nếu có. */
  ideaImageId?: string;
  /** title đăng bán đã gen sẵn của ảnh ý tưởng (mang sang generation). */
  ideaListingTitle?: string | null;
}

function parseAreaMap(raw: unknown): Record<string, AreaInput> | undefined {
  const obj = typeof raw === 'string' ? safeJson(raw) : raw;
  if (!obj || typeof obj !== 'object') return undefined;
  const out: Record<string, AreaInput> = {};
  for (const [k, v] of Object.entries(obj as Record<string, any>)) {
    if (v && typeof v === 'object') {
      out[k] = {
        x: Number(v.x) || 0,
        y: Number(v.y) || 0,
        width: Number(v.width) || 0,
        height: Number(v.height) || 0,
        rotation: Number(v.rotation) || 0,
      };
    }
  }
  return Object.keys(out).length ? out : undefined;
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Parse map setId → danh sách màu ({ "<setId>": ["black", "white"] }). */
function parseColorsMap(raw: unknown): Record<string, string[]> | undefined {
  const obj = typeof raw === 'string' ? safeJson(raw) : raw;
  if (!obj || typeof obj !== 'object') return undefined;
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(obj as Record<string, any>)) {
    if (Array.isArray(v)) {
      const list = v.map(String).filter((c) => c.length > 0);
      if (list.length) out[k] = Array.from(new Set(list));
    }
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Parse request /generate (multipart designFile hoặc JSON designUrl) →
 * design buffer/path + các field. Dùng chung cho card & shirt.
 */
async function parseGenerateRequest(req: FastifyRequest, ownerId: string): Promise<ParsedGenerate> {
  let designBuffer: Buffer | null = null;
  let designPath: string | null = null;
  let designIsUrl = false;
  let mockupIds: string[] = [];
  let setIds: string[] = [];
  let sceneIds: string[] = [];
  let watermarkId: string | undefined;
  let count: number | undefined;
  let designAreas: Record<string, AreaInput> | undefined;
  let colors: Record<string, string[]> | undefined;
  let designImageId: string | undefined;

  const ct = req.headers['content-type'] || '';
  if (ct.includes('multipart/form-data')) {
    const parts = req.parts();
    let designMime = 'image/png';
    for await (const part of parts) {
      if (part.type === 'file' && part.fieldname === 'designFile') {
        designBuffer = await part.toBuffer();
        designMime = part.mimetype || designMime;
      } else if (part.type === 'field') {
        const value = String(part.value);
        if (part.fieldname === 'mockupIds') mockupIds = parseStringArray(value);
        else if (part.fieldname === 'setIds') setIds = parseStringArray(value);
        else if (part.fieldname === 'sceneIds') sceneIds = parseStringArray(value);
        else if (part.fieldname === 'watermarkId') watermarkId = value || undefined;
        else if (part.fieldname === 'count') count = parseInt(value, 10) || undefined;
        else if (part.fieldname === 'designAreas') designAreas = parseAreaMap(value);
        else if (part.fieldname === 'colors') colors = parseColorsMap(value);
        else if (part.fieldname === 'designImageId') designImageId = value || undefined;
        else if (part.fieldname === 'designUrl') {
          designPath = value;
          designIsUrl = true;
        }
      }
    }

    if (designBuffer && !designPath) {
      const today = new Date().toISOString().slice(0, 10);
      const saved = await saveFile(designBuffer, `designs/${today}`, extFromMime(designMime));
      designPath = saved.relativePath;
      designIsUrl = false;
    }
  } else {
    const body = (req.body || {}) as {
      designUrl?: string;
      designImageId?: string;
      mockupIds?: string[];
      setIds?: string[];
      sceneIds?: string[];
      watermarkId?: string;
      count?: number;
      designAreas?: Record<string, AreaInput>;
      colors?: Record<string, string[]>;
    };
    mockupIds = body.mockupIds || [];
    setIds = body.setIds || [];
    sceneIds = body.sceneIds || [];
    watermarkId = body.watermarkId;
    count = body.count;
    designAreas = parseAreaMap(body.designAreas);
    colors = parseColorsMap(body.colors);
    designImageId = body.designImageId;
    if (body.designUrl) {
      designPath = body.designUrl;
      designIsUrl = true;
      designBuffer = await fetchDesign(body.designUrl, true);
    }
  }

  // Nguồn design = ảnh ý tưởng đã lưu (New Idea) — chỉ của chính user
  let ideaImageId: string | undefined;
  let ideaListingTitle: string | null | undefined;
  if (designImageId && !designBuffer) {
    const img = await prisma.ideaImage.findFirst({ where: { id: designImageId, ownerId } });
    if (!img) throw new Error(`idea_image_not_found: ${designImageId}`);
    designPath = img.filePath;
    designIsUrl = false;
    designBuffer = await readStoredFile(img.filePath);
    ideaImageId = img.id;
    ideaListingTitle = img.title;
  }

  return { designBuffer, designPath, designIsUrl, mockupIds, setIds, sceneIds, watermarkId, count, designAreas, colors, ideaImageId, ideaListingTitle };
}

export async function generateRoutes(app: FastifyInstance) {
  app.post('/api/generate', async (req, reply) => {
    const started = Date.now();
    const ownerId = requireUserId(req);

    const { designBuffer, designPath, designIsUrl, mockupIds, watermarkId } =
      await parseGenerateRequest(req, ownerId);

    if (!designBuffer || !designPath) {
      return reply.code(400).send({ error: 'missing_design' });
    }
    if (!mockupIds.length) {
      return reply.code(400).send({ error: 'missing_mockup_ids' });
    }

    const generation = await prisma.generation.create({
      data: {
        ownerId,
        designPath,
        designIsUrl,
        watermarkId: watermarkId || null,
        status: 'pending',
      },
    });

    try {
      const mockups = await prisma.mockup.findMany({
        where: {
          id: { in: mockupIds },
          OR: [{ ownerId }, { shares: { some: { userId: ownerId } } }],
        },
      });
      if (mockups.length !== mockupIds.length) {
        const found = new Set(mockups.map((m) => m.id));
        const missing = mockupIds.filter((id) => !found.has(id));
        throw new Error(`mockup_not_found: ${missing.join(',')}`);
      }

      let watermarkBuffer: Buffer | undefined;
      if (watermarkId) {
        const w = await prisma.watermark.findFirst({ where: { id: watermarkId, ownerId } });
        if (!w) throw new Error(`watermark_not_found: ${watermarkId}`);
        watermarkBuffer = await readStoredFile(w.filePath);
      }

      const items = [];
      for (const m of mockups) {
        const mockupBuffer = await readStoredFile(m.filePath);
        const hasWatermarkArea =
          m.watermarkX !== null &&
          m.watermarkY !== null &&
          m.watermarkWidth !== null &&
          m.watermarkHeight !== null;

        const outBuf = await compose({
          mockupBuffer,
          designBuffer,
          designArea: {
            x: m.designX,
            y: m.designY,
            width: m.designWidth,
            height: m.designHeight,
            rotation: m.designRotation,
          },
          watermarkBuffer: hasWatermarkArea ? watermarkBuffer : undefined,
          watermarkArea: hasWatermarkArea
            ? {
                x: m.watermarkX!,
                y: m.watermarkY!,
                width: m.watermarkWidth!,
                height: m.watermarkHeight!,
                rotation: m.watermarkRotation ?? 0,
              }
            : null,
        });

        const saved = await saveOutput(outBuf, generation.id, m.id);
        const item = await prisma.generationItem.create({
          data: {
            generationId: generation.id,
            mockupId: m.id,
            outputPath: saved.relativePath,
          },
        });
        items.push(item);
      }

      const updated = await prisma.generation.update({
        where: { id: generation.id },
        data: { status: 'done', durationMs: Date.now() - started },
        include: { items: true },
      });

      return generationToDto(updated);
    } catch (err: any) {
      app.log.error(err);
      await prisma.generation.update({
        where: { id: generation.id },
        data: {
          status: 'error',
          error: err?.message || String(err),
          durationMs: Date.now() - started,
        },
      });
      return reply.code(500).send({ error: 'generate_failed', message: err?.message });
    }
  });

  app.post('/api/generate/shirt', async (req, reply) => {
    const started = Date.now();
    const ownerId = requireUserId(req);

    const { designBuffer, designPath, designIsUrl, setIds, watermarkId, count, designAreas, colors, ideaImageId, ideaListingTitle } =
      await parseGenerateRequest(req, ownerId);

    if (!designBuffer || !designPath) {
      return reply.code(400).send({ error: 'missing_design' });
    }
    if (!setIds.length) {
      return reply.code(400).send({ error: 'missing_set_ids' });
    }
    const wanted = Math.max(1, Math.min(count ?? 6, 100));

    const generation = await prisma.generation.create({
      data: {
        ownerId,
        productType: 'shirt',
        title: ideaListingTitle || null,
        designPath,
        designIsUrl,
        watermarkId: watermarkId || null,
        status: 'pending',
      },
    });

    try {
      const sets = await prisma.shirtSet.findMany({
        where: {
          id: { in: setIds },
          OR: [{ ownerId }, { shares: { some: { userId: ownerId } } }],
        },
        include: { variants: true },
      });
      if (sets.length !== setIds.length) {
        const found = new Set(sets.map((s) => s.id));
        const missing = setIds.filter((id) => !found.has(id));
        throw new Error(`shirt_set_not_found: ${missing.join(',')}`);
      }
      const setById = new Map(sets.map((s) => [s.id, s]));

      let watermarkBuffer: Buffer | undefined;
      if (watermarkId) {
        const w = await prisma.watermark.findFirst({ where: { id: watermarkId, ownerId } });
        if (!w) throw new Error(`watermark_not_found: ${watermarkId}`);
        watermarkBuffer = await readStoredFile(w.filePath);
      }

      // Lọc map màu đã chọn về đúng các bộ đang generate.
      const colorSel = colors
        ? Object.fromEntries(Object.entries(colors).filter(([sid]) => setById.has(sid)))
        : undefined;
      const hasColorSel = colorSel && Object.keys(colorSel).length > 0;

      let chosen: typeof sets[number]['variants'];
      if (hasColorSel) {
        // Chọn màu thủ công: đúng từng (bộ, màu) người dùng chọn, mỗi màu 1 variant ngẫu nhiên.
        chosen = [];
        for (const [sid, wantColors] of Object.entries(colorSel!)) {
          const set = setById.get(sid)!;
          for (const color of wantColors) {
            const matches = set.variants.filter((v) => v.color === color);
            if (matches.length) chosen.push(matches[Math.floor(Math.random() * matches.length)]);
          }
        }
        if (chosen.length === 0) {
          throw new Error('no_variants_for_selected_colors');
        }
      } else {
        // Pool tất cả variants, gom theo màu → chọn ngẫu nhiên `wanted` màu khác nhau,
        // mỗi màu 1 variant ngẫu nhiên.
        const byColor = new Map<string, typeof sets[number]['variants']>();
        for (const s of sets) {
          for (const v of s.variants) {
            const list = byColor.get(v.color) ?? [];
            list.push(v);
            byColor.set(v.color, list);
          }
        }
        const pickedColors = shuffle([...byColor.keys()]).slice(0, wanted);
        chosen = pickedColors.map((c) => {
          const list = byColor.get(c)!;
          return list[Math.floor(Math.random() * list.length)];
        });

        if (chosen.length === 0) {
          throw new Error('no_variants_in_selected_sets');
        }
      }

      const items = [];
      for (const v of chosen) {
        const set = setById.get(v.setId)!;
        const mockupBuffer = await readStoredFile(v.filePath);
        const hasWatermarkArea =
          set.watermarkX !== null &&
          set.watermarkY !== null &&
          set.watermarkWidth !== null &&
          set.watermarkHeight !== null;

        const override = designAreas?.[set.id];
        const designArea = override
          ? {
              x: Math.round(override.x),
              y: Math.round(override.y),
              width: Math.round(override.width),
              height: Math.round(override.height),
              rotation: override.rotation ?? 0,
            }
          : {
              x: set.designX,
              y: set.designY,
              width: set.designWidth,
              height: set.designHeight,
              rotation: set.designRotation,
            };

        const outBuf = await compose({
          mockupBuffer,
          designBuffer,
          designOnTop: true,
          preserveDesignRatio: true,
          designArea,
          watermarkBuffer: hasWatermarkArea ? watermarkBuffer : undefined,
          watermarkArea: hasWatermarkArea
            ? {
                x: set.watermarkX!,
                y: set.watermarkY!,
                width: set.watermarkWidth!,
                height: set.watermarkHeight!,
                rotation: set.watermarkRotation ?? 0,
              }
            : null,
        });

        const saved = await saveOutput(outBuf, generation.id, v.id);
        const item = await prisma.generationItem.create({
          data: {
            generationId: generation.id,
            variantId: v.id,
            label: `${set.name}_${v.color}`,
            outputPath: saved.relativePath,
          },
        });
        items.push(item);
      }

      const updated = await prisma.generation.update({
        where: { id: generation.id },
        data: { status: 'done', durationMs: Date.now() - started },
        include: { items: true },
      });

      // Đếm số lần idea được dùng để gen mockup
      if (ideaImageId) {
        await prisma.ideaImage
          .update({ where: { id: ideaImageId }, data: { usedCount: { increment: 1 } } })
          .catch(() => {});
      }

      return generationToDto(updated);
    } catch (err: any) {
      app.log.error(err);
      await prisma.generation.update({
        where: { id: generation.id },
        data: {
          status: 'error',
          error: err?.message || String(err),
          durationMs: Date.now() - started,
        },
      });
      return reply.code(500).send({ error: 'generate_failed', message: err?.message });
    }
  });

  /**
   * Card skin / pass sleeve: design nằm dưới, mockup đã khoét lỗ đè lên. Không có watermark/count —
   * mỗi scene được chọn cho ra đúng 1 ảnh, vị trí lấy từ vùng đã calibrate của scene.
   * Hai loại dùng chung pipeline; chỉ khác loại scene được chọn và productType ghi lại.
   */
  const sceneGenerate = (kind: SceneKind) => async (req: FastifyRequest, reply: FastifyReply) => {
    const started = Date.now();
    const ownerId = requireUserId(req);

    const { designBuffer, designPath, designIsUrl, sceneIds, ideaImageId, ideaListingTitle } =
      await parseGenerateRequest(req, ownerId);

    if (!designBuffer || !designPath) return reply.code(400).send({ error: 'missing_design' });
    if (!sceneIds.length) return reply.code(400).send({ error: 'missing_scene_ids' });

    const generation = await prisma.generation.create({
      data: {
        ownerId,
        productType: kind === 'pass' ? 'pass' : 'skin',
        title: ideaListingTitle || null,
        designPath,
        designIsUrl,
        status: 'pending',
      },
    });

    try {
      const scenes = await prisma.skinScene.findMany({
        where: {
          id: { in: sceneIds },
          kind,
          OR: [{ ownerId }, { shares: { some: { userId: ownerId } } }],
        },
      });
      if (scenes.length !== sceneIds.length) {
        const found = new Set(scenes.map((s) => s.id));
        throw new Error(`skin_scene_not_found: ${sceneIds.filter((id) => !found.has(id)).join(',')}`);
      }

      const items = [];
      let ratioWarning: string | null = null;
      for (const sc of scenes) {
        const { buffer, srcRatio, holeRatio } = await composeSkin({
          sceneBuffer: await readStoredFile(sc.filePath),
          designBuffer,
          corners: JSON.parse(sc.cornersJson),
          ctrl: JSON.parse(sc.ctrlJson),
          width: sc.width,
          height: sc.height,
        });

        // Design bị kéo lấp đầy vùng dán → lệch tỉ lệ nhiều là ảnh sẽ méo mà nhìn lướt khó thấy.
        if (holeRatio && Math.abs(srcRatio - holeRatio) / holeRatio > 0.12 && !ratioWarning) {
          ratioWarning = `Tỉ lệ design (${srcRatio}) lệch nhiều so với vùng dán của "${sc.name}" (${holeRatio}) — ảnh có thể bị méo.`;
        }

        const saved = await saveOutput(buffer, generation.id, sc.id);
        items.push(
          await prisma.generationItem.create({
            data: {
              generationId: generation.id,
              sceneId: sc.id,
              label: sc.name,
              outputPath: saved.relativePath,
            },
          }),
        );
      }

      const updated = await prisma.generation.update({
        where: { id: generation.id },
        data: { status: 'done', durationMs: Date.now() - started },
        include: { items: true },
      });

      if (ideaImageId) {
        await prisma.ideaImage
          .update({ where: { id: ideaImageId }, data: { usedCount: { increment: 1 } } })
          .catch(() => {});
      }

      return { ...generationToDto(updated), ratioWarning };
    } catch (err: any) {
      app.log.error(err);
      await prisma.generation.update({
        where: { id: generation.id },
        data: { status: 'error', error: err?.message || String(err), durationMs: Date.now() - started },
      });
      return reply.code(500).send({ error: 'generate_failed', message: err?.message });
    }
  };

  app.post('/api/generate/skin', sceneGenerate('card'));
  app.post('/api/generate/pass', sceneGenerate('pass'));

  app.get('/api/generations/:id', async (req, reply) => {
    const ownerId = requireUserId(req);
    const { id } = req.params as { id: string };
    const g = await prisma.generation.findFirst({
      where: { id, ownerId },
      include: { items: true },
    });
    if (!g) return reply.code(404).send({ error: 'not_found' });
    return generationToDto(g);
  });
}
