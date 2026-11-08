/**
 * Helper kiểm chứng fix5 WS7 (trang đặt đơn SMM mới):
 *   npx tsx scripts/test-fix5-smm.ts cheapest
 *   npx tsx scripts/test-fix5-smm.ts lastorder demo
 *   npx tsx scripts/test-fix5-smm.ts cleanup <orderId>  (xoá đơn test + OrderEvent, trả số dư demo 500000)
 */
import { prisma } from "../src/lib/db";

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === "cheapest") {
    const s = await prisma.smmService.findFirst({
      where: { active: true, panelId: null },
      orderBy: [{ rate: "asc" }],
      select: { id: true, name: true, rate: true, min: true, max: true, category: { select: { platform: true, name: true } } },
    });
    const demo = await prisma.user.findUnique({ where: { username: "demo" }, select: { level: true } });
    console.log(JSON.stringify(s ? { ...s, platform: s.category.platform, categoryName: s.category.name, demoLevel: demo?.level } : null));
  } else if (cmd === "lastorder") {
    const u = await prisma.user.findUnique({ where: { username: arg }, select: { id: true, balance: true } });
    const o = u ? await prisma.smmOrder.findFirst({ where: { userId: u.id }, orderBy: { id: "desc" }, select: { id: true, code: true, serviceId: true, quantity: true, charge: true, status: true, link: true } }) : null;
    console.log(JSON.stringify({ balance: u?.balance, order: o }));
  } else if (cmd === "cleanup") {
    const orderId = parseInt(arg);
    await prisma.orderEvent.deleteMany({ where: { orderId } });
    const o = await prisma.smmOrder.delete({ where: { id: orderId } }).catch(() => null);
    await prisma.user.update({ where: { username: "demo" }, data: { balance: 500000 } });
    console.log(JSON.stringify({ deleted: o?.code ?? null, demoBalance: 500000 }));
  } else {
    console.log("unknown command");
    process.exitCode = 1;
  }
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
