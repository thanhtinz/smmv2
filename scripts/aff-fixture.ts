/**
 * Fixture nghiệm thu Affiliate (chạy TRƯỚC scripts/shots-affiliate.mjs):
 * tạo người giới thiệu affdemo (mật khẩu Aff@12345) với sổ hoa hồng thật —
 * 2 thành viên đã giới thiệu, EARN 75.000 + 50.000, đã rút 20.000 → số dư
 * 105.000 (đủ mức rút 10.000), 7 lượt click; và affpoor có 5.000 (chưa đủ
 * mức rút). Ghi thông tin cần kiểm tra sang /tmp/aff-fixture.json.
 * Xoá sạch bằng scripts/aff-fixture-clean.ts sau khi nghiệm thu.
 * Chạy: npx tsx scripts/aff-fixture.ts
 */
export {};
async function main() {
  const { prisma } = await import("../src/lib/db");
  const { hashPassword } = await import("../src/lib/password");
  const { randomKey } = await import("../src/lib/format");
  const { writeFileSync } = await import("node:fs");

  const setSetting = (key: string, value: string) =>
    prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  await setSetting("module_affiliate", "1");
  await setSetting("affiliate_percent", "6");
  await setSetting("affiliate_withdraw_min", "10000");

  const pw = await hashPassword("Aff@12345");
  const mk = (username: string, extra: any = {}) => prisma.user.create({
    data: {
      username, email: `${username}@fixture.local`, passwordHash: pw,
      apiKey: randomKey(32), depositCode: randomKey(6).toUpperCase(), refCode: randomKey(8).toUpperCase(), ...extra,
    },
  });
  // Dọn fixture cũ nếu chạy lại
  const old = await prisma.user.findMany({ where: { username: { in: ["affdemo", "affpoor", "affmember1", "affmember2"] } }, select: { id: true } });
  if (old.length) {
    const ids = old.map((u) => u.id);
    await prisma.affiliateTxn.deleteMany({ where: { userId: { in: ids } } });
    await prisma.affiliateClick.deleteMany({ where: { referrerId: { in: ids } } });
    await prisma.transaction.deleteMany({ where: { userId: { in: ids } } });
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userSession.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  const demo = await mk("affdemo", { balance: 200_000 });
  const m1 = await mk("affmember1", { referredById: demo.id, totalSpent: 1_250_000 });
  const m2 = await mk("affmember2", { referredById: demo.id, totalSpent: 833_333 });
  await prisma.user.update({ where: { id: m1.id }, data: { createdAt: new Date(Date.now() - 10 * 86400000) } });
  await prisma.user.update({ where: { id: m2.id }, data: { createdAt: new Date(Date.now() - 2 * 86400000) } });

  const txn = (amount: number, balanceAfter: number, kind: string, fromUserId: number | null, note: string, daysAgo: number) =>
    prisma.affiliateTxn.create({
      data: {
        userId: demo.id, kind, amount, balanceAfter, fromUserId, note,
        ref: kind === "EARN" ? `FIX-${fromUserId}` : undefined,
        createdAt: new Date(Date.now() - daysAgo * 86400000),
      },
    });
  await txn(75_000, 75_000, "EARN", m1.id, "Hoa hồng giới thiệu — affmember1 mua hàng", 9);
  await txn(50_000, 125_000, "EARN", m2.id, "Hoa hồng giới thiệu — affmember2 mua hàng", 1);
  await txn(-20_000, 105_000, "WITHDRAW", null, "Rút hoa hồng về ví chính", 0);
  await prisma.user.update({ where: { id: demo.id }, data: { affiliateBalance: 105_000, affiliateEnrolledAt: new Date() } });
  for (let i = 0; i < 7; i++) {
    await prisma.affiliateClick.create({
      data: { referrerId: demo.id, visitorId: `visitor-${i}`, dayKey: `2026-11-${String(6 + i).padStart(2, "0")}` },
    });
  }

  const poor = await mk("affpoor", {});
  await prisma.affiliateTxn.create({ data: { userId: poor.id, kind: "EARN", amount: 5_000, balanceAfter: 5_000, note: "Hoa hồng giới thiệu — khách mua hàng" } });
  await prisma.user.update({ where: { id: poor.id }, data: { affiliateBalance: 5_000, affiliateEnrolledAt: new Date() } });

  const product = await prisma.premiumProduct.findFirst({
    where: { active: true, panelId: null },
    orderBy: { id: "asc" },
    include: { variants: { where: { active: true }, orderBy: [{ sort: "asc" }, { price: "asc" }] } },
  });
  if (!product) throw new Error("seed chưa có sản phẩm Premium");
  writeFileSync("/tmp/aff-fixture.json", JSON.stringify({
    demoId: demo.id, demoCode: demo.refCode, poorId: poor.id,
    slug: product.slug, productName: product.name,
    variants: product.variants.map((v) => ({ name: v.name, price: v.price })),
  }, null, 2));
  console.log("fixture ok:", { demoCode: demo.refCode, slug: product.slug, variants: product.variants.length });
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
