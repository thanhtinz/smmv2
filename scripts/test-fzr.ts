/**
 * Test end-to-end đấu FazerCards (driver FZR) với mock server (scripts/mock-fzr.mjs):
 *   npx tsx scripts/test-fzr.ts
 * Kiểm: số dư USD, đồng bộ catalog + công thức giá, idempotent khi sync lại,
 * mua game key (idempotency-key + trích key khi poll), fallback JSON thô cho
 * trường giao hàng lạ, gift card bị refund -> hoàn tiền đủ, top-up map orderParams,
 * Telegram Stars timeout mơ hồ -> gọi ĐÚNG 1 lần + giữ PENDING (không hoàn tự động),
 * lỗi dứt khoát 402 -> huỷ + hoàn đủ, Steam gift chỉ sync khi bấm tay + báo giá lúc mua.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { prisma } from "../src/lib/db";
import { providerBalance } from "../src/lib/provider";
import { syncFzrCatalog } from "../src/lib/fzr-sync";
import { createPremiumOrder } from "../src/lib/orders";
import { pollFzrPremiumOrder } from "../src/lib/fzr-orders";

const MOCK = "http://127.0.0.1:3998";
const RATE = 25000, MARKUP = 20; // hệ số giá bán = 25000 x 1.2 = 30000
const sell = (usd: number) => Math.ceil(usd * RATE * (1 + MARKUP / 100));
const cost = (usd: number) => Math.ceil(usd * RATE);

let failures = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
};

async function mockLog(): Promise<any[]> {
  const r = await fetch(`${MOCK}/__log`);
  return (await r.json()).log;
}
async function mockControl(body: any) {
  await fetch(`${MOCK}/__control`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
async function waitMock(tries = 30) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`${MOCK}/__log`); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("Mock FZR không khởi động được");
}

async function main() {
  const proc: ChildProcess = spawn("node", ["scripts/mock-fzr.mjs"], { stdio: "ignore" });
  try {
    await waitMock();
    const demo = await prisma.user.findUnique({ where: { username: "demo" } });
    if (!demo) throw new Error("Chưa seed demo user");
    const startBalance = demo.balance;
    // Dọn artifact của lần chạy dở trước (nếu có) rồi nạp số dư test
    const oldVariants = (await prisma.premiumVariant.findMany({ where: { providerId: 999002 }, select: { id: true } })).map((v) => v.id);
    if (oldVariants.length) {
      await prisma.premiumOrder.deleteMany({ where: { variantId: { in: oldVariants } } });
      await prisma.premiumVariant.deleteMany({ where: { id: { in: oldVariants } } });
    }
    await prisma.premiumProduct.deleteMany({ where: { providerId: 999002 } });
    await prisma.provider.deleteMany({ where: { id: 999002 } });
    await prisma.user.update({ where: { id: demo.id }, data: { balance: 50000000 } });

    const provider = await prisma.provider.upsert({
      where: { id: 999002 },
      create: { id: 999002, kind: "PREMIUM", driver: "FZR", name: "MockFZR", apiUrl: MOCK, apiKey: "fc_test_mock", currency: "USD", exchangeRate: RATE, markupPercent: MARKUP, active: true },
      update: { driver: "FZR", apiUrl: MOCK, active: true },
    });
    const fresh = () => prisma.provider.findUnique({ where: { id: provider.id } });

    /* 1) Số dư */
    const bal = await providerBalance(provider);
    ok(bal.raw === 250.5 && bal.currency === "USD" && bal.vnd === 6262500, `balance USD ${bal.raw} -> VND ${bal.vnd}`);

    /* 2) Đồng bộ catalog */
    const s1 = await syncFzrCatalog(await fresh() as any);
    const gk = await prisma.premiumProduct.findFirst({ where: { providerId: provider.id, providerProductId: "gk-1" }, include: { variants: true } });
    ok(!!gk && gk.fulfillment === "API", "game key gk-1 thành sản phẩm API");
    const gkV = gk!.variants[0];
    ok(gkV.price === sell(59.99) && gkV.cost === cost(59.99), `giá gk-1 bán ${gkV.price} / vốn ${gkV.cost} (kỳ vọng ${sell(59.99)}/${cost(59.99)})`);
    ok(gkV.providerGroup === "gamekeys" && gkV.providerItemId === "gk-1" && gkV.providerId === provider.id, "linkage variant gamekeys đúng");
    const hidden = await prisma.premiumProduct.findFirst({ where: { providerId: provider.id, providerProductId: "gk-3" } });
    ok(!hidden, "sản phẩm isAvailable=false bị bỏ qua khi sync");
    const tp = await prisma.premiumProduct.findFirst({ where: { providerId: provider.id, providerProductId: "tp-1" }, include: { variants: true } });
    ok(tp?.variants[0]?.providerItemId === "tp-1|1.85", `topup providerItemId composite = ${tp?.variants[0]?.providerItemId}`);
    const ms = await prisma.premiumProduct.findFirst({ where: { providerId: provider.id, providerProductId: "ms-1" }, include: { variants: true } });
    ok(ms?.variants.length === 2 && ms.variants[0].providerItemId === "ms-1:of-1", "manual service có 2 gói offer, itemId composite service:offer");
    const stars = await prisma.premiumProduct.findFirst({ where: { providerId: provider.id, providerProductId: "telegram-stars" }, include: { variants: true } });
    ok(stars?.variants[0]?.price === sell(0.015), `giá 1 sao = ${stars?.variants[0]?.price} (kỳ vọng ${sell(0.015)})`);
    const tgp = await prisma.premiumProduct.findFirst({ where: { providerId: provider.id, providerProductId: "telegram-premium" }, include: { variants: true } });
    ok(tgp?.variants.length === 3 && tgp.variants.find((v) => v.providerItemId === "12")?.price === sell(35.99), "telegram premium đủ 3 gói tháng, giá theo finalPrice");
    const st = await prisma.premiumProduct.findFirst({ where: { providerId: provider.id, providerProductId: "steam-topup" }, include: { variants: true } });
    ok(st?.variants.length === 5 && st.variants.find((v) => v.providerItemId === "10")?.price === sell(10), "steam top-up 5 mệnh giá USD");
    const sgBefore = await prisma.premiumProduct.count({ where: { providerId: provider.id, providerProductId: { startsWith: "app-" } } });
    ok(sgBefore === 0, "chưa bấm tay: steam gift CHƯA được đồng bộ");

    /* 2b) Sync lại: không trùng, giá cập nhật theo công thức */
    await prisma.premiumVariant.update({ where: { id: gkV.id }, data: { price: 1 } });
    const countBefore = await prisma.premiumProduct.count({ where: { providerId: provider.id } });
    const s2 = await syncFzrCatalog(await fresh() as any);
    const countAfter = await prisma.premiumProduct.count({ where: { providerId: provider.id } });
    ok(s2.created === 0 && countBefore === countAfter, `sync lại không tạo trùng (created=${s2.created}, ${countBefore}->${countAfter})`);
    const gkV2 = await prisma.premiumVariant.findUnique({ where: { id: gkV.id } });
    ok(gkV2?.price === sell(59.99), "sync lại khôi phục giá theo công thức (autoUpdatePrice)");

    /* 2c) Steam gift: chỉ khi bấm tay */
    const logBefore = await mockLog();
    const steamCallsBefore = logBefore.filter((l) => l.path === "/api/v2/steam-gifts/games").length;
    await syncFzrCatalog(await fresh() as any); // mô phỏng vòng cron (không kèm steam)
    const logAfterCron = await mockLog();
    ok(logAfterCron.filter((l) => l.path === "/api/v2/steam-gifts/games").length === steamCallsBefore, "vòng sync kiểu cron KHÔNG gọi danh sách steam gift (rate-limit)");
    const s3 = await syncFzrCatalog(await fresh() as any, { includeSteamGifts: true });
    ok(s3.steamGifts, "sync tay có cờ steamGifts");
    const sg = await prisma.premiumProduct.findFirst({ where: { providerId: provider.id, providerProductId: "app-1245620" }, include: { variants: true } });
    ok(!!sg && sg.variants[0].price === 0, "steam gift vào catalog, giá 0 (báo giá lúc mua)");

    const demoNow = async () => (await prisma.user.findUnique({ where: { id: demo.id } }))!;
    const buy = (variantId: number, quantity: number, customData: Record<string, string>) =>
      createPremiumOrder({ user: demo, variantId, quantity, buyerInfo: demo.email, customData });

    /* 3) Mua game key: idempotency + poll giao key */
    const balBefore3 = (await demoNow()).balance;
    const o3: any = await buy(gkV.id, 2, {});
    ok(!!o3.providerOrderId && o3.status === "PENDING", `đơn game key PENDING chờ giao, providerOrderId=${o3.providerOrderId}`);
    ok((await demoNow()).balance === balBefore3 - o3.total, "tiền khách bị trừ đúng 1 lần khi mua");
    const log3 = await mockLog();
    const call3 = log3.filter((l) => l.path === "/api/v2/gamekeys/order").pop();
    ok(call3?.body?.gameKeyId === "gk-1" && call3?.body?.quantity === 2, "mock nhận đúng body gamekeys/order");
    ok(call3?.idem === String(o3.id), `Idempotency-Key = id đơn (${call3?.idem})`);
    const o3p: any = await pollFzrPremiumOrder(o3);
    ok(o3p.status === "DELIVERED" && (o3p.deliveryData || "").includes("XXXX-YYYY-ZZZZ"), `poll -> DELIVERED + trích được key: ${o3p.deliveryData}`);

    /* 3b) Trường giao hàng lạ -> fallback JSON thô */
    const weirdProduct = await prisma.premiumProduct.create({
      data: { categoryId: gk!.categoryId, name: "Weird Delivery", slug: `fzr-test-weird-${provider.id}`, fulfillment: "API", providerId: provider.id, providerProductId: "gk-weird" },
    });
    const weirdV = await prisma.premiumVariant.create({
      data: { productId: weirdProduct.id, name: "Key", price: 30000, cost: 25000, providerId: provider.id, providerGroup: "gamekeys", providerItemId: "gk-weird" },
    });
    const oW: any = await buy(weirdV.id, 1, {});
    const oWp: any = await pollFzrPremiumOrder(oW);
    ok(oWp.status === "DELIVERED" && (oWp.deliveryData || "").includes("WEIRD-CODE-123"), "trường lạ voucher_payload -> deliveryData giữ JSON thô chứa mã");

    /* 4) Gift card bị refund phía FZR -> poll hoàn tiền đủ */
    const gcRefundV = (await prisma.premiumProduct.findFirst({ where: { providerId: provider.id, providerProductId: "gc-refund" }, include: { variants: true } }))!.variants[0];
    const balBefore4 = (await demoNow()).balance;
    const o4: any = await buy(gcRefundV.id, 1, {});
    ok(o4.status === "PENDING", "đơn gift card refund-case đang PENDING");
    const o4p: any = await pollFzrPremiumOrder(o4);
    ok(o4p.status === "REFUNDED", "poll thấy refunded -> đơn REFUNDED");
    ok((await demoNow()).balance === balBefore4, "số dư khách được hoàn đủ sau refund");

    /* 5) Top-up: map orderParams từ thông tin khách điền */
    const o5: any = await buy(tp!.variants[0].id, 1, { "Tài khoản / ID người chơi": "player123" });
    const log5 = await mockLog();
    const call5 = log5.filter((l) => l.path === "/api/v2/topups/order").pop();
    ok(call5?.body?.offerId === "tp-1" && call5?.body?.amount === "1.85" && call5?.body?.orderParams?.value === "player123", `topup orderParams map đúng: ${JSON.stringify(call5?.body)}`);
    const o5p: any = await pollFzrPremiumOrder(o5);
    ok(o5p.status === "DELIVERED", "topup poll -> DELIVERED");

    /* 5b) Manual: additionalData từ thông tin khách */
    const oM: any = await buy(ms!.variants[0].id, 1, { "Thông tin bổ sung": "@tiktokuser" });
    const logM = await mockLog();
    const callM = logM.filter((l) => l.path === "/api/v2/manual-services/order").pop();
    ok(callM?.body?.manualServiceId === "ms-1" && callM?.body?.offerId === "of-1" && JSON.stringify(callM?.body?.additionalData || {}).includes("@tiktokuser"), "manual order map service/offer/additionalData đúng");
    ok(oM.status === "PENDING" && !!oM.providerOrderId, `manual order_id top-level được lưu: ${oM.providerOrderId}`);

    /* 6) Telegram Stars: timeout mơ hồ -> đúng 1 lần gọi, giữ PENDING, không hoàn */
    await mockControl({ starsBehavior: "hang" });
    const balBefore6 = (await demoNow()).balance;
    const o6: any = await buy(stars!.variants[0].id, 100, { "Telegram user ID": "123456", "Tên người dùng Telegram": "@tester" });
    await mockControl({ starsBehavior: "ok" });
    const log6 = await mockLog();
    ok(log6.filter((l) => l.path === "/api/v2/telegram/stars/buy").length === 1, "telegram stars buy được gọi ĐÚNG 1 lần dù timeout");
    ok(o6.status === "PENDING" && !o6.providerOrderId, "đơn sao mơ hồ giữ PENDING chờ xử lý tay");
    ok((await demoNow()).balance === balBefore6 - o6.total, "đơn mơ hồ KHÔNG tự hoàn tiền");

    /* 7) Lỗi dứt khoát 402 -> huỷ + hoàn đủ ngay */
    const errProduct = await prisma.premiumProduct.create({
      data: { categoryId: gk!.categoryId, name: "Err 402", slug: `fzr-test-err-${provider.id}`, fulfillment: "API", providerId: provider.id, providerProductId: "gk-402" },
    });
    const errV = await prisma.premiumVariant.create({
      data: { productId: errProduct.id, name: "Key", price: 30000, cost: 25000, providerId: provider.id, providerGroup: "gamekeys", providerItemId: "gk-402" },
    });
    const balBefore7 = (await demoNow()).balance;
    const o7: any = await buy(errV.id, 1, {});
    ok(o7.status === "REFUNDED", "402 dứt khoát -> đơn REFUNDED ngay");
    ok((await demoNow()).balance === balBefore7, "402 -> khách được hoàn đủ ngay");

    /* 8) Steam gift: báo giá lúc mua từ offers rẻ nhất 45.99 */
    const o8: any = await buy(sg!.variants[0].id, 1, { "Tài khoản Steam nhận gift": "friend1" });
    ok(o8.total === sell(45.99), `steam gift chốt giá lúc mua = ${o8.total} (kỳ vọng ${sell(45.99)})`);
    ok(!!o8.providerOrderId, "steam gift tạo đơn phía FZR thành công");

    /* 9) Steam top-up: login + mệnh giá */
    const stV10 = st!.variants.find((v) => v.providerItemId === "10")!;
    const o9: any = await buy(stV10.id, 1, { "Steam login": "steamuser1" });
    const log9 = await mockLog();
    const call9 = log9.filter((l) => l.path === "/api/v2/steam-topup/order").pop();
    ok(call9?.body?.login === "steamuser1" && call9?.body?.currency === "USD" && call9?.body?.amount === "10", `steam topup body đúng: ${JSON.stringify(call9?.body)}`);

    console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);

    /* Dọn dẹp: xoá toàn bộ artifact test, khôi phục số dư demo */
    const variantIds = (await prisma.premiumVariant.findMany({ where: { providerId: provider.id }, select: { id: true } })).map((v) => v.id);
    const productIds = (await prisma.premiumProduct.findMany({ where: { providerId: provider.id }, select: { id: true } })).map((p) => p.id);
    await prisma.premiumOrder.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.premiumVariant.deleteMany({ where: { id: { in: variantIds } } });
    await prisma.premiumProduct.deleteMany({ where: { id: { in: productIds } } });
    await prisma.premiumCategory.deleteMany({ where: { slug: { endsWith: `-${provider.id}` }, products: { none: {} } } });
    await prisma.provider.delete({ where: { id: provider.id } });
    await prisma.user.update({ where: { id: demo.id }, data: { balance: startBalance } });
    console.log(`CLEANUP done — demo balance restored to ${startBalance}`);
  } finally {
    proc.kill();
  }
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
