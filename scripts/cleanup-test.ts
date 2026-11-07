import { prisma } from "@/lib/db";
import { setSetting } from "@/lib/settings";
async function main() {
  // Khôi phục cấu hình đã đổi để test
  await setSetting("usdt_enabled", "0");
  await setSetting("usdt_address", "");
  await setSetting("usdt_min", "5");
  await setSetting("sepay_secret", "");
  // Xoá user test race + dữ liệu của nó
  const race = await prisma.user.findFirst({ where: { username: { startsWith: "racetest" } } });
  if (race) {
    const orders = await prisma.smmOrder.findMany({ where: { userId: race.id }, select: { id: true } });
    await prisma.orderEvent.deleteMany({ where: { orderId: { in: orders.map((o) => o.id) } } });
    await prisma.smmOrder.deleteMany({ where: { userId: race.id } });
    await prisma.transaction.deleteMany({ where: { userId: race.id } });
    await prisma.user.delete({ where: { id: race.id } });
    console.log("race user removed");
  }
  await prisma.discountCode.deleteMany({ where: { code: { startsWith: "RACE" } } });
  // Xoá 2 deposit test SePay của demo + giao dịch kèm theo, trả số dư về 450000
  const deps = await prisma.deposit.findMany({ where: { code: { in: ["NAP100001", "NAP100002"] } } });
  for (const d of deps) {
    await prisma.transaction.deleteMany({ where: { ref: d.code } });
    await prisma.deposit.delete({ where: { id: d.id } });
  }
  if (deps.length) {
    const total = deps.reduce((a, d) => a + d.amount + (d.bonus || 0), 0);
    await prisma.user.update({ where: { username: "demo" }, data: { balance: { decrement: total }, totalDeposited: { decrement: deps.reduce((a, d) => a + d.amount, 0) } } });
    console.log("demo deposits removed:", total);
  }
  await prisma.webhookReceipt.deleteMany({ where: { ref: { in: ["TXTEST-001", "TXTEST-002"] } } });
  const demo = await prisma.user.findUnique({ where: { username: "demo" }, select: { balance: true } });
  console.log("demo balance now:", demo?.balance);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
