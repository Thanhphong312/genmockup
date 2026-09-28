import type { SceneKind } from '@genmockup/shared';

/**
 * Card skin và pass sleeve dùng chung model SkinScene + pipeline ghép; UI chỉ khác chữ và đường dẫn.
 */
export const SCENE_KIND_UI: Record<
  SceneKind,
  {
    /** tên sản phẩm hiển thị */
    label: string;
    listPath: string;
    genPath: string;
    /** hướng dẫn khoét lỗ ở trang quản lý */
    uploadHint: string;
    emptyHint: string;
    /** hướng dẫn chỉnh 4 góc ở trang calibrate */
    editorHint: string;
  }
> = {
  card: {
    label: 'Card Skin',
    listPath: '/skin-scenes',
    genPath: '/skin-generate',
    uploadHint:
      'Upload ảnh mockup đã khoét rỗng mặt thẻ (PNG có vùng trong suốt). Hệ thống tự xác định vùng dán; ngón tay, bo góc và chip giữ nguyên vì nằm sẵn trong ảnh.',
    emptyHint: 'Khoét rỗng mặt thẻ trong ảnh, xuất PNG rồi upload lên đây.',
    editorHint: 'Kéo 4 góc cho khớp mép thẻ.',
  },
  pass: {
    label: 'Pass Sleeve',
    listPath: '/pass-scenes',
    genPath: '/pass-generate',
    uploadHint:
      'Upload ảnh mockup pass sleeve đã khoét rỗng phần ảnh của thẻ (PNG có vùng trong suốt), còn logo/viền in sẵn giữ đục. Hệ thống lấy 3 cạnh thẳng của vùng khoét rồi ngoại suy ra cả mặt thẻ; design phủ cả thẻ, phần nằm dưới vùng in sẵn bị che.',
    emptyHint: 'Khoét rỗng phần ảnh của thẻ trong bao, xuất PNG rồi upload lên đây.',
    editorHint:
      'Vùng dán là CẢ mặt thẻ, không chỉ phần khoét: kéo 2 góc phía phần in sẵn tới đúng mép thẻ.',
  },
};
