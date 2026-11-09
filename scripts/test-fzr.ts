/**
 * Test end-to-end đấu FazerCards (driver FZR) với mock server (scripts/mock-fzr.mjs):
 *   npx tsx scripts/test-fzr.ts
 * Kiểm: số dư USD, đồng bộ catalog + công thức giá, idempotent khi sync lại,
 * mua game key (idempotency-key + trích key khi poll), fallback JSON thô cho
 * trường giao hàng lạ, gift card bị refund -> hoàn tiền đủ, top-up theo OpenAPI
 * (validate-id {category_id, fields} trước -> order {category_id, offer_id,
 * fields theo key}; ID sai = từ chối + hoàn, không gọi order; nhãn admin đổi
 * được giữ khi đồng bộ lại và thực thi vẫn gửi key gốc), manual theo OpenAPI
 * (body {manual_service_id, product_id, fields? theo code} — chỉ replenishment
 * mới có fields; info của category -> description; nhãn đổi giữ theo code),
 * Telegram Stars timeout mơ hồ -> gọi ĐÚNG 1 lần + giữ PENDING (không hoàn tự động),
 * lỗi dứt khoát 402 -> huỷ + hoàn đủ, Steam gift chỉ sync khi bấm tay + báo giá lúc mua.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { prisma } from "../src/lib/db";
import { providerBalance } from "../src/lib/provider";
import { syncFzrCatalog } from "../src/lib/fzr-sync";
import { createPremiumOrder } from "../src/lib/orders";
import { pollFzrPremiumOrder } from "../src/lib/fzr-orders";
import { parsePremiumFields } from "../src/lib/format";

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
    const gkV = gk!.variants.find((v) => v.providerItemId === "gk-1-std")!;
    ok(!!gkV, "gk-1 có edition theo key_id (gk-1-std)");
    ok(gkV.price === sell(59.99) && gkV.cost === cost(59.99), `giá gk-1 bán ${gkV.price} / vốn ${gkV.cost} (kỳ vọng ${sell(59.99)}/${cost(59.99)})`);
    ok(gkV.providerGroup === "gamekeys" && gkV.providerId === provider.id && gkV.providerStock === 101, "linkage variant gamekeys đúng (group + tồn kho NCC 101)");
    ok(gk!.providerPlatform === "Steam" && gk!.providerRegion === "GLOBAL", `gamekeys sync lưu platform/region thật: ${gk!.providerPlatform}/${gk!.providerRegion}`);
    const gk3 = await prisma.premiumProduct.findFirst({ where: { providerId: provider.id, providerProductId: "gk-3" } });
    ok(!!gk3?.providerRegionInfo && gk3.providerRegionInfo.includes("Vietnam") && gk3.providerRegionInfo.includes("Russia"), `gamekeys: chi tiết quốc gia (region-restriction) được kéo cho game bị giới hạn: ${(gk3?.providerRegionInfo || "").slice(0, 90)}`);
    ok(!gk!.providerRegionInfo, "gamekeys: game KHÔNG giới hạn (gk-1) không tốn call region-restriction, providerRegionInfo trống");
    const tp = await prisma.premiumProduct.findFirst({ where: { providerId: provider.id, providerProductId: "tp-1" }, include: { variants: true } });
    ok(!!tp && tp.variants.length === 2 && tp.variants[0].providerItemId === "tp-1-86" && tp.variants[0].price === sell(1.85), `topup: category = sản phẩm, offer = variant theo offer_id (${tp?.variants[0]?.providerItemId})`);
    const tpFields = parsePremiumFields(tp!.customFields);
    ok(tpFields.length === 2 && tpFields[0].key === "player_id" && tpFields[0].label === "Player ID" && tpFields[1].key === "zone_id", `topup lưu fields[] THẬT kèm key của NCC: ${JSON.stringify(tpFields.map((f) => f.key))}`);
    ok((tp!.description || "").includes("MLBB"), "topup note của category lưu ở description");
    const tp2 = await prisma.premiumProduct.findFirst({ where: { providerId: provider.id, providerProductId: "tp-2" } });
    const tp2Fields = parsePremiumFields(tp2?.customFields);
    const serverField = tp2Fields.find((f) => f.key === "server");
    ok(serverField?.type === "select" && JSON.stringify(serverField?.options) === JSON.stringify(["asia", "america", "europe"]), `topup trường select: options normalize về giá trị: ${JSON.stringify(serverField?.options)}`);
    const ms = await prisma.premiumProduct.findFirst({ where: { providerId: provider.id, providerProductId: "ms-1" }, include: { variants: true } });
    ok(ms?.variants.length === 2 && ms.variants[0].providerItemId === "of-1", "manual: category = sản phẩm, offer = variant theo offer id");
    ok(parsePremiumFields(ms!.customFields).length === 0, "manual kind=standard KHÔNG có trường phía NCC (không còn ô generic giả)");
    const ms2 = await prisma.premiumProduct.findFirst({ where: { providerId: provider.id, providerProductId: "ms-2" }, include: { variants: true } });
    const ms2Fields = parsePremiumFields(ms2?.customFields);
    ok(ms2Fields.length === 2 && ms2Fields[0].key === "player_id" && ms2Fields[0].label === "Player ID" && ms2Fields[1].key === "server", `manual replenishment lưu fields[] {code, name} -> key/label: ${JSON.stringify(ms2Fields.map((f) => f.key))}`);
    ok((ms2!.description || "").includes("ID người chơi"), "manual info của category lưu ở description");
    const stars = await prisma.premiumProduct.findFirst({ where: { providerId: provider.id, providerProductId: "telegram-stars" }, include: { variants: true } });
    ok(stars?.variants[0]?.price === sell(0.015), `giá 1 sao = ${stars?.variants[0]?.price} (kỳ vọng ${sell(0.015)})`);
    const tgp = await prisma.premiumProduct.findFirst({ where: { providerId: provider.id, providerProductId: "telegram-premium" }, include: { variants: true } });
    ok(tgp?.variants.length === 3 && tgp.variants.find((v) => v.providerItemId === "12")?.price === sell(35.99), "telegram premium đủ 3 gói tháng, giá theo price_usd của tài liệu");
    const gcCat = await prisma.premiumProduct.findFirst({ where: { providerId: provider.id, providerProductId: "gcat-amazon-us" }, include: { variants: true } });
    ok(!!gcCat && (gcCat.description || "").includes("Region: US"), "giftcard category gcat-amazon-us thành sản phẩm, note NCC lưu ở description");
    const gcRefundChk = gcCat!.variants.find((v) => v.providerItemId === "gc-refund");
    ok(!!gcRefundChk && gcRefundChk.providerStock === 5 && gcRefundChk.price === sell(5), `giftcard offer là variant theo card_id, giá ${gcRefundChk?.price} / tồn kho ${gcRefundChk?.providerStock}`);
    const gcPs = await prisma.premiumProduct.findFirst({ where: { providerId: provider.id, providerProductId: "gcat-ps-us" }, include: { variants: true } });
    ok(!!gcPs && gcPs.variants.some((v) => (v.providerItemId || "").startsWith("name:")), "giftcard offer card_id null -> variant name:-key (đặt sẽ bị FZR từ chối dứt khoát)");
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
    ok(call3?.body?.game_id === "gk-1" && call3?.body?.key_id === "gk-1-std" && call3?.body?.quantity === 2, "mock nhận đúng body gamekeys/order {game_id, key_id, quantity} theo OpenAPI");
    ok(call3?.idem === String(o3.id), `Idempotency-Key = id đơn (${call3?.idem})`);
    const o3p: any = await pollFzrPremiumOrder(o3);
    ok(o3p.status === "DELIVERED" && (o3p.deliveryData || "").includes("XXXX-YYYY-ZZZZ"), `poll -> DELIVERED + trích được key: ${o3p.deliveryData}`);

    /* 3b) Trường giao hàng lạ -> fallback JSON thô */
    const weirdProduct = await prisma.premiumProduct.create({
      data: { categoryId: gk!.categoryId, name: "Weird Delivery", slug: `fzr-test-weird-${provider.id}`, fulfillment: "API", providerId: provider.id, providerProductId: "gk-2" },
    });
    const weirdV = await prisma.premiumVariant.create({
      data: { productId: weirdProduct.id, name: "Key", price: 30000, cost: 25000, providerId: provider.id, providerGroup: "gamekeys", providerItemId: "gk-weird" },
    });
    const oW: any = await buy(weirdV.id, 1, {});
    const oWp: any = await pollFzrPremiumOrder(oW);
    ok(oWp.status === "DELIVERED" && (oWp.deliveryData || "").includes("WEIRD-CODE-123"), "trường lạ voucher_payload -> deliveryData giữ JSON thô chứa mã");

    /* 4) Gift card bị refund phía FZR -> poll hoàn tiền đủ (model mới:
       category = sản phẩm, card_id ở variant — body order theo OpenAPI) */
    const gcRefundV = gcCat!.variants.find((v) => v.providerItemId === "gc-refund")!;
    const balBefore4 = (await demoNow()).balance;
    const o4: any = await buy(gcRefundV.id, 1, {});
    ok(o4.status === "PENDING", "đơn gift card refund-case đang PENDING");
    const log4 = await mockLog();
    const call4 = log4.filter((l) => l.path === "/api/v2/giftcards/order").pop();
    ok(call4?.body?.category_id === "gcat-amazon-us" && call4?.body?.card_id === "gc-refund" && call4?.body?.quantity === 1, "mock nhận đúng body giftcards/order {category_id, card_id, quantity} theo OpenAPI");
    const o4p: any = await pollFzrPremiumOrder(o4);
    ok(o4p.status === "REFUNDED", "poll thấy refunded -> đơn REFUNDED");
    ok((await demoNow()).balance === balBefore4, "số dư khách được hoàn đủ sau refund");

    /* 4b) Gift card mua thành công -> poll DELIVERED + trích được mã */
    const gcApple = await prisma.premiumProduct.findFirst({ where: { providerId: provider.id, providerProductId: "gcat-apple-tr" }, include: { variants: true } });
    const gcOkV = gcApple!.variants.find((v) => v.providerItemId === "gc-tr-50")!;
    const o4b: any = await buy(gcOkV.id, 1, {});
    const o4bp: any = await pollFzrPremiumOrder(o4b);
    ok(o4bp.status === "DELIVERED" && (o4bp.deliveryData || "").includes("GC-CODE-1"), `gift card poll -> DELIVERED + trích được mã: ${o4bp.deliveryData}`);

    /* 5) Top-up theo OpenAPI: validate-id {category_id, fields} TRƯỚC, rồi
       order {category_id, offer_id, fields} — fields theo ĐÚNG key của NCC */
    const o5: any = await buy(tp!.variants[0].id, 1, { "Player ID": "player123", "Zone ID": "1234" });
    const log5 = await mockLog();
    const valIdx = log5.findIndex((l) => l.path === "/api/v2/topups/validate-id" && l.method === "POST");
    const ordIdx = log5.findIndex((l) => l.path === "/api/v2/topups/order");
    ok(valIdx >= 0 && ordIdx > valIdx, "validate-id được gọi TRƯỚC order");
    const callVal = log5[valIdx];
    ok(callVal?.body?.category_id === "tp-1" && callVal?.body?.fields?.player_id === "player123" && callVal?.body?.fields?.zone_id === "1234", `validate-id body {category_id, fields theo key}: ${JSON.stringify(callVal?.body)}`);
    const call5 = log5[ordIdx];
    ok(call5?.body?.category_id === "tp-1" && call5?.body?.offer_id === "tp-1-86" && call5?.body?.fields?.player_id === "player123" && call5?.body?.fields?.zone_id === "1234", `topup order body {category_id, offer_id, fields} theo OpenAPI: ${JSON.stringify(call5?.body)}`);
    const o5p: any = await pollFzrPremiumOrder(o5);
    ok(o5p.status === "DELIVERED", "topup poll -> DELIVERED");

    /* 5c) Top-up ID sai (validate trả valid=false): từ chối TRƯỚC order + hoàn đủ */
    const orderCallsBefore5c = (await mockLog()).filter((l) => l.path === "/api/v2/topups/order").length;
    const balBefore5c = (await demoNow()).balance;
    const o5c: any = await buy(tp!.variants[0].id, 1, { "Player ID": "bad-id", "Zone ID": "1" });
    ok(o5c.status === "REFUNDED", "validate valid=false -> đơn REFUNDED ngay");
    ok((await demoNow()).balance === balBefore5c, "validate fail -> khách được hoàn đủ, không bị trừ");
    ok((await mockLog()).filter((l) => l.path === "/api/v2/topups/order").length === orderCallsBefore5c, "validate fail -> KHÔNG gọi /topups/order");

    /* 5d) Admin đổi NHÃN trường: đồng bộ lại giữ nhãn theo key; mua bằng nhãn
       mới vẫn gửi KEY gốc cho NCC (cơ chế picker/label của task 3) */
    const tpNow = await prisma.premiumProduct.findFirst({ where: { providerId: provider.id, providerProductId: "tp-1" } });
    const renamed = parsePremiumFields(tpNow!.customFields).map((f) => (f.key === "player_id" ? { ...f, label: "ID người chơi MLBB" } : f));
    await prisma.premiumProduct.update({ where: { id: tpNow!.id }, data: { customFields: JSON.stringify(renamed) } });
    await syncFzrCatalog(await fresh() as any);
    const tpAfter = await prisma.premiumProduct.findFirst({ where: { providerId: provider.id, providerProductId: "tp-1" }, include: { variants: true } });
    const fieldsAfter = parsePremiumFields(tpAfter!.customFields);
    ok(fieldsAfter.find((f) => f.key === "player_id")?.label === "ID người chơi MLBB" && fieldsAfter.find((f) => f.key === "zone_id")?.label === "Zone ID", `đồng bộ lại GIỮ nhãn admin đã đổi theo key: ${JSON.stringify(fieldsAfter.map((f) => f.label))}`);
    const o5d: any = await buy(tpAfter!.variants[0].id, 1, { "ID người chơi MLBB": "player999", "Zone ID": "777" });
    const log5d = await mockLog();
    const call5d = log5d.filter((l) => l.path === "/api/v2/topups/order").pop();
    ok(call5d?.body?.fields?.player_id === "player999" && call5d?.body?.fields?.zone_id === "777", `mua bằng nhãn đã đổi -> mock vẫn nhận KEY gốc: ${JSON.stringify(call5d?.body?.fields)}`);
    ok(o5d.status === "PENDING", "đơn top-up nhãn-đổi tạo thành công (chờ poll)");

    /* 5b) Manual kind=standard: body {manual_service_id, product_id}, KHÔNG fields */
    const oM: any = await buy(ms!.variants[0].id, 1, {});
    const logM = await mockLog();
    const callM = logM.filter((l) => l.path === "/api/v2/manual-services/order").pop();
    ok(callM?.body?.manual_service_id === "ms-1" && callM?.body?.product_id === "of-1" && !("fields" in (callM?.body || {})), `manual standard order đúng OpenAPI (không fields): ${JSON.stringify(callM?.body)}`);
    ok(oM.status === "PENDING" && !!oM.providerOrderId, `manual order_id top-level được lưu: ${oM.providerOrderId}`);

    /* 5e) Manual replenishment: order kèm fields theo field CODE */
    const ms2Now = await prisma.premiumProduct.findFirst({ where: { providerId: provider.id, providerProductId: "ms-2" }, include: { variants: true } });
    const o5e: any = await buy(ms2Now!.variants[0].id, 1, { "Player ID": "mlbb-9", "Server": "Asia" });
    const log5e = await mockLog();
    const call5e = log5e.filter((l) => l.path === "/api/v2/manual-services/order").pop();
    ok(call5e?.body?.manual_service_id === "ms-2" && call5e?.body?.product_id === "of-m1" && call5e?.body?.fields?.player_id === "mlbb-9" && call5e?.body?.fields?.server === "Asia", `manual replenishment order {manual_service_id, product_id, fields theo code}: ${JSON.stringify(call5e?.body)}`);
    ok(o5e.status === "PENDING" && !!o5e.providerOrderId, "manual replenishment tạo đơn FZR thành công");

    /* 5f) Admin đổi nhãn trường manual: đồng bộ lại giữ nhãn theo code */
    const renamedMs = parsePremiumFields(ms2Now!.customFields).map((f) => (f.key === "player_id" ? { ...f, label: "ID MLBB" } : f));
    await prisma.premiumProduct.update({ where: { id: ms2Now!.id }, data: { customFields: JSON.stringify(renamedMs) } });
    await syncFzrCatalog(await fresh() as any);
    const ms2After = await prisma.premiumProduct.findFirst({ where: { providerId: provider.id, providerProductId: "ms-2" } });
    ok(parsePremiumFields(ms2After!.customFields).find((f) => f.key === "player_id")?.label === "ID MLBB", "manual: đồng bộ lại GIỮ nhãn admin đã đổi theo code");

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
      data: { categoryId: gk!.categoryId, name: "Err 402", slug: `fzr-test-err-${provider.id}`, fulfillment: "API", providerId: provider.id, providerProductId: "gk-1" },
    });
    const errV = await prisma.premiumVariant.create({
      data: { productId: errProduct.id, name: "Key", price: 30000, cost: 25000, providerId: provider.id, providerGroup: "gamekeys", providerItemId: "gk-402" },
    });
    const balBefore7 = (await demoNow()).balance;
    const o7: any = await buy(errV.id, 1, {});
    ok(o7.status === "REFUNDED", "402 dứt khoát -> đơn REFUNDED ngay");
    ok((await demoNow()).balance === balBefore7, "402 -> khách được hoàn đủ ngay");

    /* 8) Steam gift: báo giá lúc mua từ offers rẻ nhất 45.99 (offer sub 111
     * region GLOBAL theo cấu trúc {sub_id, regions[]} của tài liệu) */
    const o8: any = await buy(sg!.variants[0].id, 1, { "Tài khoản Steam nhận gift": "https://s.team/p/abcd-efgh" });
    ok(o8.total === sell(45.99), `steam gift chốt giá lúc mua = ${o8.total} (kỳ vọng ${sell(45.99)})`);
    ok(!!o8.providerOrderId, "steam gift tạo đơn phía FZR thành công");
    const log8 = await mockLog();
    const call8 = log8.filter((l) => l.path === "/api/v2/steam-gifts/order").pop();
    ok(call8?.body?.invite_url === "https://s.team/p/abcd-efgh" && call8?.body?.sub_id === 111 && call8?.body?.app_id === 1245620 && call8?.body?.region === "GLOBAL", `steam gift order body đúng tài liệu: ${JSON.stringify(call8?.body)}`);

    /* 9) Steam top-up: kiểm tra login (check-login {steamLogin}) rồi đặt
     * đơn {steamLogin, currency, amount} theo tài liệu */
    const stV10 = st!.variants.find((v) => v.providerItemId === "10")!;
    const o9: any = await buy(stV10.id, 1, { "Steam login": "steamuser1" });
    const log9 = await mockLog();
    const chk9 = log9.filter((l) => l.path === "/api/v2/steam-topup/check-login").pop();
    ok(chk9?.body?.steamLogin === "steamuser1", `check-login body đúng tài liệu: ${JSON.stringify(chk9?.body)}`);
    const call9 = log9.filter((l) => l.path === "/api/v2/steam-topup/order").pop();
    ok(call9?.body?.steamLogin === "steamuser1" && call9?.body?.currency === "USD" && call9?.body?.amount === "10", `steam topup body đúng: ${JSON.stringify(call9?.body)}`);

    /* 9b) Steam top-up: login không nạp được (can_refill=false) -> từ chối
     * dứt khoát + hoàn tiền, KHÔNG gọi order */
    const balBefore9b = (await demoNow()).balance;
    const o9b: any = await buy(stV10.id, 1, { "Steam login": "badlogin" });
    ok(o9b.status === "REFUNDED", "check-login can_refill=false -> đơn REFUNDED");
    ok((await demoNow()).balance === balBefore9b, "check-login chặn -> khách được hoàn đủ");
    const log9b = await mockLog();
    ok(log9b.filter((l) => l.path === "/api/v2/steam-topup/order").length === log9.filter((l) => l.path === "/api/v2/steam-topup/order").length, "check-login chặn -> không gọi steam-topup/order thêm");

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
