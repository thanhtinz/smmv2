/** Xoá fixture nghiệm thu Affiliate (affdemo, affpoor, affmember1/2, affnewbie...). */
export {};
async function main() {
  const { prisma } = await import("../src/lib/db");
  const users = await prisma.user.findMany({
    where: { OR: [{ username: { in: ["affdemo", "affpoor", "affmember1", "affmember2"] } }, { username: { startsWith: "affnewbie" } }, { username: { startsWith: "gateuser" } }] },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length) {
    await prisma.affiliateTxn.deleteMany({ where: { OR: [{ userId: { in: ids } }, { fromUserId: { in: ids } }] } });
    await prisma.affiliateClick.deleteMany({ where: { referrerId: { in: ids } } });
    await prisma.transaction.deleteMany({ where: { userId: { in: ids } } });
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userSession.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
  console.log("đã xoá fixture:", ids.length, "user");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
