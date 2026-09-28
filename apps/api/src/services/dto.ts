import type {
  Mockup,
  Watermark,
  Generation,
  GenerationItem,
  ShirtSet,
  ShirtVariant,
  SkinScene,
  IdeaImage,
  IdeaGeneration,
} from '@prisma/client';
import type { SceneKind } from '@genmockup/shared';
import { buildPublicUrl } from './storage.js';

export function ideaImageToDto(i: IdeaImage) {
  return {
    id: i.id,
    generationId: i.generationId,
    filePath: i.filePath,
    fileUrl: buildPublicUrl(i.filePath),
    prompt: i.prompt,
    ideaTitle: i.ideaTitle,
    sellingPoints: i.sellingPoints,
    keyword: i.keyword,
    title: i.title,
    usedCount: i.usedCount,
    width: i.width,
    height: i.height,
    saved: i.saved,
    createdAt: i.createdAt.toISOString(),
  };
}

export function ideaGenerationToDto(g: IdeaGeneration & { images: IdeaImage[] }) {
  return {
    id: g.id,
    title: g.title,
    keyword: g.keyword,
    analysis: g.analysis,
    status: g.status as 'pending' | 'done' | 'error',
    error: g.error,
    images: g.images.map(ideaImageToDto),
    createdAt: g.createdAt.toISOString(),
  };
}

export function mockupToDto(m: Mockup) {
  return {
    id: m.id,
    name: m.name,
    filePath: m.filePath,
    fileUrl: buildPublicUrl(m.filePath),
    width: m.width,
    height: m.height,
    designArea: {
      x: m.designX,
      y: m.designY,
      width: m.designWidth,
      height: m.designHeight,
      rotation: m.designRotation,
    },
    watermarkArea:
      m.watermarkX !== null &&
      m.watermarkY !== null &&
      m.watermarkWidth !== null &&
      m.watermarkHeight !== null
        ? {
            x: m.watermarkX,
            y: m.watermarkY,
            width: m.watermarkWidth,
            height: m.watermarkHeight,
            rotation: m.watermarkRotation ?? 0,
          }
        : null,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

export function shirtVariantToDto(v: ShirtVariant) {
  return {
    id: v.id,
    setId: v.setId,
    color: v.color,
    filePath: v.filePath,
    fileUrl: buildPublicUrl(v.filePath),
    width: v.width,
    height: v.height,
    createdAt: v.createdAt.toISOString(),
  };
}

export function shirtSetToDto(s: ShirtSet & { variants?: ShirtVariant[] }) {
  const variants = (s.variants ?? []).map(shirtVariantToDto);
  const rep =
    variants.find((v) => v.color === s.representativeColor) ?? variants[0] ?? null;
  return {
    id: s.id,
    name: s.name,
    designArea: {
      x: s.designX,
      y: s.designY,
      width: s.designWidth,
      height: s.designHeight,
      rotation: s.designRotation,
    },
    watermarkArea:
      s.watermarkX !== null &&
      s.watermarkY !== null &&
      s.watermarkWidth !== null &&
      s.watermarkHeight !== null
        ? {
            x: s.watermarkX,
            y: s.watermarkY,
            width: s.watermarkWidth,
            height: s.watermarkHeight,
            rotation: s.watermarkRotation ?? 0,
          }
        : null,
    representativeColor: s.representativeColor,
    representativeUrl: rep?.fileUrl ?? null,
    variants,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

/** Giá trị lạ trong DB (hoặc query string) quy về card — loại gốc. */
export function toSceneKind(v: unknown): SceneKind {
  return v === 'pass' ? 'pass' : 'card';
}

export function skinSceneToDto(s: SkinScene) {
  return {
    id: s.id,
    kind: toSceneKind(s.kind),
    name: s.name,
    filePath: s.filePath,
    fileUrl: buildPublicUrl(s.filePath),
    width: s.width,
    height: s.height,
    corners: JSON.parse(s.cornersJson) as [number, number][],
    ctrl: JSON.parse(s.ctrlJson) as [number, number][],
    ratio: s.ratio,
    calibrated: s.calibrated,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

export function watermarkToDto(w: Watermark) {
  return {
    id: w.id,
    name: w.name,
    filePath: w.filePath,
    fileUrl: buildPublicUrl(w.filePath),
    width: w.width,
    height: w.height,
    createdAt: w.createdAt.toISOString(),
  };
}

export function generationToDto(g: Generation & { items: GenerationItem[] }) {
  return {
    id: g.id,
    productType: g.productType as 'card' | 'shirt' | 'skin' | 'pass',
    title: g.title,
    designPath: g.designPath,
    designIsUrl: g.designIsUrl,
    designUrl: g.designIsUrl ? g.designPath : buildPublicUrl(g.designPath),
    watermarkId: g.watermarkId,
    status: g.status as 'pending' | 'done' | 'error',
    error: g.error,
    durationMs: g.durationMs,
    items: g.items.map((it) => ({
      mockupId: it.mockupId,
      variantId: it.variantId,
      sceneId: it.sceneId,
      label: it.label,
      outputPath: it.outputPath,
      outputUrl: buildPublicUrl(it.outputPath),
    })),
    createdAt: g.createdAt.toISOString(),
  };
}
