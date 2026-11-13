/**
 * Kiểm chứng hệ thống GIỚI THIỆU BẠN BÈ (Affiliate — lệnh Tín 2026-11-12):
 *  1) Hoa hồng mua hàng của người được giới thiệu cộng vào SỐ DƯ HOA HỒNG
 *     RIÊNG của người giới thiệu — ví chính KHÔNG đổi; sổ AffiliateTxn có
 *     dòng EARN đúng số, gắn fromUserId của người mua.
 *  2) Tỉ lệ lấy từ setting affiliate_percent TẠI THỜI ĐIỂM cộng (đổi setting
 *     là lần cộng sau dùng tỉ lệ mới).
 *  3) Thu hồi khi hoàn đơn: trừ từ số dư hoa hồng, không vượt phần ròng đã
 *     cộng cho đúng mã đơn đó.
 *  4) Rút tiền: chân trừ số dư hoa hồng (WITHDRAW) + chân cộng ví chính
 *     (AFFILIATE_WITHDRAW) trong cùng transaction; helper mức tối thiểu.
 *  5) Click: upsert chống trùng (referrer × visitor × ngày) chỉ đếm 1.
 * Chạy: npx tsx scripts/test-affiliate.ts (cần DATABASE_URL local)
 */
export {};
let pass = 0, fail = 0;
const check = (n: string, c: boolean, x = "") => { if (c) { pass++; console.log(`PASS  ${n}${x ? " — " + x : ""}`); } else { fail++; console.log(`FAIL  ${n}${x ? " — " + x : ""}`); } };

async function main() {
  const { prisma } = await import("../src/lib/db");
  const { creditReferralCommission, clawbackReferralCommission, applyBalance } = await import("../src/lib/wallet");
  const { applyAffiliateBalance, affiliateWithdrawMin, affDayKey } = await import("../src/lib/affiliate");
  const { randomKey } = await import("../src/lib/format");

  const suffix = randomKey(6).toLowerCase();
  const mk = async (username: string, referredById?: number) => prisma.user.create({
    data: {
      username, email: `${username}@test.local`, passwordHash: "x",
      apiKey: randomKey(32), depositCode: randomKey(6).toUpperCase(), refCode: randomKey(8).toUpperCase(),
      referredById: referredById ?? null,
    },
  });
  const setPct = (v: string) => prisma.setting.upsert({ where: { key: "affiliate_percent" }, create: { key: "affiliate_percent", value: v }, update: { value: v } });
  const oldPct = (await prisma.setting.findUnique({ where: { key: "affiliate_percent" } }))?.value;

  const B = await mk(`affb${suffix}`); // người giới thiệu
  const A = await mk(`affa${suffix}`, B.id); // người được giới thiệu
  try {
    await setPct("10");
    // 1) A mua 1.000.000đ → B nhận 10% = 100.000đ vào số dư hoa hồng
    await prisma.$transaction((tx) => creditReferralCommission(tx, A.id, 1_000_000, "TESTORD1"));
    let b = await prisma.user.findUnique({ where: { id: B.id }, select: { balance: true, affiliateBalance: true } });
    check("hoa hồng vào số dư RIÊNG", b?.affiliateBalance === 100_000, `aff=${b?.affiliateBalance}`);
    check("ví chính không đổi", b?.balance === 0, `wallet=${b?.balance}`);
    const earn = await prisma.affiliateTxn.findFirst({ where: { userId: B.id, kind: "EARN", ref: "TESTORD1" } });
    check("sổ AffiliateTxn EARN đúng", !!earn && earn.amount === 100_000 && earn.balanceAfter === 100_000 && earn.fromUserId === A.id);

    // 2) Đổi tỉ lệ 5% → lần cộng sau dùng 5%
    await setPct("5");
    await prisma.$transaction((tx) => creditReferralCommission(tx, A.id, 200_000, "TESTORD2"));
    b = await prisma.user.findUnique({ where: { id: B.id }, select: { balance: true, affiliateBalance: true } });
    check("tỉ lệ mới áp dụng ngay", b?.affiliateBalance === 110_000, `aff=${b?.affiliateBalance}`);

    // 3) Hoàn 500.000đ của TESTORD1: due theo % hiện tại (5%) = 25.000, không vượt ròng của đơn (100.000)
    await clawbackReferralCommission(A.id, 500_000, "TESTORD1");
    b = await prisma.user.findUnique({ where: { id: B.id }, select: { balance: true, affiliateBalance: true } });
    check("thu hồi trừ từ số dư hoa hồng", b?.affiliateBalance === 85_000, `aff=${b?.affiliateBalance}`);
    check("thu hồi không đụng ví chính", b?.balance === 0);
    // Hoàn nốt 500.000đ còn lại của TESTORD1: due 25.000 (ròng còn 75.000) → 60.000
    await clawbackReferralCommission(A.id, 500_000, "TESTORD1");
    b = await prisma.user.findUnique({ where: { id: B.id }, select: { balance: true, affiliateBalance: true } });
    check("thu hồi lần 2 đúng ròng", b?.affiliateBalance === 60_000, `aff=${b?.affiliateBalance}`);
    // Hoàn thêm nữa cho đơn đã thu đủ theo % hiện tại: ròng đơn còn 50.000 nhưng due của lần này = 25.000 → vẫn trừ (đúng semantics % hiện tại)
    // — kiểm tra chặn trên: hoàn một đơn CHƯA từng cộng hoa hồng thì không trừ gì
    await clawbackReferralCommission(A.id, 100_000, "TESTORDX");
    b = await prisma.user.findUnique({ where: { id: B.id }, select: { balance: true, affiliateBalance: true } });
    check("đơn chưa cộng hoa hồng → không thu hồi", b?.affiliateBalance === 60_000, `aff=${b?.affiliateBalance}`);

    // 4) Rút 60.000 về ví (hai chân trong 1 transaction — cùng phép action dùng)
    check("helper mức rút tối thiểu", affiliateWithdrawMin({}) === 10_000 && affiliateWithdrawMin({ affiliate_withdraw_min: "50000" }) === 50_000 && affiliateWithdrawMin({ affiliate_withdraw_min: "abc" }) === 10_000);
    await prisma.$transaction(async (tx) => {
      await applyAffiliateBalance(tx, B.id, -60_000, "WITHDRAW", { note: "Rút hoa hồng về ví chính" });
      await applyBalance(tx, B.id, 60_000, "AFFILIATE_WITHDRAW", undefined, "Rút hoa hồng giới thiệu về ví");
    });
    b = await prisma.user.findUnique({ where: { id: B.id }, select: { balance: true, affiliateBalance: true } });
    check("rút: số dư hoa hồng về 0", b?.affiliateBalance === 0);
    check("rút: ví chính +60.000", b?.balance === 60_000, `wallet=${b?.balance}`);
    const wd = await prisma.affiliateTxn.findFirst({ where: { userId: B.id, kind: "WITHDRAW" } });
    const wtx = await prisma.transaction.findFirst({ where: { userId: B.id, type: "AFFILIATE_WITHDRAW" } });
    check("sổ hai chân đầy đủ", !!wd && wd.amount === -60_000 && wd.balanceAfter === 0 && !!wtx && wtx.amount === 60_000);
    // Trừ vượt số dư hoa hồng phải bị từ chối nguyên tử
    let rejected = false;
    try { await prisma.$transaction((tx) => applyAffiliateBalance(tx, B.id, -1, "WITHDRAW")); } catch { rejected = true; }
    check("trừ vượt số dư hoa hồng bị chặn", rejected);

    // 5) Click chống trùng theo ngày
    const vid = randomKey(20);
    const day = affDayKey();
    const up = () => prisma.affiliateClick.upsert({
      where: { referrerId_visitorId_dayKey: { referrerId: B.id, visitorId: vid, dayKey: day } },
      create: { referrerId: B.id, visitorId: vid, dayKey: day }, update: {},
    });
    await up(); await up(); await up();
    const clicks = await prisma.affiliateClick.count({ where: { referrerId: B.id, visitorId: vid } });
    check("click trùng trong ngày chỉ đếm 1", clicks === 1, `clicks=${clicks}`);
  } finally {
    if (oldPct !== undefined && oldPct !== null) await setPct(oldPct); else await prisma.setting.deleteMany({ where: { key: "affiliate_percent" } });
    await prisma.affiliateClick.deleteMany({ where: { referrerId: B.id } });
    await prisma.affiliateTxn.deleteMany({ where: { userId: B.id } });
    await prisma.transaction.deleteMany({ where: { userId: B.id } });
    await prisma.user.deleteMany({ where: { id: { in: [A.id, B.id] } } });
    await prisma.$disconnect();
  }
  console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
