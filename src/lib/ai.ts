import { getSettings } from "./settings";
import { decryptSecret } from "./secret-box";

/** Lớp gọi AI dùng chung: OpenAI (và mọi endpoint tương thích), Google Gemini
 *  hoặc Meta Model API (Muse). Mặc định dùng cấu hình toàn hệ thống do admin
 *  dán trong Cấu hình → tab AI. Panel con có thể truyền AiConfig riêng (key
 *  của chính chủ panel) để ghi đè. */
export type AiConfig = { enabled: boolean; provider: string; baseUrl?: string | null; apiKey?: string | null; model?: string | null };

/** Cấu hình AI riêng từ một bộ trường cấu hình (aiEnabled/aiProvider/aiApiKey…);
 *  null = dùng cấu hình AI chung của hệ thống. */
export function panelAiConfig(cfg: { aiEnabled: boolean; aiProvider: string; aiBaseUrl?: string | null; aiApiKey?: string | null; aiModel?: string | null } | null | undefined): AiConfig | null {
  if (!cfg || !cfg.aiEnabled || !(cfg.aiApiKey || "").trim()) return null;
  // aiApiKey có thể đang mã hoá (enc:) — giải mã tại phễu dùng chung này (idempotent với bản rõ)
  return { enabled: true, provider: cfg.aiProvider || "openai", baseUrl: cfg.aiBaseUrl, apiKey: cfg.aiApiKey ? decryptSecret(cfg.aiApiKey) : cfg.aiApiKey, model: cfg.aiModel };
}

async function resolveConfig(cfg?: AiConfig | null): Promise<AiConfig> {
  if (cfg) return cfg;
  const s = await getSettings();
  const provider = s.ai_provider || "openai";
  // Meta dùng key + model riêng (ai_meta_*) để admin dán key Meta không ghi đè
  // key OpenAI/Gemini đang lưu; model trống thì mặc định Muse Wonder.
  if (provider === "meta") {
    return { enabled: s.ai_enabled === "1", provider, baseUrl: s.ai_base_url, apiKey: s.ai_meta_api_key, model: (s.ai_meta_model || "").trim() || "muse-wonder-1.0" };
  }
  return { enabled: s.ai_enabled === "1", provider, baseUrl: s.ai_base_url, apiKey: s.ai_api_key, model: s.ai_model };
}

export async function aiConfigured(cfg?: AiConfig | null) {
  const c = await resolveConfig(cfg);
  return c.enabled && !!(c.apiKey || "").trim();
}

export async function aiChat(system: string, user: string, cfg?: AiConfig | null): Promise<string> {
  const c = await resolveConfig(cfg);
  const key = (c.apiKey || "").trim();
  if (!c.enabled || !key) throw new Error("AI chưa được cấu hình");
  const provider = c.provider || "openai";
  const model = (c.model || "").trim() || (provider === "gemini" ? "gemini-2.0-flash" : provider === "meta" ? "muse-wonder-1.0" : "gpt-4o-mini");

  if (provider === "gemini") {
    const base = (c.baseUrl || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
    // Tài liệu Gemini API: gửi key qua header x-goog-api-key (cách được
    // khuyến nghị) thay cho tham số ?key= trên URL — key không lọt vào
    // URL/log. Body systemInstruction/contents/generationConfig và cách
    // đọc candidates[].content.parts[].text giữ đúng hợp đồng REST.
    const r = await fetch(`${base}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { temperature: 0.3 },
      }),
    });
    const j: any = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.error?.message || `Gemini trả lỗi ${r.status}`);
    const text = j?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
    if (!text) throw new Error("Gemini không trả nội dung");
    return text;
  }

  if (provider === "meta") {
    // Meta Model API — đúng tài liệu chính thức dev.meta.ai:
    // POST https://api.meta.ai/v1/chat/completions, xác thực bằng header
    // "Authorization: Bearer <key>" (key dạng LLM_<id>_<secret>), body tương
    // thích OpenAI {model, messages}; nội dung trả lời ở
    // choices[0].message.content; lỗi là envelope {error:{message,type,...}}.
    // Muse Wonder là model suy luận: reasoning_effort mặc định của nó là
    // "max" (nặng + chậm cho chat tư vấn) nên chốt "low" — giá trị tài liệu
    // công nhận. temperature tài liệu khuyên để mặc định nên KHÔNG gửi.
    // Độ dài trả lời giới hạn bằng max_completion_tokens (tên tham số đúng
    // cho Chat Completions; max_output_tokens thuộc Responses API, bị 400).
    // Role "system" được tài liệu chấp nhận, ngang hàng "developer".
    const base = (c.baseUrl || "https://api.meta.ai/v1").replace(/\/$/, "");
    const r = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        reasoning_effort: "low",
        max_completion_tokens: 2048,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    const j: any = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.error?.message || `Meta Model API trả lỗi ${r.status}`);
    const text = j?.choices?.[0]?.message?.content || "";
    if (!text) throw new Error("Meta Model API không trả nội dung");
    return text;
  }

  const base = (c.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const r = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  const j: any = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error?.message || `Nhà cung cấp AI trả lỗi ${r.status}`);
  const text = j?.choices?.[0]?.message?.content || "";
  if (!text) throw new Error("Nhà cung cấp AI không trả nội dung");
  return text;
}

/** Kiểm tra kết nối: gửi một câu chào ngắn, trả về thông báo lỗi/thành công để admin thấy. */
export async function testAiConnection(cfg?: AiConfig | null): Promise<string> {
  const reply = await aiChat("Bạn là trợ lý kiểm tra kết nối. Trả lời đúng một từ: OK", "ping", cfg);
  return reply.slice(0, 120);
}
