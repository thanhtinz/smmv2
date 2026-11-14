/**
 * Test hồi quy full-audit 3d1309c P2-03: receipt SePay PUR:<txId> bị mồ
 * côi khi process chết sau claim nhưng trước settle.
 *   npx tsx scripts/test-sepay-purchase-orphan.ts   (cần server :3000 + DB seed)
 * Trước bản vá: claim cũ chặn vĩnh viễn mọi retry ("duplicate purchase
 * tx"), phiên đã nhận tiền kẹt PENDING không đường cứu.
 * Sau bản vá: claim quá lease 10 phút + phiên chưa chốt -> retry tiếp
 * quản bằng CAS và settle chạy; claim còn tươi vẫn chặn trùng; phiên đã
 * EXECUTED thì claim quá hạn cũng không được tiếp quản.
 */
import { prisma } from "../src/lib/db";
import { getSettings, setSetting } from "../src/lib/settings";
import { createPurchasePayment } from "../src/lib/purchase";

const BASE = "http://127.0.0.1:3000";
const SECRET = "test_orphan_secret";
let failures = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
};

async function sepayHook(txId: string, amount: number, code: string) {
  const r = await fetch(`${BASE}/api/webhooks/sepay`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Apikey ${SECRET}` },
    body: JSON.stringify({ id: txId, gateway: "Vietcombank", transferType: "in", transferAmount: amount, content: `CK ${code} CAM ON` }),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) as any };
}

const ageReceipt = (txId: string, minutes: number) =>
  prisma.webhookReceipt.update({ where: { ref: `PUR:${txId}` }, data: { createdAt: new Date(Date.now() - minutes * 60000) } });

async function main() {
  const demo = await prisma.user.findUnique({ where: { username: "demo" } });
  if (!demo) throw new Error("Chưa seed demo user");
  const variant = await prisma.premiumVariant.findFirst({
    where: { product: { slug: "youtube-premium" }, active: true },
    orderBy: { price: "asc" },
  });
  if (!variant) throw new Error("Thiếu variant youtube-premium trong seed");
  const s0 = await getSettings();
  const prevSecret = s0.sepay_secret || "";
  const prevDirect = s0.direct_sepay_enabled || "";
  let bank = await prisma.bankAccount.findFirst({ where: { active: true } });
  let bankCreated = false;
  if (!bank) {
    bank = await prisma.bankAccount.create({ data: { bankName: "Vietcombank", accountNumber: "9998887776", holder: "TEST SHOP", active: true } });
    bankCreated = true;
  }
  await setSetting("sepay_secret", SECRET);
  await setSetting("direct_sepay_enabled", "1");

  const mkSession = () => createPurchasePayment({
    userId: demo.id, method: "SEPAY",
    lines: [{ variantId: variant.id, qty: 1, custom: {}, buyerInfo: demo.email }],
    promoCode: "",
  }) as Promise<any>;

  try {
    // 1) Claim mồ côi (11 phút) + phiên PENDING -> retry tiếp quản + settle
    const pp1: any = await mkSession();
    const TX1 = "TXORPH-0001";
    await prisma.webhookReceipt.create({ data: { ref: `PUR:${TX1}` } });
    await ageReceipt(TX1, 11);
    const r1 = await sepayHook(TX1, pp1.amount, pp1.code);
    const after1 = await prisma.purchasePayment.findUnique({ where: { id: pp1.id } });
    ok(r1.status === 200 && r1.json?.result !== undefined && after1?.status === "EXECUTED",
      `1. claim mồ côi được tiếp quản, phiên EXECUTED (http=${r1.status}, result=${r1.json?.result || r1.json?.skipped || "?"})`);
    const orders1 = await prisma.premiumOrder.count({ where: { purchasePaymentId: pp1.id } });
    ok(orders1 === 1, "1b. đúng 1 đơn được tạo");

    // 2) Claim còn tươi -> vẫn chặn trùng, phiên không đụng vào
    const pp2: any = await mkSession();
    const TX2 = "TXORPH-0002";
    await prisma.webhookReceipt.create({ data: { ref: `PUR:${TX2}` } });
    const r2 = await sepayHook(TX2, pp2.amount, pp2.code);
    const after2 = await prisma.purchasePayment.findUnique({ where: { id: pp2.id } });
    ok(r2.json?.skipped === "duplicate purchase tx" && after2?.status === "PENDING",
      "2. claim tươi vẫn chặn trùng, phiên giữ PENDING");

    // 3) Phiên đã EXECUTED + claim quá hạn -> không tiếp quản, không tạo đơn 2
    await ageReceipt(TX1, 11);
    const r3 = await sepayHook(TX1, pp1.amount, pp1.code);
    const orders3 = await prisma.premiumOrder.count({ where: { purchasePaymentId: pp1.id } });
    ok(r3.json?.skipped === "duplicate purchase tx" && orders3 === 1,
      "3. phiên đã chốt: claim quá hạn cũng bị chặn, không đơn trùng");

    // dọn dẹp
    await prisma.webhookReceipt.deleteMany({ where: { ref: { in: [`PUR:${TX1}`, `PUR:${TX2}`] } } });
    await prisma.purchasePayment.delete({ where: { id: pp2.id } }).catch(() => {});
  } finally {
    await setSetting("sepay_secret", prevSecret);
    await setSetting("direct_sepay_enabled", prevDirect);
    if (bankCreated) await prisma.bankAccount.delete({ where: { id: bank.id } }).catch(() => {});
  }

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAIL`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
