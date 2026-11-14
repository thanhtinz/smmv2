/**
 * Full-audit 3d1309c P2-05 — nhánh cập nhật thường của adminPremiumOrderAction
 * nay ghi bằng CAS lạc quan trên (status, updatedAt) đã đọc. Test mô phỏng
 * đúng trình tự đua: request A đọc đơn còn sống -> request B huỷ + hoàn
 * tiền -> request A ghi DELIVERED theo snapshot cũ: CAS phải trượt, đơn
 * giữ REFUNDED và chỉ có đúng một lần hoàn.
 */
import { prisma } from "../src/lib/db";
import { refundFzrPremiumOrder } from "../src/lib/fzr-orders";

let fails = 0;
function ok(cond: boolean, label: string) {
  console.log(`${cond ? "PASS" : "FAIL"} ${label}`);
  if (!cond) fails++;
}

async function main() {
  const stamp = Date.now().toString(36);
  const user = await prisma.user.create({
    data: {
      username: `cas${stamp}`, email: `cas${stamp}@t.local`, passwordHash: "x", balance: 0,
      apiKey: `caskey${stamp}`, depositCode: `CS${stamp}`.slice(0, 12).toUpperCase(), refCode: `RF${stamp}`.toUpperCase(),
    },
  });
  const cat = await prisma.premiumCategory.create({ data: { name: `CasCat ${stamp}`, slug: `cas-${stamp}` } });
  const product = await prisma.premiumProduct.create({ data: { name: `CasProd ${stamp}`, slug: `casp-${stamp}`, categoryId: cat.id } });
  const variant = await prisma.premiumVariant.create({ data: { productId: product.id, name: "Gói", price: 70000 } });
  const order = await prisma.premiumOrder.create({
    data: { code: `CAS${stamp}`.slice(0, 16).toUpperCase(), userId: user.id, variantId: variant.id, quantity: 1, total: 70000, status: "PENDING" },
  });

  // Request A đọc đơn (snapshot còn sống)
  const snapA = (await prisma.premiumOrder.findUnique({ where: { id: order.id } }))!;
  ok(snapA.status === "PENDING", "A1: snapshot A đọc đơn PENDING");

  // Request B huỷ đơn + hoàn tiền (claim nguyên tử dùng chung)
  const cancelled = await refundFzrPremiumOrder(snapA as any, "REFUNDED", "Admin huỷ đơn premium — hoàn tiền");
  const balAfterCancel = (await prisma.user.findUnique({ where: { id: user.id } }))!.balance;
  ok(cancelled && balAfterCancel === 70000, "A2: B huỷ thành công, hoàn 70.000");

  // Request A ghi theo snapshot cũ — đúng câu lệnh CAS của action hiện tại
  const cas = await prisma.premiumOrder.updateMany({
    where: { id: order.id, status: snapA.status, updatedAt: snapA.updatedAt },
    data: { status: "DELIVERED", deliveryData: "hồi sinh", adminNote: snapA.adminNote },
  });
  const after = (await prisma.premiumOrder.findUnique({ where: { id: order.id } }))!;
  ok(cas.count === 0, "A3: CAS của A trượt (count=0)");
  ok(after.status === "REFUNDED" && after.deliveryData !== "hồi sinh", "A4: đơn giữ REFUNDED, không bị hồi sinh");
  ok((await prisma.user.findUnique({ where: { id: user.id } }))!.balance === 70000, "A5: vẫn đúng một lần hoàn");

  // Đối chứng: CAS với snapshot tươi trên đơn đang sống phải ghi được
  const live = await prisma.premiumOrder.create({
    data: { code: `CS2${stamp}`.slice(0, 16).toUpperCase(), userId: user.id, variantId: variant.id, quantity: 1, total: 1000, status: "PENDING" },
  });
  const snapLive = (await prisma.premiumOrder.findUnique({ where: { id: live.id } }))!;
  const cas2 = await prisma.premiumOrder.updateMany({
    where: { id: live.id, status: snapLive.status, updatedAt: snapLive.updatedAt },
    data: { status: "DELIVERED", deliveryData: "key-123", adminNote: snapLive.adminNote },
  });
  ok(cas2.count === 1 && ((await prisma.premiumOrder.findUnique({ where: { id: live.id } }))!.status === "DELIVERED"), "A6: CAS snapshot tươi vẫn ghi bình thường");

  await prisma.premiumOrder.deleteMany({ where: { userId: user.id } });
  await prisma.transaction.deleteMany({ where: { userId: user.id } });
  await prisma.notification.deleteMany({ where: { userId: user.id } });
  await prisma.premiumVariant.delete({ where: { id: variant.id } });
  await prisma.premiumProduct.delete({ where: { id: product.id } });
  await prisma.premiumCategory.delete({ where: { id: cat.id } });
  await prisma.user.delete({ where: { id: user.id } }).catch(() => {});

  console.log(fails === 0 ? "ALL PASS" : `${fails} FAIL`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
