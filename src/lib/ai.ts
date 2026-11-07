import { getSettings } from "./settings";
import { decryptSecret } from "./secret-box";

/** Lớp gọi AI dùng chung: OpenAI (và mọi endpoint tương thích) hoặc Google Gemini.
 *  Mặc định dùng cấu hình toàn hệ thống do admin dán trong Cấu hình → tab AI.
 *  Panel con có thể truyền AiConfig riêng (key của chính chủ panel) để ghi đè. */
export type AiConfig = { enabled: boolean; provider: string; baseUrl?: string | null; apiKey?: string | null; model?: string | null };

export function panelAiConfig(panel: { aiEnabled: boolean; aiProvider: string; aiBaseUrl?: string | null; aiApiKey?: string | null; aiModel?: string | null } | null | undefined): AiConfig | null {
  if (!panel || !panel.aiEnabled || !(panel.aiApiKey || "").trim()) return null;
  // aiApiKey của panel có thể đang mã hoá (enc:) — giải mã tại phễu dùng chung này (idempotent với bản rõ)
  return { enabled: true, provider: panel.aiProvider || "openai", baseUrl: panel.aiBaseUrl, apiKey: panel.aiApiKey ? decryptSecret(panel.aiApiKey) : panel.aiApiKey, model: panel.aiModel };
}

async function resolveConfig(cfg?: AiConfig | null): Promise<AiConfig> {
  if (cfg) return cfg;
  const s = await getSettings();
  return { enabled: s.ai_enabled === "1", provider: s.ai_provider || "openai", baseUrl: s.ai_base_url, apiKey: s.ai_api_key, model: s.ai_model };
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
  const model = (c.model || "").trim() || (provider === "gemini" ? "gemini-2.0-flash" : "gpt-4o-mini");

  if (provider === "gemini") {
    const base = (c.baseUrl || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
    const r = await fetch(`${base}/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
