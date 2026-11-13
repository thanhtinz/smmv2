/**
 * Kiểm chứng gói thành viên PASS (lệnh Tín 2026-11-12, lib/pass.ts):
 *  1) Mua 1 tháng bằng ví: trừ đúng giá admin đặt, hạn = +1 tháng dương lịch;
 *     gia hạn khi còn hạn cộng tiếp TỪ HẠN CŨ; số dư không đủ -> lỗi sạch,
 *     không trừ tiền, không dời hạn. Đơn mua Pass không sinh cashback.
 *  2) Thứ tự tiền Premium: giá -> flash -> mã giảm giá -> giảm Pass; cashback
 *     % tính trên tiền thực trả cuối, cộng ví trong cùng transaction.
 *  3) Giá trị phạm vi cũ "SMM" còn sót trong DB (trước đợt gỡ SMM 2026-11-12)
 *     rơi về ALL: đơn Premium vẫn hưởng Pass bình thường.
 *  4) Phạm vi PREMIUM vẫn áp cho đơn Premium; khách không có Pass thì không
 *     giảm/không hoàn (flash vẫn chạy độc lập).
 *  5) Hoàn tiền: thu hồi cashback từng phần + hoàn nốt qua refundFzrPremiumOrder
 *     không vượt tổng đã cộng.
 *  6) Quà tháng: claim tạo đơn Premium 0đ giao thật từ kho (DELIVERED),
 *     không trừ ví, không cashback; nhận lần 2 cùng tháng bị chặn; khách
 *     không có Pass bị chặn.
 * Chạy: npx tsx scripts/test-pass.ts (cần DATABASE_URL local)
 */
export {};
let pass = 0, fail = 0;
const check = (n: string, c: boolean, x = "") => { if (c) { pass++; console.log(`PASS  ${n}${x ? " — " + x : ""}`); } else { fail++; console.log(`FAIL  ${n}${x ? " — " + x : ""}`); } };

async function main() {
  const { prisma } = await import("../src/lib/db");
  const { randomKey } = await import("../src/lib/format");
  const passLib = await import("../src/lib/pass");
  const { createPremiumOrder } = await import("../src/lib/orders");
  const { refundFzrPremiumOrder } = await import("../src/lib/fzr-orders");

  const suffix = randomKey(6).toLowerCase();
  const PASS_KEYS = ["pass_enabled", "pass_name", "pass_price_1m", "pass_price_3m", "pass_price_12m", "pass_cashback_percent", "pass_discount_percent", "pass_scope", "pass_gift_product_id", "pass_gift_variant_id"];
  const oldSettings = new Map<string, string | null>();
  for (const k of PASS_KEYS) oldSettings.set(k, (await prisma.setting.findUnique({ where: { key: k } }))?.value ?? null);
  const setPass = async (kv: Record<string, string>) => {
    for (const [k, v] of Object.entries(kv)) await prisma.setting.upsert({ where: { key: k }, create: { key: k, value: v }, update: { value: v } });
  };
  const mk = async (username: string, balance: number) => prisma.user.create({
    data: { username, email: `${username}@test.local`, passwordHash: "x", balance, apiKey: randomKey(32), depositCode: randomKey(6).toUpperCase() },
  });
  const bal = async (id: number) => (await prisma.user.findUnique({ where: { id }, select: { balance: true, passExpiresAt: true } }))!;
  const cashbackSum = async (userId: number, ref?: string) => {
    const a = await prisma.transaction.aggregate({ where: { userId, type: "PASS_CASHBACK", ...(ref ? { ref } : {}) }, _sum: { amount: true } });
    return a._sum.amount || 0;
  };

  // ---------- Fixtures ----------
  const pcat = await prisma.premiumCategory.create({ data: { name: `PassTest ${suffix}`, slug: `passtest-${suffix}` } });
  const prod = await prisma.premiumProduct.create({ data: { categoryId: pcat.id, name: `Premium PassTest ${suffix}`, slug: `premium-passtest-${suffix}`, fulfillment: "MANUAL" } });
  const variant = await prisma.premiumVariant.create({ data: { productId: prod.id, name: "Gói test", price: 200000, cost: 50000 } });
  const giftProd = await prisma.premiumProduct.create({ data: { categoryId: pcat.id, name: `Gift PassTest ${suffix}`, slug: `gift-passtest-${suffix}`, fulfillment: "AUTO_STOCK" } });
  const giftVariant = await prisma.premiumVariant.create({ data: { productId: giftProd.id, name: "Quà tháng", price: 50000, cost: 10000 } });
  for (const p of [`GIFT-${suffix}-1`, `GIFT-${suffix}-2`]) await prisma.premiumStock.create({ data: { variantId: giftVariant.id, payload: p } });
  const flash = await prisma.flashSale.create({
    data: {
      name: `Flash PassTest ${suffix}`, percent: 20, scope: "ALL",
      startsAt: new Date(Date.now() - 3600_000), endsAt: new Date(Date.now() + 86400_000),
      productIds: JSON.stringify([prod.id]),
    },
  });
  const promo = await prisma.discountCode.create({ data: { code: `PASSTEST${suffix.toUpperCase()}`, type: "PERCENT", value: 10, scope: "ALL", active: true } });

  const U = await mk(`passu${suffix}`, 1_000_000); // thành viên Pass
  const V = await mk(`passv${suffix}`, 1_000_000); // không Pass
  const W = await mk(`passw${suffix}`, 10_000); // ví mỏng

  try {
    await setPass({
      pass_enabled: "1", pass_price_1m: "50000", pass_price_3m: "120000", pass_price_12m: "400000",
      pass_cashback_percent: "10", pass_discount_percent: "5", pass_scope: "ALL",
      pass_gift_product_id: String(giftProd.id), pass_gift_variant_id: String(giftVariant.id),
    });

    // addMonths kẹp cuối tháng
    const am = passLib.addMonths(new Date(2026, 0, 31), 1);
    check("addMonths kẹp ngày cuối tháng", am.getFullYear() === 2026 && am.getMonth() === 1 && am.getDate() === 28, am.toDateString());

    // ---------- 1) Mua + gia hạn ----------
    const before = Date.now();
    const bought = await passLib.buyPass(U.id, 1);
    let u = await bal(U.id);
    check("mua Pass trừ đúng giá admin đặt", u.balance === 950_000, `bal=${u.balance}`);
    check("hạn = +1 tháng dương lịch", !!u.passExpiresAt && u.passExpiresAt.getTime() > before + 26 * 86400_000 && u.passExpiresAt.getTime() < Date.now() + 32 * 86400_000);
    check("đơn mua Pass KHÔNG sinh cashback", (await cashbackSum(U.id)) === 0);
    const buyTxn = await prisma.transaction.findFirst({ where: { userId: U.id, type: "PASS_PURCHASE" } });
    check("sổ có giao dịch PASS_PURCHASE -50.000", !!buyTxn && buyTxn.amount === -50_000 && buyTxn.balanceAfter === 950_000);
    check("buyPass trả đúng giá + hạn", bought.price === 50_000 && bought.expiry.getTime() === u.passExpiresAt!.getTime());

    // Gia hạn khi còn hạn 10 ngày: hạn mới = hạn cũ + 1 tháng
    const preset = new Date(Date.now() + 10 * 86400_000);
    await prisma.user.update({ where: { id: U.id }, data: { passExpiresAt: preset } });
    const renewed = await passLib.buyPass(U.id, 1);
    const expected = passLib.addMonths(preset, 1);
    u = await bal(U.id);
    check("gia hạn trừ thêm đúng giá kỳ", u.balance === 900_000, `bal=${u.balance}`);
    check("gia hạn cộng TỪ HẠN CŨ (không từ hôm nay)", Math.abs(renewed.expiry.getTime() - expected.getTime()) < 1000, renewed.expiry.toISOString());

    // Số dư không đủ: lỗi sạch, không đổi gì
    let threw = false;
    try { await passLib.buyPass(W.id, 1); } catch { threw = true; }
    const w = await bal(W.id);
    check("số dư không đủ -> lỗi, ví nguyên, không có hạn", threw && w.balance === 10_000 && !w.passExpiresAt);

    const fullU = (await prisma.user.findUnique({ where: { id: U.id } }))!;
    const fullV = (await prisma.user.findUnique({ where: { id: V.id } }))!;

    // ---------- 2) Premium: flash 20% -> promo 10% -> Pass 5%; cashback 10% ----------
    // 200.000 -> 160.000 -> -16.000 = 144.000 -> -7.200 = 136.800; cashback 13.680
    const po = await createPremiumOrder({ user: fullU, variantId: variant.id, quantity: 1, buyerInfo: "buyer@test.local", promoCode: promo.code });
    const balAfterPremium = (await bal(U.id)).balance;
    check("Premium: tổng sau flash+promo+Pass = 136.800", po.total === 136_800, `total=${po.total}`);
    check("Premium: passDiscount ghi đúng 7.200", po.passDiscount === 7_200, `pd=${po.passDiscount}`);
    check("Premium: promoDiscount ghi đúng 16.000", po.promoDiscount === 16_000, `promo=${po.promoDiscount}`);
    check("Premium: ví = cũ - 136.800 + cashback 13.680", balAfterPremium === 900_000 - 136_800 + 13_680, `bal=${balAfterPremium}`);
    check("Premium: cashback của đơn = 13.680", (await cashbackSum(U.id, po.code)) === 13_680);

    // ---------- 3) Giá trị scope cũ "SMM" trong DB rơi về ALL ----------
    // 200.000 -> flash 160.000 -> Pass 5% = -8.000 -> 152.000; cashback 15.200
    await setPass({ pass_scope: "SMM" });
    check("passConfig: scope 'SMM' cũ đọc thành ALL", passLib.passConfigFromSettings({ ...(await import("../src/lib/settings")).DEFAULT_SETTINGS, pass_scope: "SMM" }).scope === "ALL");
    const po3 = await createPremiumOrder({ user: fullU, variantId: variant.id, quantity: 1, buyerInfo: "buyer@test.local" });
    check("scope cũ 'SMM': đơn Premium vẫn hưởng Pass (152.000)", po3.total === 152_000 && po3.passDiscount === 8_000, `total=${po3.total}`);
    check("scope cũ 'SMM': cashback của đơn = 15.200", (await cashbackSum(U.id, po3.code)) === 15_200);

    // ---------- 4) Phạm vi PREMIUM + khách không Pass ----------
    await setPass({ pass_scope: "PREMIUM" });
    const po4 = await createPremiumOrder({ user: fullU, variantId: variant.id, quantity: 1, buyerInfo: "buyer@test.local" });
    check("scope=PREMIUM: đơn Premium hưởng Pass (152.000)", po4.total === 152_000 && po4.passDiscount === 8_000, `total=${po4.total}`);
    await setPass({ pass_scope: "ALL" });
    const poV = await createPremiumOrder({ user: fullV, variantId: variant.id, quantity: 1, buyerInfo: "v@test.local" });
    check("khách không Pass: flash vẫn chạy (160.000), không giảm Pass/cashback", poV.total === 160_000 && poV.passDiscount === 0 && (await cashbackSum(V.id)) === 0, `total=${poV.total}`);

    // ---------- 5) Hoàn tiền -> thu hồi cashback ----------
    // Premium (đơn §2): thu hồi tay một phần 68.400 (nửa tổng) -> 6.840; hoàn nốt qua đường FZR -> thêm 6.840 (không vượt ròng)
    await passLib.clawbackPassCashback(U.id, 68_400, po.code);
    check("thu hồi một phần Premium: còn ròng 6.840", (await cashbackSum(U.id, po.code)) === 6_840, `net=${await cashbackSum(U.id, po.code)}`);
    const poFresh = (await prisma.premiumOrder.findUnique({ where: { id: po.id } }))!;
    await refundFzrPremiumOrder(poFresh, "REFUNDED", "Test hoàn đơn Premium");
    check("hoàn nốt Premium: cashback ròng về đúng 0 (không thu vượt)", (await cashbackSum(U.id, po.code)) === 0, `net=${await cashbackSum(U.id, po.code)}`);

    // ---------- 6) Quà tháng ----------
    const balBeforeGift = (await bal(U.id)).balance;
    const gift = await passLib.claimPassGift(U.id);
    const giftOrder = await prisma.premiumOrder.findUnique({ where: { code: gift.orderCode } });
    check("quà: đơn 0đ được tạo", !!giftOrder && giftOrder.total === 0, `total=${giftOrder?.total}`);
    check("quà: giao thật từ kho (DELIVERED + nội dung)", giftOrder?.status === "DELIVERED" && (giftOrder?.deliveryData || "").includes(`GIFT-${suffix}-1`), giftOrder?.status);
    check("quà: không trừ ví", (await bal(U.id)).balance === balBeforeGift);
    check("quà: không sinh cashback", (await cashbackSum(U.id, gift.orderCode)) === 0);
    let secondBlocked = false;
    try { await passLib.claimPassGift(U.id); } catch { secondBlocked = true; }
    check("quà: nhận lần 2 cùng tháng bị chặn", secondBlocked);
    let noPassBlocked = false;
    try { await passLib.claimPassGift(V.id); } catch { noPassBlocked = true; }
    check("quà: khách không Pass bị chặn", noPassBlocked);
    const stockLeft = await prisma.premiumStock.count({ where: { variantId: giftVariant.id, status: "AVAILABLE" } });
    check("quà: kho trừ đúng 1 (còn 1)", stockLeft === 1, `left=${stockLeft}`);

    // ---------- Tắt tính năng ----------
    await setPass({ pass_enabled: "0" });
    check("tắt Pass: không còn giảm giá", (await passLib.passDiscountFor(U.id, "PREMIUM", 100_000)) === 0);
    let buyBlocked = false;
    try { await passLib.buyPass(U.id, 1); } catch { buyBlocked = true; }
    check("tắt Pass: mua bị chặn", buyBlocked);
  } finally {
    // Dọn fixture + khôi phục settings Pass như trước khi test
    const userIds = [U.id, V.id, W.id];
    await prisma.passGiftClaim.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.premiumOrder.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.transaction.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.premiumStock.deleteMany({ where: { variantId: giftVariant.id } });
    await prisma.premiumVariant.deleteMany({ where: { id: { in: [variant.id, giftVariant.id] } } });
    await prisma.premiumProduct.deleteMany({ where: { id: { in: [prod.id, giftProd.id] } } });
    await prisma.premiumCategory.deleteMany({ where: { id: pcat.id } });
    await prisma.flashSale.deleteMany({ where: { id: flash.id } });
    await prisma.discountCode.deleteMany({ where: { id: promo.id } });
    for (const k of PASS_KEYS) {
      const old = oldSettings.get(k);
      if (old === null || old === undefined) await prisma.setting.deleteMany({ where: { key: k } });
      else await prisma.setting.upsert({ where: { key: k }, create: { key: k, value: old }, update: { value: old } });
    }
    await prisma.$disconnect();
  }
  console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
