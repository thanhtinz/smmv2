/**
 * Kiểm chứng đợt 111 — định tuyến email cảnh báo theo sự kiện + cảnh báo kho:
 *  (a) ticket có danh sách email riêng -> mail CHỈ đi danh sách đó;
 *  (b) sự kiện không có danh sách riêng -> rơi về danh sách chung alert_email_to;
 *  (c) kho (stockQty) chạm 0 -> đúng 1 cảnh báo "Hết kho" (đi danh sách riêng
 *      của sự kiện stock); đơn tiếp theo ở tồn 0 bị chặn và KHÔNG bắn thêm;
 *  (d) nạp lại kho rồi bán xuống 0 lần nữa -> cảnh báo lại;
 *  (e) ngưỡng sắp hết = 3: tồn rơi tới 3 -> 1 cảnh báo "Sắp hết kho", bán
 *      tiếp xuống 2 không bắn nữa, xuống 0 -> cảnh báo "Hết kho";
 *  (e2) kho AUTO_STOCK (dòng PremiumStock) vơi tới 0 cũng bắn "Hết kho";
 *  (f) Telegram/Discord vẫn được gọi như trước (kể cả cho sự kiện stock).
 * Bắt mail bằng cách thay nodemailer.createTransport bằng transporter giả
 * (không gửi mail thật); Telegram/Discord chặn ở global fetch như test-meta-ai.
 * Chạy: npx tsx scripts/test-alerts-routing.ts (cần DATABASE_URL local)
 */
export {};
let pass = 0, fail = 0;
const check = (n: string, c: boolean, x = "") => { if (c) { pass++; console.log(`PASS  ${n}${x ? " — " + x : ""}`); } else { fail++; console.log(`FAIL  ${n}${x ? " — " + x : ""}`); } };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // ---- Chặn lớp gửi TRƯỚC khi import các lib dùng tới nó ----
  // nodemailer có 2 bản ESM/CJS: mã nguồn qua tsx dùng bản CJS (require) nên
  // phải vá qua createRequire; vá thêm bản ESM cho chắc. Vá createTransport
  // bằng transporter giả ghi lại người nhận — KHÔNG gửi mail thật.
  const sentMails: { bcc: string[]; subject: string; html: string }[] = [];
  const stubTransport = () => ({
    sendMail: async (opts: any) => { sentMails.push({ bcc: opts.bcc || [], subject: String(opts.subject || ""), html: String(opts.html || "") }); return { messageId: "stub" }; },
  });
  const { createRequire } = await import("node:module");
  (createRequire(import.meta.url)("nodemailer") as any).createTransport = stubTransport;
  ((await import("nodemailer")).default as any).createTransport = stubTransport;
  const realFetch = globalThis.fetch;
  const fetchCalls: string[] = [];
  globalThis.fetch = (async (url: any) => { fetchCalls.push(String(url)); return new Response("{}", { status: 200, headers: { "content-type": "application/json" } }); }) as any;

  const { prisma } = await import("../src/lib/db");
  const { randomKey } = await import("../src/lib/format");
  const { alertMother } = await import("../src/lib/alerts");
  const { stockCrossing } = await import("../src/lib/variant-stock");
  const { createPremiumOrder } = await import("../src/lib/orders");

  const waitFor = async (cond: () => boolean, ms = 4000) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) return false; await sleep(50); } return true; };
  const outMails = () => sentMails.filter((m) => m.subject.startsWith("Hết kho:"));
  const lowMails = () => sentMails.filter((m) => m.subject.startsWith("Sắp hết kho:"));

  // ---- Settings fixture: lưu cũ -> đặt -> cuối test khôi phục ----
  const KEYS = ["alert_email_enabled", "alert_email_to", "alert_email_to_ticket", "alert_email_to_premium_order", "alert_email_to_stock", "alert_events", "alert_stock_low_threshold", "alert_discord_enabled", "alert_discord_webhook", "telegram_notify", "telegram_bot_token", "telegram_chat_id", "smtp_enabled", "smtp_host", "smtp_user", "smtp_from"];
  const old: Record<string, string | null> = {};
  for (const k of KEYS) old[k] = (await prisma.setting.findUnique({ where: { key: k } }))?.value ?? null;
  const set = async (kv: Record<string, string>) => { for (const [k, v] of Object.entries(kv)) await prisma.setting.upsert({ where: { key: k }, create: { key: k, value: v }, update: { value: v } }); };
  await set({
    alert_email_enabled: "1",
    alert_email_to: "chung@test.local",
    alert_email_to_ticket: "hotro@test.local",
    alert_email_to_premium_order: "",
    alert_email_to_stock: "kho@test.local",
    alert_events: "",
    alert_stock_low_threshold: "5",
    alert_discord_enabled: "0", alert_discord_webhook: "",
    telegram_notify: "0", telegram_bot_token: "", telegram_chat_id: "",
    smtp_enabled: "1", smtp_host: "stub.local", smtp_user: "stub@test.local", smtp_from: "noreply@test.local",
  });

  try {
    // ---- (a) ticket -> danh sách riêng ----
    await alertMother("ticket", "Ticket thử", "nội dung");
    check("(a) ticket gửi đúng 1 email", sentMails.length === 1, `${sentMails.length} mail`);
    check("(a) ticket chỉ tới danh sách riêng", JSON.stringify(sentMails[0]?.bcc) === JSON.stringify(["hotro@test.local"]), JSON.stringify(sentMails[0]?.bcc));

    // ---- (b) premium_order -> danh sách chung ----
    sentMails.length = 0;
    await alertMother("premium_order", "Đơn thử", "nội dung");
    check("(b) sự kiện chưa có danh sách riêng gửi đúng 1 email", sentMails.length === 1);
    check("(b) rơi về danh sách chung alert_email_to", JSON.stringify(sentMails[0]?.bcc) === JSON.stringify(["chung@test.local"]), JSON.stringify(sentMails[0]?.bcc));

    // ---- Hàm thuần stockCrossing ----
    check("(thuần) chạm 0 -> OUT", stockCrossing(2, 0, 5) === "OUT");
    check("(thuần) vượt ngưỡng xuống -> LOW", stockCrossing(6, 5, 5) === "LOW");
    check("(thuần) đã dưới ngưỡng từ trước -> không bắn", stockCrossing(5, 4, 5) === null);
    check("(thuần) ngưỡng 0: chỉ OUT, không LOW", stockCrossing(3, 1, 0) === null && stockCrossing(1, 0, 0) === "OUT");
    check("(thuần) tồn không giảm -> không bắn", stockCrossing(3, 3, 5) === null && stockCrossing(0, 0, 5) === null);

    // ---- Fixtures kho ----
    const suffix = randomKey(6).toLowerCase();
    const user = await prisma.user.create({ data: { username: `alert${suffix}`, email: `alert${suffix}@test.local`, passwordHash: "x", balance: 100000000, apiKey: randomKey(32), depositCode: randomKey(6).toUpperCase() } });
    const cat = await prisma.premiumCategory.create({ data: { name: `AlertTest ${suffix}`, slug: `alerttest-${suffix}` } });
    const prodQty = await prisma.premiumProduct.create({ data: { categoryId: cat.id, name: `KhoQty ${suffix}`, slug: `khoqty-${suffix}`, fulfillment: "MANUAL" } });
    const vQty = await prisma.premiumVariant.create({ data: { productId: prodQty.id, name: "Gói kho số lượng", price: 10000, cost: 1000, stockQty: 2 } });
    const prodAuto = await prisma.premiumProduct.create({ data: { categoryId: cat.id, name: `KhoAuto ${suffix}`, slug: `khoauto-${suffix}`, fulfillment: "AUTO_STOCK" } });
    const vAuto = await prisma.premiumVariant.create({ data: { productId: prodAuto.id, name: "Gói kho tự động", price: 10000, cost: 1000 } });
    await prisma.premiumStock.create({ data: { variantId: vAuto.id, payload: `ACC-${suffix}-1` } });
    const buy = (variantId: number, quantity: number) => createPremiumOrder({ user, variantId, quantity, buyerInfo: "buyer@test.local" });

    // ---- (c) chạm 0 -> đúng 1 cảnh báo, đi danh sách riêng của stock ----
    await buy(vQty.id, 2);
    check("(c) bán chạm 0 -> bắn cảnh báo hết kho", await waitFor(() => outMails().length === 1), `${outMails().length} mail hết kho`);
    check("(c) cảnh báo kho đi danh sách riêng kho@", JSON.stringify(outMails()[0]?.bcc) === JSON.stringify(["kho@test.local"]), JSON.stringify(outMails()[0]?.bcc));
    check("(c) nội dung ghi rõ sản phẩm + gói + link admin", (outMails()[0]?.html || "").includes(`KhoQty ${suffix}`) && (outMails()[0]?.html || "").includes("/admin/premium"));
    let blocked = false;
    try { await buy(vQty.id, 1); } catch { blocked = true; }
    await sleep(400);
    check("(c) tồn đã 0: đơn sau bị chặn hết hàng, không cảnh báo thêm", blocked && outMails().length === 1);

    // ---- (d) nạp lại kho -> bán xuống 0 -> cảnh báo lại ----
    await prisma.premiumVariant.update({ where: { id: vQty.id }, data: { stockQty: 1 } });
    await buy(vQty.id, 1);
    check("(d) nạp lại kho rồi chạm 0 -> cảnh báo lần 2", await waitFor(() => outMails().length === 2), `${outMails().length} mail hết kho`);

    // ---- (e) ngưỡng sắp hết = 3 ----
    await set({ alert_stock_low_threshold: "3" });
    const vLow = await prisma.premiumVariant.create({ data: { productId: prodQty.id, name: "Gói ngưỡng", price: 10000, cost: 1000, stockQty: 5 } });
    await buy(vLow.id, 2); // còn 3 = ngưỡng -> LOW
    check("(e) rơi tới ngưỡng -> 1 cảnh báo sắp hết kho", await waitFor(() => lowMails().length === 1), `${lowMails().length} mail sắp hết`);
    check("(e) nội dung ghi tồn còn lại = 3", (lowMails()[0]?.html || "").includes("còn lại: 3"));
    await buy(vLow.id, 1); // còn 2 — đã dưới ngưỡng từ trước
    await sleep(400);
    check("(e) bán tiếp dưới ngưỡng -> không bắn thêm", lowMails().length === 1);
    await buy(vLow.id, 2); // còn 0 -> OUT
    check("(e) xuống 0 -> cảnh báo hết kho", await waitFor(() => outMails().length === 3), `${outMails().length} mail hết kho`);

    // ---- (e2) AUTO_STOCK vơi tới 0 ----
    const delivered = await buy(vAuto.id, 1);
    check("(e2) đơn AUTO_STOCK giao ngay từ kho", delivered.status === "DELIVERED", delivered.status);
    check("(e2) kho tự động chạm 0 -> cảnh báo hết kho", await waitFor(() => outMails().length === 4), `${outMails().length} mail hết kho`);

    // ---- (f) Telegram/Discord giữ nguyên + nhận cả sự kiện stock ----
    await set({ telegram_notify: "1", telegram_bot_token: "123:stub", telegram_chat_id: "999", alert_discord_enabled: "1", alert_discord_webhook: "https://discord.com/api/webhooks/1/stub" });
    fetchCalls.length = 0;
    await alertMother("ticket", "Ticket thử kênh", "nội dung");
    check("(f) Telegram vẫn được gọi", fetchCalls.some((u) => u.includes("api.telegram.org/bot123:stub/sendMessage")), fetchCalls.join(" | "));
    check("(f) Discord vẫn được gọi", fetchCalls.some((u) => u.includes("discord.com/api/webhooks/1/stub")));
    await prisma.premiumVariant.update({ where: { id: vQty.id }, data: { stockQty: 1 } });
    fetchCalls.length = 0;
    await buy(vQty.id, 1); // chạm 0 lần nữa -> stock alert qua mọi kênh
    check("(f) sự kiện stock cũng đi Telegram/Discord", await waitFor(() => fetchCalls.some((u) => u.includes("api.telegram.org")) && fetchCalls.some((u) => u.includes("discord.com"))));
    check("(f) sự kiện stock vẫn đi email riêng", await waitFor(() => outMails().length === 5), `${outMails().length} mail hết kho`);
  } finally {
    // Khôi phục settings như trước test
    for (const k of KEYS) {
      const v = old[k];
      if (v === null || v === undefined) await prisma.setting.deleteMany({ where: { key: k } });
      else await prisma.setting.upsert({ where: { key: k }, create: { key: k, value: v }, update: { value: v } });
    }
    globalThis.fetch = realFetch;
    await prisma.$disconnect();
  }
  console.log(`\n== test-alerts-routing: ${pass} PASS, ${fail} FAIL ==`);
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => { console.error("FATAL", e); process.exit(1); });
