import { api } from './client';
import type { AppSettingsView } from '@genmockup/shared';

export async function getSettings(): Promise<AppSettingsView> {
  const { data } = await api.get<AppSettingsView>('/settings');
  return data;
}

export interface UpdateSettingsBody {
  openaiApiKey?: string;
  analysisModel?: string;
  imageModel?: string;
  imageQuality?: string;
}

export async function updateSettings(body: UpdateSettingsBody): Promise<AppSettingsView> {
  const { data } = await api.put<AppSettingsView>('/settings', body);
  return data;
}
