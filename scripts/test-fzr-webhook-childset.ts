/**
 * Full-audit 6750109 P2-01 — trạng thái của MỘT đơn con không được chốt
 * tổng cho đơn cha nhiều lượt. applyFzrOrderStatus phải bỏ qua bộ trạng
 * thái thiếu số lượng so với providerOrderId của đơn (webhook fallback
 * cũ truyền đúng bộ thiếu này); chỉ bộ đủ mới được áp.
 */
import { prisma } from "../src/lib/db";
import { applyFzrOrderStatus } from "../src/lib/fzr-orders";

let fails = 0;
function ok(cond: boolean, label: string) {
  console.log(`${cond ? "PASS" : "FAIL"} ${label}`);
  if (!cond) fails++;
}

const RAW_DONE = { status: "completed", cards: [{ code: "KEY-CHILD-1" }] };
const RAW_DEAD = { status: "cancelled" };

async function main() {
  const stamp = Date.now().toString(36);
  const user = await prisma.user.create({
    data: {
      username: `wch${stamp}`, email: `wch${stamp}@t.local`, passwordHash: "x", balance: 0,
      apiKey: `wchkey${stamp}`, depositCode: `WC${stamp}`.slice(0, 12).toUpperCase(), refCode: `RF${stamp}`.toUpperCase(),
    },
  });
  const cat = await prisma.premiumCategory.create({ data: { name: `WchCat ${stamp}`, slug: `wch-${stamp}` } });
  const product = await prisma.premiumProduct.create({ data: { name: `WchProd ${stamp}`, slug: `wchp-${stamp}`, categoryId: cat.id } });
  const variant = await prisma.premiumVariant.create({ data: { productId: product.id, name: "Gói", price: 30000 } });
  const order = await prisma.premiumOrder.create({
    data: {
      code: `WCH${stamp}`.slice(0, 16).toUpperCase(), userId: user.id, variantId: variant.id,
      quantity: 3, total: 90000, status: "PENDING", providerOrderId: "fzr-a,fzr-b,fzr-c",
    },
  });
  const get = async () => (await prisma.premiumOrder.findUnique({ where: { id: order.id } }))!;
  const bal = async () => (await prisma.user.findUnique({ where: { id: user.id } }))!.balance;

  // 1) Webhook completed cho 1 child (bộ thiếu) -> không DELIVERED
  await applyFzrOrderStatus(order as any, ["completed"], [RAW_DONE], { fromWebhook: true });
  let o = await get();
  ok(o.status === "PENDING" && !o.deliveryData, "W1: 1 child completed -> đơn cha giữ PENDING, không giao giả");

  // 2) Webhook cancelled cho 1 child (bộ thiếu) -> không REFUNDED, không hoàn tiền
  await applyFzrOrderStatus(order as any, ["cancelled"], [RAW_DEAD], { fromWebhook: true });
  o = await get();
  ok(o.status === "PENDING" && (await bal()) === 0 && o.refundedAmount === 0, "W2: 1 child cancelled -> không hoàn toàn bộ");

  // 3) Bộ 2/3 vẫn thiếu -> vẫn không chốt
  await applyFzrOrderStatus(order as any, ["completed", "completed"], [RAW_DONE, RAW_DONE], { fromWebhook: true });
  o = await get();
  ok(o.status === "PENDING", "W3: bộ 2/3 trạng thái -> vẫn chờ đủ");

  // 4) Bộ đủ 3/3 completed -> DELIVERED bình thường
  await applyFzrOrderStatus(order as any, ["completed", "completed", "completed"], [RAW_DONE, RAW_DONE, RAW_DONE], { fromWebhook: true });
  o = await get();
  ok(o.status === "DELIVERED" && (o.deliveryData || "").includes("KEY-CHILD-1"), "W4: đủ 3/3 completed -> DELIVERED");

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
