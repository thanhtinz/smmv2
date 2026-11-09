/**
 * Test hồi quy THANH TOÁN TRỰC TIẾP giỏ hàng (PurchasePayment, đợt fix9 —
 * bổ sung script độc lập ở đợt chốt 2026-11-08 vì trước đó chỉ kiểm chứng
 * tay 7/7, không còn script):
 *   npx tsx scripts/test-purchase-payment.ts   (cần server chạy ở :3000)
 * Kiểm qua HTTP webhook SePay THẬT (route production):
 *  1) Tạo phiên SEPAY -> webhook đủ tiền -> EXECUTED, đúng 1 đơn Premium,
 *     ví KHÔNG bị trừ (externalPaid).
 *  2) Webhook TRÙNG (cùng txId) -> bị chặn ở claim PUR:<txId>: vẫn 1 đơn,
 *     đúng 1 WebhookReceipt.
 *  3) Thiếu tiền: webhook trả thiếu -> phiên vẫn PENDING, 0 đơn; chuyển
 *     nốt phần còn lại (txId khác) -> cộng dồn đủ -> EXECUTED + 1 đơn.
 *  4) Hết hạn: phiên quá hạn -> expireStalePurchases -> EXPIRED, 0 đơn.
 */
import { prisma } from "../src/lib/db";
import { getSettings, setSetting } from "../src/lib/settings";
import { createPurchasePayment, expireStalePurchases } from "../src/lib/purchase";

const BASE = "http://127.0.0.1:3000";
const SECRET = "test_pp_secret_2026";
let failures = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
};

async function sepayHook(txId: string, amount: number, code: string) {
  const r = await fetch(`${BASE}/api/webhooks/sepay`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Apikey ${SECRET}` },
    body: JSON.stringify({ id: txId, gateway: "Vietcombank", transferType: "in", transferAmount: amount, content: `CK THUE WEB ${code} CAM ON` }),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

async function main() {
  const demo = await prisma.user.findUnique({ where: { username: "demo" } });
  if (!demo) throw new Error("Chưa seed demo user");
  const startBalance = demo.balance;
  const s0 = await getSettings();
  const prevSecret = s0.sepay_secret || "";
  const prevDirect = s0.direct_sepay_enabled || "";

  const variant = await prisma.premiumVariant.findFirst({
    where: { product: { slug: "youtube-premium" }, active: true },
    orderBy: { price: "asc" },
  });
  if (!variant) throw new Error("Thiếu variant youtube-premium trong seed");

  // Fixture tài khoản ngân hàng nếu DB chưa có cái nào đang bật
  let bank = await prisma.bankAccount.findFirst({ where: { active: true } });
  let bankCreated = false;
  if (!bank) {
    bank = await prisma.bankAccount.create({ data: { bankName: "Vietcombank", accountNumber: "9998887776", holder: "TEST SHOP", active: true } });
    bankCreated = true;
  }
  await setSetting("sepay_secret", SECRET);
  await setSetting("direct_sepay_enabled", "1");

  const createdPP: number[] = [];
  const createdOrders: string[] = [];
  try {
    /* 1) Phiên đủ tiền qua webhook */
    const pp1: any = await createPurchasePayment({ userId: demo.id, method: "SEPAY", lines: [{ variantId: variant.id, qty: 1, custom: {}, buyerInfo: demo.email }], promoCode: "" });
    createdPP.push(pp1.id);
    ok(pp1.status === "PENDING" && pp1.amount === variant.price && /^MUA/.test(pp1.code), `phiên tạo: ${pp1.code} amount=${pp1.amount}`);
    const balBefore = (await prisma.user.findUnique({ where: { id: demo.id } }))!.balance;
    const h1 = await sepayHook("TXPP-0001", pp1.amount, pp1.code);
    ok(h1.status === 200 && h1.json.result === "executed", `webhook đủ tiền -> executed: ${JSON.stringify(h1.json)}`);
    const pp1After = await prisma.purchasePayment.findUnique({ where: { id: pp1.id } });
    const codes1: string[] = JSON.parse(pp1After!.orderCodes || "[]");
    createdOrders.push(...codes1);
    ok(pp1After!.status === "EXECUTED" && codes1.length === 1, `phiên EXECUTED + đúng 1 mã đơn: ${JSON.stringify(codes1)}`);
    ok(await prisma.premiumOrder.count({ where: { code: { in: codes1 } } }) === 1, "đúng 1 PremiumOrder được tạo");
    ok((await prisma.user.findUnique({ where: { id: demo.id } }))!.balance === balBefore, "ví KHÔNG bị trừ (trả qua cổng)");

    /* 2) Webhook trùng txId -> không thực thi lần hai */
    const h2 = await sepayHook("TXPP-0001", pp1.amount, pp1.code);
    ok(h2.json.skipped === "duplicate purchase tx", `webhook trùng bị chặn: ${JSON.stringify(h2.json)}`);
    ok(await prisma.premiumOrder.count({ where: { code: { in: codes1 } } }) === 1, "vẫn đúng 1 đơn sau webhook trùng");
    ok(await prisma.webhookReceipt.count({ where: { ref: "PUR:TXPP-0001" } }) === 1, "đúng 1 WebhookReceipt PUR:TXPP-0001");

    /* 3) Thiếu tiền -> chờ; chuyển nốt -> cộng dồn đủ -> thực thi */
    const pp2: any = await createPurchasePayment({ userId: demo.id, method: "SEPAY", lines: [{ variantId: variant.id, qty: 1, custom: {}, buyerInfo: demo.email }], promoCode: "" });
    createdPP.push(pp2.id);
    const part = Math.floor(pp2.amount / 2);
    const h3 = await sepayHook("TXPP-0002", part, pp2.code);
    ok(h3.json.result === "underpaid", `trả thiếu -> underpaid: ${JSON.stringify(h3.json)}`);
    let pp2Now = await prisma.purchasePayment.findUnique({ where: { id: pp2.id } });
    ok(pp2Now!.status === "PENDING" && !pp2Now!.orderCodes, "phiên thiếu tiền vẫn PENDING, chưa có đơn nào");
    const h4 = await sepayHook("TXPP-0003", pp2.amount - part, pp2.code);
    ok(h4.json.result === "executed", `chuyển nốt phần còn lại -> executed: ${JSON.stringify(h4.json)}`);
    pp2Now = await prisma.purchasePayment.findUnique({ where: { id: pp2.id } });
    const codes2: string[] = JSON.parse(pp2Now!.orderCodes || "[]");
    createdOrders.push(...codes2);
    ok(pp2Now!.status === "EXECUTED" && codes2.length === 1, `phiên 2 EXECUTED + 1 đơn: ${JSON.stringify(codes2)}`);

    /* 4) Hết hạn -> EXPIRED, không đơn */
    const pp3: any = await createPurchasePayment({ userId: demo.id, method: "SEPAY", lines: [{ variantId: variant.id, qty: 1, custom: {}, buyerInfo: demo.email }], promoCode: "" });
    createdPP.push(pp3.id);
    await prisma.purchasePayment.update({ where: { id: pp3.id }, data: { expiresAt: new Date(Date.now() - 60000) } });
    const n = await expireStalePurchases();
    const pp3Now = await prisma.purchasePayment.findUnique({ where: { id: pp3.id } });
    ok(n >= 1 && pp3Now!.status === "EXPIRED" && !pp3Now!.orderCodes, `phiên quá hạn -> EXPIRED (expire trả ${n}), 0 đơn — giỏ của khách không bị đụng`);
  } finally {
    // Dọn fixture + khôi phục
    for (const code of createdOrders) {
      const o = await prisma.premiumOrder.findUnique({ where: { code }, select: { id: true } });
      if (o) await prisma.premiumOrder.delete({ where: { id: o.id } }).catch(() => {});
    }
    await prisma.webhookReceipt.deleteMany({ where: { ref: { in: ["PUR:TXPP-0001", "PUR:TXPP-0002", "PUR:TXPP-0003"] } } });
    await prisma.purchasePayment.deleteMany({ where: { id: { in: createdPP } } });
    await prisma.apiLog.deleteMany({ where: { kind: "webhook", ref: { in: ["TXPP-0001", "TXPP-0002", "TXPP-0003"] } } });
    if (bankCreated) await prisma.bankAccount.delete({ where: { id: bank!.id } }).catch(() => {});
    await setSetting("sepay_secret", prevSecret);
    await setSetting("direct_sepay_enabled", prevDirect);
    // Ví có thể lệch nếu có hoàn thừa/chênh lệch — khôi phục số dư seed
    await prisma.user.update({ where: { id: demo.id }, data: { balance: startBalance } });
  }
  ok((await prisma.user.findUnique({ where: { id: demo.id } }))!.balance === startBalance, "số dư demo khôi phục");
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAIL`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
