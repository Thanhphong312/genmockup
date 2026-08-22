import { prisma } from './db.js';

export const SETTING_KEYS = {
  openaiApiKey: 'openai_api_key',
  analysisModel: 'openai_analysis_model',
  imageModel: 'openai_image_model',
  imageQuality: 'openai_image_quality',
} as const;

const DEFAULTS = {
  analysisModel: 'gpt-4o',
  imageModel: 'gpt-image-1',
  imageQuality: 'medium',
};

export async function getSetting(userId: string, key: string): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({ where: { userId_key: { userId, key } } });
  return row?.value ?? null;
}

export async function setSetting(userId: string, key: string, value: string): Promise<void> {
  await prisma.appSetting.upsert({
    where: { userId_key: { userId, key } },
    update: { value },
    create: { userId, key, value },
  });
}

/**
 * Cờ bật/tắt tính năng phân tích & tạo ý tưởng (New Idea), đọc từ env FEATURE_IDEAS.
 * Mặc định bật; đặt FEATURE_IDEAS=off (hoặc 0/false/no/disabled) để tạm khóa.
 */
export function isIdeasEnabled(): boolean {
  const v = (process.env.FEATURE_IDEAS ?? '').trim().toLowerCase();
  if (!v) return true;
  return !['off', '0', 'false', 'no', 'disabled'].includes(v);
}

export interface OpenAiConfig {
  apiKey: string;
  analysisModel: string;
  imageModel: string;
  imageQuality: string;
}

export async function getOpenAiConfig(userId: string): Promise<OpenAiConfig> {
  const [apiKey, analysisModel, imageModel, imageQuality] = await Promise.all([
    getSetting(userId, SETTING_KEYS.openaiApiKey),
    getSetting(userId, SETTING_KEYS.analysisModel),
    getSetting(userId, SETTING_KEYS.imageModel),
    getSetting(userId, SETTING_KEYS.imageQuality),
  ]);
  return {
    // Fallback env chỉ dùng khi user chưa nhập key riêng
    apiKey: apiKey || process.env.OPENAI_API_KEY || '',
    analysisModel: analysisModel || DEFAULTS.analysisModel,
    imageModel: imageModel || DEFAULTS.imageModel,
    imageQuality: imageQuality || DEFAULTS.imageQuality,
  };
}
