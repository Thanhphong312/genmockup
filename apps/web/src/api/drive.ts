import { api } from './client';

export interface DriveFolder {
  id: string;
  name: string;
  createdTime?: string;
  webViewLink?: string;
}

export interface DriveStatus {
  configured: boolean;
  authenticated: boolean;
  parentFolderId: string | null;
}

export interface DriveUploadResult {
  generationId: string;
  folderId: string;
  uploaded: Array<{
    mockupId: string;
    mockupName: string;
    driveFileId?: string;
    driveName?: string;
    driveUrl?: string;
    error?: string;
  }>;
  design: {
    name?: string;
    driveFileId?: string;
    driveUrl?: string;
    folderUrl?: string;
    error?: string;
  } | null;
}

export async function getDriveStatus(): Promise<DriveStatus> {
  const { data } = await api.get<DriveStatus>('/drive/status');
  return data;
}

export function getOAuthStartUrl(redirectBack: string): string {
  const params = new URLSearchParams({ redirect: redirectBack });
  return `/api/drive/oauth/start?${params.toString()}`;
}

export async function disconnectDrive(): Promise<void> {
  await api.post('/drive/oauth/disconnect');
}

export async function importDriveToken(json: string): Promise<void> {
  await api.post('/drive/token-import', { json });
}

export async function listDriveFolders(parentId?: string): Promise<DriveFolder[]> {
  const { data } = await api.get<DriveFolder[]>('/drive/folders', {
    params: parentId ? { parentId } : {},
  });
  return data;
}

export async function createDriveFolder(name: string, parentId?: string): Promise<DriveFolder> {
  const { data } = await api.post<DriveFolder>('/drive/folders', { name, parentId });
  return data;
}

export async function uploadGenerationToDrive(
  generationId: string,
  folderId: string,
): Promise<DriveUploadResult> {
  const { data } = await api.post<DriveUploadResult>('/drive/upload', {
    generationId,
    folderId,
  });
  return data;
}
