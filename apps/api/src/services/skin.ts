/**
 * Ghép card skin: design nằm DƯỚI, ảnh mockup đã khoét rỗng đè LÊN.
 *
 * Nhờ thứ tự này, ngón tay / mép ví / bo góc / chip đều giữ nguyên tự động vì chúng vẫn nằm
 * trong ảnh mockup — không cần dựng mask hay layer overlay riêng.
 */
import sharp from 'sharp';
import type { Point } from './perspective.js';
import { coonsGrid, growQuad, quadSize, warpMesh } from './perspective.js';

/**
 * Nạp design về RGBA đục, thu nhỏ sẵn về xấp xỉ cỡ vùng dán.
 *
 * Hai bẫy bắt buộc phải tránh ở đây:
 *  1. Thu nhỏ bằng bilinear lúc warp sinh vân sọc moiré → phải Lanczos thu nhỏ TRƯỚC.
 *  2. sharp sắp xếp lại pipeline: removeAlpha() chạy SAU resize(), nên resize vẫn premultiply
 *     và RGB nằm dưới vùng alpha=0 (lỗ khoét chip) bị nhân về 0 → ra ô đen giữa thẻ.
 *     Phải bỏ alpha rồi materialize ra buffer, resize ở pass thứ hai.
 */
async function loadDesignFlat(designBuffer: Buffer, fitW: number, fitH: number) {
  const src = await sharp(designBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = src.info.width;
  const H = src.info.height;

  const rgb = Buffer.alloc(W * H * 3);
  for (let p = 0; p < W * H; p++) {
    rgb[p * 3] = src.data[p * 4];
    rgb[p * 3 + 1] = src.data[p * 4 + 1];
    rgb[p * 3 + 2] = src.data[p * 4 + 2];
  }

  const pipe = sharp(rgb, { raw: { width: W, height: H, channels: 3 } });
  const resized = fitW < W ? pipe.resize(fitW, fitH, { kernel: 'lanczos3', fit: 'fill' }) : pipe;
  const { data, info } = await resized.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { buf: Buffer.from(data), DW: info.width, DH: info.height, srcRatio: H ? W / H : 0 };
}

export interface ComposeSkinInput {
  /** ảnh mockup đã khoét rỗng mặt thẻ */
  sceneBuffer: Buffer;
  designBuffer: Buffer;
  corners: Point[];
  ctrl: Point[];
  width: number;
  height: number;
}

export interface ComposeSkinResult {
  buffer: Buffer;
  /** tỉ lệ ảnh design gốc — so với holeRatio để cảnh báo méo */
  srcRatio: number;
  holeRatio: number;
}

export async function composeSkin(input: ComposeSkinInput): Promise<ComposeSkinResult> {
  const { width: W, height: H } = input;
  const { width: qw, height: qh, ratio: holeRatio } = quadSize(input.corners);

  // supersample nhẹ 1.15× để giữ nét sau khi warp
  const { buf, DW, DH, srcRatio } = await loadDesignFlat(
    input.designBuffer,
    Math.ceil(qw * 1.15),
    Math.ceil(qh * 1.15),
  );

  const grid = coonsGrid(growQuad(input.corners), growQuad(input.ctrl));
  const warped = warpMesh(buf, DW, DH, grid, W, H);

  const buffer = await sharp({
    create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: warped, raw: { width: W, height: H, channels: 4 }, left: 0, top: 0 },
      { input: input.sceneBuffer, left: 0, top: 0 },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();

  return { buffer, srcRatio: +srcRatio.toFixed(3), holeRatio: +holeRatio.toFixed(3) };
}

/** Bản JPEG nhẹ dùng cho preview trong trang calibrate. */
export async function composeSkinPreview(input: ComposeSkinInput): Promise<Buffer> {
  const { buffer } = await composeSkin(input);
  return sharp(buffer).jpeg({ quality: 88, chromaSubsampling: '4:4:4' }).toBuffer();
}
