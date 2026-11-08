/**
 * Test WS9 (kho theo gói + loại giao hàng) với mock FZR (scripts/mock-fzr.mjs):
 *  MANUAL: stockQty=2 -> đặt 2 ok (kho 0) -> đặt nữa bị chặn "Gói đã hết hàng"
 *          -> hoàn đơn PENDING -> kho trả về 2; cờ outOfStock chặn đặt.
 *  API:    variant FZR stockQty=1 -> đặt ok (kho 0, provider gọi 1 lần)
 *          -> đặt nữa bị chặn TRƯỚC provider (log mock không tăng)
 *          -> variant gk-402 lỗi dứt khoát -> hoàn tiền + kho trả về 1.
 *   npx tsx scripts/test-fix5-stock.ts
 */
import { spawn, type ChildProcess } from "node:child_process";
import { prisma } from "../src/lib/db";
import { createPremiumOrder } from "../src/lib/orders";
import { refundFzrPremiumOrder } from "../src/lib/fzr-orders";

const MOCK = "http://127.0.0.1:3998";
let failures = 0;
const ok = (cond: boolean, label: string) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function mockLog(): Promise<any[]> { const r = await fetch(`${MOCK}/__log`); return (await r.json()).log; }
async function waitMock() {
  for (let i = 0; i < 30; i++) { try { const r = await fetch(`${MOCK}/__log`); if (r.ok) return; } catch {} await sleep(300); }
  throw new Error("Mock FZR không khởi động được");
}
async function expectStockError(fn: () => Promise<any>): Promise<boolean> {
  try { await fn(); return false; } catch (e: any) { return String(e?.message || e).includes("hết hàng"); }
}

async function main() {
  const proc: ChildProcess = spawn("node", ["scripts/mock-fzr.mjs"], { stdio: "ignore" });
  try {
    await waitMock();
    const demo = await prisma.user.findUnique({ where: { username: "demo" } });
    if (!demo) throw new Error("no demo");
    const v1 = await prisma.premiumVariant.findUnique({ where: { id: 1 }, include: { product: { select: { fulfillment: true } } } });
    if (!v1 || v1.product.fulfillment !== "MANUAL") throw new Error("variant 1 không phải MANUAL");
    await prisma.user.update({ where: { id: demo.id }, data: { balance: 500000 } });

    /* ---------- MANUAL ---------- */
    await prisma.premiumVariant.update({ where: { id: 1 }, data: { stockQty: 2, outOfStock: false, deliveryType: null } });
    const o1 = await createPremiumOrder({ user: demo, variantId: 1, quantity: 2, buyerInfo: "demo@example.com" });
    let vNow = await prisma.premiumVariant.findUnique({ where: { id: 1 }, select: { stockQty: true } });
    ok(vNow?.stockQty === 0, `MANUAL: đặt 2 với kho 2 -> kho còn 0 (thực tế ${vNow?.stockQty})`);
    const balAfterBuy = (await prisma.user.findUnique({ where: { id: demo.id }, select: { balance: true } }))!.balance;
    ok(balAfterBuy === 500000 - o1.total, "MANUAL: ví trừ đúng tổng đơn");
    ok(await expectStockError(() => createPremiumOrder({ user: demo, variantId: 1, quantity: 1, buyerInfo: "demo@example.com" })), "MANUAL: kho 0 -> đặt nữa bị chặn 'Gói đã hết hàng'");
    const balAfterBlock = (await prisma.user.findUnique({ where: { id: demo.id }, select: { balance: true } }))!.balance;
    ok(balAfterBlock === balAfterBuy, "MANUAL: đơn bị chặn không trừ tiền");
    const refunded = await refundFzrPremiumOrder(o1 as any, "REFUNDED", "Test WS9 hoàn đơn");
    vNow = await prisma.premiumVariant.findUnique({ where: { id: 1 }, select: { stockQty: true } });
    ok(refunded && vNow?.stockQty === 2, `MANUAL: hoàn đơn chưa giao -> kho trả về 2 (thực tế ${vNow?.stockQty})`);
    await prisma.premiumVariant.update({ where: { id: 1 }, data: { outOfStock: true, stockQty: 5 } });
    ok(await expectStockError(() => createPremiumOrder({ user: demo, variantId: 1, quantity: 1, buyerInfo: "demo@example.com" })), "MANUAL: cờ Hết hàng (outOfStock) chặn đặt dù kho còn 5");

    /* ---------- API qua mock FZR ---------- */
    const provider = await prisma.provider.upsert({
      where: { id: 999002 },
      update: { apiUrl: MOCK, apiKey: "fc_test_mock", driver: "FZR", kind: "PREMIUM", currency: "USD", exchangeRate: 25000, markupPercent: 20 },
      create: { id: 999002, name: "Mock FZR WS9", apiUrl: MOCK, apiKey: "fc_test_mock", driver: "FZR", kind: "PREMIUM", currency: "USD", exchangeRate: 25000, markupPercent: 20 },
    });
    const cat = await prisma.premiumCategory.findFirst({ select: { id: true } });
    const product = await prisma.premiumProduct.create({
      data: { name: "WS9 API Game Key", slug: "ws9-api-game-key", categoryId: cat!.id, fulfillment: "API", providerId: provider.id, color: "#0ea5e9" },
    });
    const mkVariant = async (itemId: string, stockQty: number) => prisma.premiumVariant.create({
      data: { productId: product.id, name: `Key ${itemId}`, price: 30000, cost: 25000, providerId: provider.id, providerGroup: "gamekeys", providerItemId: itemId, stockQty },
    });
    const vOk = await mkVariant("gk-1", 1);
    const logBefore = (await mockLog()).filter((l: any) => String(l.path || "").includes("gamekeys/order")).length;
    const oApi = await createPremiumOrder({ user: demo, variantId: vOk.id, quantity: 1, buyerInfo: "demo@example.com" });
    const vApiNow = await prisma.premiumVariant.findUnique({ where: { id: vOk.id }, select: { stockQty: true } });
    ok(vApiNow?.stockQty === 0, `API: đặt 1 với kho 1 -> kho còn 0 (thực tế ${vApiNow?.stockQty})`);
    const logAfter1 = (await mockLog()).filter((l: any) => String(l.path || "").includes("gamekeys/order")).length;
    ok(logAfter1 === logBefore + 1, `API: provider được gọi đúng 1 lần (${logBefore} -> ${logAfter1})`);
    ok(await expectStockError(() => createPremiumOrder({ user: demo, variantId: vOk.id, quantity: 1, buyerInfo: "demo@example.com" })), "API: kho 0 -> đặt nữa bị chặn 'Gói đã hết hàng'");
    const logAfter2 = (await mockLog()).filter((l: any) => String(l.path || "").includes("gamekeys/order")).length;
    ok(logAfter2 === logAfter1, `API: đơn bị chặn KHÔNG gọi provider (log giữ ${logAfter2})`);
    console.log("API order status:", oApi.status);

    const vFail = await mkVariant("gk-402", 1);
    const oFail = await createPremiumOrder({ user: demo, variantId: vFail.id, quantity: 1, buyerInfo: "demo@example.com" });
    const vFailNow = await prisma.premiumVariant.findUnique({ where: { id: vFail.id }, select: { stockQty: true } });
    const oFailNow = await prisma.premiumOrder.findUnique({ where: { id: oFail.id }, select: { status: true } });
    ok(oFailNow?.status === "REFUNDED", `API lỗi dứt khoát: đơn REFUNDED (thực tế ${oFailNow?.status})`);
    ok(vFailNow?.stockQty === 1, `API lỗi dứt khoát: kho trả về 1 (thực tế ${vFailNow?.stockQty})`);

    /* ---------- Dọn dẹp ---------- */
    await prisma.premiumOrder.deleteMany({ where: { variantId: { in: [vOk.id, vFail.id] } } });
    await prisma.premiumVariant.deleteMany({ where: { id: { in: [vOk.id, vFail.id] } } });
    await prisma.premiumProduct.delete({ where: { id: product.id } });
    await prisma.provider.delete({ where: { id: provider.id } });
    await prisma.premiumOrder.deleteMany({ where: { id: o1.id } });
    await prisma.premiumVariant.update({ where: { id: 1 }, data: { stockQty: null, outOfStock: false, deliveryType: null } });
    await prisma.user.update({ where: { id: demo.id }, data: { balance: 500000 } });
    console.log("cleanup done");
  } finally {
    proc.kill();
  }
  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
