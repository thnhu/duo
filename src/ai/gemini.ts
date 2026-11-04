import { buildExampleText, buildInstruction } from './prompt';
import { AiError, type AiProvider, type RawTmrnd, type TmrndRequest } from './types';

// Gemini API, free tier (spec 6.6): no card needed. The model name is a
// setting, not code. Free-tier content may be used by Google to improve its
// products, which PO accepted for examples they request themselves.
//
// The key goes in a header, not the URL, so it does not end up in logs or
// browser history.

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const ATTRIBUTES = ['tone', 'mode', 'register', 'nuance', 'dialect'] as const;

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

// Structured output: the response must match this shape, and each value is
// restricted to the allowed list with `enum`.
function responseSchema(request: TmrndRequest) {
  const property = (values: string[]) => ({
    type: 'OBJECT',
    properties: {
      value: { type: 'STRING', enum: values },
      reason: { type: 'STRING' },
      confidence: { type: 'NUMBER' },
    },
    required: ['value', 'reason'],
  });
  return {
    type: 'OBJECT',
    properties: Object.fromEntries(ATTRIBUTES.map((key) => [key, property(request.allowed[key])])),
    required: [...ATTRIBUTES],
  };
}

export function parseGeminiResponse(data: unknown): RawTmrnd {
  const text = (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
    ?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new AiError('unavailable', 'Gemini không trả về nội dung (có thể bị chặn bộ lọc).');
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
    return parsed as RawTmrnd;
  } catch {
    throw new AiError('unavailable', 'Gemini trả về dữ liệu không đúng định dạng.');
  }
}

export function createGeminiProvider(fetchFn: FetchFn = (url, init) => fetch(url, init)): AiProvider {
  return {
    id: 'gemini',
    label: 'Gemini (gói miễn phí)',
    defaultModel: 'gemini-flash-latest',
    // Free tier is limited per minute; stay well under it.
    minIntervalMs: 6000,

    async suggestTmrnd(request, signal) {
      const url = `${ENDPOINT}/${encodeURIComponent(request.model)}:generateContent`;
      const body = {
        systemInstruction: { parts: [{ text: buildInstruction(request.allowed) }] },
        contents: [{ role: 'user', parts: [{ text: buildExampleText(request) }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: responseSchema(request),
        },
      };

      let response: Response;
      try {
        response = await fetchFn(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': request.apiKey },
          body: JSON.stringify(body),
          signal,
        });
      } catch (error) {
        if (signal?.aborted) throw error;
        throw new AiError('network', 'Không kết nối được tới Gemini.');
      }

      if (response.status === 429) {
        throw new AiError('rate-limit', 'Gemini báo đã hết lượt miễn phí (tạm thời). Thử lại sau.');
      }
      if (response.status === 401 || response.status === 403) {
        throw new AiError('auth', 'Gemini từ chối khóa API. Kiểm tra lại khóa trong Cài đặt.');
      }
      if (response.status === 400) {
        // An invalid key also answers 400 ("API key not valid").
        const detail = await response.text().catch(() => '');
        if (/api key/i.test(detail)) {
          throw new AiError('auth', 'Gemini từ chối khóa API. Kiểm tra lại khóa trong Cài đặt.');
        }
        throw new AiError('unavailable', 'Gemini không nhận yêu cầu (400). Thử đổi tên model trong Cài đặt.');
      }
      if (response.status === 404) {
        throw new AiError('unavailable', `Không tìm thấy model "${request.model}". Đổi tên model trong Cài đặt.`);
      }
      if (!response.ok) {
        throw new AiError('unavailable', `Gemini đang lỗi (${response.status}).`);
      }

      let data: unknown;
      try {
        data = await response.json();
      } catch {
        throw new AiError('unavailable', 'Gemini trả về dữ liệu không đọc được.');
      }
      return parseGeminiResponse(data);
    },
  };
}
