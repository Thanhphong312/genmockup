import { api } from './client';
import type { ShirtSet, UpdateShirtSetRequest } from '@genmockup/shared';
import { fileToDataUrl } from '../lib/img';

export interface ScanResult {
  scannedSets: number;
  createdSets: number;
  addedVariants: number;
  sets: ShirtSet[];
}

/** `all` (chỉ admin) = xem bộ áo của mọi user, để đổi chủ sở hữu. */
export async function listShirtSets(all = false): Promise<ShirtSet[]> {
  const { data } = await api.get<ShirtSet[]>('/shirt-sets', { params: all ? { all: 1 } : {} });
  return data;
}

export async function getShirtSet(id: string): Promise<ShirtSet> {
  const { data } = await api.get<ShirtSet>(`/shirt-sets/${id}`);
  return data;
}

export async function scanShirtSets(): Promise<ScanResult> {
  const { data } = await api.post<ScanResult>('/shirt-sets/scan');
  return data;
}

export async function createShirtSet(name: string): Promise<ShirtSet> {
  const { data } = await api.post<ShirtSet>('/shirt-sets', { name });
  return data;
}

export async function uploadShirtVariant(id: string, color: string, file: File): Promise<ShirtSet> {
  // Gửi base64 JSON thay vì multipart — ổn định hơn khi đi qua Cloudflare Tunnel.
  const imageBase64 = await fileToDataUrl(file);
  const { data } = await api.post<ShirtSet>(`/shirt-sets/${id}/variants`, {
    color,
    imageBase64,
    filename: file.name,
  });
  return data;
}

export async function deleteShirtVariant(id: string, variantId: string): Promise<ShirtSet> {
  const { data } = await api.delete<ShirtSet>(`/shirt-sets/${id}/variants/${variantId}`);
  return data;
}

export async function updateShirtSet(
  id: string,
  body: UpdateShirtSetRequest,
): Promise<ShirtSet> {
  const { data } = await api.put<ShirtSet>(`/shirt-sets/${id}`, body);
  return data;
}

export async function deleteShirtSet(id: string): Promise<void> {
  await api.delete(`/shirt-sets/${id}`);
}

export async function listShirtSetShares(id: string): Promise<{ id: string; username: string }[]> {
  const { data } = await api.get<{ id: string; username: string }[]>(`/shirt-sets/${id}/shares`);
  return data;
}

export async function addShirtSetShare(id: string, userId: string): Promise<void> {
  await api.post(`/shirt-sets/${id}/shares`, { userId });
}

export async function removeShirtSetShare(id: string, userId: string): Promise<void> {
  await api.delete(`/shirt-sets/${id}/shares/${userId}`);
}
