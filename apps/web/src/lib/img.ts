/**
 * Đổi URL ảnh gốc /files/<rel> → /thumb?w=..&path=<rel> để tải ảnh nhỏ (WebP) cho
 * lưới/thumbnail, tránh kéo ảnh gốc (mockup áo ~2.5MB) gây chậm/lỗi khi tải nhiều ảnh.
 */
/** Đọc File → data URL base64 (để upload qua JSON, tránh multipart dễ đứt qua tunnel). */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(new Error('Không đọc được file'));
    fr.readAsDataURL(file);
  });
}

export function thumb(fileUrl: string | null | undefined, w = 240): string | undefined {
  if (!fileUrl) return fileUrl ?? undefined;
  const i = fileUrl.indexOf('/files/');
  if (i < 0) return fileUrl;
  const base = fileUrl.slice(0, i);
  const rel = fileUrl.slice(i + '/files/'.length);
  return `${base}/thumb?w=${w}&path=${encodeURIComponent(rel)}`;
}
