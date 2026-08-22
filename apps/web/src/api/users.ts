import { api } from './client';

export interface AppUser {
  id: string;
  username: string;
  role: string;
  createdAt: string;
}

export async function listUsers(): Promise<AppUser[]> {
  const { data } = await api.get<AppUser[]>('/users');
  return data;
}

export async function getUserDirectory(): Promise<{ id: string; username: string }[]> {
  const { data } = await api.get<{ id: string; username: string }[]>('/users/directory');
  return data;
}

export async function createUser(body: {
  username: string;
  password: string;
  role: string;
}): Promise<AppUser> {
  const { data } = await api.post<AppUser>('/users', body);
  return data;
}

export async function updateUser(
  id: string,
  body: { password?: string; role?: string },
): Promise<AppUser> {
  const { data } = await api.put<AppUser>(`/users/${id}`, body);
  return data;
}

export async function deleteUser(id: string): Promise<void> {
  await api.delete(`/users/${id}`);
}

// ---- Đổi quyền sở hữu (admin) ----

/** Loại nội dung có chủ sở hữu; `idea`/`generation` chỉ chuyển hàng loạt theo user. */
export type ContentType =
  | 'mockup'
  | 'shirtSet'
  | 'skinScene'
  | 'watermark'
  | 'idea'
  | 'generation';

export const CONTENT_LABELS: Record<ContentType, string> = {
  mockup: 'Mockup card',
  shirtSet: 'Bộ áo',
  skinScene: 'Mockup card skin',
  watermark: 'Watermark',
  idea: 'Ảnh ý tưởng',
  generation: 'Lịch sử generate',
};

export type ContentCounts = Record<ContentType, number>;

export async function getUserContent(id: string): Promise<ContentCounts> {
  const { data } = await api.get<ContentCounts>(`/users/${id}/content`);
  return data;
}

export interface TransferUserResult {
  from: string;
  to: string;
  total: number;
  renamed: number;
}

export async function transferUserContent(
  id: string,
  body: { toUserId: string; types: ContentType[] },
): Promise<TransferUserResult> {
  const { data } = await api.post<TransferUserResult>(`/users/${id}/transfer`, body);
  return data;
}

export interface TransferItemsResult {
  moved: number;
  renamed: number;
  toUsername: string;
}

export async function transferItems(body: {
  type: ContentType;
  ids: string[];
  toUserId: string;
}): Promise<TransferItemsResult> {
  const { data } = await api.post<TransferItemsResult>('/users/transfer-items', body);
  return data;
}
