/**
 * Test webhook FZR theo ĐÚNG envelope tài liệu (đợt đối chiếu 2026-11-09):
 *   - chữ ký header dạng "sha256=<hex HMAC>" (có tiền tố) — sai chữ ký -> 401.
 *   - sự kiện webhook.test -> 200, không đổi trạng thái.
 *   - order.status_changed: body KHÔNG mang nội dung giao — route phải tự
 *     GET /orders/{id} lấy trạng thái + mã giao thật rồi mới DELIVERED.
 *   - gửi lại cùng event_id -> deduped, không áp lại.
 *   - manual_service.chat.message -> kéo thread về DB + thông báo khách.
 * Cần app server chạy ở :3000 (như test-purchase-payment) + mock FZR.
 *   npx tsx scripts/test-fzr-webhook.ts
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createHmac } from "node:crypto";
import { prisma } from "../src/lib/db";
import { setSetting } from "../src/lib/settings";
import { syncFzrCatalog } from "../src/lib/fzr-sync";
import { createPremiumOrder } from "../src/lib/orders";

const BASE = "http://127.0.0.1:3000";
const MOCK = "http://127.0.0.1:3998";
const PID = 999005;
const SECRET = "whsec_test_doc";

let failures = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
};

const sign = (raw: string) => "sha256=" + createHmac("sha256", SECRET).update(raw, "utf8").digest("hex");

async function postWebhook(evt: any, signature?: string): Promise<{ status: number; json: any }> {
  const raw = JSON.stringify(evt);
  const r = await fetch(`${BASE}/api/webhooks/fzr`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Webhook-Signature": signature ?? sign(raw) },
    body: raw,
  });
  return { status: r.status, json: await r.json().catch(() => null) };
}

async function main() {
  // Từ P2-03 webhook FZR claim receipt NGUYÊN TỬ theo event_id — các
  // event_id cố định của test này phải được dọn trước mỗi lần chạy, nếu
  // không lượt chạy sau bị dedupe chặn (processed=false) oan.
  await prisma.webhookReceipt.deleteMany({ where: { ref: { in: ["fzr:evt-bad-1", "fzr:evt-test-1", "fzr:evt-done-1", "fzr:evt-chat-1"] } } }).catch(() => {});

  const proc: ChildProcess = spawn("node", ["scripts/mock-fzr.mjs"], { env: { ...process.env, MOCK_FZR_PORT: "3998" }, stdio: "ignore" });
  try {
    for (let i = 0; i < 40; i++) { try { const r = await fetch(`${MOCK}/__log`); if (r.ok) break; } catch { /* chờ */ } await new Promise((r) => setTimeout(r, 250)); }
    const health = await fetch(`${BASE}/`).catch(() => null);
    if (!health) throw new Error("App server chưa chạy ở :3000 — build + start trước khi chạy test này");

    const demo: any = await prisma.user.findUnique({ where: { username: "demo" } });
    const startBalance = demo.balance;
    await prisma.user.update({ where: { id: demo.id }, data: { balance: 50000000 } });
    await prisma.provider.upsert({
      where: { id: PID },
      create: { id: PID, name: "Mock FZR WH", kind: "PREMIUM", driver: "FZR", apiUrl: MOCK, apiKey: "fc_test_mock", currency: "USD", exchangeRate: 25000, markupPercent: 20, autoUpdatePrice: true, syncContent: true, active: true },
      update: { apiUrl: MOCK, apiKey: "fc_test_mock", driver: "FZR", active: true },
    });
    const provider: any = await prisma.provider.findUnique({ where: { id: PID } });
    await syncFzrCatalog(provider, {});
    await setSetting("fzr_webhook_secret", SECRET);

    /* Đơn gamekey PENDING tự tạo ở DB với providerOrderId lấy từ mock —
     * webhook sẽ là đường hoàn tất nó (mô phỏng đơn treo chờ NCC). */
    const mockOrderRes = await fetch(`${MOCK}/api/v2/gamekeys/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": "fc_test_mock", "Idempotency-Key": "wh-test-1" },
      body: JSON.stringify({ game_id: "gk-1", key_id: "gk-1-std", quantity: 1 }),
    });
    const mockOrderJson: any = await mockOrderRes.json();
    const mockOrderId = String(mockOrderJson?.order?.id || mockOrderJson?.orderId);
    ok(!!mockOrderId && mockOrderId !== "undefined", `fixture: mock tạo đơn ${mockOrderId}`);
    const gkVariant = await prisma.premiumVariant.findFirst({ where: { providerId: PID, providerGroup: "gamekeys", providerItemId: "gk-1-std" } });
    const gkOrder = await prisma.premiumOrder.create({
      data: {
        code: `WH${Date.now().toString().slice(-10)}`, userId: demo.id, variantId: gkVariant!.id, quantity: 1,
        total: 1000, cost: 900, status: "PENDING", providerId: PID, providerOrderId: mockOrderId,
      } as any,
    });

    /* 1) Sai chữ ký -> 401, đơn không đổi */
    const bad = await postWebhook({ event: "order.status_changed", event_id: "evt-bad-1", timestamp: new Date().toISOString(), data: { order_id: mockOrderId, type: "gamekey", status: "completed" } }, "sha256=0000");
    ok(bad.status === 401, `chữ ký sai -> 401 (thực tế ${bad.status})`);
    ok((await prisma.premiumOrder.findUnique({ where: { id: gkOrder.id } }))?.status === "PENDING", "chữ ký sai -> đơn vẫn PENDING");

    /* 2) webhook.test -> 200 processed, không đổi trạng thái */
    const test = await postWebhook({ event: "webhook.test", event_id: "evt-test-1", timestamp: new Date().toISOString(), data: {} });
    ok(test.status === 200 && test.json?.processed === true, `webhook.test -> 200 processed (${test.status})`);

    /* 3) order.status_changed completed -> route TỰ lấy chi tiết đơn từ
     * GET /orders/{id} (envelope không có mã) -> DELIVERED kèm mã thật */
    const done = await postWebhook({ event: "order.status_changed", event_id: "evt-done-1", timestamp: new Date().toISOString(), data: { order_id: mockOrderId, type: "gamekey", status: "completed", previous_status: "processing" } });
    ok(done.status === 200 && done.json?.processed === true, `status_changed -> 200 processed (${done.status})`);
    const afterDone: any = await prisma.premiumOrder.findUnique({ where: { id: gkOrder.id } });
    ok(afterDone?.status === "DELIVERED", `đơn DELIVERED qua webhook (thực tế ${afterDone?.status})`);
    ok((afterDone?.deliveryData || "").includes("XXXX-YYYY-ZZZZ"), `nội dung giao lấy từ GET /orders/{id}: ${(afterDone?.deliveryData || "").slice(0, 40)}`);

    /* 4) Gửi lại cùng event_id -> deduped */
    const dup = await postWebhook({ event: "order.status_changed", event_id: "evt-done-1", timestamp: new Date().toISOString(), data: { order_id: mockOrderId, type: "gamekey", status: "completed", previous_status: "processing" } });
    ok(dup.status === 200 && dup.json?.deduped === true, `cùng event_id -> deduped (${JSON.stringify(dup.json)})`);

    /* 5) manual_service.chat.message -> thread được kéo về + báo khách */
    const ms = await prisma.premiumProduct.findFirst({ where: { providerId: PID, providerProductId: "ms-1" }, include: { variants: true } });
    const mOrder: any = await createPremiumOrder({ user: demo, variantId: ms!.variants[0].id, quantity: 1, buyerInfo: demo.email, customData: {} });
    ok(mOrder.status === "PENDING" && !!mOrder.providerOrderId, `fixture: đơn manual PENDING ${mOrder.providerOrderId}`);
    const notifBefore = await prisma.notification.count({ where: { userId: demo.id } });
    const chatEvt = await postWebhook({ event: "manual_service.chat.message", event_id: "evt-chat-1", timestamp: new Date().toISOString(), data: { order_id: mOrder.providerOrderId } });
    ok(chatEvt.status === 200 && chatEvt.json?.processed === true, `chat.message -> 200 processed (${chatEvt.status})`);
    const chatCount = await prisma.manualChatMessage.count({ where: { orderId: mOrder.id } });
    ok(chatCount >= 1, `thread chat đã kéo về DB (${chatCount} tin)`);
    const notifAfter = await prisma.notification.count({ where: { userId: demo.id } });
    ok(notifAfter > notifBefore, `khách được thông báo tin chat mới (${notifBefore} -> ${notifAfter})`);

    /* Dọn dẹp */
    await prisma.manualChatMessage.deleteMany({ where: { orderId: mOrder.id } });
    await prisma.premiumOrder.deleteMany({ where: { id: { in: [gkOrder.id, mOrder.id] } } });
    await prisma.notification.deleteMany({ where: { userId: demo.id, title: { contains: "dịch vụ thủ công" } } });
    const vIds = (await prisma.premiumVariant.findMany({ where: { providerId: PID }, select: { id: true } })).map((v) => v.id);
    await prisma.premiumOrder.deleteMany({ where: { variantId: { in: vIds } } });
    await prisma.premiumVariant.deleteMany({ where: { providerId: PID } });
    await prisma.premiumProduct.deleteMany({ where: { providerId: PID } });
    await prisma.premiumCategory.deleteMany({ where: { slug: { endsWith: `-${PID}` }, products: { none: {} } } });
    await prisma.provider.delete({ where: { id: PID } });
    await prisma.apiLog.deleteMany({ where: { kind: "fzr_webhook" } });
    await setSetting("fzr_webhook_secret", "");
    await prisma.user.update({ where: { id: demo.id }, data: { balance: startBalance } });
    console.log("CLEANUP done");
  } finally {
    proc.kill();
  }
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAIL`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
