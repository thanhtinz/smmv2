/** BỎ HẲN MoMo (lệnh Tín 2026-11-10 21:12 "Chỗ qr ngân hàng là auto qua sepay
 *  bỏ momo đi" + mở rộng "Bỏ hẳn momo"):
 *  node scripts/shots-naptien-nomomo.mjs
 *  Điều kiện chạy: server production :3000 + mock BoltUtil :3997 + fixture
 *  scripts/naptien-balance-fixture.ts (ngân hàng + MoMo đều đã cấu hình).
 *  Kiểm chứng:
 *  - Trang nạp tiền (fixture có CẢ bank lẫn MoMo): KHÔNG còn chữ "MoMo" ở bất
 *    cứ đâu trên trang; tile phương thức ghi "Ngân hàng · cộng tự động".
 *  - Luồng 2 bước vẫn chạy: chưa bấm -> không panel; gõ 500000 + bấm "Nạp
 *    tiền" -> panel hiện, QR chứa amount=500000, có dòng Số tiền nạp +
 *    Thưởng/Tổng (mốc fixture [{from:500000,percent:10}] do script tự đặt),
 *    ghi chú cuối panel nhắc SePay, vẫn không có "MoMo".
 *  - Chỉ cấu hình MoMo (xoá bank_account + không có BankAccount nào): phương
 *    thức "QR ngân hàng" KHÔNG xuất hiện (không method chết).
 *  - Admin /admin/cau-hinh-nap-tien: không còn "MoMo", tick ví ghi "Hiện QR
 *    ngân hàng ở trang nạp tiền."
 *  - Admin /admin/nap-tien: bản ghi nạp MOMO cũ (fixture NAPMOMO01 do script
 *    tạo) vẫn render nhãn "MoMo" không lỗi; script tự dọn bản ghi sau đó. */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });
let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; };

const envRaw = readFileSync("/home/hatch/workspace/smmv2/.env", "utf8");
let secret = envRaw.split("\n").find((l) => l.startsWith("AUTH_SECRET")).split("=").slice(1).join("=").trim();
if ((secret.startsWith('"') && secret.endsWith('"')) || (secret.startsWith("'") && secret.endsWith("'"))) secret = secret.slice(1, -1);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const mint = (claims) => {
  const u = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sv: 0, iat: now, exp: now + 3600, ...claims })}`;
  return `${u}.${createHmac("sha256", secret).update(u).digest("base64url")}`;
};
const demoToken = mint({ uid: 2, role: "USER", username: "demo" });
const adminToken = mint({ uid: 1, role: "ADMIN", username: "admin", amr: "passkey" });

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=old", "--disable-gpu", "--no-sandbox", "--disable-setuid-sandbox", "--hide-scrollbars",
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-naptien-nomomo",
  "--remote-debugging-port=9399", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9399/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
    await sleep(200);
  }
  throw new Error("chrome CDP không lên");
}
let msgId = 0;
const pending = new Map();
let ws;
let sessionId = null;
function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}
async function evaluate(expr) {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || "eval error");
  return r.result?.value;
}
async function navigate(url, waitMs = 3200) { await send("Page.navigate", { url }); await sleep(waitMs); }
async function setViewport(width, height, mobile) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: !!mobile });
}
async function captureFullPage(name) {
  const m = await send("Page.getLayoutMetrics");
  const size = m.cssContentSize || m.contentSize;
  const r = await send("Page.captureScreenshot", {
    format: "png", captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: Math.ceil(size.width), height: Math.ceil(size.height), scale: 1 },
  });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name, `${Math.ceil(size.width)}x${Math.ceil(size.height)}`);
}
async function setCookie(token) {
  await send("Network.setCookie", { name: "smmv2_session", value: token, url: BASE + "/", path: "/" });
}

const STATE = `(() => {
  const tx = document.body.innerText || "";
  const mCol = document.querySelector('[data-col="methods"]');
  const pCol = document.querySelector('[data-col="panel"]');
  const img = document.querySelector('img[alt*="VietQR"]');
  const mTx = mCol ? (mCol.textContent || "") : "";
  return {
    text: tx,
    hasMomo: /momo/i.test(tx),
    // Method phải dò TRONG cột methods: mô tả đầu trang luôn chứa chữ
    // "QR ngân hàng" nên dò toàn trang sẽ dương tính giả.
    methods: ["QR ngân hàng", "PayPal", "Stripe", "USDT"].filter((x) => mTx.includes(x)),
    tileDescBankOnly: !!mCol && (mCol.textContent || "").includes("Ngân hàng · cộng tự động"),
    hasPanel: !!pCol,
    qrSrc: img ? img.getAttribute("src") : null,
    panelText: pCol ? (pCol.textContent || "") : "",
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
  };
})()`;

const clickConfirm = `(() => {
  const col = document.querySelector('[data-col="methods"]');
  const b = col ? [...col.querySelectorAll('button')].find((x) => (x.textContent || "").trim() === "Nạp tiền") : null;
  if (!b) return false; b.click(); return true;
})()`;

async function typeAmount(digits) {
  await evaluate(`(() => { const i = document.querySelector('[data-col="methods"] input[name="bankAmount"]'); if (!i) return false; i.focus(); i.select(); return true; })()`);
  await send("Input.insertText", { text: digits });
  await sleep(300);
}

async function setSetting(prisma, key, value) {
  if (value === null) await prisma.setting.deleteMany({ where: { key } });
  else await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

async function main() {
  const prisma = new PrismaClient();
  ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
  };
  try {
    // Mốc thưởng fixture cho dòng Thưởng/Tổng (script tự đặt, tự dọn)
    await setSetting(prisma, "deposit_bonus_tiers", JSON.stringify([{ from: 500000, percent: 10 }]));
    const demo = await prisma.user.findUnique({ where: { username: "demo" } });
    await prisma.deposit.deleteMany({ where: { userId: demo.id, method: "USDT", status: "PENDING", externalId: { startsWith: "bolt:" } } });

    const t = await send("Target.createTarget", { url: "about:blank" });
    sessionId = (await send("Target.attachToTarget", { targetId: t.targetId, flatten: true })).sessionId;
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Network.enable");
    await setViewport(1440, 1100, false);
    await setCookie(demoToken);
    await send("Network.setCookie", { name: "smmv2-lang", value: "vi", url: BASE + "/", path: "/" });
    await navigate(`${BASE}/`, 2500);
    await evaluate(`(() => { try { localStorage.setItem("smmv2-lang", "vi"); document.cookie = "smmv2-lang=vi; path=/; max-age=31536000; samesite=lax"; } catch (e) {} return true; })()`);

    // --- Pha 1: bank + MoMo đều đã cấu hình (fixture) -> trang nạp KHÔNG còn MoMo ---
    await navigate(`${BASE}/dashboard/nap-tien`, 4000);
    const s0 = await evaluate(STATE);
    ok(s0.methods.length === 4, `đủ 4 phương thức (${s0.methods.join(", ")})`);
    ok(!s0.hasMomo, "trang nạp tiền KHÔNG còn chữ MoMo ở trạng thái đầu (bank + MoMo đều đã cấu hình)");
    ok(s0.tileDescBankOnly, 'tile QR ngân hàng ghi "Ngân hàng · cộng tự động" (chỉ ngân hàng)');
    ok(!s0.hasPanel, "chưa bấm: chưa có thẻ panel (luồng 2 bước nguyên vẹn)");

    await typeAmount("500000");
    ok(await evaluate(clickConfirm) === true, 'bấm nút "Nạp tiền" với 500.000');
    await sleep(900);
    const s1 = await evaluate(STATE);
    ok(s1.hasPanel, "sau khi bấm: thẻ panel hiện");
    ok(!!s1.qrSrc && s1.qrSrc.includes("amount=500000"), `URL QR chứa amount=500000 (${s1.qrSrc})`);
    ok(!s1.hasMomo, "panel ngân hàng KHÔNG còn chữ MoMo (không còn khối Ví MoMo)");
    ok(s1.panelText.includes("SePay"), "ghi chú cuối panel nhắc cộng tự động qua SePay");
    ok(s1.panelText.includes("Số tiền nạp") && s1.panelText.includes("550.000"), "dòng Số tiền nạp + Tổng cộng vào ví 550.000đ vẫn đúng (mốc thưởng 10%)");
    ok(s1.panelText.includes("SMM DEMO01") && s1.panelText.includes("0123456789"), "thông tin chuyển khoản ngân hàng nguyên vẹn");
    await captureFullPage("2026-11-10-naptien-nomomo-desktop");

    // --- Mobile ---
    await setViewport(390, 900, true);
    await navigate(`${BASE}/dashboard/nap-tien`, 4000);
    await typeAmount("500000");
    await evaluate(clickConfirm);
    await sleep(900);
    const sm = await evaluate(STATE);
    ok(sm.hasPanel && !sm.hasMomo && sm.overflowX === false, "mobile: panel hiện sau khi bấm, không MoMo, không tràn ngang");
    await captureFullPage("2026-11-10-naptien-nomomo-mobile");
    await setViewport(1440, 1100, false);

    // --- Pha 2: chỉ MoMo (gỡ bank) -> method QR ngân hàng KHÔNG xuất hiện ---
    const bankRowsBefore = await prisma.bankAccount.count({ where: { active: true } });
    await setSetting(prisma, "bank_account", "");
    await prisma.bankAccount.updateMany({ data: { active: false } });
    await navigate(`${BASE}/dashboard/nap-tien`, 4000);
    const s2 = await evaluate(STATE);
    ok(!s2.methods.includes("QR ngân hàng"), `chỉ cấu hình MoMo: method QR ngân hàng KHÔNG xuất hiện (methods còn lại: ${s2.methods.join(", ")})`);
    // khôi phục trạng thái fixture
    await setSetting(prisma, "bank_account", "0123456789");
    if (bankRowsBefore > 0) await prisma.bankAccount.updateMany({ data: { active: true } });

    // --- Admin: trang cấu hình nạp tiền không còn MoMo ---
    await setCookie(adminToken);
    await navigate(`${BASE}/admin/cau-hinh-nap-tien`, 4000);
    const sa = await evaluate(STATE);
    ok(!sa.hasMomo, "admin Cấu hình nạp tiền: KHÔNG còn chữ MoMo");
    ok(sa.text.includes("Hiện QR ngân hàng ở trang nạp tiền."), 'tick ví ghi "Hiện QR ngân hàng ở trang nạp tiền."');

    // --- Admin: bản ghi MOMO cũ vẫn render nhãn ---
    await prisma.deposit.deleteMany({ where: { code: "NAPMOMO01" } });
    await prisma.deposit.create({ data: { code: "NAPMOMO01", userId: demo.id, method: "MOMO", amount: 100000, bonus: 0, status: "APPROVED", auto: true } });
    await navigate(`${BASE}/admin/nap-tien?q=NAPMOMO01`, 4000);
    const sd = await evaluate(STATE);
    ok(sd.text.includes("NAPMOMO01"), "admin Quản lý nạp tiền: tìm thấy bản ghi MOMO cũ NAPMOMO01");
    ok(sd.text.includes("MoMo"), 'bản ghi MOMO cũ vẫn render nhãn "MoMo" (DEP_METHOD giữ nguyên cho dữ liệu lịch sử)');
    await prisma.deposit.deleteMany({ where: { code: "NAPMOMO01" } });
  } finally {
    await setSetting(prisma, "deposit_bonus_tiers", null).catch(() => {});
    await prisma.$disconnect();
  }

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => { try { chrome.kill(); } catch { /* noop */ } });
