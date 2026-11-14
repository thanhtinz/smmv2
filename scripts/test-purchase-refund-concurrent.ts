/**
 * Full-audit 3d1309c P2-06 — refundOnce phải nguyên tử ở DB: insert
 * claim PurchaseRefundClaim + cộng ví trong CÙNG transaction. Test này
 * chạy đúng thân transaction của refundOnce (claim create + applyBalance)
 * từ 8 lượt song song với cùng một khoá (phiên, dòng, loại): đúng 1
 * lượt commit, ví chỉ tăng đúng 1 lần, đúng 1 dòng claim.
 * Kèm kiểm tra fail-closed: cộng ví lỗi (tràn int4) thì claim cũng
 * rollback — không để lại claim mồ côi chặn lần hoàn thật sau đó.
 */
import { prisma } from "../src/lib/db";
import { applyBalance } from "../src/lib/wallet";

let fails = 0;
function ok(cond: boolean, label: string) {
  console.log(`${cond ? "PASS" : "FAIL"} ${label}`);
  if (!cond) fails++;
}

async function attempt(userId: number, ppId: number, amount: number): Promise<"done" | "already" | "failed"> {
  const claimWhere = { purchasePaymentId: ppId, lineNo: 0, kind: "FULL" };
  const claimed = await prisma.purchaseRefundClaim.findFirst({ where: claimWhere, select: { id: true } });
  if (claimed) return "already";
  try {
    await prisma.$transaction(async (tx) => {
      await tx.purchaseRefundClaim.create({ data: { ...claimWhere, amount } });
      await applyBalance(tx, userId, amount, "REFUND", `PUR${ppId}L0F`, "race test");
    });
    return "done";
  } catch {
    const now = await prisma.purchaseRefundClaim.findFirst({ where: claimWhere, select: { id: true } }).catch(() => null);
    return now ? "already" : "failed";
  }
}

async function main() {
  const stamp = Date.now().toString(36);
  const user = await prisma.user.create({
    data: {
      username: `rcc${stamp}`, email: `rcc${stamp}@t.local`, passwordHash: "x", balance: 1000,
      apiKey: `rcckey${stamp}`, depositCode: `RC${stamp}`.slice(0, 12).toUpperCase(), refCode: `RF${stamp}`.toUpperCase(),
    },
  });
  const ppId = 987000000 + Math.floor(Math.random() * 1000000);

  const results = await Promise.all(Array.from({ length: 8 }, () => attempt(user.id, ppId, 5000)));
  const after = (await prisma.user.findUnique({ where: { id: user.id } }))!;
  const claims = await prisma.purchaseRefundClaim.count({ where: { purchasePaymentId: ppId } });
  const txs = await prisma.transaction.count({ where: { userId: user.id, type: "REFUND", ref: `PUR${ppId}L0F` } });
  ok(results.filter((r) => r === "done").length === 1, `R1: đúng 1 lượt thắng trong 8 lượt đua (${results.join(",")})`);
  ok(after.balance === 6000 && claims === 1 && txs === 1, `R2: ví +5.000 đúng 1 lần, 1 claim, 1 giao dịch (balance=${after.balance}, claims=${claims}, txs=${txs})`);

  // Fail-closed: ví gần trần int4 -> applyBalance lỗi -> claim rollback
  const ppId2 = ppId + 1;
  await prisma.user.update({ where: { id: user.id }, data: { balance: 2147483640 } });
  const r = await attempt(user.id, ppId2, 5000);
  const claims2 = await prisma.purchaseRefundClaim.count({ where: { purchasePaymentId: ppId2 } });
  ok(r === "failed" && claims2 === 0, "R3: cộng ví lỗi -> claim rollback, không claim mồ côi");
  // Hạ ví xuống rồi thử lại: hoàn phải chạy được (không bị claim chết chặn)
  await prisma.user.update({ where: { id: user.id }, data: { balance: 1000 } });
  const r2 = await attempt(user.id, ppId2, 5000);
  const bal2 = (await prisma.user.findUnique({ where: { id: user.id } }))!.balance;
  ok(r2 === "done" && bal2 === 6000, "R4: thử lại sau lỗi -> hoàn thành công");

  await prisma.purchaseRefundClaim.deleteMany({ where: { purchasePaymentId: { in: [ppId, ppId2] } } });
  await prisma.transaction.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } }).catch(() => {});

  console.log(fails === 0 ? "ALL PASS" : `${fails} FAIL`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
