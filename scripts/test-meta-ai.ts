/**
 * Kiểm chứng tích hợp Meta Model API (Muse) cho hệ thống AI của web:
 *  A) Chặn fetch: request gửi đi đúng hợp đồng tài liệu chính thức dev.meta.ai —
 *     POST https://api.meta.ai/v1/chat/completions, header
 *     "Authorization: Bearer <key>", body {model, messages} kèm
 *     reasoning_effort="low" + max_completion_tokens, KHÔNG gửi các tham số tài
 *     liệu ghi không hỗ trợ (temperature để mặc định theo khuyến nghị; stop /
 *     frequency_penalty / presence_penalty / logit_bias / max_output_tokens…).
 *     Đọc kết quả đúng chỗ choices[0].message.content; lỗi đọc envelope
 *     {error:{message}}.
 *  B) API THẬT với key giả: phải lỗi trung thực (ném lỗi rõ ràng), không
 *     "OK giả", không trả nội dung bịa.
 *  C) Cần DB local: "bộ não" tư vấn (finder) — prompt cấp cho AI chứa dữ liệu
 *     thật của site (danh mục dịch vụ + thông tin nạp tiền từ cấu hình + bài
 *     FAQ), ngôn ngữ lý do theo ngôn ngữ khách; AI lỗi → rơi êm về tìm từ khoá
 *     (mode "local"), không crash.
 * Chạy: npx tsx scripts/test-meta-ai.ts
 */
export {};
let pass = 0, fail = 0;
const check = (n: string, c: boolean, x = "") => { if (c) { pass++; console.log(`PASS  ${n}${x ? " — " + x : ""}`); } else { fail++; console.log(`FAIL  ${n}${x ? " — " + x : ""}`); } };

const realFetch = globalThis.fetch;
let captured: { url: string; method: string; headers: any; body: any }[] = [];

function stubFetchOk() {
  captured = [];
  globalThis.fetch = (async (url: any, init: any = {}) => {
    const u = String(url);
    let body: any = null;
    try { body = JSON.parse(String(init.body || "{}")); } catch { body = {}; }
    captured.push({ url: u, method: init.method || "GET", headers: init.headers || {}, body });
    return new Response(JSON.stringify({
      id: "chatcmpl-test", object: "chat.completion", created: 1700000000, model: body?.model || "muse-wonder-1.0",
      choices: [{ index: 0, message: { role: "assistant", content: "Câu trả lời mẫu" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as any;
}

function stubFetchError(status: number, message: string) {
  captured = [];
  globalThis.fetch = (async (url: any, init: any = {}) => {
    captured.push({ url: String(url), method: init.method || "GET", headers: init.headers || {}, body: JSON.parse(String(init.body || "{}")) });
    return new Response(JSON.stringify({ error: { message, type: "invalid_request_error", param: null, code: "test" } }), { status, headers: { "content-type": "application/json" } });
  }) as any;
}

async function main() {
  const { aiChat, testAiConnection } = await import("../src/lib/ai");

  // ---------- A) Hợp đồng request theo tài liệu ----------
  stubFetchOk();
  const out = await aiChat("Bạn là trợ lý tư vấn.", "Khách cần tăng follow TikTok", { enabled: true, provider: "meta", apiKey: "LLM_1234567890_fake", model: "" });
  const c0 = captured[0];
  check("A1 URL đúng tài liệu: POST https://api.meta.ai/v1/chat/completions", c0?.url === "https://api.meta.ai/v1/chat/completions" && c0?.method === "POST", c0?.url || "");
  check("A2 Header Authorization: Bearer <key> + Content-Type json", c0?.headers?.Authorization === "Bearer LLM_1234567890_fake" && c0?.headers?.["Content-Type"] === "application/json");
  check("A3 Model trống -> mặc định muse-wonder-1.0 (Muse Wonder theo tài liệu)", c0?.body?.model === "muse-wonder-1.0", c0?.body?.model || "");
  check("A4 messages đúng dạng [{system},{user}]", Array.isArray(c0?.body?.messages) && c0.body.messages.length === 2 && c0.body.messages[0].role === "system" && c0.body.messages[1].role === "user");
  check("A5 reasoning_effort=low + max_completion_tokens có mặt (tham số tài liệu công nhận)", c0?.body?.reasoning_effort === "low" && c0?.body?.max_completion_tokens === 2048);
  const banned = ["temperature", "stop", "frequency_penalty", "presence_penalty", "logit_bias", "logprobs", "max_output_tokens", "modalities", "audio", "verbosity"];
  check("A6 Không gửi tham số tài liệu không hỗ trợ/khuyên tránh", banned.every((k) => !(k in (c0?.body || {}))), banned.filter((k) => k in (c0?.body || {})).join(","));
  check("A7 Đọc đúng choices[0].message.content", out === "Câu trả lời mẫu");

  stubFetchOk();
  await aiChat("sys", "usr", { enabled: true, provider: "meta", apiKey: "LLM_x", model: "muse-spark-1.3", baseUrl: "https://example.test/v1/" });
  check("A8 Tôn trọng model + base URL tuỳ chỉnh (bỏ dấu / cuối)", captured[0]?.url === "https://example.test/v1/chat/completions" && captured[0]?.body?.model === "muse-spark-1.3", captured[0]?.url || "");

  stubFetchError(401, "Invalid API key provided");
  let errMsg = "";
  try { await aiChat("sys", "usr", { enabled: true, provider: "meta", apiKey: "LLM_bad", model: "" }); } catch (e: any) { errMsg = String(e?.message || e); }
  check("A9 Lỗi 401: ném lỗi mang message trong envelope {error:{message}} của nhà cung cấp", errMsg.includes("Invalid API key provided"), errMsg.slice(0, 80));

  // ---------- B) API thật + key giả: lỗi trung thực ----------
  globalThis.fetch = realFetch;
  let realErr = "";
  try { await testAiConnection({ enabled: true, provider: "meta", apiKey: "LLM_0000000000000000_key-gia-chi-de-test", model: "" }); } catch (e: any) { realErr = String(e?.message || e); }
  check("B1 Key giả gọi API thật -> lỗi trung thực, không OK giả", realErr.length > 0, realErr.slice(0, 120));

  // ---------- C) Bộ não tư vấn trên DB thật ----------
  try {
    const { setSetting, getSettings } = await import("../src/lib/settings");
    const { prisma } = await import("../src/lib/db");
    const { findServices } = await import("../src/lib/finder");
    const before = await getSettings();
    await setSetting("ai_enabled", "1");
    await setSetting("ai_provider", "meta");
    await setSetting("ai_meta_api_key", "LLM_1234567890_fake");
    await setSetting("ai_meta_model", "");

    // C1: AI trả picks hợp lệ -> mode "ai"; prompt phải chứa grounding thật
    let promptSys = "", promptUser = "";
    globalThis.fetch = (async (url: any, init: any = {}) => {
      const body = JSON.parse(String(init.body || "{}"));
      promptSys = body.messages?.[0]?.content || "";
      promptUser = body.messages?.[1]?.content || "";
      const m = /"id":(\d+)/.exec(promptUser);
      const id = m ? Number(m[1]) : 0;
      const payload = JSON.stringify({ picks: [{ id, reason: "Hợp nhu cầu của bạn" }] });
      return new Response(JSON.stringify({
        id: "chatcmpl-t", object: "chat.completion", created: 1, model: "muse-wonder-1.0",
        choices: [{ index: 0, message: { role: "assistant", content: payload }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as any;
    const r1 = await findServices({ q: "tăng follow tiktok giá rẻ", lang: "vi" });
    check("C1 Finder + Meta: trả picks mode 'ai'", r1.mode === "ai" && r1.picks.length >= 1, `mode=${r1.mode} picks=${r1.picks.length}`);
    check("C2 Prompt chứa tên website thật từ cấu hình", !!before.site_name && promptSys.includes(before.site_name), before.site_name || "");
    check("C3 Prompt chứa thông tin nạp tiền thật (tối thiểu từ cấu hình)", promptUser.includes("THÔNG TIN WEBSITE") && promptUser.includes(before.deposit_min || "10000"), `deposit_min=${before.deposit_min}`);
    const faqCat = await prisma.postCategory.findUnique({ where: { slug: "faq" } });
    const faqPost = faqCat ? await prisma.post.findFirst({ where: { published: true, categoryId: faqCat.id, panelId: null }, select: { title: true } }) : null;
    if (faqPost) check("C4 Prompt chứa bài FAQ thật của website", promptUser.includes(faqPost.title), faqPost.title.slice(0, 60));
    else console.log("SKIP  C4 — DB chưa có bài FAQ để đối chiếu");
    check("C5 Prompt khoá cứng: chỉ chọn trong danh mục, không bịa giá", promptSys.includes("chỉ chọn id có trong danh mục") && promptSys.includes("không bịa"));

    // C6: ngôn ngữ EN -> chỉ thị tiếng Anh
    promptSys = ""; promptUser = "";
    globalThis.fetch = (async (url: any, init: any = {}) => {
      const body = JSON.parse(String(init.body || "{}"));
      promptSys = body.messages?.[0]?.content || "";
      promptUser = body.messages?.[1]?.content || "";
      const m = /"id":(\d+)/.exec(promptUser);
      const payload = JSON.stringify({ picks: [{ id: m ? Number(m[1]) : 0, reason: "Fits your need" }] });
      return new Response(JSON.stringify({
        id: "chatcmpl-t", object: "chat.completion", created: 1, model: "muse-wonder-1.0",
        choices: [{ index: 0, message: { role: "assistant", content: payload }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as any;
    const r2 = await findServices({ q: "cheap tiktok followers", lang: "en" });
    check("C6 Lang EN: system prompt tiếng Anh + vẫn trả picks", promptSys.includes("HARD RULES") && r2.mode === "ai");

    // C7: AI sập -> rơi êm về local, không crash
    globalThis.fetch = (async () => { throw new Error("network down"); }) as any;
    const r3 = await findServices({ q: "tăng follow tiktok", lang: "vi" });
    check("C7 AI lỗi -> mode 'local', không crash", r3.mode === "local", `picks=${r3.picks.length}`);

    // khôi phục cấu hình seed
    await setSetting("ai_enabled", "0");
    await setSetting("ai_provider", "openai");
    await setSetting("ai_meta_api_key", "");
    await setSetting("ai_meta_model", "muse-wonder-1.0");
    await prisma.$disconnect();
  } catch (e: any) {
    check("C0 DB local khả dụng cho phần kiểm chứng bộ não", false, String(e?.message || e).slice(0, 120));
  } finally {
    globalThis.fetch = realFetch;
  }

  console.log(`\n== test-meta-ai: ${pass} PASS, ${fail} FAIL ==`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
