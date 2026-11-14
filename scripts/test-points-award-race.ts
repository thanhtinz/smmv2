/**
 * Full-audit a75d260 P3-03 — cộng điểm thưởng idempotent ở tầng DB:
 * gọi awardPointsForPremiumOrder đồng thời nhiều lần cho cùng một
 * đơn thì điểm chỉ tăng đúng một lần và chỉ có một claim.
 */
import { prisma } from "../src/lib/db";
import { awardPointsForPremiumOrder } from "../src/lib/points";
import { getSettings, setSetting } from "../src/lib/settings";

let fails = 0;
function ok(cond: boolean, label: string) {
  console.log(`${cond ? "PASS" : "FAIL"} ${label}`);
  if (!cond) fails++;
}

async function main() {
  const s0 = await getSettings();
  const prevPer = s0.points_per_100k || "";
  await setSetting("points_per_100k", "5"); // 200.000đ -> 10 điểm
  const stamp = Date.now().toString(36);
  const user = await prisma.user.create({
    data: {
      username: `par${stamp}`, email: `par${stamp}@t.local`, passwordHash: "x", points: 0,
      apiKey: `parkey${stamp}`, depositCode: `PA${stamp}`.slice(0, 12).toUpperCase(), refCode: `RF${stamp}`.toUpperCase(),
    },
  });
  const fakeOrder = { id: 98765000 + Math.floor(Math.random() * 9000), userId: user.id, total: 200000, code: `PAR${stamp}`.toUpperCase() };

  await Promise.all([
    awardPointsForPremiumOrder(fakeOrder),
    awardPointsForPremiumOrder(fakeOrder),
    awardPointsForPremiumOrder(fakeOrder),
    awardPointsForPremiumOrder(fakeOrder),
  ]);
  const after = await prisma.user.findUnique({ where: { id: user.id } });
  const claims = await prisma.pointsAwardClaim.count({ where: { ref: `premium-${fakeOrder.id}` } });
  ok(after?.points === 10, `P1: 4 lượt đồng thời -> điểm tăng đúng 10 (đang ${after?.points})`);
  ok(claims === 1, `P2: đúng 1 claim trong DB (đang ${claims})`);

  // Gọi thêm tuần tự cũng không cộng nữa
  await awardPointsForPremiumOrder(fakeOrder);
  const after2 = await prisma.user.findUnique({ where: { id: user.id } });
  ok(after2?.points === 10, "P3: gọi lại tuần tự không cộng thêm");

  await prisma.pointsAwardClaim.deleteMany({ where: { ref: `premium-${fakeOrder.id}` } });
  await prisma.apiLog.deleteMany({ where: { kind: "points_earn", ref: `premium-${fakeOrder.id}` } });
  await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  await setSetting("points_per_100k", prevPer);

  console.log(fails === 0 ? "ALL PASS" : `${fails} FAIL`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
