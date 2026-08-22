import type { FastifyInstance } from 'fastify';
import { getOpenAiConfig, setSetting, SETTING_KEYS, isIdeasEnabled } from '../services/settings.js';
import { requireUserId } from '../services/auth.js';

interface UpdateBody {
  openaiApiKey?: string;
  analysisModel?: string;
  imageModel?: string;
  imageQuality?: string;
}

function view(cfg: Awaited<ReturnType<typeof getOpenAiConfig>>) {
  return {
    hasOpenaiKey: Boolean(cfg.apiKey),
    openaiKeyLast4: cfg.apiKey ? cfg.apiKey.slice(-4) : null,
    analysisModel: cfg.analysisModel,
    imageModel: cfg.imageModel,
    imageQuality: cfg.imageQuality,
    ideasEnabled: isIdeasEnabled(),
  };
}

export async function settingsRoutes(app: FastifyInstance) {
  app.get('/api/settings', { schema: { tags: ['Settings'], summary: 'Cấu hình của tôi (che key)' } }, async (req) => {
    const uid = requireUserId(req);
    return view(await getOpenAiConfig(uid));
  });

  app.put('/api/settings', { schema: { tags: ['Settings'], summary: 'Cập nhật cấu hình OpenAI của tôi' } }, async (req) => {
    const uid = requireUserId(req);
    const body = (req.body || {}) as UpdateBody;
    if (body.openaiApiKey && body.openaiApiKey.trim()) {
      await setSetting(uid, SETTING_KEYS.openaiApiKey, body.openaiApiKey.trim());
    }
    if (body.analysisModel) await setSetting(uid, SETTING_KEYS.analysisModel, body.analysisModel);
    if (body.imageModel) await setSetting(uid, SETTING_KEYS.imageModel, body.imageModel);
    if (body.imageQuality) await setSetting(uid, SETTING_KEYS.imageQuality, body.imageQuality);
    return view(await getOpenAiConfig(uid));
  });
}
