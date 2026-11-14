/**
 * Test hồi quy audit đợt 2 P1-03: PurchasePayment exactly-once khi tiến
 * trình chết GIỮA createPremiumOrder và lúc lưu tiến độ.
 *   npx tsx scripts/test-purchase-recovery2.ts   (chỉ cần DB local đã seed)
 * Trước bản vá: tiến độ chỉ ghi SAU khi tạo đơn — crash ở giữa thì lượt
 * phục hồi chạy lại dòng từ đầu, tạo đơn/giao hàng TRÙNG. Lease 3 phút
 * còn có thể hết khi một dòng gọi nhà cung cấp vẫn đang chạy.
 * Sau bản vá: (1) lease 10 phút; (2) Ý ĐỊNH của dòng được ghi TRƯỚC khi
 * tạo đơn; (3) tiếp quản gặp dòng "pending" thì ĐỐI SOÁT — có đơn khớp
 * (khách + gói + số lượng + cửa sổ thời gian) thì nhận lại đơn đó, không
 * có thì mới chạy lại.
 */
import { prisma } from "../src/lib/db";
import { settlePurchasePayment, parsePurchaseData } from "../src/lib/purchase";
import { createPremiumOrder } from "../src/lib/orders";

let failures = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
};

async function main() {
  const demo = await prisma.user.findUnique({ where: { username: "demo" } });
  if (!demo) throw new Error("Chưa seed demo user");
  const variant = await prisma.premiumVariant.findFirst({
    where: { product: { slug: "youtube-premium" }, active: true },
    orderBy: { price: "asc" },
  });
  if (!variant) throw new Error("Thiếu variant youtube-premium trong seed");
  const P = variant.price;
  const startBalance = demo.balance;
  const createdPP: number[] = [];
  const createdOrders: string[] = [];

  const makeStuckPP = async (startedAt: number) => {
    const pp0 = await prisma.purchasePayment.create({
      data: {
        code: "TMP", userId: demo.id, method: "SEPAY", amount: P, status: "PENDING",
        snapshot: JSON.stringify({ lines: [{ variantId: variant.id, qty: 1, custom: {}, buyerInfo: demo.email, share: P }], promo: null }),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
    const pp = await prisma.purchasePayment.update({
      where: { id: pp0.id },
      data: {
        code: `MUAR${pp0.id}`, status: "PROCESSING",
        paidAt: new Date(startedAt), updatedAt: new Date(Date.now() - 15 * 60000),
        providerData: JSON.stringify({ receivedVnd: P, execution: [{ variantId: variant.id, ok: false, pending: true, startedAt }], creditedTotal: 0 }),
      },
    });
    createdPP.push(pp.id);
    return pp;
  };
  const balance = async () => (await prisma.user.findUnique({ where: { id: demo.id } }))!.balance;

  try {
    /* A) Đơn ĐÃ được tạo trước khi crash -> tiếp quản NHẬN LẠI, không tạo trùng */
    const startedA = Date.now();
    const preOrder: any = await createPremiumOrder({ user: demo as any, variantId: variant.id, quantity: 1, buyerInfo: demo.email, externalPaid: { method: "SEPAY", ref: "MUAR-A" } });
    createdOrders.push(preOrder.code);
    const ppA = await makeStuckPP(startedA);
    const balA = await balance();
    const rA = await settlePurchasePayment(ppA.id);
    const afterA = await prisma.purchasePayment.findUnique({ where: { id: ppA.id } });
    const codesA: string[] = afterA!.orderCodes ? JSON.parse(afterA!.orderCodes) : [];
    ok(rA.ok && afterA!.status === "EXECUTED", `A: phiên kẹt được chốt EXECUTED (${rA.reason})`);
    ok(codesA.length === 1 && codesA[0] === preOrder.code, `A: nhận lại đúng đơn đã tạo ${preOrder.code} (codes=${JSON.stringify(codesA)})`);
    ok((await prisma.premiumOrder.count({ where: { userId: demo.id, variantId: variant.id, code: { in: createdOrders } } })) === 1, "A: vẫn đúng 1 PremiumOrder — không tạo trùng");
    ok((await balance()) === balA, "A: ví không đổi (không bồi hoàn thừa)");

    /* B) Ý định pending nhưng đơn CHƯA từng được tạo -> chạy lại, đúng 1 đơn */
    const ppB = await makeStuckPP(Date.now() - 12 * 60000);
    const rB = await settlePurchasePayment(ppB.id);
    const afterB = await prisma.purchasePayment.findUnique({ where: { id: ppB.id } });
    const codesB: string[] = afterB!.orderCodes ? JSON.parse(afterB!.orderCodes) : [];
    if (codesB[0]) createdOrders.push(codesB[0]);
    const execB = parsePurchaseData(afterB!).execution?.[0];
    ok(rB.ok && afterB!.status === "EXECUTED" && codesB.length === 1, `B: chạy lại tạo đúng 1 đơn (${codesB[0] || "không có"})`);
    ok(execB && execB.ok === true && !execB.pending, "B: kết quả dòng đã chốt, không còn pending");
  } finally {
    for (const code of createdOrders) {
      const o = await prisma.premiumOrder.findUnique({ where: { code }, select: { id: true } });
      if (o) await prisma.premiumOrder.delete({ where: { id: o.id } }).catch(() => {});
    }
    await prisma.purchasePayment.deleteMany({ where: { id: { in: createdPP } } });
    await prisma.user.update({ where: { id: demo.id }, data: { balance: startBalance } });
  }
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAIL`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
