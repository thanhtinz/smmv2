/**
 * Kiểm chứng BoltUtil end-to-end với mock (không có sandbox thật):
 *  tạo đơn đã ký đúng -> webhook CONFIRMED ký đúng cộng đúng VND (số thực nhận ×
 *  tỉ giá chụp) + thưởng, giao trùng không cộng 2 lần; chữ ký sai -> 401 không
 *  cộng; MANUAL_UNDERPAID cộng theo số nhỏ hơn; PAID (chưa xác nhận) poll vẫn
 *  giữ chờ; đường poll cộng khi webhook không tới; EXPIRED đóng đơn không cộng;
 *  ping OK; trang cấu hình admin không còn form USDT thủ công cũ.
 * Cần server :3000 chạy bản build mới.  npx tsx scripts/test-boltutil.ts
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createHmac } from "node:crypto";
import { SignJWT } from "jose";
import { prisma } from "../src/lib/db";
import { getSettings, setSetting } from "../src/lib/settings";
import { getBoltConfig, boltPing, boltCreateOrder, pollBoltutilDeposit } from "../src/lib/boltutil";

const BASE = "http://127.0.0.1:3000";
const MOCK = "http://127.0.0.1:3997";
const SECRET = "boltwhsec_test";
let pass = 0, fail = 0;
const check = (n: string, c: boolean, x = "") => { if (c) { pass++; console.log(`PASS  ${n}${x ? " — " + x : ""}`); } else { fail++; console.log(`FAIL  ${n}${x ? " — " + x : ""}`); } };

async function control(body: any) { await fetch(`${MOCK}/__control`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); }
async function emit(externalOrderId: string) {
  const r = await fetch(`${MOCK}/__emit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: `${BASE}/api/webhooks/boltutil`, externalOrderId }) });
  return r.json() as Promise<any>;
}

async function makeDeposit(userId: number, amountVnd: number, rate: number) {
  const usd = Math.round((amountVnd / rate) * 100) / 100;
  const dep = await prisma.deposit.create({
    data: {
      code: "TMP", userId, method: "USDT", amount: amountVnd, bonus: 0, status: "PENDING", auto: true,
      content: "TRON", usdCents: Math.round(usd * 100),
      providerData: JSON.stringify({ rateVndPerUsd: rate, network: "TRON", currency: "USDT", boltStatus: "CREATING" }),
    },
  });
  const { genCode } = await import("../src/lib/format");
  const code = genCode("NAP", dep.id);
  await prisma.deposit.update({ where: { id: dep.id }, data: { code, externalId: `bolt:${code}` } });
  const cfg = await getBoltConfig();
  const order = await boltCreateOrder(cfg, { externalOrderId: code, amountUsd: usd, network: "TRON" });
  await prisma.deposit.update({
    where: { id: dep.id },
    data: { providerRef: order.orderId, providerData: JSON.stringify({ rateVndPerUsd: rate, network: "TRON", currency: "USDT", externalOrderId: code, checkoutUrl: order.checkoutUrl, paymentAddress: order.paymentAddress, cryptoAmount: String(order.cryptoAmount), expiresAt: order.expiresAt, boltStatus: "PENDING" }) },
  });
  return { id: dep.id, code, order };
}

async function main() {
  const mock: ChildProcess = spawn("node", ["scripts/mock-boltutil.mjs"], { stdio: "ignore" });
  try {
    for (let i = 0; i < 40; i++) { try { const r = await fetch(`${MOCK}/api/v1/ping`, { headers: { "X-Bolt-Key": "bolt_test_key", "X-Bolt-Timestamp": String(Date.now()), "X-Bolt-Signature": createHmac("sha256", SECRET).update(`${Date.now()}.`).digest("hex") } }); if (r.ok) break; } catch { /* chờ */ } await new Promise((r) => setTimeout(r, 250)); }

    const prev = await getSettings();
    const demo: any = await prisma.user.findUnique({ where: { username: "demo" } });
    const startBalance = demo.balance as number;
    await setSetting("boltutil_enabled", "1");
    await setSetting("boltutil_api_key", "bolt_test_key");
    await setSetting("boltutil_webhook_secret", SECRET);
    await setSetting("boltutil_api_url", MOCK);
    await setSetting("usdt_rate", "25000");
    await setSetting("deposit_bonus_tiers", JSON.stringify([{ from: 100000, percent: 10 }]));
    await prisma.user.update({ where: { id: demo.id }, data: { balance: 1000000 } });
    const bal = async () => (await prisma.user.findUnique({ where: { id: demo.id } }))!.balance;

    // 1) ping + tạo đơn (mock tự kiểm chữ ký — sai ký là 401 ngay)
    const cfg = await getBoltConfig();
    const pong: any = await boltPing(cfg).catch((e) => null);
    check("ping BoltUtil OK (mock đã xác thực chữ ký)", !!pong && pong.ok === true);
    const d1 = await makeDeposit(demo.id, 250000, 25000);
    check("tạo đơn BoltUtil: có orderId + checkoutUrl + địa chỉ", !!d1.order.orderId && !!d1.order.checkoutUrl && !!d1.order.paymentAddress, d1.order.orderId);

    // 2) webhook CONFIRMED số thực nhận = đúng 10 USDT -> cộng 250.000 + thưởng 25.000
    await control({ externalOrderId: d1.code, status: "CONFIRMED", actualReceivedAmount: 10, paidTxHash: "txhash_d1" });
    const e1 = await emit(d1.code);
    const dep1: any = await prisma.deposit.findUnique({ where: { id: d1.id } });
    check("webhook CONFIRMED -> APPROVED + cộng 275.000 (gốc + thưởng)", e1.webhookStatus === 200 && dep1.status === "APPROVED" && (await bal()) === 1275000, `${dep1.status}/${await bal()}`);
    check("txHash được ghi lên yêu cầu nạp", (JSON.parse(dep1.providerData || "{}").paidTxHash || "") === "txhash_d1");
    const e1dup = await emit(d1.code);
    check("webhook giao trùng -> KHÔNG cộng lần 2", e1dup.webhookStatus === 200 && (await bal()) === 1275000);

    // 3) chữ ký sai -> 401, không cộng
    const d2 = await makeDeposit(demo.id, 250000, 25000);
    await control({ externalOrderId: d2.code, status: "CONFIRMED", actualReceivedAmount: 10 });
    const payload = JSON.stringify({ externalOrderId: d2.code, orderId: d2.order.orderId, status: "CONFIRMED", paidAmount: 10, actualReceivedAmount: 10 });
    const badRes = await fetch(`${BASE}/api/webhooks/boltutil`, { method: "POST", headers: { "content-type": "application/json", "x-bolt-timestamp": String(Date.now()), "x-bolt-signature": "deadbeef" }, body: payload });
    const dep2: any = await prisma.deposit.findUnique({ where: { id: d2.id } });
    check("chữ ký sai -> 401 + đơn vẫn PENDING, không cộng", badRes.status === 401 && dep2.status === "PENDING" && (await bal()) === 1275000);

    // 4) MANUAL_UNDERPAID: thực nhận 9.5 -> cộng 237.500 + thưởng 23.750 = 261.250
    await control({ externalOrderId: d2.code, status: "CONFIRMED", actualReceivedAmount: 9.5, settlementType: "MANUAL_UNDERPAID" });
    await emit(d2.code);
    const dep2b: any = await prisma.deposit.findUnique({ where: { id: d2.id } });
    check("MANUAL_UNDERPAID -> cộng theo số thực nhận nhỏ hơn (261.250 kèm thưởng)", dep2b.status === "APPROVED" && dep2b.amount === 237500 && (await bal()) === 1275000 + 261250, `${dep2b.amount}/${await bal()}`);
    check("settlementType được lưu để đối soát", JSON.parse(dep2b.providerData || "{}").settlementType === "MANUAL_UNDERPAID");

    // 5) PAID chưa xác nhận: poll KHÔNG cộng, đơn giữ PENDING
    const d3 = await makeDeposit(demo.id, 250000, 25000);
    await control({ externalOrderId: d3.code, status: "PAID", actualReceivedAmount: 10 });
    const balBefore5 = await bal();
    await pollBoltutilDeposit(d3.id);
    const dep3: any = await prisma.deposit.findUnique({ where: { id: d3.id } });
    check("trạng thái PAID qua poll -> vẫn PENDING, chưa cộng", dep3.status === "PENDING" && (await bal()) === balBefore5 && JSON.parse(dep3.providerData || "{}").boltStatus === "PAID");

    // 6) webhook mất -> poll thấy CONFIRMED thì cộng
    await control({ externalOrderId: d3.code, status: "CONFIRMED", actualReceivedAmount: 10, paidTxHash: "txhash_d3" });
    const r6 = await pollBoltutilDeposit(d3.id);
    const dep3b: any = await prisma.deposit.findUnique({ where: { id: d3.id } });
    check("poll dự phòng cộng tiền khi webhook không tới", r6.ok && dep3b.status === "APPROVED" && (await bal()) === balBefore5 + 275000, r6.reason);

    // 7) EXPIRED qua poll -> đóng đơn, không cộng
    const d4 = await makeDeposit(demo.id, 250000, 25000);
    await control({ externalOrderId: d4.code, status: "EXPIRED" });
    const balBefore7 = await bal();
    await pollBoltutilDeposit(d4.id);
    const dep4: any = await prisma.deposit.findUnique({ where: { id: d4.id } });
    check("EXPIRED qua poll -> REJECTED (đóng), không cộng", dep4.status === "REJECTED" && (await bal()) === balBefore7);

    // 8) trang cấu hình admin: còn form USDT thủ công cũ không?
    const admin: any = await prisma.user.findUnique({ where: { username: "admin" } });
    const prev2fa = await prisma.setting.findUnique({ where: { key: "admin_2fa_required" } });
    await setSetting("admin_2fa_required", "0");
    try {
      const secret = new TextEncoder().encode((process.env.AUTH_SECRET || "").replace(/^"|"$/g, ""));
      const token = await new SignJWT({ uid: admin.id, role: admin.role, username: admin.username, sv: admin.sessionVersion }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(secret);
      const page = await fetch(`${BASE}/admin/cau-hinh-nap-tien`, { headers: { cookie: `smmv2_session=${token}` } });
      const html = await page.text();
      check("cấu hình nạp: KHÔNG còn ô địa chỉ ví USDT thủ công", page.status === 200 && !html.includes('name="usdt_address"') && !html.includes('name="txHash"'));
      check("cấu hình nạp: có mục BoltUtil + URL webhook", html.includes("BoltUtil") && html.includes("/api/webhooks/boltutil"));
    } finally {
      await setSetting("admin_2fa_required", prev2fa?.value ?? "1");
    }

    // Dọn dẹp
    await prisma.deposit.deleteMany({ where: { id: { in: [d1.id, d2.id, d3.id, d4.id] } } });
    await prisma.apiLog.deleteMany({ where: { kind: "bolt_webhook" } });
    await setSetting("boltutil_enabled", "0");
    await setSetting("boltutil_api_key", "");
    await setSetting("boltutil_webhook_secret", "");
    await setSetting("boltutil_api_url", "");
    await setSetting("usdt_rate", prev.usdt_rate || "");
    await setSetting("deposit_bonus_tiers", prev.deposit_bonus_tiers || "[]");
    await prisma.user.update({ where: { id: demo.id }, data: { balance: startBalance } });
    console.log("CLEANUP done");
  } finally {
    mock.kill();
  }
  console.log(fail === 0 ? `\nALL PASS (${pass})` : `\n${fail} FAIL / ${pass} PASS`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
