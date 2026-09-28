import { api } from './client';
import type { Area, Generation, SceneKind } from '@genmockup/shared';

export interface GenerateOptions {
  designFile?: File;
  designUrl?: string;
  mockupIds: string[];
  watermarkId?: string;
}

export async function generate(opts: GenerateOptions): Promise<Generation> {
  if (opts.designFile) {
    const fd = new FormData();
    fd.append('designFile', opts.designFile);
    fd.append('mockupIds', JSON.stringify(opts.mockupIds));
    if (opts.watermarkId) fd.append('watermarkId', opts.watermarkId);
    const { data } = await api.post<Generation>('/generate', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  }
  const { data } = await api.post<Generation>('/generate', {
    designUrl: opts.designUrl,
    mockupIds: opts.mockupIds,
    watermarkId: opts.watermarkId,
  });
  return data;
}

export interface GenerateShirtOptions {
  designFile?: File;
  designUrl?: string;
  designImageId?: string;
  setIds: string[];
  count?: number;
  watermarkId?: string;
  designAreas?: Record<string, Area>;
  colors?: Record<string, string[]>;
}

export async function generateShirt(opts: GenerateShirtOptions): Promise<Generation> {
  const hasColors = !!opts.colors && Object.keys(opts.colors).length > 0;
  if (opts.designFile) {
    const fd = new FormData();
    fd.append('designFile', opts.designFile);
    fd.append('setIds', JSON.stringify(opts.setIds));
    if (opts.count != null) fd.append('count', String(opts.count));
    if (opts.watermarkId) fd.append('watermarkId', opts.watermarkId);
    if (opts.designAreas) fd.append('designAreas', JSON.stringify(opts.designAreas));
    if (hasColors) fd.append('colors', JSON.stringify(opts.colors));
    const { data } = await api.post<Generation>('/generate/shirt', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  }
  const { data } = await api.post<Generation>('/generate/shirt', {
    designUrl: opts.designUrl,
    designImageId: opts.designImageId,
    setIds: opts.setIds,
    count: opts.count,
    watermarkId: opts.watermarkId,
    designAreas: opts.designAreas,
    colors: hasColors ? opts.colors : undefined,
  });
  return data;
}

export interface GenerateSkinOptions {
  /** card → /generate/skin, pass → /generate/pass */
  kind: SceneKind;
  designFile?: File;
  designUrl?: string;
  designImageId?: string;
  sceneIds: string[];
}

/** Kết quả generate card skin / pass sleeve, kèm cảnh báo lệch tỉ lệ nếu có. */
export type SkinGeneration = Generation & { ratioWarning?: string | null };

export async function generateSkin(opts: GenerateSkinOptions): Promise<SkinGeneration> {
  const url = opts.kind === 'pass' ? '/generate/pass' : '/generate/skin';
  if (opts.designFile) {
    const fd = new FormData();
    fd.append('designFile', opts.designFile);
    fd.append('sceneIds', JSON.stringify(opts.sceneIds));
    const { data } = await api.post<SkinGeneration>(url, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  }
  const { data } = await api.post<SkinGeneration>(url, {
    designUrl: opts.designUrl,
    designImageId: opts.designImageId,
    sceneIds: opts.sceneIds,
  });
  return data;
}

export async function getGeneration(id: string): Promise<Generation> {
  const { data } = await api.get<Generation>(`/generations/${id}`);
  return data;
}
