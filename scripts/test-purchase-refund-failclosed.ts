/**
 * Test tái-audit 0e15517 P2-B: hoàn tiền trong settlePurchasePayment phải
 * FAIL-CLOSED + idempotent.
 *   npx tsx scripts/test-purchase-refund-failclosed.ts
 * Trước bản vá: transaction hoàn tiền bị .catch(() => {}) nuốt lỗi nhưng
 * code vẫn tăng creditedTotal, ghi kết quả credited và chốt EXECUTED —
 * DB lỗi đúng lúc hoàn thì tiền mất khỏi mọi đường tự động.
 * Sau bản vá (refundOnce, khoá sổ Transaction.ref = PUR{pp}L{dòng}{D|F}):
 *   S1) Đã có giao dịch hoàn mang khoá -> KHÔNG cộng lần hai (idempotent).
 *   S2) Transaction hoàn lỗi thật (cộng tràn int4) -> dòng GIỮ pending,
 *       phiên GIỮ PROCESSING (không EXECUTED), số dư không đổi.
 *   S3) Hoàn bình thường -> cộng đúng 1 lần, phiên EXECUTED.
 *   S4) Hoàn chênh lệch khi nhận đơn lỗi (tràn int4) -> dòng giữ pending,
 *       phiên không EXECUTED.
 *   S5) Hoàn chênh lệch bình thường -> cộng đúng phần chênh, có giao
 *       dịch mang khoá D, phiên EXECUTED.
 */
import { prisma } from "../src/lib/db";
import { settlePurchasePayment, parsePurchaseData } from "../src/lib/purchase";

let failures = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
};

const INT4_MAX = 2147483647;

async function main() {
  const demo = await prisma.user.findUnique({ where: { username: "demo" } });
  if (!demo) throw new Error("Chưa seed demo user");
  const variant = await prisma.premiumVariant.findFirst({
    where: { product: { slug: "youtube-premium" }, active: true },
    orderBy: { price: "asc" },
  });
  if (!variant) throw new Error("Thiếu variant youtube-premium trong seed");
  const startBalance = demo.balance;
  const createdPP: number[] = [];
  const createdOrders: number[] = [];

  const makePP = async (share: number, patch: Record<string, any> = {}) => {
    const pp0 = await prisma.purchasePayment.create({
      data: {
        code: "TMP", userId: demo.id, method: "SEPAY", amount: share, status: "PENDING",
        snapshot: JSON.stringify({ lines: [{ variantId: variant.id, qty: 1, custom: {}, buyerInfo: demo.email, share }], promo: null }),
        expiresAt: new Date(Date.now() + 30 * 60000),
      },
    });
    const pp = await prisma.purchasePayment.update({
      where: { id: pp0.id },
      data: {
        code: `RFND${pp0.id}`, status: "PROCESSING", paidAt: new Date(), updatedAt: new Date(Date.now() - 15 * 60000),
        providerData: JSON.stringify({ receivedVnd: share, creditedTotal: 0 }),
        ...patch,
      },
    });
    createdPP.push(pp.id);
    return pp;
  };
  const balance = async () => (await prisma.user.findUnique({ where: { id: demo.id } }))!.balance;
  const ppState = async (id: number) => prisma.purchasePayment.findUnique({ where: { id } });
  const refCount = async (ppId: number, kind: "D" | "F") =>
    prisma.transaction.count({ where: { userId: demo.id, type: "REFUND", ref: `PUR${ppId}L0${kind}` } });

  try {
    /* S1) Idempotent: sổ đã có giao dịch hoàn FULL của phiên -> settle
       (dòng sẽ lỗi tạo đơn vì gói bị tắt) không cộng thêm lần nào. */
    await prisma.premiumVariant.update({ where: { id: variant.id }, data: { active: false } });
    const pp1 = await makePP(70000);
    await prisma.transaction.create({
      data: { userId: demo.id, type: "REFUND", amount: 70000, balanceAfter: startBalance, ref: `PUR${pp1.id}L0F`, note: "giao dịch hoàn của lượt trước (giả lập)" },
    });
    const b1 = await balance();
    const r1 = await settlePurchasePayment(pp1.id);
    ok(r1.ok && (await balance()) === b1, "S1: đã hoàn ở lượt trước -> không cộng lần hai");
    ok((await ppState(pp1.id))?.status === "EXECUTED", "S1: phiên vẫn chốt EXECUTED (hoàn đã có sổ)");

    /* S2) Hoàn lỗi thật: số dư gần trần int4, cộng bồi hoàn -> tràn ->
       transaction lỗi -> dòng pending, phiên PROCESSING, dư không đổi. */
    const pp2 = await makePP(10000000);
    await prisma.user.update({ where: { id: demo.id }, data: { balance: INT4_MAX - 5000000 } });
    const r2 = await settlePurchasePayment(pp2.id);
    const st2 = await ppState(pp2.id);
    ok(r2.ok && r2.reason === "refund_pending", `S2: settle báo refund_pending (${r2.reason})`);
    ok(st2?.status === "PROCESSING", "S2: phiên GIỮ PROCESSING — không EXECUTED");
    ok((await balance()) === INT4_MAX - 5000000, "S2: số dư không đổi (hoàn chưa thành công)");
    ok(parsePurchaseData(st2 as any).execution?.[0]?.pending === true, "S2: dòng giữ trạng thái pending chờ thử lại");
    ok((await refCount(pp2.id, "F")) === 0, "S2: không có giao dịch hoàn nào lọt sổ");

    /* S3) Hoàn bình thường (gói vẫn tắt): cộng đúng phần tiền của dòng. */
    await prisma.user.update({ where: { id: demo.id }, data: { balance: startBalance } });
    const pp3 = await makePP(70000);
    const r3 = await settlePurchasePayment(pp3.id);
    ok(r3.ok && (await balance()) === startBalance + 70000, "S3: bồi hoàn cộng đúng 1 lần vào ví");
    ok((await ppState(pp3.id))?.status === "EXECUTED", "S3: phiên EXECUTED");
    ok((await refCount(pp3.id, "F")) === 1, "S3: đúng 1 giao dịch hoàn mang khoá F");
    await prisma.user.update({ where: { id: demo.id }, data: { balance: startBalance } });
    await prisma.premiumVariant.update({ where: { id: variant.id }, data: { active: true } });

    /* S4+S5) Nhận đơn theo khoá: đơn có sẵn total < share.
       S4: diff cộng tràn int4 -> pending/PROCESSING. S5: diff thường -> xong. */
    const mkAdopted = async (ppId: number, total: number) => {
      const o0 = await prisma.premiumOrder.create({
        data: {
          code: "TMP", userId: demo.id, variantId: variant.id, quantity: 1, total, status: "PENDING",
          buyerInfo: demo.email, purchasePaymentId: ppId, purchaseLineNo: 0,
        },
      });
      createdOrders.push(o0.id);
      return prisma.premiumOrder.update({ where: { id: o0.id }, data: { code: `PRE-RF${o0.id}` } });
    };
    const pendingPatch = (share: number) => ({
      providerData: JSON.stringify({
        receivedVnd: share, creditedTotal: 0,
        execution: [{ variantId: variant.id, ok: false, pending: true, startedAt: Date.now() - 15 * 60000 }],
      }),
    });

    const pp4 = await makePP(10000000, pendingPatch(10000000));
    await mkAdopted(pp4.id, 9000000); // diff = 1.000.000
    await prisma.user.update({ where: { id: demo.id }, data: { balance: INT4_MAX - 500000 } });
    const r4 = await settlePurchasePayment(pp4.id);
    ok(r4.ok && r4.reason === "refund_pending" && (await ppState(pp4.id))?.status === "PROCESSING", "S4: hoàn chênh lệch lỗi -> phiên giữ PROCESSING");
    ok((await balance()) === INT4_MAX - 500000, "S4: số dư không đổi");

    const pp5 = await makePP(70000, pendingPatch(70000));
    await mkAdopted(pp5.id, 65000); // diff = 5.000
    await prisma.user.update({ where: { id: demo.id }, data: { balance: startBalance } });
    const r5 = await settlePurchasePayment(pp5.id);
    ok(r5.ok && (await balance()) === startBalance + 5000, "S5: hoàn chênh lệch cộng đúng 5.000đ");
    ok((await ppState(pp5.id))?.status === "EXECUTED" && (await refCount(pp5.id, "D")) === 1, "S5: phiên EXECUTED + 1 giao dịch khoá D");
  } finally {
    await prisma.premiumOrder.deleteMany({ where: { id: { in: createdOrders } } });
    await prisma.premiumOrder.deleteMany({ where: { purchasePaymentId: { in: createdPP } } });
    await prisma.transaction.deleteMany({ where: { userId: demo.id, ref: { in: createdPP.flatMap((id) => [`PUR${id}L0D`, `PUR${id}L0F`]) } } });
    await prisma.purchasePayment.deleteMany({ where: { id: { in: createdPP } } });
    await prisma.premiumVariant.update({ where: { id: variant.id }, data: { active: true } }).catch(() => {});
    await prisma.user.update({ where: { id: demo.id }, data: { balance: startBalance } });
  }
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAIL`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
