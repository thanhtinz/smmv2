/**
 * Kiểm chứng webhook FZR THẬT (docs reseller) qua HTTP vào server :3000:
 *  chữ ký HMAC-SHA256 trên raw body (Setting fzr_webhook_secret) — hợp lệ thì áp
 *  trạng thái qua applyFzrOrderStatus (chung với cron poll), sai chữ ký -> 401
 *  không đổi gì, trùng webhook id -> áp đúng 1 lần, sự kiện đến muộn/sai thứ tự
 *  không thụt lùi đơn đã kết thúc, partial -> giao + ghi chú admin.
 * Cần server đang chạy bản build mới ở :3000.  npx tsx scripts/test-webhook.ts
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createHmac } from "node:crypto";
import { prisma } from "../src/lib/db";
import { setSetting } from "../src/lib/settings";
import { syncFzrCatalog } from "../src/lib/fzr-sync";
import { createPremiumOrder } from "../src/lib/orders";

const BASE = process.env.WALK_BASE || "http://127.0.0.1:3000";
const MOCK = "http://127.0.0.1:3998";
const PROVIDER_ID = 999004;
const SECRET = "whsec_test_123";
let pass = 0, fail = 0;
const check = (n: string, c: boolean, x = "") => { if (c) { pass++; console.log(`PASS  ${n}${x ? " — " + x : ""}`); } else { fail++; console.log(`FAIL  ${n}${x ? " — " + x : ""}`); } };

async function postWebhook(evt: any, secret: string | null) {
  const raw = JSON.stringify(evt);
  const headers: Record<string, string> = { "content-type": "application/json", "x-webhook-id": evt.id, "x-webhook-event": evt.type };
  if (secret !== null) headers["x-webhook-signature"] = createHmac("sha256", secret).update(raw, "utf8").digest("hex");
  const res = await fetch(`${BASE}/api/webhooks/fzr`, { method: "POST", headers, body: raw });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function main() {
  const mock: ChildProcess = spawn("node", ["scripts/mock-fzr.mjs"], { stdio: "ignore" });
  try {
    for (let i = 0; i < 40; i++) { try { const r = await fetch(`${MOCK}/api/v2/balance`, { headers: { "X-API-Key": "fc_test_mock" } }); if (r.ok) break; } catch { /* chờ */ } await new Promise((r) => setTimeout(r, 250)); }
    await prisma.provider.upsert({
      where: { id: PROVIDER_ID },
      create: { id: PROVIDER_ID, name: "Mock FZR WH", kind: "PREMIUM", driver: "FZR", apiUrl: MOCK, apiKey: "fc_test_mock", currency: "USD", exchangeRate: 25000, markupPercent: 20, autoUpdatePrice: true, syncContent: true, active: true },
      update: { apiUrl: MOCK, apiKey: "fc_test_mock", driver: "FZR", active: true },
    });
    const provider: any = await prisma.provider.findUnique({ where: { id: PROVIDER_ID } });
    await syncFzrCatalog(provider, {});
    await setSetting("fzr_webhook_secret", SECRET);

    const demo: any = await prisma.user.findUnique({ where: { username: "demo" } });
    const startBalance = demo.balance as number;
    await prisma.user.update({ where: { id: demo.id }, data: { balance: 50000000 } });
    const freshDemo = async () => (await prisma.user.findUnique({ where: { id: demo.id } })) as any;

    const manualV = await prisma.premiumVariant.findFirst({ where: { providerId: PROVIDER_ID, providerGroup: "manual" }, orderBy: { price: "asc" } });
    check("có variant manual để tạo đơn PENDING", !!manualV);
    const buyManual = async () => createPremiumOrder({ user: await freshDemo(), variantId: manualV!.id, quantity: 1, customData: { "Thông tin bổ sung": "@whuser" } }) as any;

    // 1) completed + cards -> DELIVERED, nội dung từ order.cards
    const oA: any = await buyManual();
    check("đơn A PENDING + có providerOrderId", oA.status === "PENDING" && !!oA.providerOrderId, oA.providerOrderId);
    const rA = await postWebhook({ id: "wh_t1", type: "order.status_changed", created_at: new Date().toISOString(), data: { id: oA.providerOrderId, kind: "manual_service", status: "completed", previous_status: "processing", payload: { status: "completed", cards: [{ code: "WH-CARD-1" }] } } }, SECRET);
    const afterA: any = await prisma.premiumOrder.findUnique({ where: { id: oA.id } });
    check("webhook completed hợp lệ -> 200 processed", rA.status === 200 && rA.json?.processed === true, JSON.stringify(rA.json));
    check("đơn A DELIVERED + nội dung từ order.cards", afterA.status === "DELIVERED" && (afterA.deliveryData || "").includes("WH-CARD-1"), afterA.deliveryData || "");

    // 2) refund -> REFUNDED + hoàn đúng 1 lần dù giao trùng
    const oB: any = await buyManual();
    const balBeforeRefund = (await freshDemo()).balance;
    const evtB = { id: "wh_t2", type: "order.status_changed", created_at: new Date().toISOString(), data: { id: oB.providerOrderId, kind: "manual_service", status: "refunded", previous_status: "processing", payload: { status: "refunded" } } };
    const rB = await postWebhook(evtB, SECRET);
    const afterB: any = await prisma.premiumOrder.findUnique({ where: { id: oB.id } });
    check("webhook refund -> REFUNDED + hoàn đủ", rB.status === 200 && afterB.status === "REFUNDED" && (await freshDemo()).balance === balBeforeRefund + oB.total, afterB.status);
    const rDup = await postWebhook(evtB, SECRET);
    check("giao trùng webhook id -> deduped, không hoàn lần 2", rDup.json?.deduped === true && (await freshDemo()).balance === balBeforeRefund + oB.total);
    const rLate = await postWebhook({ id: "wh_t3", type: "order.status_changed", created_at: new Date().toISOString(), data: { id: oB.providerOrderId, kind: "manual_service", status: "completed", payload: { status: "completed", cards: [{ code: "LATE" }] } } }, SECRET);
    const afterB2: any = await prisma.premiumOrder.findUnique({ where: { id: oB.id } });
    check("sự kiện completed đến sau refund -> KHÔNG thụt lùi", rLate.status === 200 && afterB2.status === "REFUNDED" && (await freshDemo()).balance === balBeforeRefund + oB.total);

    // 3) sai chữ ký -> 401, đơn nguyên trạng
    const oC: any = await buyManual();
    const rC = await postWebhook({ id: "wh_t4", type: "order.status_changed", created_at: new Date().toISOString(), data: { id: oC.providerOrderId, kind: "manual_service", status: "completed", payload: { status: "completed", cards: [{ code: "HACK" }] } } }, "whsec_WRONG");
    const afterC: any = await prisma.premiumOrder.findUnique({ where: { id: oC.id } });
    check("chữ ký sai -> 401 + đơn vẫn PENDING", rC.status === 401 && afterC.status === "PENDING", `${rC.status}/${afterC.status}`);

    // 4) partial -> DELIVERED + ghi chú admin đối soát tay
    const oD: any = await buyManual();
    const rD = await postWebhook({ id: "wh_t5", type: "order.status_changed", created_at: new Date().toISOString(), data: { id: oD.providerOrderId, kind: "manual_service", status: "partial", payload: { status: "partial", cards: [{ code: "PART-1" }] } } }, SECRET);
    const afterD: any = await prisma.premiumOrder.findUnique({ where: { id: oD.id } });
    check("partial -> DELIVERED + nội dung đã giao + ghi chú MỘT PHẦN", rD.status === 200 && afterD.status === "DELIVERED" && (afterD.deliveryData || "").includes("PART-1") && /MỘT PHẦN/.test(afterD.adminNote || ""), afterD.status);

    const logs = await prisma.apiLog.count({ where: { kind: "fzr_webhook" } });
    check("mọi lượt webhook đều có ApiLog capture", logs >= 5, `${logs} dòng`);

    // Dọn dẹp
    const vIds = (await prisma.premiumVariant.findMany({ where: { providerId: PROVIDER_ID }, select: { id: true } })).map((v) => v.id);
    await prisma.premiumOrder.deleteMany({ where: { variantId: { in: vIds } } });
    const pIds = (await prisma.premiumProduct.findMany({ where: { variants: { some: { providerId: PROVIDER_ID } } }, select: { id: true } })).map((p) => p.id);
    await prisma.premiumVariant.deleteMany({ where: { providerId: PROVIDER_ID } });
    await prisma.premiumProduct.deleteMany({ where: { id: { in: pIds } } });
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
