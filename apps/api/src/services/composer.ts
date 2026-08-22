import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { resolveAbsPath } from './storage.js';

export interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface ComposeInput {
  mockupBuffer: Buffer;
  designBuffer: Buffer;
  designArea: Area;
  watermarkBuffer?: Buffer;
  watermarkArea?: Area | null;
  /**
   * true  → mockup dưới, design đè lên trên (dùng cho áo / mockup đục).
   * false → design dưới, mockup đè lên (mặc định card / mockup có alpha).
   */
  designOnTop?: boolean;
  /**
   * true  → design giữ nguyên tỉ lệ ảnh gốc: cao = area.height, rộng = cao × tỉ lệ gốc,
   *         canh giữa theo tâm area (dùng cho áo, tránh méo khi design không đúng 5:7).
   * false → design kéo giãn cho khớp đúng area.width × area.height (mặc định card).
   */
  preserveDesignRatio?: boolean;
}

/**
 * Đặt 1 layer lên canvas W×H, cắt bớt phần tràn ra ngoài khung nếu cần.
 *
 * sharp.composite() chấp nhận toạ độ âm và phần tràn qua mép phải/dưới, nhưng TỪ CHỐI
 * layer có chiều rộng hoặc cao lớn hơn ảnh nền ("Image to composite must have same
 * dimensions or smaller"). Chuyện đó xảy ra thật:
 *  - shirt (`preserveDesignRatio`): rộng = cao × tỉ lệ ảnh gốc, nên design rất ngang +
 *    vùng đặt cao là ra layer rộng hơn cả ảnh áo;
 *  - xoay: `rotate()` nới khung bao, layer vuông cạnh W xoay 45° thành W√2.
 *
 * Cắt (chứ không thu nhỏ) để khớp đúng thứ editor hiển thị — editor clip design theo mép
 * ảnh mockup, nên thu nhỏ sẽ ra kết quả khác hẳn với preview.
 * Trả về null nếu layer nằm trọn ngoài khung.
 */
async function placedLayer(
  buf: Buffer,
  area: Area,
  canvasW: number,
  canvasH: number,
  preserveRatio = false,
): Promise<sharp.OverlayOptions | null> {
  const layer = await prepareLayer(buf, area, preserveRatio);
  const meta = await sharp(layer).metadata();
  const lw = meta.width ?? area.width;
  const lh = meta.height ?? area.height;
  const left = area.x - Math.floor((lw - area.width) / 2);
  const top = area.y - Math.floor((lh - area.height) / 2);

  if (lw <= canvasW && lh <= canvasH) {
    return { input: layer, left, top, blend: 'over' };
  }

  const x0 = Math.max(0, left);
  const y0 = Math.max(0, top);
  const x1 = Math.min(canvasW, left + lw);
  const y1 = Math.min(canvasH, top + lh);
  if (x1 <= x0 || y1 <= y0) return null;

  const cropped = await sharp(layer)
    .extract({ left: x0 - left, top: y0 - top, width: x1 - x0, height: y1 - y0 })
    .png()
    .toBuffer();
  return { input: cropped, left: x0, top: y0, blend: 'over' };
}

async function prepareLayer(buf: Buffer, area: Area, preserveRatio = false): Promise<Buffer> {
  let targetW = Math.max(1, Math.round(area.width));
  const targetH = Math.max(1, Math.round(area.height));

  if (preserveRatio) {
    const src = await sharp(buf).metadata();
    if (src.width && src.height) {
      targetW = Math.max(1, Math.round(targetH * (src.width / src.height)));
    }
  }

  let pipeline = sharp(buf).resize(targetW, targetH, {
    kernel: sharp.kernel.lanczos3,
    fit: 'fill',
  });

  if (area.rotation && area.rotation !== 0) {
    pipeline = pipeline.rotate(area.rotation, {
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
  }

  return pipeline.png().toBuffer();
}

/**
 * Ghép theo thứ tự z-index (dưới → trên):
 *   1. Design (dưới cùng)
 *   2. Mockup (đè lên design — nên có vùng trong suốt nơi design xuất hiện)
 *   3. Watermark (trên cùng)
 *
 * Output giữ nguyên kích thước mockup gốc.
 *
 * LƯU Ý: để design hiện ra, ảnh mockup cần có alpha channel trong suốt
 * tại vùng đặt design. Mockup PNG đặc (không alpha) sẽ che mất design.
 */
export async function compose(input: ComposeInput): Promise<Buffer> {
  const mockupMeta = await sharp(input.mockupBuffer).metadata();
  const W = mockupMeta.width ?? 0;
  const H = mockupMeta.height ?? 0;
  if (!W || !H) throw new Error('mockup_invalid_size');

  const layers: sharp.OverlayOptions[] = [];

  const designLayer = await placedLayer(
    input.designBuffer,
    input.designArea,
    W,
    H,
    input.preserveDesignRatio,
  );
  const mockupLayer: sharp.OverlayOptions = {
    input: input.mockupBuffer,
    left: 0,
    top: 0,
    blend: 'over',
  };

  if (input.designOnTop) {
    // Áo / mockup đục: mockup dưới, design đè lên trên
    layers.push(mockupLayer);
    if (designLayer) layers.push(designLayer);
  } else {
    // Card / mockup có alpha: design dưới, mockup đè lên
    if (designLayer) layers.push(designLayer);
    layers.push(mockupLayer);
  }

  // Watermark luôn ở trên cùng (nếu có)
  if (input.watermarkBuffer && input.watermarkArea) {
    const wm = await placedLayer(input.watermarkBuffer, input.watermarkArea, W, H);
    if (wm) layers.push(wm);
  }

  // Base là canvas trong suốt cùng kích thước mockup
  return sharp({
    create: {
      width: W,
      height: H,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(layers)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

export async function readStoredFile(relativePath: string): Promise<Buffer> {
  return readFile(resolveAbsPath(relativePath));
}

export async function fetchDesign(designUrlOrPath: string, isUrl: boolean): Promise<Buffer> {
  if (isUrl) {
    const res = await fetch(designUrlOrPath);
    if (!res.ok) throw new Error(`Failed to fetch design: ${res.status}`);
    const arr = await res.arrayBuffer();
    return Buffer.from(arr);
  }
  return readStoredFile(designUrlOrPath);
}
