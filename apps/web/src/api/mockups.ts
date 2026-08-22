import { api } from './client';
import type { Mockup, Area } from '@genmockup/shared';
import { fileToDataUrl } from '../lib/img';

/** `all` (chỉ admin) = xem mockup của mọi user, để đổi chủ sở hữu. */
export async function listMockups(all = false): Promise<Mockup[]> {
  const { data } = await api.get<Mockup[]>('/mockups', { params: all ? { all: 1 } : {} });
  return data;
}

export async function getMockup(id: string): Promise<Mockup> {
  const { data } = await api.get<Mockup>(`/mockups/${id}`);
  return data;
}

export async function uploadMockup(file: File, name: string): Promise<Mockup> {
  // Gửi base64 JSON thay vì multipart — ổn định hơn khi đi qua Cloudflare Tunnel.
  const imageBase64 = await fileToDataUrl(file);
  const { data } = await api.post<Mockup>('/mockups', { name, imageBase64 });
  return data;
}

export interface UpdateMockupBody {
  name?: string;
  designArea?: Area;
  watermarkArea?: Area | null;
}

export async function updateMockup(id: string, body: UpdateMockupBody): Promise<Mockup> {
  const { data } = await api.put<Mockup>(`/mockups/${id}`, body);
  return data;
}

export async function deleteMockup(id: string): Promise<void> {
  await api.delete(`/mockups/${id}`);
}

export async function replaceMockupFile(id: string, file: File): Promise<Mockup> {
  const fd = new FormData();
  fd.append('file', file);
  const { data } = await api.post<Mockup>(`/mockups/${id}/file`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export interface DirectoryUser {
  id: string;
  username: string;
}

export async function listMockupShares(id: string): Promise<DirectoryUser[]> {
  const { data } = await api.get<DirectoryUser[]>(`/mockups/${id}/shares`);
  return data;
}

export async function addMockupShare(id: string, userId: string): Promise<void> {
  await api.post(`/mockups/${id}/shares`, { userId });
}

export async function removeMockupShare(id: string, userId: string): Promise<void> {
  await api.delete(`/mockups/${id}/shares/${userId}`);
}
