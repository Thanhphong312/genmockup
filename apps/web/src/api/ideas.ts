import { api } from './client';
import type { IdeaGenerationResult, IdeaImage } from '@genmockup/shared';

export type TrademarkMode = 'avoid' | 'keep' | 'default';

export async function startIdeas(
  file: File,
  title: string,
  keyword: string,
  count = 4,
  trademark: TrademarkMode = 'avoid',
): Promise<{ id: string; status: string }> {
  const fd = new FormData();
  fd.append('sourceImage', file);
  fd.append('title', title);
  fd.append('keyword', keyword);
  fd.append('count', String(count));
  fd.append('trademark', trademark);
  const { data } = await api.post<{ id: string; status: string }>('/ideas/generate', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function getIdeaGeneration(id: string): Promise<IdeaGenerationResult> {
  const { data } = await api.get<IdeaGenerationResult>(`/ideas/generations/${id}`);
  return data;
}

export async function saveIdeas(imageIds: string[]): Promise<IdeaImage[]> {
  const { data } = await api.post<IdeaImage[]>('/ideas/save', { imageIds });
  return data;
}

export async function listIdeas(): Promise<IdeaImage[]> {
  const { data } = await api.get<IdeaImage[]>('/ideas');
  return data;
}

export async function deleteIdea(id: string): Promise<void> {
  await api.delete(`/ideas/${id}`);
}

export async function genIdeaTitle(
  id: string,
  template: string,
  keyword: string,
): Promise<IdeaImage> {
  const { data } = await api.post<IdeaImage>(`/ideas/${id}/title`, { template, keyword });
  return data;
}
