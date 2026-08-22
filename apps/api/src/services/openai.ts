import OpenAI, { toFile } from 'openai';
import { getOpenAiConfig } from './settings.js';

export interface IdeaBrief {
  title: string;
  prompt: string;
  sellingPoints?: string;
  listingTitle?: string;
}

export type TrademarkMode = 'avoid' | 'keep' | 'default';

function trademarkClause(mode: TrademarkMode | undefined): string {
  if (mode === 'avoid') {
    return (
      ' TRADEMARK SAFETY: the designs MUST be 100% original and safe for print-on-demand. ' +
      'Do NOT depict or reference any real brand name, company logo, trademark, sports team, ' +
      'copyrighted character, movie/game IP, or celebrity likeness. If the reference contains any such element, ' +
      'replace it with a generic, original alternative.'
    );
  }
  if (mode === 'keep') {
    return (
      ' You MAY keep and faithfully reflect the brand/logo/character elements shown in the reference where relevant.'
    );
  }
  return '';
}

async function getClient(userId: string): Promise<{ client: OpenAI; cfg: Awaited<ReturnType<typeof getOpenAiConfig>> }> {
  const cfg = await getOpenAiConfig(userId);
  if (!cfg.apiKey) throw new Error('openai_not_configured');
  // timeout dài cho image gen; maxRetries thấp để không treo quá lâu
  return { client: new OpenAI({ apiKey: cfg.apiKey, timeout: 180_000, maxRetries: 1 }), cfg };
}

function wrapError(err: any): Error {
  const status = err?.status;
  const msg = err?.error?.message || err?.message || String(err);
  if (status === 401) return new Error(`openai_unauthorized: ${msg}`);
  if (status === 403) return new Error(`openai_forbidden (org có thể chưa verify cho gpt-image-1): ${msg}`);
  if (status === 429) return new Error(`openai_rate_limited: ${msg}`);
  return new Error(`openai_error: ${msg}`);
}

/**
 * Phân tích chuyên sâu ảnh + title + keyword → analysis text + N brief ý tưởng.
 */
export async function analyzeAndIdeate(input: {
  userId: string;
  imageBuffer: Buffer;
  mime: string;
  title: string;
  keyword: string;
  n?: number;
  trademark?: TrademarkMode;
}): Promise<{ analysis: string; ideas: IdeaBrief[] }> {
  const { client, cfg } = await getClient(input.userId);
  const n = Math.max(1, Math.min(input.n ?? 4, 8));
  const dataUrl = `data:${input.mime};base64,${input.imageBuffer.toString('base64')}`;

  const sys =
    'You are a senior print-on-demand commercial art director and bestseller strategist. ' +
    'Your #1 goal: designs that SELL — maximum commercial appeal, strong niche fit, and premium perceived value. ' +
    'Analyze the reference artwork deeply (subject, style, composition, color palette, mood, target audience, typography). ' +
    `Then propose ${n} NEW design ideas that keep the reference style/theme but are each distinct, original, and optimized to sell. ` +
    'Every idea MUST maximize these SELLING FACTORS: ' +
    '(1) target a clear buyer niche + a trending or evergreen theme; ' +
    '(2) a strong emotional / humor / identity hook (relatable "this is me", giftable); ' +
    '(3) one clear focal subject, instantly readable from a distance; ' +
    '(4) a catchy short slogan or clever wordplay in bold legible typography when it fits (keep text minimal and error-free); ' +
    '(5) bold high-contrast composition, clean vector/flat style, a limited cohesive print-friendly palette; ' +
    '(6) a polished, premium finish — not generic clip-art. ' +
    'IMPORTANT: each idea is a STANDALONE GRAPHIC DESIGN meant to be printed on a shirt — NOT a photo, NOT a shirt/apparel mockup, NOT a scene. ' +
    'Each idea "prompt" must be a detailed, self-contained image-generation prompt that BAKES IN the selling factors above, describing ONLY the isolated artwork ' +
    '(subject, style, colors, composition, typography) on a fully TRANSPARENT background, centered, print-ready sticker/clip-art style, with NO background, NO mockup, NO t-shirt, NO frame. ' +
    'Each idea "sellingPoints" = 1-2 short sentences (Vietnamese) explaining WHO buys it and WHY it sells (the value hook / điểm ăn tiền). ' +
    `Each idea "listingTitle" = ONE catchy, keyword-rich POD marketplace listing title (English, under ~140 chars, no quotes)${input.keyword ? ` that naturally includes the keyword "${input.keyword}"` : ''}. ` +
    trademarkClause(input.trademark) +
    ' Respond ONLY as JSON.';

  try {
    const resp = await client.chat.completions.create({
      model: cfg.analysisModel,
      messages: [
        { role: 'system', content: sys },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Title: ${input.title}\nKeyword: ${input.keyword}\nGive a deep analysis and ${n} new similar ideas.`,
            },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'idea_analysis',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              analysis: { type: 'string' },
              ideas: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    title: { type: 'string' },
                    prompt: { type: 'string' },
                    sellingPoints: { type: 'string' },
                    listingTitle: { type: 'string' },
                  },
                  required: ['title', 'prompt', 'sellingPoints', 'listingTitle'],
                },
              },
            },
            required: ['analysis', 'ideas'],
          },
        },
      },
    });

    const raw = resp.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw) as { analysis?: string; ideas?: IdeaBrief[] };
    const ideas = (parsed.ideas || []).slice(0, n).filter((i) => i?.prompt);
    if (!ideas.length) throw new Error('openai_no_ideas');
    return { analysis: parsed.analysis || '', ideas };
  } catch (err: any) {
    if (err?.message?.startsWith('openai_no_ideas')) throw err;
    throw wrapError(err);
  }
}

/**
 * Sinh 1 title đăng bán (POD listing) theo template + keyword cho 1 ý tưởng.
 */
export async function generateListingTitle(input: {
  userId: string;
  context: string;
  template?: string;
  keyword?: string;
}): Promise<string> {
  const { client, cfg } = await getClient(input.userId);
  const sys =
    'You are an expert print-on-demand SEO copywriter. Write ONE catchy, keyword-rich product listing title for a shirt design ' +
    'that maximizes clicks and search visibility on marketplaces (Etsy/Amazon Merch). Keep it under ~140 characters, ' +
    'no surrounding quotes, no line breaks. Return ONLY the title text.';
  const user =
    `Design context: ${input.context || '(none)'}\n` +
    `Title template/format to follow: ${input.template?.trim() || '(none — just be catchy and SEO-friendly)'}\n` +
    `Must naturally include this keyword: ${input.keyword?.trim() || '(none)'}`;
  try {
    const resp = await client.chat.completions.create({
      model: cfg.analysisModel,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
    });
    const t = (resp.choices[0]?.message?.content || '').trim().replace(/^["']+|["']+$/g, '').trim();
    if (!t) throw new Error('openai_no_title');
    return t;
  } catch (err: any) {
    if (err?.message === 'openai_no_title') throw err;
    throw wrapError(err);
  }
}

/**
 * Sinh 1 ảnh ý tưởng bằng images.edit (dùng ảnh gốc làm reference).
 */
const TRANSPARENT_SUFFIX =
  ' Isolated print-ready design artwork on a fully transparent background. ' +
  'No background, no scene, no t-shirt or apparel mockup, no frame, no drop shadow. Centered, crisp edges.';

export async function generateIdeaImage(input: {
  userId: string;
  sourceBuffer: Buffer;
  mime: string;
  prompt: string;
  size?: string;
  quality?: string;
  trademark?: TrademarkMode;
}): Promise<Buffer> {
  const { client, cfg } = await getClient(input.userId);
  try {
    const image = await toFile(input.sourceBuffer, 'source.png', { type: input.mime });
    const res = await client.images.edit({
      model: cfg.imageModel,
      image,
      prompt: input.prompt + TRANSPARENT_SUFFIX + trademarkClause(input.trademark),
      size: (input.size as any) || 'auto',
      quality: (input.quality as any) || (cfg.imageQuality as any) || 'auto',
      background: 'transparent',
      output_format: 'png',
    });
    const b64 = res.data?.[0]?.b64_json;
    if (!b64) throw new Error('openai_no_image');
    return Buffer.from(b64, 'base64');
  } catch (err: any) {
    if (err?.message === 'openai_no_image') throw err;
    throw wrapError(err);
  }
}
