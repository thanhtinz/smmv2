/** NẠP TIỀN 2 BƯỚC CHO QR NGÂN HÀNG + BỎ FORM KHAI BÁO (lệnh Tín 2026-11-10 21:00):
 *  node scripts/shots-naptien-amount.mjs
 *  Kiểm chứng trên bản production (server :3000 + mock BoltUtil :3997 + fixture
 *  4 phương thức + mốc thưởng fixture [{from:500000, percent:10}]):
 *  - form khai báo nạp ĐÃ GỠ hẳn (không input[name=amount], không nút "Gửi khai báo nạp")
 *  - chọn QR ngân hàng: thẻ trái có ô "Số tiền nạp" (name=bankAmount) + nút
 *    "Nạp tiền"; CHƯA bấm thì cột phải KHÔNG có thẻ panel
 *  - gõ 500000 -> ô tự định dạng "500.000"; bấm Nạp tiền -> thẻ panel hiện:
 *    QR có amount=500000, nội dung CK nguyên vẹn (2 lần), dòng Số tiền nạp
 *    500.000đ + Thưởng nạp +50.000đ (+10%) + Tổng cộng vào ví 550.000đ
 *  - đổi 200000 + bấm lại -> QR amount=200000, còn mỗi dòng số tiền (không mốc)
 *  - số tiền sai (5000 < tối thiểu) hoặc rỗng -> lỗi cạnh ô, panel vẫn ẩn
 *  - USDT: panel hiện ngay khi chọn + tạo phiên qua mock vẫn chạy; quay lại
 *    ngân hàng thì bước reset (panel ẩn); PayPal hiện panel ngay như cũ
 *  - mobile 390: thẻ trái trên, bấm xong thẻ panel hiện bên dưới */
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

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=old", "--disable-gpu", "--no-sandbox", "--disable-setuid-sandbox", "--hide-scrollbars",
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-naptien-amount",
  "--remote-debugging-port=9397", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9397/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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

const STATE = `(() => {
  const tx = document.body.textContent || "";
  const mCol = document.querySelector('[data-col="methods"]');
  const pCol = document.querySelector('[data-col="panel"]');
  const rect = (el) => el ? { left: Math.round(el.getBoundingClientRect().left), right: Math.round(el.getBoundingClientRect().right), top: Math.round(el.getBoundingClientRect().top + window.scrollY), bottom: Math.round(el.getBoundingClientRect().bottom + window.scrollY), width: Math.round(el.getBoundingClientRect().width) } : null;
  const img = document.querySelector('img[alt*="VietQR"]');
  const wrap = img ? img.closest('.max-w-3xl') : null;
  const amtInp = mCol ? mCol.querySelector('input[name="bankAmount"]') : null;
  const vis = (el) => !!el && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
  const cards = [...document.querySelectorAll('.card')];
  const bonus = cards.find((c) => (c.textContent || "").includes("Thưởng nạp hiện tại"));
  const hist = cards.find((c) => (c.textContent || "").includes("Lịch sử nạp"));
  return {
    methods: ["QR ngân hàng", "PayPal", "Stripe", "USDT"].filter((x) => tx.includes(x)),
    hasPanel: !!pCol,
    mRect: rect(mCol), pRect: rect(pCol),
    gapX: mCol && pCol ? Math.round(pCol.getBoundingClientRect().left - mCol.getBoundingClientRect().right) : -1,
    amtVisible: vis(amtInp),
    amtValue: amtInp ? amtInp.value : null,
    amtLabel: !!mCol && (mCol.textContent || "").includes("Số tiền nạp"),
    confirmBtn: !!mCol && [...mCol.querySelectorAll('button')].some((b) => (b.textContent || "").trim() === "Nạp tiền"),
    errMin: !!mCol && (mCol.textContent || "").includes("Số tiền nạp tối thiểu là"),
    declareGone: !tx.includes("Gửi khai báo nạp") && !document.querySelector('input[name="amount"]') && !tx.includes("Khai báo để đối soát"),
    qrSrc: img ? img.getAttribute("src") : null,
    wrapHasAll: !!wrap && ["0123456789", "Vietcombank", "NGUYEN VAN A", "Ví MoMo", "0901234567"].every((x) => (wrap.textContent || "").includes(x)),
    contentCount: ((document.body.innerText || "").match(/SMM DEMO01/g) || []).length,
    panelText: pCol ? (pCol.textContent || "") : "",
    usdVisible: vis(pCol ? pCol.querySelector('input[name="usd"]') : null),
    vndVisible: vis(pCol ? pCol.querySelector('input[name="vnd"]') : null),
    bonusWidth: bonus ? Math.round(bonus.getBoundingClientRect().width) : 0,
    histWidth: hist ? Math.round(hist.getBoundingClientRect().width) : 0,
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
  };
})()`;

const clickMethod = (name) => `(() => {
  const col = document.querySelector('[data-col="methods"]');
  const b = col ? [...col.querySelectorAll('button')].find((x) => (x.textContent || "").includes(${JSON.stringify(name)})) : null;
  if (!b) return false; b.click(); return true;
})()`;

const clickConfirm = `(() => {
  const col = document.querySelector('[data-col="methods"]');
  const b = col ? [...col.querySelectorAll('button')].find((x) => (x.textContent || "").trim() === "Nạp tiền") : null;
  if (!b) return false; b.click(); return true;
})()`;

async function typeAmount(digits) {
  await evaluate(`(() => { const i = document.querySelector('[data-col="methods"] input[name="bankAmount"]'); if (!i) return false; i.focus(); i.select(); return true; })()`);
  if (digits) await send("Input.insertText", { text: digits });
  else await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
  await sleep(300);
}

async function main() {
  ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
  };
  // Dọn phiên USDT chờ còn sót của user demo (chạy lại script không bị dính
  // panel "đang chờ" của lần chạy trước thay cho form tạo phiên).
  const prismaMain = new PrismaClient();
  const demoUser = await prismaMain.user.findUnique({ where: { username: "demo" } });
  if (demoUser) await prismaMain.deposit.deleteMany({ where: { userId: demoUser.id, method: "USDT", status: "PENDING", externalId: { startsWith: "bolt:" } } });
  await prismaMain.$disconnect();

  const t = await send("Target.createTarget", { url: "about:blank" });
  sessionId = (await send("Target.attachToTarget", { targetId: t.targetId, flatten: true })).sessionId;
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await setViewport(1440, 1100, false);
  await send("Network.setCookie", { name: "smmv2_session", value: demoToken, url: BASE + "/", path: "/" });
  await send("Network.setCookie", { name: "smmv2-lang", value: "vi", url: BASE + "/", path: "/" });
  await navigate(`${BASE}/`, 2500);
  await evaluate(`(() => { try { localStorage.setItem("smmv2-lang", "vi"); document.cookie = "smmv2-lang=vi; path=/; max-age=31536000; samesite=lax"; } catch (e) {} return true; })()`);

  // --- Trạng thái đầu: ngân hàng được chọn, CHƯA có panel ---
  await navigate(`${BASE}/dashboard/nap-tien`, 4000);
  const s0 = await evaluate(STATE);
  console.log("INITIAL", JSON.stringify(s0));
  ok(s0.methods.length === 4, `đủ 4 phương thức (${s0.methods.join(", ")})`);
  ok(s0.declareGone, "form khai báo nạp đã GỠ hẳn (không ô amount, không nút Gửi khai báo)");
  ok(s0.amtVisible && s0.amtLabel, 'thẻ trái có ô nhập "Số tiền nạp" (name=bankAmount) khi chọn QR ngân hàng');
  ok(s0.confirmBtn, 'thẻ trái có nút "Nạp tiền"');
  ok(!s0.hasPanel && !s0.qrSrc, "CHƯA bấm: cột phải KHÔNG có thẻ panel, không có QR");
  ok(s0.bonusWidth >= 1000 && s0.histWidth >= 1000, `dải thưởng + lịch sử vẫn full-width (thưởng ${s0.bonusWidth}px, lịch sử ${s0.histWidth}px)`);

  // --- Gõ 500000: ô tự định dạng phân cách nghìn ---
  await typeAmount("500000");
  const s1 = await evaluate(STATE);
  ok(s1.amtValue === "500.000", `ô số tiền tự định dạng nghìn: "${s1.amtValue}"`);
  ok(!s1.hasPanel, "đã gõ số tiền nhưng CHƯA bấm: panel vẫn chưa hiện");
  await captureFullPage("2026-11-10-naptien-amount-before");

  // --- Bấm Nạp tiền: panel hiện, QR kèm amount, đủ dòng tiền + thưởng ---
  ok(await evaluate(clickConfirm) === true, 'bấm nút "Nạp tiền"');
  await sleep(900);
  const s2 = await evaluate(STATE);
  console.log("AFTER", JSON.stringify({ qrSrc: s2.qrSrc, panelText: s2.panelText }));
  ok(s2.hasPanel, "sau khi bấm: thẻ panel bên phải ĐÃ hiện");
  ok(!!s2.qrSrc && s2.qrSrc.includes("amount=500000"), `URL QR chứa amount=500000 (${s2.qrSrc})`);
  ok(s2.qrSrc === "https://img.vietqr.io/image/VCB-0123456789-compact2.png?amount=500000&addInfo=SMM+DEMO01&accountName=NGUYEN+VAN+A", "mẫu URL QR byte-exact như server sinh (vietQrUrl: BIN VCB, amount đứng đầu) — chỉ thay 0 -> 500000");
  ok(!!s2.qrSrc && s2.qrSrc.replace("amount=500000", "amount=0") === "https://img.vietqr.io/image/VCB-0123456789-compact2.png?amount=0&addInfo=SMM+DEMO01&accountName=NGUYEN+VAN+A", "đặt amount=0 trở lại thì URL khớp 100% URL server sinh hiện tại (byte-identical)");
  ok(s2.wrapHasAll && s2.contentCount === 2, `khối hợp nhất nguyên vẹn: ngân hàng/MoMo đủ, nội dung CK đúng 2 lần (thực tế ${s2.contentCount})`);
  ok(s2.panelText.includes("Số tiền nạp") && s2.panelText.includes("500.000"), "panel có dòng Số tiền nạp 500.000đ");
  ok(s2.panelText.includes("Thưởng nạp") && s2.panelText.includes("+10%") && s2.panelText.includes("50.000"), "dòng Thưởng nạp +50.000đ (+10%) đúng mốc fixture 500.000 -> 10%");
  ok(s2.panelText.includes("Tổng cộng vào ví") && s2.panelText.includes("550.000"), "dòng Tổng cộng vào ví 550.000đ");
  ok(s2.gapX >= 20 && s2.gapX <= 28, `khe giữa 2 thẻ vẫn ~24px (thực tế ${s2.gapX})`);
  await captureFullPage("2026-11-10-naptien-amount-after");

  // --- Đổi số tiền 200000 + bấm lại: QR cập nhật, hết mốc thưởng ---
  await typeAmount("200000");
  ok(await evaluate(clickConfirm) === true, "bấm Nạp tiền lần 2 với 200.000");
  await sleep(900);
  const s3 = await evaluate(STATE);
  ok(!!s3.qrSrc && s3.qrSrc.includes("amount=200000"), `QR cập nhật amount=200000 (${s3.qrSrc})`);
  ok(s3.panelText.includes("200.000"), "dòng Số tiền nạp cập nhật 200.000đ");
  ok(!s3.panelText.includes("Tổng cộng vào ví") && !s3.panelText.includes("Thưởng nạp"), "200.000 không đạt mốc: KHÔNG còn dòng thưởng/tổng (chỉ dòng số tiền)");

  // --- USDT: panel hiện ngay + tạo phiên qua mock ---
  ok(await evaluate(clickMethod("USDT")) === true, "bấm chọn USDT");
  await sleep(1000);
  const sU = await evaluate(STATE);
  ok(sU.hasPanel && sU.vndVisible, "USDT: thẻ panel hiện NGAY khi chọn, ô VNĐ trong panel");
  const submit = await evaluate(`(() => {
    const col = document.querySelector('[data-col="panel"]');
    const b = col ? [...col.querySelectorAll('button')].find((x) => (x.textContent || "").includes("Tạo phiên nạp USDT")) : null;
    if (!b) return false; b.click(); return true;
  })()`);
  ok(submit === true, "gửi form tạo phiên USDT");
  await sleep(5000);
  const afterUsdt = await evaluate(`(() => {
    const col = document.querySelector('[data-col="panel"]');
    const tx = col ? (col.textContent || "") : "";
    return { hasPending: tx.includes("Đang chờ thanh toán"), hasMockAddr: tx.includes("TMockBoltAddress"), hasCountdown: tx.includes("Hết hạn sau") };
  })()`);
  ok(afterUsdt.hasPending && afterUsdt.hasMockAddr && afterUsdt.hasCountdown, "phiên USDT tạo thành công qua mock (panel chờ + địa chỉ + đếm ngược)");

  // --- Quay lại ngân hàng: bước RESET (panel ẩn) ---
  ok(await evaluate(clickMethod("QR ngân hàng")) === true, "bấm chọn lại QR ngân hàng");
  await sleep(1000);
  const s4 = await evaluate(STATE);
  ok(!s4.hasPanel && s4.amtVisible, "quay lại ngân hàng: bước đã RESET — panel ẩn, ô số tiền hiện ở thẻ trái");

  // --- Số tiền sai: lỗi cạnh ô, panel vẫn ẩn ---
  await typeAmount("5000");
  ok(await evaluate(clickConfirm) === true, "bấm Nạp tiền với 5.000 (dưới tối thiểu)");
  await sleep(700);
  const s5 = await evaluate(STATE);
  ok(s5.errMin, 'lỗi "Số tiền nạp tối thiểu là ..." hiện cạnh ô nhập');
  ok(!s5.hasPanel, "số tiền sai: panel VẪN ẩn");

  // --- Số tiền rỗng: lỗi, panel vẫn ẩn ---
  await typeAmount("");
  ok(await evaluate(clickConfirm) === true, "bấm Nạp tiền với ô rỗng");
  await sleep(700);
  const s6 = await evaluate(STATE);
  ok(s6.errMin && !s6.hasPanel, "ô rỗng: lỗi hiện, panel vẫn ẩn");

  // --- PayPal: panel hiện ngay như cũ ---
  ok(await evaluate(clickMethod("PayPal")) === true, "bấm chọn PayPal");
  await sleep(1000);
  const sP = await evaluate(STATE);
  ok(sP.hasPanel && sP.usdVisible && sP.panelText.includes("Thanh toán qua PayPal"), "PayPal: panel hiện ngay khi chọn, ô USD nguyên vẹn");

  // --- Mobile 390: thẻ trái trên, bấm xong panel hiện bên dưới ---
  await setViewport(390, 900, true);
  await navigate(`${BASE}/dashboard/nap-tien`, 4000);
  const sm0 = await evaluate(STATE);
  ok(!sm0.hasPanel && sm0.amtVisible, "mobile: ban đầu panel ẩn, ô số tiền ở thẻ trái");
  await typeAmount("500000");
  ok(await evaluate(clickConfirm) === true, "mobile: bấm Nạp tiền");
  await sleep(900);
  const sm = await evaluate(STATE);
  console.log("MOBILE", JSON.stringify(sm));
  ok(sm.hasPanel && !!sm.qrSrc && sm.qrSrc.includes("amount=500000"), "mobile: panel hiện sau khi bấm, QR có amount=500000");
  ok(!!sm.mRect && !!sm.pRect && sm.mRect.bottom <= sm.pRect.top, "mobile: thẻ panel nằm DƯỚI thẻ phương thức");
  ok(sm.overflowX === false, "mobile không tràn ngang");
  await captureFullPage("2026-11-10-naptien-amount-mobile");

  // --- Pha 2: ngân hàng khai qua bảng BankAccount (mẫu vietqrUrl KHÔNG có
  // sẵn amount) -> QR phải giữ nguyên mẫu đó và amount được điền vào cuối ---
  const prisma = new PrismaClient();
  try {
    await prisma.bankAccount.deleteMany({ where: { accountNumber: "999988887777" } });
    await prisma.bankAccount.create({ data: { bankName: "Vietcombank", accountNumber: "999988887777", holder: "NGUYEN VAN A", active: true, sort: 0 } });
    await setViewport(1440, 1100, false);
    await navigate(`${BASE}/dashboard/nap-tien`, 4000);
    const t0 = await evaluate(STATE);
    ok(!t0.hasPanel && t0.amtVisible, "pha 2 (BankAccount): ban đầu panel vẫn ẩn, ô số tiền ở thẻ trái");
    await typeAmount("300000");
    ok(await evaluate(clickConfirm) === true, "pha 2: bấm Nạp tiền với 300.000");
    await sleep(900);
    const t1 = await evaluate(STATE);
    console.log("PHASE2", JSON.stringify({ qrSrc: t1.qrSrc }));
    ok(t1.qrSrc === "https://img.vietqr.io/image/970436-999988887777-compact2.png?accountName=NGUYEN+VAN+A&addInfo=SMM+DEMO01&amount=300000", "pha 2: mẫu vietqrUrl (BIN 970436, không amount) giữ nguyên + amount=300000 điền vào cuối");
    ok(t1.panelText.includes("999988887777") && t1.panelText.includes("300.000"), "pha 2: panel hiện đúng tài khoản BankAccount + dòng số tiền 300.000đ");
  } finally {
    await prisma.bankAccount.deleteMany({ where: { accountNumber: "999988887777" } });
    await prisma.$disconnect();
  }

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => { try { chrome.kill(); } catch { /* noop */ } });
