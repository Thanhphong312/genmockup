export interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface Mockup {
  id: string;
  name: string;
  filePath: string;
  fileUrl: string;
  width: number;
  height: number;
  designArea: Area;
  watermarkArea: Area | null;
  createdAt: string;
  updatedAt: string;
  /** true nếu mockup này được người khác chia sẻ cho mình (chỉ dùng, không sửa). */
  shared?: boolean;
  /** tên chủ sở hữu khi là mockup được chia sẻ. */
  ownerName?: string | null;
}

export interface Watermark {
  id: string;
  name: string;
  filePath: string;
  fileUrl: string;
  width: number;
  height: number;
  createdAt: string;
  /** chỉ có khi admin xem `?all=1` — watermark không có cơ chế chia sẻ. */
  shared?: boolean;
  ownerName?: string | null;
}

export interface ShirtVariant {
  id: string;
  setId: string;
  color: string;
  filePath: string;
  fileUrl: string;
  width: number;
  height: number;
  createdAt: string;
}

export interface ShirtSet {
  id: string;
  name: string;
  designArea: Area;
  watermarkArea: Area | null;
  representativeColor: string | null;
  representativeUrl: string | null;
  variants: ShirtVariant[];
  createdAt: string;
  updatedAt: string;
  /** true nếu bộ áo này được người khác chia sẻ cho mình (chỉ dùng generate). */
  shared?: boolean;
  ownerName?: string | null;
}

/** [x, y] theo pixel ảnh gốc. */
export type Point = [number, number];

/**
 * Vùng dán của card skin: 4 góc THẬT theo thứ tự TL, TR, BR, BL.
 * Khác `Area` (chữ nhật + rotation) ở chỗ tả được nghiêng phối cảnh thật.
 */
export type Quad = [Point, Point, Point, Point];

/**
 * Loại mockup khoét lỗ. Cùng pipeline ghép (design nằm dưới, mockup đè lên), chỉ khác cách dò:
 * - card: khoét cả mặt thẻ (card skin).
 * - pass: pass sleeve — chỉ khoét một phần mặt thẻ, phần còn lại in sẵn; vùng dán ngoại suy
 *   ra cả mặt thẻ từ 3 cạnh thẳng của vùng khoét.
 */
export type SceneKind = 'card' | 'pass';
export const SCENE_KINDS: SceneKind[] = ['card', 'pass'];

export interface SkinScene {
  id: string;
  kind: SceneKind;
  name: string;
  filePath: string;
  fileUrl: string;
  width: number;
  height: number;
  /** 4 góc mặt thẻ */
  corners: Quad;
  /** control point Bezier bậc 2 của 4 cạnh: TL→TR, TR→BR, BR→BL, BL→TL */
  ctrl: Quad;
  /** tỉ lệ rộng/cao của vùng khoét */
  ratio: number;
  /** false = đang dùng kết quả dò tự động, chưa ai xác nhận */
  calibrated: boolean;
  createdAt: string;
  updatedAt: string;
  shared?: boolean;
  ownerName?: string | null;
}

/** Kết quả dò vùng khoét khi upload hoặc bấm dò lại. */
export interface HoleDetectResult {
  width: number;
  height: number;
  corners: Quad;
  ctrl: Quad;
  ratio: number;
  /** độ lệch lớn nhất của mỗi cạnh so với đường thẳng (px). ~0 = cạnh thẳng. */
  bend: number[];
}

export interface UpdateSkinSceneRequest {
  name?: string;
  corners?: Quad;
  ctrl?: Quad;
}

export interface GenerateSkinRequest {
  kind?: SceneKind;
  designUrl?: string;
  designImageId?: string;
  sceneIds: string[];
}

export interface GenerationItem {
  mockupId: string | null;
  variantId: string | null;
  sceneId: string | null;
  label: string | null;
  outputPath: string;
  outputUrl: string;
}

export interface Generation {
  id: string;
  productType: 'card' | 'shirt' | 'skin' | 'pass';
  title: string | null;
  designPath: string;
  designIsUrl: boolean;
  watermarkId: string | null;
  status: 'pending' | 'done' | 'error';
  error: string | null;
  durationMs: number | null;
  items: GenerationItem[];
  createdAt: string;
}

export interface GenerateRequest {
  designUrl?: string;
  mockupIds: string[];
  watermarkId?: string;
}

export interface GenerateShirtRequest {
  designUrl?: string;
  designImageId?: string;
  setIds: string[];
  count?: number;
  watermarkId?: string;
  /** Override vị trí design theo từng setId (chọn ở Generate). */
  designAreas?: Record<string, Area>;
  /** Màu chọn thủ công theo từng setId. Có giá trị → bỏ qua random theo count. */
  colors?: Record<string, string[]>;
}

export interface AppSettingsView {
  hasOpenaiKey: boolean;
  openaiKeyLast4: string | null;
  analysisModel: string;
  imageModel: string;
  imageQuality: string;
  /** false → tính năng phân tích & tạo ý tưởng đang tạm khóa (FEATURE_IDEAS=off). */
  ideasEnabled: boolean;
}

export interface IdeaImage {
  id: string;
  generationId: string | null;
  filePath: string;
  fileUrl: string;
  prompt: string | null;
  ideaTitle: string | null;
  sellingPoints: string | null;
  keyword: string | null;
  title: string | null;
  usedCount: number;
  width: number;
  height: number;
  saved: boolean;
  createdAt: string;
}

export interface IdeaGenerationResult {
  id: string;
  title: string;
  keyword: string;
  analysis: string | null;
  status: 'pending' | 'done' | 'error';
  error: string | null;
  images: IdeaImage[];
  createdAt: string;
}

export interface UpdateShirtSetRequest {
  name?: string;
  representativeColor?: string;
  designArea?: Area;
  watermarkArea?: Area | null;
}

export interface UpdateMockupRequest {
  name?: string;
  designArea?: Area;
  watermarkArea?: Area | null;
}

export const DESIGN_RATIO = 5 / 7;

/** Thẻ ATM/credit chuẩn ISO 7810 ID-1: 85.6 × 54 mm. Dùng cho card skin và pass sleeve. */
export const CARD_SKIN_RATIO = 85.6 / 54;
