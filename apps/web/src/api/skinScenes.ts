import { api } from './client';
import type { Quad, SkinScene, UpdateSkinSceneRequest } from '@genmockup/shared';
import { fileToDataUrl } from '../lib/img';

/** Scene kèm độ cong 4 cạnh — chỉ có ngay sau khi dò tự động. */
export interface SkinSceneWithBend extends SkinScene {
  bend?: number[];
}

/** `all` (chỉ admin) = xem scene của mọi user, để đổi chủ sở hữu. */
export async function listSkinScenes(all = false): Promise<SkinScene[]> {
  const { data } = await api.get<SkinScene[]>('/skin-scenes', { params: all ? { all: 1 } : {} });
  return data;
}

export async function getSkinScene(id: string): Promise<SkinScene> {
  const { data } = await api.get<SkinScene>(`/skin-scenes/${id}`);
  return data;
}

export async function uploadSkinScene(file: File, name?: string): Promise<SkinSceneWithBend> {
  // base64 JSON thay vì multipart — ổn định hơn khi đi qua Cloudflare Tunnel.
  const imageBase64 = await fileToDataUrl(file);
  const { data } = await api.post<SkinSceneWithBend>('/skin-scenes', {
    imageBase64,
    filename: file.name,
    name,
  });
  return data;
}

export async function redetectSkinScene(id: string): Promise<SkinSceneWithBend> {
  const { data } = await api.post<SkinSceneWithBend>(`/skin-scenes/${id}/redetect`);
  return data;
}

export async function updateSkinScene(id: string, body: UpdateSkinSceneRequest): Promise<SkinScene> {
  const { data } = await api.put<SkinScene>(`/skin-scenes/${id}`, body);
  return data;
}

export async function deleteSkinScene(id: string): Promise<void> {
  await api.delete(`/skin-scenes/${id}`);
}

export interface SkinPreviewResult {
  dataUrl: string;
  designRatio: number | null;
  holeRatio: number;
}

/** Ghép thử — chạy đúng hàm compose lúc generate nên thấy sao ra vậy. */
export async function previewSkinScene(
  id: string,
  body: { imageBase64?: string; designImageId?: string; corners?: Quad; ctrl?: Quad },
): Promise<SkinPreviewResult> {
  const { data } = await api.post<SkinPreviewResult>(`/skin-scenes/${id}/preview`, body);
  return data;
}

export async function listSkinSceneShares(id: string): Promise<{ id: string; username: string }[]> {
  const { data } = await api.get<{ id: string; username: string }[]>(`/skin-scenes/${id}/shares`);
  return data;
}

export async function addSkinSceneShare(id: string, userId: string): Promise<void> {
  await api.post(`/skin-scenes/${id}/shares`, { userId });
}

export async function removeSkinSceneShare(id: string, userId: string): Promise<void> {
  await api.delete(`/skin-scenes/${id}/shares/${userId}`);
}

export interface SkinSceneShareSummary {
  /** số scene thực sự quản lý được trong danh sách gửi lên */
  total: number;
  skipped: number;
  counts: { userId: string; count: number }[];
}

export async function skinSceneShareSummary(sceneIds: string[]): Promise<SkinSceneShareSummary> {
  const { data } = await api.post<SkinSceneShareSummary>('/skin-scenes/shares/summary', { sceneIds });
  return data;
}

export interface BulkShareResult {
  scenes: number;
  users: number;
  changed: number;
}

export async function bulkSkinSceneShare(
  sceneIds: string[],
  userIds: string[],
  mode: 'add' | 'remove',
): Promise<BulkShareResult> {
  const { data } = await api.post<BulkShareResult>('/skin-scenes/shares/bulk', {
    sceneIds,
    userIds,
    mode,
  });
  return data;
}
