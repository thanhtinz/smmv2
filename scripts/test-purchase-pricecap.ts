/**
 * Test tái-audit P2-02 (2026-11-14): race tăng giá giữa kiểm tra giá và
 * tạo đơn.
 *   npx tsx scripts/test-purchase-pricecap.ts   (chỉ cần DB local đã seed)
 * Trước bản vá: settle tính lại giá ở một bước riêng rồi mới gọi
 * createPremiumOrder (hàm này tính LẠI theo dữ liệu mới) — giá đổi đúng
 * cửa sổ giữa hai bước thì đơn vẫn chốt EXECUTED theo giá mới cao hơn
 * phần đã thu, code chỉ cảnh báo admin.
 * Sau bản vá: settle truyền maxTotal = phần đã thu của dòng;
 * createPremiumOrder tự chốt trần bằng tổng thực thi cuối của chính nó
 * TRƯỚC mọi tác dụng phụ + đọc lại giá gốc trong transaction tạo đơn —
 * vượt trần là huỷ, dòng rơi vào bồi hoàn ví như ca giá tăng thường.
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
  const variant0 = await prisma.premiumVariant.findFirst({
    where: { product: { slug: "youtube-premium" }, active: true },
    orderBy: { price: "asc" },
  });
  if (!variant0) throw new Error("Thiếu variant youtube-premium trong seed");
  const P = variant0.price;
  const startBalance = demo.balance;
  const FAKE_PP = 990000001;
  const createdPP: number[] = [];
  const balance = async () => (await prisma.user.findUnique({ where: { id: demo.id } }))!.balance;
  const stockQty = async () => (await prisma.premiumVariant.findUnique({ where: { id: variant0.id } }))!.stockQty;

  try {
    /* A) Trần = giá hiện tại: tạo đơn bình thường, tổng đúng P */
    const oA: any = await createPremiumOrder({ user: demo as any, variantId: variant0.id, quantity: 1, buyerInfo: demo.email, externalPaid: { method: "SEPAY", ref: "CAP-A" }, purchaseRef: { paymentId: FAKE_PP, lineNo: 0 }, maxTotal: P });
    ok(oA && oA.total === P, `A: tạo đơn với trần = giá hiện tại thành công (tổng ${oA?.total})`);

    /* B) Giá tăng SAU khi đã chốt trần: createPremiumOrder phải TỰ chặn,
       không đơn, không trừ kho */
    const stockBefore = await stockQty();
    await prisma.premiumVariant.update({ where: { id: variant0.id }, data: { price: P + 50000 } });
    let threw = false;
    try {
      await createPremiumOrder({ user: demo as any, variantId: variant0.id, quantity: 1, buyerInfo: demo.email, externalPaid: { method: "SEPAY", ref: "CAP-B" }, purchaseRef: { paymentId: FAKE_PP, lineNo: 1 }, maxTotal: P });
    } catch { threw = true; }
    ok(threw, "B: giá tăng vượt trần -> createPremiumOrder ném lỗi");
    ok((await prisma.premiumOrder.count({ where: { purchasePaymentId: FAKE_PP, purchaseLineNo: 1 } })) === 0, "B: không có đơn nào được tạo");
    ok((await stockQty()) === stockBefore, "B: kho không bị trừ");

    /* C) Qua đường settle với giá đã tăng: dòng bị chặn, bồi hoàn ví đủ P,
       không đơn — đúng ngữ nghĩa ca giá tăng của P1-02 nhưng nay do trần
       trong createPremiumOrder chốt (không phụ thuộc bước kiểm riêng) */
    const pp0 = await prisma.purchasePayment.create({
      data: {
        code: "TMP", userId: demo.id, method: "SEPAY", amount: P, status: "PENDING",
        snapshot: JSON.stringify({ lines: [{ variantId: variant0.id, qty: 1, custom: {}, buyerInfo: demo.email, share: P }], promo: null }),
        providerData: JSON.stringify({ receivedVnd: P }),
        expiresAt: new Date(Date.now() + 30 * 60000),
      },
    });
    const pp = await prisma.purchasePayment.update({ where: { id: pp0.id }, data: { code: `MUAC${pp0.id}` } });
    createdPP.push(pp.id);
    const balC = await balance();
    const rC = await settlePurchasePayment(pp.id);
    const afterC = await prisma.purchasePayment.findUnique({ where: { id: pp.id } });
    const execC = parsePurchaseData(afterC!).execution?.[0];
    ok(rC.ok && afterC!.status === "EXECUTED", "C: phiên chốt EXECUTED");
    ok(!!execC && execC.ok === false && execC.credited === P, "C: dòng bị chặn và ghi bồi hoàn đúng P");
    ok((await balance()) === balC + P, "C: ví được cộng đúng phần đã thu P");
    ok((await prisma.premiumOrder.count({ where: { purchasePaymentId: pp.id } })) === 0, "C: không đơn nào sinh ra từ phiên này");

    /* D) Trả giá về cũ: settle chạy bình thường, đơn tổng đúng P */
    await prisma.premiumVariant.update({ where: { id: variant0.id }, data: { price: P } });
    const ppD0 = await prisma.purchasePayment.create({
      data: {
        code: "TMP", userId: demo.id, method: "SEPAY", amount: P, status: "PENDING",
        snapshot: JSON.stringify({ lines: [{ variantId: variant0.id, qty: 1, custom: {}, buyerInfo: demo.email, share: P }], promo: null }),
        providerData: JSON.stringify({ receivedVnd: P }),
        expiresAt: new Date(Date.now() + 30 * 60000),
      },
    });
    const ppD = await prisma.purchasePayment.update({ where: { id: ppD0.id }, data: { code: `MUAD${ppD0.id}` } });
    createdPP.push(ppD.id);
    const rD = await settlePurchasePayment(ppD.id);
    const codesD: string[] = JSON.parse((await prisma.purchasePayment.findUnique({ where: { id: ppD.id } }))!.orderCodes || "[]");
    const orderD = codesD[0] ? await prisma.premiumOrder.findUnique({ where: { code: codesD[0] } }) : null;
    ok(rD.ok && !!orderD && orderD!.total === P && orderD!.purchasePaymentId === ppD.id, "D: giá ổn định -> đơn tạo bình thường, tổng đúng P, mang khoá phiên");
  } finally {
    await prisma.premiumOrder.deleteMany({ where: { purchasePaymentId: { in: [FAKE_PP, ...createdPP] } } });
    await prisma.purchasePayment.deleteMany({ where: { id: { in: createdPP } } });
    await prisma.premiumVariant.update({ where: { id: variant0.id }, data: { price: P } });
    await prisma.user.update({ where: { id: demo.id }, data: { balance: startBalance } });
  }
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAIL`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
