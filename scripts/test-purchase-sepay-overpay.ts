/**
 * Full-audit a75d260 P2-03 — tiền thừa khi hai webhook SePay tới đồng
 * thời không còn bị mất: mỗi giao dịch ghi nhận theo txRef (cộng đúng
 * một lần), phần vượt amount được sweep hoàn vào ví đúng một lần bằng
 * CAS trên excessCreditedVnd — bất kể lượt nào thắng claim thực thi.
 * Kịch bản theo đúng báo cáo: 100% + 100% và 60% + 60% đồng thời,
 * cộng retry cùng txRef.
 */
import { prisma } from "../src/lib/db";
import { createPurchasePayment, settlePurchasePayment } from "../src/lib/purchase";
import { getSettings, setSetting } from "../src/lib/settings";

let fails = 0;
function ok(cond: boolean, label: string) {
  console.log(`${cond ? "PASS" : "FAIL"} ${label}`);
  if (!cond) fails++;
}

async function main() {
  const demo = await prisma.user.findUnique({ where: { username: "demo" } });
  if (!demo) throw new Error("Chưa seed demo user");
  const variant = await prisma.premiumVariant.findFirst({
    where: { product: { slug: "youtube-premium" }, active: true },
    orderBy: { price: "asc" },
  });
  if (!variant) throw new Error("Thiếu variant youtube-premium trong seed");
  const s0 = await getSettings();
  const prevDirect = s0.direct_sepay_enabled || "";
  const prevSecret = s0.sepay_secret || "";
  await setSetting("direct_sepay_enabled", "1");
  await setSetting("sepay_secret", "test_overpay_secret");
  let bank = await prisma.bankAccount.findFirst({ where: { active: true } });
  let bankCreated = false;
  if (!bank) {
    bank = await prisma.bankAccount.create({ data: { bankName: "Vietcombank", accountNumber: "9998887775", holder: "TEST SHOP", active: true } });
    bankCreated = true;
  }
  const bal = async () => (await prisma.user.findUnique({ where: { id: demo.id } }))!.balance;
  const mk = async () => createPurchasePayment({
    userId: demo.id, method: "SEPAY",
    lines: [{ variantId: variant.id, qty: 1, custom: {}, buyerInfo: demo.email }],
    promoCode: "",
  }) as any;

  // S1: 100% + 100% đồng thời
  {
    const pp = await mk();
    const A = pp.amount as number;
    const b0 = await bal();
    await Promise.all([
      settlePurchasePayment(pp.id, { paidVnd: A, paidTxRef: `ov1-${pp.id}-a`, finalIfUnderpaid: "wait" }),
      settlePurchasePayment(pp.id, { paidVnd: A, paidTxRef: `ov1-${pp.id}-b`, finalIfUnderpaid: "wait" }),
    ]);
    const after = await prisma.purchasePayment.findUnique({ where: { id: pp.id } });
    const orders = await prisma.premiumOrder.count({ where: { purchasePaymentId: pp.id } });
    ok(after?.status === "EXECUTED" && orders === 1, "S1a: phiên EXECUTED, đúng 1 đơn");
    ok(after?.receivedVnd === 2 * A && after?.excessCreditedVnd === A,
      `S1b: sổ nhận 2x (${after?.receivedVnd}), thừa đã hoàn 1x (${after?.excessCreditedVnd})`);
    ok((await bal()) - b0 === A, `S1c: ví +${A} đúng phần thừa một lần (delta ${(await bal()) - b0})`);
  }

  // S2: 60% + 60% đồng thời
  {
    const pp = await mk();
    const A = pp.amount as number;
    const p1 = Math.round(A * 0.6);
    const p2 = Math.round(A * 0.6);
    const expectExcess = p1 + p2 - A;
    const b0 = await bal();
    await Promise.all([
      settlePurchasePayment(pp.id, { paidVnd: p1, paidTxRef: `ov2-${pp.id}-a`, finalIfUnderpaid: "wait" }),
      settlePurchasePayment(pp.id, { paidVnd: p2, paidTxRef: `ov2-${pp.id}-b`, finalIfUnderpaid: "wait" }),
    ]);
    const after = await prisma.purchasePayment.findUnique({ where: { id: pp.id } });
    ok(after?.status === "EXECUTED" && after?.excessCreditedVnd === expectExcess && (await bal()) - b0 === expectExcess,
      `S2: 60+60 -> thừa ${expectExcess} hoàn đúng một lần (sổ ${after?.excessCreditedVnd}, ví ${(await bal()) - b0})`);
  }

  // S3: retry cùng txRef không cộng trùng; txRef khác cộng tiếp
  {
    const pp = await mk();
    const A = pp.amount as number;
    const half = Math.floor(A / 2);
    await settlePurchasePayment(pp.id, { paidVnd: half, paidTxRef: `ov3-${pp.id}-a`, finalIfUnderpaid: "wait" });
    await settlePurchasePayment(pp.id, { paidVnd: half, paidTxRef: `ov3-${pp.id}-a`, finalIfUnderpaid: "wait" });
    let after = await prisma.purchasePayment.findUnique({ where: { id: pp.id } });
    ok(after?.receivedVnd === half && after?.status === "PENDING",
      `S3a: retry cùng txRef -> vẫn ghi ${half} (đang ${after?.receivedVnd})`);
    await settlePurchasePayment(pp.id, { paidVnd: A - half, paidTxRef: `ov3-${pp.id}-b`, finalIfUnderpaid: "wait" });
    after = await prisma.purchasePayment.findUnique({ where: { id: pp.id } });
    ok(after?.status === "EXECUTED" && after?.receivedVnd === A && after?.excessCreditedVnd === 0,
      "S3b: txRef khác cộng tiếp -> đủ tiền, EXECUTED, không thừa");
  }

  await setSetting("direct_sepay_enabled", prevDirect);
  await setSetting("sepay_secret", prevSecret);
  if (bankCreated) await prisma.bankAccount.delete({ where: { id: bank.id } }).catch(() => {});
  console.log(fails === 0 ? "ALL PASS" : `${fails} FAIL`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
