/**
 * Test E2E fix6 task 6 — API sản phẩm số theo nhóm qua HTTP /api/v2 thật
 * (server local :3000) + mock FZR (:3998):
 *   products theo nhóm (kho WS9) · buy game key -> poll DELIVERED -> premium_status
 *   có delivery · buy Telegram Stars bằng username + telegram_id · gói manual
 *   theo dõi kho: trừ kho + chặn hết hàng {error} · ApiLog · hồi quy SMM.
 *   npx tsx scripts/test-fix6-api.ts
 */
import { spawn, type ChildProcess } from "node:child_process";
import { prisma } from "../src/lib/db";
import { syncFzrCatalog } from "../src/lib/fzr-sync";
import { pollFzrPremiumOrder } from "../src/lib/fzr-orders";

const MOCK = "http://127.0.0.1:3998";
const API = "http://127.0.0.1:3000/api/v2";
const PROVIDER_ID = 999006;
let failures = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitMock() {
  for (let i = 0; i < 30; i++) {
    try { const r = await fetch(`${MOCK}/__log`); if (r.ok) return; } catch {}
    await sleep(300);
  }
  throw new Error("Mock FZR không khởi động được");
}

async function main() {
  const proc: ChildProcess = spawn("node", ["scripts/mock-fzr.mjs"], { stdio: "ignore" });
  const orderCodes: string[] = [];
  let smmOrderId = 0;
  let manualProductId = 0;
  try {
    await waitMock();
    const demo = await prisma.user.findUnique({ where: { username: "demo" } });
    if (!demo?.apiKey) throw new Error("demo/apiKey chưa sẵn sàng");
    const KEY = demo.apiKey;
    const api = async (params: Record<string, string>) => {
      const body = new URLSearchParams({ key: KEY, ...params });
      const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
      return r.json() as Promise<any>;
    };

    // Dọn fixture cũ + nạp số dư test + provider mock + đồng bộ catalog
    const oldV = (await prisma.premiumVariant.findMany({ where: { providerId: PROVIDER_ID }, select: { id: true } })).map((v) => v.id);
    if (oldV.length) {
      await prisma.premiumOrder.deleteMany({ where: { variantId: { in: oldV } } });
      await prisma.premiumVariant.deleteMany({ where: { id: { in: oldV } } });
    }
    await prisma.premiumProduct.deleteMany({ where: { providerId: PROVIDER_ID } });
    await prisma.provider.deleteMany({ where: { id: PROVIDER_ID } });
    await prisma.user.update({ where: { id: demo.id }, data: { balance: 50000000 } });
    const provider = await prisma.provider.create({
      data: { id: PROVIDER_ID, kind: "PREMIUM", driver: "FZR", name: "MockFZR-api", apiUrl: MOCK, apiKey: "fc_test_mock", currency: "USD", exchangeRate: 25000, markupPercent: 20, active: true },
    });
    await syncFzrCatalog(provider as any);

    /* 1) Catalog theo nhóm */
    const gkList = await api({ action: "products", group: "gamekeys" });
    ok(Array.isArray(gkList) && gkList.length === 1 && gkList[0].group === "gamekeys", "products?group=gamekeys trả đúng 1 nhóm gamekeys");
    const gkProduct = gkList[0].products.find((p: any) => p.name);
    const gkVariant = await prisma.premiumVariant.findFirst({ where: { providerId: PROVIDER_ID, providerGroup: "gamekeys", providerItemId: "gk-1" } });
    const gkEntry = gkList[0].products.flatMap((p: any) => p.variants).find((v: any) => v.variant === gkVariant!.id);
    ok(!!gkEntry && gkEntry.stock === "in_stock" && gkEntry.price === gkVariant!.price, `variant gamekey trong catalog: price=${gkEntry?.price} stock=${gkEntry?.stock}`);
    const all = await api({ action: "products" });
    const groupKeys = all.map((g: any) => g.group);
    ok(groupKeys.includes("telegram_stars") && groupKeys.includes("telegram_premium") && groupKeys.includes("giftcards"), `products (mọi nhóm) có: ${groupKeys.join(",")}`);
    const starsProduct = all.find((g: any) => g.group === "telegram_stars")?.products[0];
    ok(JSON.stringify(starsProduct?.required_fields || []).includes("Tên người dùng Telegram"), "sản phẩm Telegram Stars khai required_fields có username");
    const badGroup = await api({ action: "products", group: "khong-co" });
    ok(badGroup.error === "Unknown group", "group lạ -> {error: Unknown group}");

    /* 2) Hồi quy: balance + services SMM */
    const bal = await api({ action: "balance" });
    ok(bal.balance === "50000000" && bal.currency === "VND", `balance khớp DB: ${bal.balance}`);
    const services = await api({ action: "services" });
    ok(Array.isArray(services) && services.length > 0 && services[0].rate !== undefined, `services SMM còn nguyên (${services.length} dịch vụ)`);

    /* 3) Mua game key qua API -> poll -> premium_status có delivery */
    const buyGk = await api({ action: "buy", product: String(gkVariant!.id), quantity: "1" });
    ok(!!buyGk.order_code && !buyGk.error, `buy gamekey -> ${buyGk.order_code} (${buyGk.status})`);
    orderCodes.push(buyGk.order_code);
    const gkOrder = await prisma.premiumOrder.findUnique({ where: { code: buyGk.order_code } });
    const polled: any = await pollFzrPremiumOrder(gkOrder as any);
    ok(polled.status === "DELIVERED", `poll đơn gamekey -> DELIVERED`);
    const stGk = await api({ action: "premium_status", order_code: buyGk.order_code });
    ok(stGk.status === "DELIVERED" && String(stGk.delivery || "").includes("XXXX-YYYY-ZZZZ"), `premium_status trả delivery key: ${stGk.delivery}`);

    /* 4) Mua Telegram Stars qua API bằng username + telegram_id */
    const starsVariant = await prisma.premiumVariant.findFirst({ where: { providerId: PROVIDER_ID, providerGroup: "telegram_stars" } });
    const buyStars = await api({ action: "buy", product: String(starsVariant!.id), quantity: "50", username: "demo_user", telegram_id: "123456789" });
    ok(!!buyStars.order_code && !buyStars.error, `buy Telegram Stars -> ${buyStars.order_code} (${buyStars.status})`);
    orderCodes.push(buyStars.order_code);
    const starsOrder = await prisma.premiumOrder.findUnique({ where: { code: buyStars.order_code } });
    ok((starsOrder?.buyerInfo || "").includes("Tên người dùng Telegram: demo_user") && (starsOrder?.buyerInfo || "").includes("Telegram user ID: 123456789"), "buyerInfo đơn Stars mang đúng nhãn web");
    const polledStars: any = await pollFzrPremiumOrder(starsOrder as any);
    const stStars = await api({ action: "premium_status", order_code: buyStars.order_code });
    ok(polledStars.status === "DELIVERED" || stStars.status === "DELIVERED", `đơn Stars -> DELIVERED (poll=${polledStars.status}, api=${stStars.status})`);

    /* 5) Gói manual theo dõi kho (WS9): trừ kho + chặn hết hàng */
    const cat = await prisma.premiumCategory.findFirst({ orderBy: { id: "asc" } });
    const manualProduct = await prisma.premiumProduct.create({
      data: { slug: "fixture-api-manual", name: "Fixture API Manual", fulfillment: "MANUAL", active: true, categoryId: cat!.id },
    });
    manualProductId = manualProduct.id;
    const manualVariant = await prisma.premiumVariant.create({
      data: { productId: manualProduct.id, name: "Gói kho 2", price: 10000, stockQty: 2 },
    });
    const manList = await api({ action: "products", group: "manual" });
    const manEntry = manList[0].products.find((p: any) => p.id === manualProduct.id)?.variants[0];
    ok(manEntry?.stock === "in_stock" && manEntry?.stock_qty === 2, `catalog manual: stock_qty=${manEntry?.stock_qty}`);
    const buyMan = await api({ action: "buy", product: String(manualVariant.id), quantity: "1", note: "khach@example.com" });
    ok(!!buyMan.order_code && !buyMan.error, `buy manual -> ${buyMan.order_code}`);
    orderCodes.push(buyMan.order_code);
    const afterStock = await prisma.premiumVariant.findUnique({ where: { id: manualVariant.id } });
    ok(afterStock?.stockQty === 1, `kho trừ 2 -> 1 (thực tế ${afterStock?.stockQty})`);
    const buyTooMany = await api({ action: "buy", product: String(manualVariant.id), quantity: "2" });
    ok(buyTooMany.error === "Gói đã hết hàng", `buy vượt kho -> {error: "${buyTooMany.error}"}`);

    /* 6) ApiLog cho các đơn qua API */
    const logs = await prisma.apiLog.findMany({ where: { kind: "reseller_in", ref: { in: orderCodes } } });
    ok(logs.length >= 3, `ApiLog reseller_in cho đơn API: ${logs.length} dòng`);

    /* 7) Hồi quy SMM add qua API */
    const svc = await prisma.smmService.findFirst({ where: { active: true }, orderBy: { id: "asc" } });
    const add = await api({ action: "add", service: String(svc!.id), link: "https://www.instagram.com/demo.profile/", quantity: "100" });
    ok(typeof add.order === "number" && add.order > 0, `SMM add qua API -> order id ${add.order}`);
    smmOrderId = add.order;
  } finally {
    // Dọn fixture + khôi phục demo
    if (smmOrderId) {
      await prisma.orderEvent.deleteMany({ where: { orderId: smmOrderId } }).catch(() => {});
      await prisma.smmOrder.deleteMany({ where: { id: smmOrderId } }).catch(() => {});
    }
    if (orderCodes.length) await prisma.apiLog.deleteMany({ where: { kind: "reseller_in", ref: { in: orderCodes } } }).catch(() => {});
    const vs = (await prisma.premiumVariant.findMany({ where: { OR: [{ providerId: PROVIDER_ID }, { productId: manualProductId || -1 }] }, select: { id: true } })).map((v) => v.id);
    if (vs.length) {
      await prisma.premiumOrder.deleteMany({ where: { variantId: { in: vs } } }).catch(() => {});
      await prisma.premiumVariant.deleteMany({ where: { id: { in: vs } } }).catch(() => {});
    }
    await prisma.premiumProduct.deleteMany({ where: { OR: [{ providerId: PROVIDER_ID }, { id: manualProductId || -1 }] } }).catch(() => {});
    await prisma.provider.deleteMany({ where: { id: PROVIDER_ID } }).catch(() => {});
    const demo = await prisma.user.findUnique({ where: { username: "demo" } });
    if (demo) await prisma.user.update({ where: { id: demo.id }, data: { balance: 500000 } });
    proc.kill();
  }
  console.log(failures === 0 ? "ALL PASS" : `${failures} FAIL`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
