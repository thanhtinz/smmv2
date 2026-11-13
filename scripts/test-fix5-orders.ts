/**
 * Helper kiểm chứng: gieo 1 đơn Premium mẫu cho demo (đã giao, có bảo hành)
 * để chụp trang chi tiết đơn Premium, rồi dọn sạch.
 *   npx tsx scripts/test-fix5-orders.ts seed | clean
 * Đơn gieo trực tiếp vào DB — không đụng số dư ví.
 * (Nửa SMM của helper đã gỡ cùng đợt gỡ SMM 2026-11-12.)
 */
import { prisma } from "../src/lib/db";

const PRE_CODE = "PRE900001";

async function main() {
  const cmd = process.argv[2];
  const demo = await prisma.user.findUnique({ where: { username: "demo" }, select: { id: true } });
  if (!demo) throw new Error("no demo user");
  if (cmd === "seed") {
    const variant = await prisma.premiumVariant.findFirst({ where: { id: 1 }, select: { id: true } });
    if (!variant) throw new Error("missing seed data");
    const pre = await prisma.premiumOrder.create({
      data: {
        code: PRE_CODE, userId: demo.id, variantId: variant.id, quantity: 1, total: 55000,
        status: "DELIVERED", buyerInfo: "demo@example.com",
        deliveryData: "Tài khoản: demo@example.com\nMã kích hoạt: TEST-KEY-1234",
        warrantyUntil: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      },
    });
    console.log(JSON.stringify({ preId: pre.id, preCode: pre.code }));
  } else if (cmd === "clean") {
    await prisma.premiumOrder.deleteMany({ where: { code: PRE_CODE } });
    console.log("cleaned");
  } else {
    console.log("unknown command");
    process.exitCode = 1;
  }
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
