import { api } from './client';

export interface MeResponse {
  username: string | null;
  role?: string | null;
  authEnabled: boolean;
}

export async function getMe(): Promise<MeResponse> {
  const { data } = await api.get<MeResponse>('/auth/me');
  return data;
}

export async function login(username: string, password: string): Promise<void> {
  await api.post('/auth/login', { username, password });
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout');
}

export interface UpdateProfileBody {
  username?: string;
  currentPassword?: string;
  newPassword?: string;
}

export async function updateProfile(
  body: UpdateProfileBody,
): Promise<{ username: string; role: string }> {
  const { data } = await api.put<{ username: string; role: string }>('/profile', body);
  return data;
}
