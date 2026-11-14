/**
 * Test hồi quy audit đợt 2 P2-01: receipt SePay của thanh toán mua giỏ
 * KHÔNG được kẹt sau lỗi tạm thời.
 *   npx tsx scripts/test-sepay-purchase-retry.ts   (cần server :3000 + DB seed)
 * Trước bản vá: claim PUR:<txId> tạo trước, settlePurchasePayment ném lỗi
 * thì receipt ở lại vĩnh viễn — SePay retry cùng txId bị trả "duplicate
 * purchase tx", phiên mua không bao giờ được thực thi dù tiền đã về.
 * Sau bản vá: lỗi tạm thời -> xoá claim + HTTP 500; SePay gửi lại cùng
 * txId thì settlement chạy được; thành công rồi thì claim giữ nguyên
 * (retry tiếp theo vẫn bị chặn trùng như cũ).
 * Lỗi tạm thời được giả lập bằng snapshot hỏng (JSON.parse ném lỗi ngay
 * trong settle, sau khi claim) — đúng vị trí và đúng tính chất của lỗi.
 */
import { prisma } from "../src/lib/db";
import { getSettings, setSetting } from "../src/lib/settings";
import { createPurchasePayment } from "../src/lib/purchase";

const BASE = "http://127.0.0.1:3000";
const SECRET = "test_p201_secret";
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
  return { status: r.status, json: await r.json().catch(() => ({})) };
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
  const prevSecret = s0.sepay_secret || "";
  const prevDirect = s0.direct_sepay_enabled || "";
  const startBalance = demo.balance;
  let bank = await prisma.bankAccount.findFirst({ where: { active: true } });
  let bankCreated = false;
  if (!bank) {
    bank = await prisma.bankAccount.create({ data: { bankName: "Vietcombank", accountNumber: "9998887776", holder: "TEST SHOP", active: true } });
    bankCreated = true;
  }
  await setSetting("sepay_secret", SECRET);
  await setSetting("direct_sepay_enabled", "1");

  const pp: any = await createPurchasePayment({ userId: demo.id, method: "SEPAY", lines: [{ variantId: variant.id, qty: 1, custom: {}, buyerInfo: demo.email }], promoCode: "" });
  const goodSnapshot = pp.snapshot;
  const TX = "TXP201-0001";
  try {
    // 1) Snapshot hỏng -> settle ném lỗi SAU claim: phải 500 + claim được nhả
    await prisma.purchasePayment.update({ where: { id: pp.id }, data: { snapshot: "NOT-JSON{{{" } });
    const h1 = await sepayHook(TX, pp.amount, pp.code);
    ok(h1.status === 500, `lỗi tạm thời -> HTTP 500 để SePay retry (nhận ${h1.status})`);
    ok(!(await prisma.webhookReceipt.findUnique({ where: { ref: `PUR:${TX}` } })), "claim PUR đã được NHẢ sau lỗi tạm thời");
    // Settle đã claim trước khi ném lỗi nên phiên nằm ở PROCESSING — lượt
    // retry phải tới được settle để tiếp quản (trước bản vá route chặn
    // mọi trạng thái ngoài PENDING/EXPIRED ở "purchase already settled").
    ok((await prisma.purchasePayment.findUnique({ where: { id: pp.id } }))!.status === "PROCESSING", "phiên ở PROCESSING chờ tiếp quản");

    // 2) Sửa snapshot + cho lease hết hạn -> SePay gửi lại CÙNG txId: tiếp quản chạy được
    await prisma.purchasePayment.update({ where: { id: pp.id }, data: { snapshot: goodSnapshot, updatedAt: new Date(Date.now() - 15 * 60000) } });
    const h2 = await sepayHook(TX, pp.amount, pp.code);
    ok(h2.status === 200 && (h2.json.result === "executed" || h2.json.result === "executed_resumed"), `retry cùng txId -> executed: ${JSON.stringify(h2.json)}`);
    const after = await prisma.purchasePayment.findUnique({ where: { id: pp.id } });
    const codes: string[] = after!.orderCodes ? JSON.parse(after!.orderCodes) : [];
    ok(after!.status === "EXECUTED" && codes.length === 1, `phiên EXECUTED + đúng 1 đơn (${codes[0] || "—"})`);

    // 3) Retry LẦN NỮA sau thành công: vẫn bị chặn trùng (claim giữ nguyên)
    const h3 = await sepayHook(TX, pp.amount, pp.code);
    ok(h3.status === 200 && String(h3.json.skipped || "").includes("duplicate"), `sau thành công, retry vẫn bị chặn trùng: ${JSON.stringify(h3.json)}`);
    ok((await prisma.premiumOrder.count({ where: { code: { in: codes } } })) === 1, "vẫn đúng 1 PremiumOrder");
    if (codes[0]) {
      const o = await prisma.premiumOrder.findUnique({ where: { code: codes[0] }, select: { id: true } });
      if (o) await prisma.premiumOrder.delete({ where: { id: o.id } }).catch(() => {});
    }
  } finally {
    await prisma.webhookReceipt.deleteMany({ where: { ref: `PUR:${TX}` } });
    await prisma.apiLog.deleteMany({ where: { kind: "webhook", ref: TX } });
    await prisma.purchasePayment.delete({ where: { id: pp.id } }).catch(() => {});
    if (bankCreated) await prisma.bankAccount.delete({ where: { id: bank!.id } }).catch(() => {});
    await setSetting("sepay_secret", prevSecret);
    await setSetting("direct_sepay_enabled", prevDirect);
    await prisma.user.update({ where: { id: demo.id }, data: { balance: startBalance } });
  }
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAIL`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
