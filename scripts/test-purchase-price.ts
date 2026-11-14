/**
 * Test hồi quy audit đợt 2 P1-02: thanh toán trực tiếp LỆCH GIÁ.
 *   npx tsx scripts/test-purchase-price.ts   (chỉ cần DB local đã seed)
 * Trước bản vá: settlePurchasePayment chỉ hoàn khi giá GIẢM (diff > 0);
 * giá TĂNG sau lúc khách trả (tăng giá gói / flash sale kết thúc) thì
 * diff < 0 bị bỏ qua — shop vẫn giao đơn theo giá mới, lỗ phần chênh.
 * Sau bản vá: mỗi dòng được tính lại bằng computeCartPayable trước khi
 * tạo đơn; tổng thực thi > phần đã thu của dòng -> KHÔNG tạo đơn, bồi
 * hoàn toàn bộ phần tiền của dòng vào ví khách.
 */
import { prisma } from "../src/lib/db";
import { settlePurchasePayment, parsePurchaseData } from "../src/lib/purchase";

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

  const makePP = async (share: number) => {
    const pp0 = await prisma.purchasePayment.create({
      data: {
        code: "TMP",
        userId: demo.id, method: "SEPAY", amount: share, status: "PENDING",
        snapshot: JSON.stringify({ lines: [{ variantId: variant.id, qty: 1, custom: {}, buyerInfo: demo.email, share }], promo: null }),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
    const pp = await prisma.purchasePayment.update({ where: { id: pp0.id }, data: { code: `MUATP${pp0.id}` } });
    createdPP.push(pp.id);
    return pp;
  };
  const balance = async () => (await prisma.user.findUnique({ where: { id: demo.id } }))!.balance;

  try {
    /* 1) Giá TĂNG sau khi trả -> không tạo đơn, bồi hoàn đủ phần của dòng */
    const pp1 = await makePP(P);
    await prisma.premiumVariant.update({ where: { id: variant.id }, data: { price: P + 50000 } });
    const bal1 = await balance();
    const r1 = await settlePurchasePayment(pp1.id, { paidVnd: P });
    const after1 = await prisma.purchasePayment.findUnique({ where: { id: pp1.id } });
    const exec1 = parsePurchaseData(after1!).execution?.[0];
    ok(r1.ok && after1!.status === "EXECUTED", `giá tăng: phiên chốt EXECUTED (${r1.reason})`);
    ok(!after1!.orderCodes || JSON.parse(after1!.orderCodes).length === 0, "giá tăng: KHÔNG tạo đơn nào");
    ok(exec1 && exec1.ok === false && String(exec1.error || "").includes("Giá gói đã tăng"), `giá tăng: dòng ghi lỗi lệch giá (${exec1?.error || "—"})`);
    ok((await balance()) === bal1 + P, `giá tăng: ví được bồi hoàn đủ ${P.toLocaleString("vi-VN")}đ`);

    /* 2) Giá GIỮ NGUYÊN -> tạo đơn bình thường, ví không đổi */
    await prisma.premiumVariant.update({ where: { id: variant.id }, data: { price: P } });
    const pp2 = await makePP(P);
    const bal2 = await balance();
    const r2 = await settlePurchasePayment(pp2.id, { paidVnd: P });
    const after2 = await prisma.purchasePayment.findUnique({ where: { id: pp2.id } });
    const codes2 = after2!.orderCodes ? JSON.parse(after2!.orderCodes) : [];
    if (codes2[0]) createdOrders.push(codes2[0]);
    ok(r2.ok && codes2.length === 1, `giá nguyên: tạo đúng 1 đơn (${codes2[0] || "không có"})`);
    ok((await balance()) === bal2, "giá nguyên: ví không đổi");

    /* 3) Giá GIẢM -> tạo đơn + hoàn phần chênh lệch vào ví */
    const pp3 = await makePP(P);
    await prisma.premiumVariant.update({ where: { id: variant.id }, data: { price: P - 20000 } });
    const bal3 = await balance();
    const r3 = await settlePurchasePayment(pp3.id, { paidVnd: P });
    const after3 = await prisma.purchasePayment.findUnique({ where: { id: pp3.id } });
    const codes3 = after3!.orderCodes ? JSON.parse(after3!.orderCodes) : [];
    if (codes3[0]) createdOrders.push(codes3[0]);
    ok(r3.ok && codes3.length === 1, "giá giảm: vẫn tạo đơn");
    ok((await balance()) === bal3 + 20000, "giá giảm: ví được hoàn đúng chênh lệch 20.000đ");
  } finally {
    await prisma.premiumVariant.update({ where: { id: variant.id }, data: { price: P } });
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
