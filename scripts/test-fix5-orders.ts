/**
 * Helper kiểm chứng fix5 WS8: gieo 2 đơn mẫu cho demo (1 SMM đang chạy + 1
 * Premium đã giao có bảo hành) để chụp trang chi tiết, rồi dọn sạch.
 *   npx tsx scripts/test-fix5-orders.ts seed | clean
 * Đơn gieo trực tiếp vào DB — không đụng số dư ví.
 */
import { prisma } from "../src/lib/db";

const SMM_CODE = "SMM900001";
const PRE_CODE = "PRE900001";

async function main() {
  const cmd = process.argv[2];
  const demo = await prisma.user.findUnique({ where: { username: "demo" }, select: { id: true } });
  if (!demo) throw new Error("no demo user");
  if (cmd === "seed") {
    const svc = await prisma.smmService.findFirst({ where: { active: true, panelId: null }, orderBy: { id: "asc" }, select: { id: true } });
    const variant = await prisma.premiumVariant.findFirst({ where: { id: 1 }, select: { id: true } });
    if (!svc || !variant) throw new Error("missing seed data");
    const smm = await prisma.smmOrder.create({
      data: {
        code: SMM_CODE, userId: demo.id, serviceId: svc.id,
        link: "https://facebook.com/trang.mau.test", quantity: 1000, charge: 2850,
        startCount: 1200, remains: 400, status: "IN_PROGRESS", fulfillment: "MANUAL",
        note: "Chạy chậm giúp em nhé", adminNote: "Đã nhận đơn, đang chạy.",
      },
    });
    await prisma.orderEvent.createMany({
      data: [
        { orderId: smm.id, status: "PENDING", note: "Đơn được tạo" },
        { orderId: smm.id, status: "IN_PROGRESS", note: "Bắt đầu chạy" },
      ],
    });
    const pre = await prisma.premiumOrder.create({
      data: {
        code: PRE_CODE, userId: demo.id, variantId: variant.id, quantity: 1, total: 55000,
        status: "DELIVERED", buyerInfo: "demo@example.com",
        deliveryData: "Tài khoản: demo@example.com\nMã kích hoạt: TEST-KEY-1234",
        warrantyUntil: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      },
    });
    console.log(JSON.stringify({ smmId: smm.id, smmCode: smm.code, preId: pre.id, preCode: pre.code }));
  } else if (cmd === "clean") {
    const smm = await prisma.smmOrder.findUnique({ where: { code: SMM_CODE }, select: { id: true } });
    if (smm) {
      await prisma.orderEvent.deleteMany({ where: { orderId: smm.id } });
      await prisma.smmOrder.delete({ where: { id: smm.id } });
    }
    await prisma.premiumOrder.deleteMany({ where: { code: PRE_CODE } });
    console.log("cleaned");
  } else {
    console.log("unknown command");
    process.exitCode = 1;
  }
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
