import { api } from './client';
import type { Watermark } from '@genmockup/shared';

/** `all` (chỉ admin) = xem watermark của mọi user, để đổi chủ sở hữu. */
export async function listWatermarks(all = false): Promise<Watermark[]> {
  const { data } = await api.get<Watermark[]>('/watermarks', { params: all ? { all: 1 } : {} });
  return data;
}

export async function uploadWatermark(file: File, name: string): Promise<Watermark> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('name', name);
  const { data } = await api.post<Watermark>('/watermarks', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function deleteWatermark(id: string): Promise<void> {
  await api.delete(`/watermarks/${id}`);
}
