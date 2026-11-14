/**
 * Full-audit 3d1309c P2-02 — applyFzrOrderStatus với trạng thái TRỘN ở
 * mức lượt: [completed, cancelled] không được chốt DELIVERED; phải sang
 * PARTIAL, giữ nội dung phần completed và hoàn phần lượt bị huỷ theo sổ.
 */
import { prisma } from "../src/lib/db";
import { applyFzrOrderStatus } from "../src/lib/fzr-orders";

let fails = 0;
function ok(cond: boolean, label: string) {
  console.log(`${cond ? "PASS" : "FAIL"} ${label}`);
  if (!cond) fails++;
}

const RAW_DONE = { status: "completed", cards: [{ code: "KEY-ALPHA-1" }] };
const RAW_DEAD = { status: "cancelled" };
const RAW_DEAD_R = { status: "refunded" };
const RAW_BUSY = { status: "processing" };
const RAW_PART = { status: "partial", cards: [{ code: "KEY-PART-1" }] };

async function main() {
  const stamp = Date.now().toString(36);
  const user = await prisma.user.create({
    data: {
      username: `mix${stamp}`, email: `mix${stamp}@t.local`, passwordHash: "x", balance: 0,
      apiKey: `mixkey${stamp}`, depositCode: `MX${stamp}`.slice(0, 12).toUpperCase(), refCode: `RF${stamp}`.toUpperCase(),
    },
  });
  const cat = await prisma.premiumCategory.create({ data: { name: `MixCat ${stamp}`, slug: `mix-${stamp}` } });
  const product = await prisma.premiumProduct.create({ data: { name: `MixProd ${stamp}`, slug: `mixp-${stamp}`, categoryId: cat.id } });
  const variant = await prisma.premiumVariant.create({ data: { productId: product.id, name: "Gói", price: 45000 } });
  let seq = 0;
  const mk = async (qty: number, total: number) => {
    seq += 1;
    return prisma.premiumOrder.create({
      data: { code: `MIX${stamp}${seq}`.slice(0, 16).toUpperCase(), userId: user.id, variantId: variant.id, quantity: qty, total, status: "PENDING" },
    });
  };
  const bal = async () => (await prisma.user.findUnique({ where: { id: user.id } }))!.balance;
  const get = async (id: number) => (await prisma.premiumOrder.findUnique({ where: { id } }))!;

  // S1: [completed, cancelled] -> PARTIAL + hoàn 1/2
  const s1 = await mk(2, 90000);
  await applyFzrOrderStatus(s1 as any, ["completed", "cancelled"], [RAW_DONE, RAW_DEAD]);
  let o = await get(s1.id);
  ok(o.status === "PARTIAL", "S1a: mixed completed+cancelled -> PARTIAL (không DELIVERED)");
  ok(!!o.deliveryData && o.deliveryData.includes("KEY-ALPHA-1"), "S1b: giữ nội dung phần completed");
  ok(o.refundedAmount === 45000 && (await bal()) === 45000, "S1c: hoàn đúng phần lượt huỷ 45.000");
  await applyFzrOrderStatus(o as any, ["completed", "cancelled"], [RAW_DONE, RAW_DEAD]);
  o = await get(s1.id);
  ok(o.refundedAmount === 45000 && (await bal()) === 45000, "S1d: poll lặp không hoàn thêm");

  // S2: [completed, refunded] -> PARTIAL + hoàn 1/2
  const s2 = await mk(2, 90000);
  const b2 = await bal();
  await applyFzrOrderStatus(s2 as any, ["completed", "refunded"], [RAW_DONE, RAW_DEAD_R]);
  o = await get(s2.id);
  ok(o.status === "PARTIAL" && o.refundedAmount === 45000 && (await bal()) - b2 === 45000, "S2: completed+refunded -> PARTIAL + hoàn 45.000");

  // S3: [completed, processing] -> PARTIAL, chưa hoàn
  const s3 = await mk(2, 90000);
  const b3 = await bal();
  await applyFzrOrderStatus(s3 as any, ["completed", "processing"], [RAW_DONE, RAW_BUSY]);
  o = await get(s3.id);
  ok(o.status === "PARTIAL" && o.refundedAmount === 0 && (await bal()) === b3, "S3: completed+processing -> PARTIAL, không hoàn, không DELIVERED");
  // ...rồi lượt còn lại cũng completed -> DELIVERED
  await applyFzrOrderStatus(o as any, ["completed", "completed"], [RAW_DONE, RAW_DONE]);
  o = await get(s3.id);
  ok(o.status === "DELIVERED", "S3b: đủ completed ở lượt sau -> DELIVERED");

  // S4: [completed, partial] -> PARTIAL theo nhánh partial sẵn có, không hoàn tự động
  const s4 = await mk(2, 90000);
  const b4 = await bal();
  await applyFzrOrderStatus(s4 as any, ["completed", "partial"], [RAW_DONE, RAW_PART]);
  o = await get(s4.id);
  ok(o.status === "PARTIAL" && o.refundedAmount === 0 && (await bal()) === b4, "S4: completed+partial -> PARTIAL, không tự hoàn");

  // S5: [completed, completed] -> DELIVERED như cũ
  const s5 = await mk(2, 90000);
  await applyFzrOrderStatus(s5 as any, ["completed", "completed"], [RAW_DONE, RAW_DONE]);
  o = await get(s5.id);
  ok(o.status === "DELIVERED" && o.refundedAmount === 0, "S5: all completed -> DELIVERED");

  // S6: qty 3, [completed, cancelled, completed] -> hoàn đúng 1/3
  const s6 = await mk(3, 90000);
  const b6 = await bal();
  await applyFzrOrderStatus(s6 as any, ["completed", "cancelled", "completed"], [RAW_DONE, RAW_DEAD, RAW_DONE]);
  o = await get(s6.id);
  ok(o.status === "PARTIAL" && o.refundedAmount === 30000 && (await bal()) - b6 === 30000, "S6: 1/3 lượt huỷ -> hoàn 30.000");

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
