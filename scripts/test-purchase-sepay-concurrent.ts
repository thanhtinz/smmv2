/**
 * Full-audit 6750109 P2-02 — hai giao dịch SePay một phần tới ĐỒNG THỜI
 * cho cùng một phiên mua không được ghi đè số tiền đã nhận. Trước bản
 * vá receivedVnd nằm trong providerData JSON (đọc–cộng–ghi cả object)
 * nên hai lượt cùng đọc 0 và cùng ghi 50%. Nay cộng nguyên tử ở cột
 * receivedVnd của DB: tổng phải đúng 100% và phiên thực thi đúng 1 lần.
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
  await setSetting("sepay_secret", "test_concurrent_secret");
  let bank = await prisma.bankAccount.findFirst({ where: { active: true } });
  let bankCreated = false;
  if (!bank) {
    bank = await prisma.bankAccount.create({ data: { bankName: "Vietcombank", accountNumber: "9998887776", holder: "TEST SHOP", active: true } });
    bankCreated = true;
  }
  const pp: any = await createPurchasePayment({
    userId: demo.id, method: "SEPAY",
    lines: [{ variantId: variant.id, qty: 1, custom: {}, buyerInfo: demo.email }],
    promoCode: "",
  });
  const total = pp.amount as number;
  const half1 = Math.floor(total / 2);
  const half2 = total - half1;

  const [r1, r2] = await Promise.all([
    settlePurchasePayment(pp.id, { paidVnd: half1, finalIfUnderpaid: "wait" }),
    settlePurchasePayment(pp.id, { paidVnd: half2, finalIfUnderpaid: "wait" }),
  ]);
  const after = await prisma.purchasePayment.findUnique({ where: { id: pp.id } });
  const orders = await prisma.premiumOrder.count({ where: { purchasePaymentId: pp.id } });
  ok(after?.receivedVnd === total, `S1: tổng đã nhận đúng 100% (${after?.receivedVnd}/${total})`);
  ok(after?.status === "EXECUTED", `S2: phiên EXECUTED (r1=${r1.reason}, r2=${r2.reason})`);
  ok(orders === 1, "S3: đúng 1 đơn được tạo dù hai lượt cùng chạy");

  // Đối chứng tuần tự: trả 50% trước -> underpaid, phiên chờ; trả nốt -> EXECUTED
  const pp2: any = await createPurchasePayment({
    userId: demo.id, method: "SEPAY",
    lines: [{ variantId: variant.id, qty: 1, custom: {}, buyerInfo: demo.email }],
    promoCode: "",
  });
  const t2 = pp2.amount as number;
  const h1 = Math.floor(t2 / 2);
  const ra = await settlePurchasePayment(pp2.id, { paidVnd: h1, finalIfUnderpaid: "wait" });
  const mid = await prisma.purchasePayment.findUnique({ where: { id: pp2.id } });
  ok(ra.reason === "underpaid" && mid?.receivedVnd === h1 && mid?.status === "PENDING",
    `S4: trả một phần -> chờ, ghi đúng phần đã nhận (${mid?.receivedVnd}/${t2})`);
  const rb = await settlePurchasePayment(pp2.id, { paidVnd: t2 - h1, finalIfUnderpaid: "wait" });
  const end2 = await prisma.purchasePayment.findUnique({ where: { id: pp2.id } });
  ok(rb.ok && end2?.status === "EXECUTED" && end2?.receivedVnd === t2, "S5: trả nốt phần còn lại -> EXECUTED, tổng đúng");

  await setSetting("direct_sepay_enabled", prevDirect);
  await setSetting("sepay_secret", prevSecret);
  if (bankCreated) await prisma.bankAccount.delete({ where: { id: bank.id } }).catch(() => {});
  console.log(fails === 0 ? "ALL PASS" : `${fails} FAIL`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
