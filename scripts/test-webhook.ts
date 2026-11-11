/**
 * Kiểm chứng webhook FZR qua HTTP vào server :3000 — PHẦN TRẠNG THÁI ĐƠN
 * (viết lại 2026-11-10 theo hợp đồng HIỆN HÀNH sau đợt đối chiếu tài liệu
 * 2026-11-09; bản cũ khẳng định hợp đồng đã bỏ — nội dung giao nằm trong
 * payload webhook — nên fail 5 mục):
 *  - Envelope tài liệu { event, event_id, data: { order_id, status } };
 *    chữ ký header X-Webhook-Signature = "sha256=" + HMAC-SHA256 trên raw
 *    body (Setting fzr_webhook_secret).
 *  - Body webhook KHÔNG mang nội dung giao: route tự GET /orders/{id} từ
 *    NCC rồi áp qua applyFzrOrderStatus (chung với cron poll). Mã giả
 *    (decoy) nhồi trong body KHÔNG được lọt vào deliveryData.
 *  - completed (manual) -> DELIVERED, nội dung lấy từ GET /orders/{id}.
 *  - refunded -> REFUNDED + hoàn đúng 1 lần: gửi lại bằng event_id MỚI vẫn
 *    không hoàn lần 2 (chống trùng ở tầng tiền — khác khử trùng event_id).
 *  - Sự kiện completed đến SAU khi đơn đã refund -> KHÔNG thụt lùi.
 *  - partial -> DELIVERED + nội dung đã giao + ghi chú admin MỘT PHẦN.
 *  - GET /orders/{id} lỗi -> vẫn áp trạng thái từ sự kiện nhưng
 *    allowRawDelivery=false: đơn DELIVERED mà KHÔNG có nội dung giao.
 *  - manual_service.chat.waiting_reply -> báo khách NCC đang chờ phản hồi.
 *  - Mọi lượt webhook đều có ApiLog kind "fzr_webhook".
 * PHẦN ĐÃ CÓ ở scripts/test-fzr-webhook.ts (KHÔNG lặp lại ở đây): chữ ký
 * sai -> 401, webhook.test -> 200 processed, khử trùng CÙNG event_id ->
 * deduped, completed gamekey qua GET /orders/{id}, sự kiện
 * manual_service.chat.message kéo thread + báo khách.
 * Cần server đang chạy bản build mới ở :3000.  npx tsx scripts/test-webhook.ts
 * LƯU Ý: chạy MỘT MÌNH — các suite FZR dùng chung DB local, chạy nối tiếp
 * trong cùng một lệnh shell sẽ dính fixture của nhau (fail giả).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createHmac } from "node:crypto";
import { prisma } from "../src/lib/db";
import { setSetting } from "../src/lib/settings";
import { syncFzrCatalog } from "../src/lib/fzr-sync";
import { createPremiumOrder } from "../src/lib/orders";

const BASE = process.env.WH_BASE || "http://127.0.0.1:3000";
const MOCK = "http://127.0.0.1:3998";
const PROVIDER_ID = 999006;
const SECRET = "whsec_test_rw";
let pass = 0, fail = 0;
const check = (n: string, c: boolean, x = "") => { if (c) { pass++; console.log(`PASS  ${n}${x ? " — " + x : ""}`); } else { fail++; console.log(`FAIL  ${n}${x ? " — " + x : ""}`); } };

const sign = (raw: string) => "sha256=" + createHmac("sha256", SECRET).update(raw, "utf8").digest("hex");

/** Gửi webhook đúng envelope tài liệu; decoy = nhồi payload chứa mã giả vào
 *  body để chứng minh route không bao giờ lấy nội dung giao từ envelope. */
async function postWebhook(evt: any, decoy = false) {
  if (decoy) evt = { ...evt, data: { ...evt.data, payload: { status: evt.data?.status, cards: [{ code: "DECOY-CODE" }] } } };
  const raw = JSON.stringify(evt);
  const res = await fetch(`${BASE}/api/webhooks/fzr`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-webhook-signature": sign(raw) },
    body: raw,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

/** Lật trạng thái "poll" phía mock — GET /orders/{id} sẽ trả trạng thái này
 *  (kèm keys = delivery nếu có), mô phỏng NCC đổi trạng thái sau khi tạo đơn. */
async function flip(orderId: string, status: string, delivery?: string[]) {
  const r = await fetch(`${MOCK}/__control`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ flip: { orderId, status, delivery } }),
  });
  if (!r.ok) throw new Error(`flip mock thất bại cho ${orderId}`);
}

const evt = (event_id: string, order_id: string, status: string, event = "order.status_changed") => ({
  event, event_id, timestamp: new Date().toISOString(),
  data: { order_id, type: "manual_service", status, previous_status: "processing" },
});

async function main() {
  const mock: ChildProcess = spawn("node", ["scripts/mock-fzr.mjs"], { env: { ...process.env, MOCK_FZR_PORT: "3998" }, stdio: "ignore" });
  const createdOrderIds: number[] = [];
  try {
    for (let i = 0; i < 40; i++) { try { const r = await fetch(`${MOCK}/__log`); if (r.ok) break; } catch { /* chờ */ } await new Promise((r) => setTimeout(r, 250)); }
    const health = await fetch(`${BASE}/`).catch(() => null);
    if (!health) throw new Error("App server chưa chạy ở :3000 — build + start trước khi chạy test này");

    await prisma.provider.upsert({
      where: { id: PROVIDER_ID },
      create: { id: PROVIDER_ID, name: "Mock FZR WH RW", kind: "PREMIUM", driver: "FZR", apiUrl: MOCK, apiKey: "fc_test_mock", currency: "USD", exchangeRate: 25000, markupPercent: 20, autoUpdatePrice: true, syncContent: true, active: true },
      update: { apiUrl: MOCK, apiKey: "fc_test_mock", driver: "FZR", active: true },
    });
    const provider: any = await prisma.provider.findUnique({ where: { id: PROVIDER_ID } });
    await syncFzrCatalog(provider, {});
    await setSetting("fzr_webhook_secret", SECRET);

    const demo: any = await prisma.user.findUnique({ where: { username: "demo" } });
    const startBalance = demo.balance as number;
    const runStart = new Date();
    await prisma.user.update({ where: { id: demo.id }, data: { balance: 50000000 } });
    const freshDemo = async () => (await prisma.user.findUnique({ where: { id: demo.id } })) as any;
    const logBaseline = await prisma.apiLog.count({ where: { kind: "fzr_webhook" } });

    // Chọn variant manual KHÔNG có trường bắt buộc (dịch vụ standard) — test
    // này kiểm webhook trạng thái, không kiểm fields. Cách mua mô phỏng đúng
    // luồng web: buyerInfo = danh tính tài khoản khi không có fields.
    const manualCands = await prisma.premiumVariant.findMany({ where: { providerId: PROVIDER_ID, providerGroup: "manual" }, include: { product: { select: { customFields: true } } }, orderBy: { price: "asc" } });
    const { parsePremiumFields } = await import("../src/lib/format");
    const manualV = manualCands.find((v: any) => !parsePremiumFields(v.product.customFields).some((f: any) => f.required));
    check("có variant manual để tạo đơn PENDING", !!manualV);
    if (!manualV) throw new Error("thiếu fixture variant manual");
    const buyManual = async () => {
      const u: any = await freshDemo();
      const o: any = await createPremiumOrder({ user: u, variantId: manualV!.id, quantity: 1, buyerInfo: u.email || u.username });
      createdOrderIds.push(o.id);
      return o;
    };

    // 1) completed -> DELIVERED, nội dung từ GET /orders/{id}, KHÔNG từ body
    const oA: any = await buyManual();
    check("đơn A PENDING + có providerOrderId", oA.status === "PENDING" && !!oA.providerOrderId, oA.providerOrderId);
    await flip(oA.providerOrderId, "completed", ["WH-CARD-1"]);
    const rA = await postWebhook(evt("evt-rw-a1", oA.providerOrderId, "completed"), true);
    const afterA: any = await prisma.premiumOrder.findUnique({ where: { id: oA.id } });
    check("webhook completed hợp lệ -> 200 processed", rA.status === 200 && rA.json?.processed === true, JSON.stringify(rA.json));
    check("đơn A DELIVERED + nội dung từ GET /orders/{id}", afterA.status === "DELIVERED" && (afterA.deliveryData || "").includes("WH-CARD-1"), afterA.deliveryData || "");
    check("mã decoy trong body KHÔNG lọt vào nội dung giao", !(afterA.deliveryData || "").includes("DECOY-CODE"));

    // 2) refund -> REFUNDED + hoàn đúng 1 lần dù gửi lại bằng event_id mới
    const oB: any = await buyManual();
    const balAfterBuyB = (await freshDemo()).balance;
    await flip(oB.providerOrderId, "refunded");
    const rB = await postWebhook(evt("evt-rw-b1", oB.providerOrderId, "refunded"));
    const afterB: any = await prisma.premiumOrder.findUnique({ where: { id: oB.id } });
    check("webhook refund -> REFUNDED + hoàn đủ", rB.status === 200 && afterB.status === "REFUNDED" && (await freshDemo()).balance === balAfterBuyB + oB.total, afterB.status);
    const rB2 = await postWebhook(evt("evt-rw-b2", oB.providerOrderId, "refunded"));
    check("gửi lại refund bằng event_id MỚI -> vẫn REFUNDED, không hoàn lần 2", rB2.status === 200 && (await prisma.premiumOrder.findUnique({ where: { id: oB.id } }))?.status === "REFUNDED" && (await freshDemo()).balance === balAfterBuyB + oB.total);

    // 3) sự kiện completed đến sau refund -> KHÔNG thụt lùi
    await flip(oB.providerOrderId, "completed", ["LATE-CODE"]);
    const rLate = await postWebhook(evt("evt-rw-b3", oB.providerOrderId, "completed"));
    const afterB2: any = await prisma.premiumOrder.findUnique({ where: { id: oB.id } });
    check("completed đến sau refund -> đơn giữ REFUNDED + tiền nguyên + không nhận mã muộn", rLate.status === 200 && afterB2.status === "REFUNDED" && (await freshDemo()).balance === balAfterBuyB + oB.total && !(afterB2.deliveryData || "").includes("LATE-CODE"), afterB2.status);

    // 4) partial -> DELIVERED + nội dung đã giao + ghi chú admin đối soát tay
    const oD: any = await buyManual();
    await flip(oD.providerOrderId, "partial", ["PART-1"]);
    const rD = await postWebhook(evt("evt-rw-d1", oD.providerOrderId, "partial"));
    const afterD: any = await prisma.premiumOrder.findUnique({ where: { id: oD.id } });
    check("partial -> DELIVERED + nội dung đã giao + ghi chú MỘT PHẦN", rD.status === 200 && afterD.status === "DELIVERED" && (afterD.deliveryData || "").includes("PART-1") && /MỘT PHẦN/.test(afterD.adminNote || ""), afterD.status);

    // 5) GET /orders/{id} lỗi (đơn không tồn tại phía mock) -> vẫn áp trạng
    //    thái từ sự kiện, nhưng allowRawDelivery=false: không nội dung giao,
    //    mã decoy trong body cũng không lọt vào.
    const ghost = await prisma.premiumOrder.create({
      data: {
        code: `RW${Date.now().toString().slice(-10)}`, userId: demo.id, variantId: manualV!.id, quantity: 1,
        total: 1000, cost: 900, status: "PENDING", providerId: PROVIDER_ID, providerOrderId: "ord_manual_ghost",
      } as any,
    });
    createdOrderIds.push(ghost.id);
    const rG = await postWebhook(evt("evt-rw-g1", "ord_manual_ghost", "completed"), true);
    const afterG: any = await prisma.premiumOrder.findUnique({ where: { id: ghost.id } });
    check("GET chi tiết lỗi -> vẫn áp trạng thái sự kiện (DELIVERED)", rG.status === 200 && rG.json?.processed === true && afterG.status === "DELIVERED", afterG.status);
    check("fallback KHÔNG đổ nội dung thô/decoy vào nội dung giao", !afterG.deliveryData && !(afterG.deliveryData || "").includes("DECOY-CODE"), JSON.stringify(afterG.deliveryData));

    // 6) manual_service.chat.waiting_reply -> báo khách NCC đang chờ phản hồi
    const oE: any = await buyManual();
    const rE = await postWebhook({ event: "manual_service.chat.waiting_reply", event_id: "evt-rw-e1", timestamp: new Date().toISOString(), data: { order_id: oE.providerOrderId } });
    const waitNotif = await prisma.notification.findFirst({ where: { userId: demo.id, title: "Nhà cung cấp đang chờ phản hồi", createdAt: { gte: runStart } } });
    check("waiting_reply -> 200 processed + khách nhận thông báo chờ phản hồi", rE.status === 200 && rE.json?.processed === true && !!waitNotif, JSON.stringify(rE.json));

    // 7) Mọi lượt webhook (7 POST ở trên) đều có ApiLog capture
    const logs = await prisma.apiLog.count({ where: { kind: "fzr_webhook" } });
    check("mọi lượt webhook đều có ApiLog capture", logs >= logBaseline + 7, `${logs - logBaseline} dòng mới`);

    // Dọn dẹp
    await prisma.manualChatMessage.deleteMany({ where: { orderId: { in: createdOrderIds } } });
    await prisma.notification.deleteMany({ where: { userId: demo.id, createdAt: { gte: runStart } } });
    const vIds = (await prisma.premiumVariant.findMany({ where: { providerId: PROVIDER_ID }, select: { id: true } })).map((v) => v.id);
    await prisma.premiumOrder.deleteMany({ where: { variantId: { in: vIds } } });
    await prisma.premiumVariant.deleteMany({ where: { providerId: PROVIDER_ID } });
    await prisma.premiumProduct.deleteMany({ where: { providerId: PROVIDER_ID } });
    await prisma.premiumCategory.deleteMany({ where: { slug: { endsWith: `-${PROVIDER_ID}` }, products: { none: {} } } });
    await prisma.apiLog.deleteMany({ where: { kind: "fzr_webhook" } });
    await prisma.provider.delete({ where: { id: PROVIDER_ID } });
    await setSetting("fzr_webhook_secret", "");
    await prisma.user.update({ where: { id: demo.id }, data: { balance: startBalance } });
    console.log("CLEANUP done");
  } finally {
    mock.kill();
  }
  console.log(fail === 0 ? `\nALL PASS (${pass})` : `\n${fail} FAIL / ${pass} PASS`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
