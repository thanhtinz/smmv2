import { prisma } from "../src/lib/db";
async function main() {
  const smm = await prisma.smmOrder.findMany({ where: { code: { in: ["SMM100101", "SMM100102", "SMM100103"] } }, select: { id: true } });
  await prisma.orderEvent.deleteMany({ where: { orderId: { in: smm.map((o) => o.id) } } });
  await prisma.smmOrder.deleteMany({ where: { id: { in: smm.map((o) => o.id) } } });
  await prisma.premiumOrder.deleteMany({ where: { code: { in: ["PRE100201", "PRE100202", "PRE100203"] } } });
  const fx = await prisma.premiumProduct.findUnique({ where: { slug: "fixture-telegram" } });
  if (fx) { await prisma.premiumVariant.deleteMany({ where: { productId: fx.id } }); await prisma.premiumProduct.delete({ where: { id: fx.id } }); }
  const demo = await prisma.user.findUnique({ where: { username: "demo" } });
  console.log(JSON.stringify({ smmDeleted: smm.length, demoBalance: demo?.balance }));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
