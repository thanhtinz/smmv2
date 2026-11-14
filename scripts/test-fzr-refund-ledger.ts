/**
 * Full-audit 3d1309c P2-01 — sổ hoàn tiền theo đơn (refundedAmount):
 * đơn FZR nhiều lượt được hoàn MỘT PHẦN ở bước thực thi, sau đó bị hoàn
 * toàn bộ qua refundFzrPremiumOrder (đường poll/admin dùng chung) thì
 * tổng REFUND không được vượt total của đơn.
 */
import { prisma } from "../src/lib/db";
import { creditOrderRefund, refundableOf } from "../src/lib/refund-ledger";
import { refundFzrPremiumOrder } from "../src/lib/fzr-orders";

let fails = 0;
function ok(cond: boolean, label: string) {
  console.log(`${cond ? "PASS" : "FAIL"} ${label}`);
  if (!cond) fails++;
}

async function main() {
  const stamp = Date.now().toString(36);
  const user = await prisma.user.create({
    data: { username: `led${stamp}`, email: `led${stamp}@t.local`, passwordHash: "x", balance: 0, apiKey: `ledkey${stamp}`, depositCode: `LD${stamp}`.slice(0, 12).toUpperCase(), refCode: `RF${stamp}`.toUpperCase() },
  });
  const cat = await prisma.premiumCategory.create({ data: { name: `LedCat ${stamp}`, slug: `led-${stamp}` } });
  const product = await prisma.premiumProduct.create({
    data: { name: `LedProd ${stamp}`, slug: `ledp-${stamp}`, categoryId: cat.id },
  });
  const variant = await prisma.premiumVariant.create({
    data: { productId: product.id, name: "Gói 2 lượt", price: 50000 },
  });
  const mkOrder = (code: string, qty: number, total: number) =>
    prisma.premiumOrder.create({
      data: { code, userId: user.id, variantId: variant.id, quantity: qty, total, status: "PENDING" },
    });
  const bal = async () => (await prisma.user.findUnique({ where: { id: user.id } }))!.balance;
  const refundSum = async (code: string) => {
    const rows = await prisma.transaction.findMany({ where: { userId: user.id, type: "REFUND", ref: code } });
    return rows.reduce((a, t) => a + t.amount, 0);
  };

  // Đơn A: qty 2, total 100.000 — hoàn một phần 50.000 (1 lượt) trước
  const a = await mkOrder(`LED${stamp}A`.slice(0, 16), 2, 100000);
  let creditedA = 0;
  await prisma.$transaction(async (tx) => {
    creditedA = await creditOrderRefund(tx, a, 50000, { reason: "Hoàn 1 lượt không thực thi được", units: 1 });
  });
  ok(creditedA === 50000 && (await bal()) === 50000, "A1: hoàn một phần cộng đúng 50.000");
  let freshA = (await prisma.premiumOrder.findUnique({ where: { id: a.id } }))!;
  ok(freshA.refundedAmount === 50000 && freshA.refundedUnits === 1 && refundableOf(freshA) === 50000, "A2: sổ ghi 50.000/1 lượt, còn hoàn được 50.000");

  // Sau đó provider báo huỷ toàn bộ -> refundFzrPremiumOrder chỉ hoàn nốt 50.000
  const claimed = await refundFzrPremiumOrder(freshA, "REFUNDED", "Nhà cung cấp báo huỷ/hoàn đơn");
  freshA = (await prisma.premiumOrder.findUnique({ where: { id: a.id } }))!;
  ok(claimed && freshA.status === "REFUNDED", "A3: đơn chuyển REFUNDED");
  ok((await bal()) === 100000, "A4: tổng cộng ví đúng 100.000 (không vượt total)");
  ok((await refundSum(freshA.code)) === 100000 && freshA.refundedAmount === 100000, "A5: tổng REFUND = total, sổ khớp");

  // Hoàn lần nữa: claim trượt, không cộng thêm
  const again = await refundFzrPremiumOrder(freshA, "REFUNDED", "lặp");
  ok(!again && (await bal()) === 100000, "A6: hoàn lặp không cộng thêm đồng nào");

  // Đơn B: không hoàn một phần trước -> hoàn đủ total
  const b = await mkOrder(`LED${stamp}B`.slice(0, 16), 1, 30000);
  const beforeB = await bal();
  await refundFzrPremiumOrder(b as any, "CANCELED", "huỷ");
  ok((await bal()) - beforeB === 30000, "B1: đơn chưa hoàn phần nào -> hoàn đủ 30.000");

  // Đơn C: xin hoàn vượt phần còn lại -> bị chặn ở total
  const c = await mkOrder(`LED${stamp}C`.slice(0, 16), 1, 20000);
  let creditedC = 0;
  await prisma.$transaction(async (tx) => {
    creditedC = await creditOrderRefund(tx, c, 999999, { reason: "xin vượt" });
  });
  ok(creditedC === 20000, "C1: creditOrderRefund chặn ở total của đơn");

  await prisma.premiumOrder.deleteMany({ where: { userId: user.id } });
  await prisma.transaction.deleteMany({ where: { userId: user.id } });
  await prisma.notification.deleteMany({ where: { userId: user.id } });
  await prisma.premiumVariant.delete({ where: { id: variant.id } });
  await prisma.premiumProduct.delete({ where: { id: product.id } });
  await prisma.premiumCategory.delete({ where: { id: cat.id } });
  await prisma.user.delete({ where: { id: user.id } });

  console.log(fails === 0 ? "ALL PASS" : `${fails} FAIL`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
