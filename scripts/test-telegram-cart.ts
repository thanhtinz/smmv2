/**
 * Smoke B′ + D ở tầng logic thật (không qua HTTP):
 *  - B′: sync catalog từ mock FZR -> đặt đơn Stars + Premium bằng đúng hình
 *    dữ liệu của placeTelegramOrderAction (customData Telegram ID + username)
 *    -> kiểm mock nhận buy đúng, lịch sử (telegramOrderWhere) thấy cả hai.
 *  - D: checkout hỗn hợp ở tầng createPremiumOrder — 1 dòng AUTO_STOCK đủ hàng
 *    (thành công), 1 dòng AUTO_STOCK thiếu hàng (lỗi), ví chỉ bị trừ dòng thành
 *    công. (Bản thân checkoutCartAction chỉ là vòng lặp gọi hàm này.)
 *   npx tsx scripts/test-telegram-cart.ts
 */
import { spawn, type ChildProcess } from "node:child_process";
import { prisma } from "../src/lib/db";
import { setSetting } from "../src/lib/settings";
import { syncFzrCatalog } from "../src/lib/fzr-sync";
import { createPremiumOrder } from "../src/lib/orders";
import { getTelegramProvider, getTelegramVariants, telegramOrderWhere } from "../src/lib/tg";
import { FZR_LABELS } from "../src/lib/fzr";

const MOCK_PORT = 3998;
const MOCK = `http://127.0.0.1:${MOCK_PORT}`;
const PROVIDER_ID = 999003;
let pass = 0, fail = 0;
const check = (n: string, c: boolean, x = "") => { if (c) { pass++; console.log(`PASS  ${n}${x ? " — " + x : ""}`); } else { fail++; console.log(`FAIL  ${n}${x ? " — " + x : ""}`); } };

async function mockLog() {
  const r = await fetch(`http://127.0.0.1:${MOCK_PORT}/__log`);
  const j: any = await r.json();
  return (j.log || j) as { method: string; path: string; body: any }[];
}

async function main() {
  const mock: ChildProcess = spawn("node", ["scripts/mock-fzr.mjs"], { env: { ...process.env, MOCK_FZR_PORT: String(MOCK_PORT) }, stdio: "ignore" });
  try {
    for (let i = 0; i < 40; i++) { try { const r = await fetch(`${MOCK}/balance`, { headers: { "X-API-Key": "fc_test_mock" } }); if (r.ok) break; } catch { /* chờ */ } await new Promise((r) => setTimeout(r, 250)); }

    await prisma.provider.upsert({
      where: { id: PROVIDER_ID },
      create: { id: PROVIDER_ID, name: "Mock FZR TG", kind: "PREMIUM", driver: "FZR", apiUrl: MOCK, apiKey: "fc_test_mock", currency: "USD", exchangeRate: 25000, markupPercent: 20, autoUpdatePrice: true, syncContent: true, active: true },
      update: { apiUrl: MOCK, apiKey: "fc_test_mock", driver: "FZR", exchangeRate: 25000, markupPercent: 20, active: true },
    });
    const provider: any = await prisma.provider.findUnique({ where: { id: PROVIDER_ID } });
    await syncFzrCatalog(provider, {});
    await setSetting("telegram_provider_id", String(PROVIDER_ID));
    await setSetting("telegram_enabled", "1");

    const demo: any = await prisma.user.findUnique({ where: { username: "demo" } });
    const startBalance = demo.balance as number;
    await prisma.user.update({ where: { id: demo.id }, data: { balance: 50000000 } });

    const tp = await getTelegramProvider();
    check("B′ getTelegramProvider chọn đúng provider đã cấu hình", tp?.id === PROVIDER_ID);
    const { stars, premium } = await getTelegramVariants(PROVIDER_ID);
    check("B′ có variant Stars + 3 variant Premium", !!stars && premium.length === 3, `stars=${!!stars} premium=${premium.length}`);

    // Đặt đơn Stars: 100 sao cho Telegram ID 123456789 (đúng hình action)
    const starsOrder: any = await createPremiumOrder({
      user: demo, variantId: stars!.id, quantity: 100,
      customData: { [FZR_LABELS.telegramId]: "123456789", "Tên người dùng Telegram": "@tin_test" },
    });
    const log1 = await mockLog();
    const starBuy = log1.filter((x) => x.path.includes("/telegram/stars/buy"));
    check("B′ đơn Stars gọi buy đúng body", starBuy.length === 1 && starBuy[0].body.quantity === 100 && starBuy[0].body.userId === 123456789, JSON.stringify(starBuy[0]?.body));
    check("B′ đơn Stars có providerOrderId", !!starsOrder.providerOrderId);

    // Đặt đơn Premium 3 tháng
    const p3 = premium.find((v: any) => v.providerItemId === "3")!;
    const premOrder: any = await createPremiumOrder({
      user: demo, variantId: p3.id, quantity: 1,
      customData: { [FZR_LABELS.telegramId]: "123456789", "Tên người dùng Telegram": "@tin_test" },
    });
    const log2 = await mockLog();
    const premBuy = log2.filter((x) => x.path.includes("/telegram/premium/buy"));
    check("B′ đơn Premium gọi buy đúng body", premBuy.length === 1 && premBuy[0].body.months === 3 && premBuy[0].body.userId === 123456789, JSON.stringify(premBuy[0]?.body));

    const hist = await prisma.premiumOrder.findMany({ where: { userId: demo.id, ...telegramOrderWhere() } });
    check("B′ lịch sử Telegram thấy cả 2 đơn", hist.some((o) => o.id === starsOrder.id) && hist.some((o) => o.id === premOrder.id), `${hist.length} đơn`);


    // --- B′ đường kép: username-only đi offer top-up Telegram (đường b) ---
    const logBefore = await mockLog();
    const userOrder2: any = await createPremiumOrder({
      user: demo, variantId: stars!.id, quantity: 50,
      customData: { "Tên người dùng Telegram": "@tin_test" },
    });
    const logB = await mockLog();
    const topupCalls = logB.slice(logBefore.length).filter((x) => x.path.includes("/topups/order"));
    check("B′ username-only: sync ghi nhận offer top-up Telegram", topupCalls.length === 1 && topupCalls[0].body.offerId === "tp-tg", JSON.stringify(topupCalls[0]?.body));
    check("B′ username-only: username vào đúng trường offer", topupCalls[0]?.body?.orderParams?.username === "tin_test", JSON.stringify(topupCalls[0]?.body?.orderParams));
    check("B′ username-only: đơn có providerOrderId (đi đường top-up)", !!userOrder2.providerOrderId);

    // --- B′ đường (c): không ID, không offer top-up -> giữ PENDING chờ tay ---
    const { setSetting: setS } = await import("../src/lib/settings");
    await setS("telegram_topup_offer_id", "");
    const balBeforeHold = (await prisma.user.findUnique({ where: { id: demo.id } }))!.balance;
    const holdOrder: any = await createPremiumOrder({
      user: demo, variantId: stars!.id, quantity: 50,
      customData: { "Tên người dùng Telegram": "@tin_test" },
    });
    const logC = await mockLog();
    const newBuys = logC.slice(logB.length).filter((x) => x.path.includes("/telegram/stars/buy") || x.path.includes("/telegram/premium/buy") || x.path.includes("/topups/order"));
    check("B′ đường (c): đơn giữ PENDING chờ xử lý tay", holdOrder.status === "PENDING" && /xử lý tay/.test(holdOrder.adminNote || ""), holdOrder.adminNote || "");
    check("B′ đường (c): KHÔNG gọi provider, KHÔNG hoàn tiền", newBuys.length === 0 && (await prisma.user.findUnique({ where: { id: demo.id } }))!.balance === balBeforeHold - holdOrder.total);
    await setS("telegram_topup_offer_id", "tp-tg");

    // --- D: checkout hỗn hợp ở tầng createPremiumOrder ---
    // (AUTO_STOCK thiếu kho thì đơn PENDING chờ giao tay theo máy cũ — dòng lỗi
    //  dứt khoát để kiểm là dòng vượt số dư: ví chỉ đủ cho dòng đầu.)
    const smokeCat = await prisma.premiumCategory.create({ data: { name: "Cart Smoke Cat", slug: `cart-smoke-cat-${Date.now()}` } });
    const stockProduct = await prisma.premiumProduct.create({
      data: { name: "Cart Smoke Product", slug: `cart-smoke-${Date.now()}`, categoryId: smokeCat.id, active: true, panelId: null, fulfillment: "AUTO_STOCK" } as any,
    });
    const vOk = await prisma.premiumVariant.create({
      data: { productId: stockProduct.id, name: "Gói đủ tiền", price: 30000, active: true } as any,
    });
    const vExp = await prisma.premiumVariant.create({
      data: { productId: stockProduct.id, name: "Gói vượt ví", price: 45000, active: true } as any,
    });
    await prisma.premiumStock.createMany({
      data: [
        { variantId: vOk.id, payload: "CART-KEY-1", status: "AVAILABLE" } as any,
        { variantId: vOk.id, payload: "CART-KEY-2", status: "AVAILABLE" } as any,
      ],
    });
    await prisma.user.update({ where: { id: demo.id }, data: { balance: 40000 } });
    let okOrder: any = null, badError = "";
    try { okOrder = await createPremiumOrder({ user: { ...demo, balance: 40000 }, variantId: vOk.id, quantity: 1 }); } catch (e: any) { badError = String(e?.message); }
    check("D dòng 1 đặt thành công + giao ngay key kho", !!okOrder && (okOrder.deliveryData || "").includes("CART-KEY"), okOrder?.code || badError);
    const freshDemo: any = await prisma.user.findUnique({ where: { id: demo.id } });
    try { await createPremiumOrder({ user: freshDemo, variantId: vExp.id, quantity: 1 }); } catch (e: any) { badError = String(e?.message || ""); }
    check("D dòng 2 vượt số dư bị từ chối có lý do", badError.length > 0, badError.slice(0, 80));
    const after = (await prisma.user.findUnique({ where: { id: demo.id } }))!.balance;
    check("D ví chỉ trừ đúng dòng thành công (40000 -> 10000)", after === 10000, `${after}`);

    // Dọn dẹp
    const orderIds = [starsOrder.id, premOrder.id, userOrder2.id, holdOrder.id, okOrder?.id].filter(Boolean);
    void 0;
    await prisma.premiumOrder.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.premiumStock.deleteMany({ where: { variantId: { in: [vOk.id, vExp.id] } } });
    await prisma.premiumVariant.deleteMany({ where: { productId: stockProduct.id } });
    await prisma.premiumProduct.delete({ where: { id: stockProduct.id } });
    await prisma.premiumCategory.delete({ where: { id: smokeCat.id } });
    const syncProducts = await prisma.premiumProduct.findMany({ where: { variants: { some: { providerId: PROVIDER_ID } } }, select: { id: true } });
    const vIds = (await prisma.premiumVariant.findMany({ where: { providerId: PROVIDER_ID }, select: { id: true } })).map((v) => v.id);
    await prisma.premiumOrder.deleteMany({ where: { variantId: { in: vIds } } });
    await prisma.premiumVariant.deleteMany({ where: { providerId: PROVIDER_ID } });
    await prisma.premiumProduct.deleteMany({ where: { id: { in: syncProducts.map((p) => p.id) } } });
    await prisma.provider.delete({ where: { id: PROVIDER_ID } });
    await setSetting("telegram_provider_id", "");
    await setSetting("telegram_topup_offer_id", "");
    await setSetting("telegram_topup_field", "");
    await setSetting("telegram_topup_provider_id", "");
    await prisma.user.update({ where: { id: demo.id }, data: { balance: startBalance } });
    console.log("CLEANUP done");
  } finally {
    mock.kill();
  }
  console.log(fail === 0 ? `\nALL PASS (${pass})` : `\n${fail} FAIL / ${pass} PASS`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
