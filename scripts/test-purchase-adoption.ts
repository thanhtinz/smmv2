/**
 * Test tái-audit P2-01 (2026-11-14): recovery KHÔNG được nhận nhầm đơn của
 * phiên thanh toán khác.
 *   npx tsx scripts/test-purchase-adoption.ts   (chỉ cần DB local đã seed)
 * Trước bản vá: nhánh pending đối soát theo khách + gói + số lượng + cửa
 * sổ thời gian rồi nhận ĐƠN ĐẦU TIÊN khớp — hai phiên đồng thời cùng
 * khách/gói thì phiên chết trước có thể nhận đơn của phiên kia.
 * Sau bản vá: đơn do settle tạo mang khoá (purchasePaymentId, lineNo)
 * DUY NHẤT; recovery nhận lại theo đúng khoá; đường cửa sổ chỉ áp cho
 * đơn CHƯA có khoá (tạo trước đợt vá) và ghi khoá ngay khi nhận.
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
  const snap = () => JSON.stringify({ lines: [{ variantId: variant.id, qty: 1, custom: {}, buyerInfo: demo.email, share: P }], promo: null });

  const makePP = async (patch: Record<string, any>) => {
    const pp0 = await prisma.purchasePayment.create({
      data: {
        code: "TMP", userId: demo.id, method: "SEPAY", amount: P, status: "PENDING",
        snapshot: snap(), expiresAt: new Date(Date.now() + 30 * 60000),
      },
    });
    const pp = await prisma.purchasePayment.update({ where: { id: pp0.id }, data: { code: `MUAP${pp0.id}`, ...patch } });
    createdPP.push(pp.id);
    return pp;
  };
  const codesOf = async (id: number) => {
    const pp = await prisma.purchasePayment.findUnique({ where: { id } });
    return (pp!.orderCodes ? JSON.parse(pp!.orderCodes) : []) as string[];
  };

  try {
    /* C) Hai phiên đồng thời cùng khách/gói: B chạy trọn, A kẹt pending
       với startedAt TRONG cửa sổ — A tiếp quản phải tạo đơn RIÊNG của A,
       tuyệt đối không nhận đơn của B. */
    const ppB = await makePP({ providerData: JSON.stringify({ receivedVnd: P }) });
    const rB = await settlePurchasePayment(ppB.id);
    const codesB = await codesOf(ppB.id);
    ok(rB.ok && codesB.length === 1, `C: phiên B chốt xong với 1 đơn (${codesB[0] || "không có"})`);
    const orderB = codesB[0] ? await prisma.premiumOrder.findUnique({ where: { code: codesB[0] } }) : null;
    ok(!!orderB && orderB!.purchasePaymentId === ppB.id && orderB!.purchaseLineNo === 0, "C: đơn của B mang đúng khoá của B");

    const ppA = await makePP({
      status: "PROCESSING", paidAt: new Date(), updatedAt: new Date(Date.now() - 15 * 60000),
      providerData: JSON.stringify({ receivedVnd: P, execution: [{ variantId: variant.id, ok: false, pending: true, startedAt: Date.now() }], creditedTotal: 0 }),
    });
    const rA = await settlePurchasePayment(ppA.id);
    const codesA = await codesOf(ppA.id);
    ok(rA.ok && codesA.length === 1, `C: phiên A tiếp quản chốt xong với 1 đơn (${codesA[0] || "không có"})`);
    ok(codesA[0] !== codesB[0], "C: A có đơn RIÊNG — không nhận nhầm đơn của B");
    const orderA = codesA[0] ? await prisma.premiumOrder.findUnique({ where: { code: codesA[0] } }) : null;
    ok(!!orderA && orderA!.purchasePaymentId === ppA.id && orderA!.purchaseLineNo === 0, "C: đơn của A mang đúng khoá của A");
    ok((await prisma.premiumOrder.count({ where: { userId: demo.id, variantId: variant.id, purchasePaymentId: { in: [ppA.id, ppB.id] } } })) === 2, "C: tổng đúng 2 đơn cho 2 phiên");

    /* D) Nhận lại theo KHOÁ dù startedAt đã NGOÀI mọi cửa sổ thời gian:
       đơn tạo bởi chính phiên C (mang khoá C) trước khi tiến trình chết. */
    const ppC = await makePP({
      status: "PROCESSING", paidAt: new Date(Date.now() - 3 * 3600000), updatedAt: new Date(Date.now() - 15 * 60000),
      providerData: JSON.stringify({ receivedVnd: P, execution: [{ variantId: variant.id, ok: false, pending: true, startedAt: Date.now() - 3 * 3600000 }], creditedTotal: 0 }),
    });
    const preC: any = await createPremiumOrder({ user: demo as any, variantId: variant.id, quantity: 1, buyerInfo: demo.email, externalPaid: { method: "SEPAY", ref: ppC.code }, purchaseRef: { paymentId: ppC.id, lineNo: 0 } });
    const countBefore = await prisma.premiumOrder.count({ where: { userId: demo.id, variantId: variant.id } });
    const rC = await settlePurchasePayment(ppC.id);
    const codesC = await codesOf(ppC.id);
    ok(rC.ok && codesC.length === 1 && codesC[0] === preC.code, `D: tiếp quản nhận lại đúng đơn theo khoá (${preC.code})`);
    ok((await prisma.premiumOrder.count({ where: { userId: demo.id, variantId: variant.id } })) === countBefore, "D: không tạo thêm đơn nào");

    /* E) Khoá là DUY NHẤT: tạo đơn thứ hai cùng (paymentId, lineNo) phải lỗi. */
    let dupThrew = false;
    try {
      await createPremiumOrder({ user: demo as any, variantId: variant.id, quantity: 1, buyerInfo: demo.email, externalPaid: { method: "SEPAY", ref: ppC.code }, purchaseRef: { paymentId: ppC.id, lineNo: 0 } });
    } catch { dupThrew = true; }
    ok(dupThrew, "E: tạo trùng khoá bị chặn (unique constraint)");
    ok((await prisma.premiumOrder.count({ where: { purchasePaymentId: ppC.id, purchaseLineNo: 0 } })) === 1, "E: vẫn đúng 1 đơn cho khoá của C");
  } finally {
    await prisma.premiumOrder.deleteMany({ where: { purchasePaymentId: { in: createdPP } } });
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
