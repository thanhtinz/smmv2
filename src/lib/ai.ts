import { getSettings } from "./settings";

/** Lớp gọi AI dùng chung: OpenAI (và mọi endpoint tương thích) hoặc Google Gemini.
 *  Key do admin tự dán trong Cấu hình → tab AI. Chưa cấu hình thì aiConfigured() = false. */
export async function aiConfigured() {
  const s = await getSettings();
  return s.ai_enabled === "1" && !!(s.ai_api_key || "").trim();
}

export async function aiChat(system: string, user: string): Promise<string> {
  const s = await getSettings();
  const key = (s.ai_api_key || "").trim();
  if (s.ai_enabled !== "1" || !key) throw new Error("AI chưa được cấu hình");
  const provider = s.ai_provider || "openai";
  const model = (s.ai_model || "").trim() || (provider === "gemini" ? "gemini-2.0-flash" : "gpt-4o-mini");

  if (provider === "gemini") {
    const base = (s.ai_base_url || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
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

  const base = (s.ai_base_url || "https://api.openai.com/v1").replace(/\/$/, "");
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
export async function testAiConnection(): Promise<string> {
  const reply = await aiChat("Bạn là trợ lý kiểm tra kết nối. Trả lời đúng một từ: OK", "ping");
  return reply.slice(0, 120);
}
