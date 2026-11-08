/**
 * Helper kiểm chứng fix5 WS4 (trang chi tiết Premium mới):
 *   npx tsx scripts/test-fix5-detail.ts cheapest
 *   npx tsx scripts/test-fix5-detail.ts lastorder demo
 *   npx tsx scripts/test-fix5-detail.ts cleanup <orderId>   (xoá đơn test + trả kho + hoàn số dư demo về 500000)
 */
import { prisma } from "../src/lib/db";

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === "cheapest") {
    const v = await prisma.premiumVariant.findFirst({
      where: { active: true, price: { gt: 0 }, product: { active: true, panelId: null } },
      orderBy: { price: "asc" },
      include: { product: { select: { slug: true, name: true, fulfillment: true } } },
    });
    const stock = v ? await prisma.premiumStock.count({ where: { variantId: v.id, status: "AVAILABLE" } }) : 0;
    console.log(JSON.stringify(v ? { slug: v.product.slug, productName: v.product.name, fulfillment: v.product.fulfillment, variantId: v.id, variantName: v.name, price: v.price, stock } : null));
  } else if (cmd === "lastorder") {
    const u = await prisma.user.findUnique({ where: { username: arg }, select: { id: true, balance: true } });
    const o = u ? await prisma.premiumOrder.findFirst({ where: { userId: u.id }, orderBy: { id: "desc" }, select: { id: true, code: true, variantId: true, quantity: true, total: true, status: true, promoDiscount: true, deliveryData: true } }) : null;
    console.log(JSON.stringify({ balance: u?.balance, order: o }));
  } else if (cmd === "cleanup") {
    const orderId = parseInt(arg);
    const o = await prisma.premiumOrder.findUnique({ where: { id: orderId } });
    if (!o) { console.log("no order"); return; }
    // Trả các dòng kho đã bán của đơn này về AVAILABLE (nếu có)
    const restored = await prisma.premiumStock.updateMany({ where: { orderId: o.id }, data: { status: "AVAILABLE", orderId: null } }).catch(() => ({ count: 0 }));
    await prisma.premiumOrder.delete({ where: { id: o.id } });
    await prisma.user.update({ where: { username: "demo" }, data: { balance: 500000 } });
    console.log(JSON.stringify({ deleted: o.code, stockRestored: restored.count, demoBalance: 500000 }));
  } else {
    console.log("unknown command");
    process.exitCode = 1;
  }
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
