/** HAI CỘT TRANG NẠP TIỀN (lệnh Tín 2026-11-10 20:33):
 *  node scripts/shots-naptien-columns.mjs
 *  Kiểm chứng trên bản production (server :3000 + mock BoltUtil :3997 + fixture 4 phương thức):
 *  - desktop: cột TRÁI = danh sách phương thức xếp dọc, cột PHẢI = panel của
 *    phương thức đang chọn; panel ngân hàng giữ khối hợp nhất (QR trên, nội
 *    dung CK dưới) nằm trọn trong cột phải
 *  - chuyển đủ 4 phương thức: PayPal/Stripe hiện form trong cột phải, USDT tạo
 *    phiên qua mock chạy tới panel chờ trong cột phải
 *  - thẻ thưởng + lịch sử vẫn full-width dưới thẻ nạp; không còn thẻ số dư /
 *    form khai báo; nút chép ở dòng STK có phản hồi
 *  - mobile 390: xếp dọc một cột (chọn phương thức trước, panel dưới), không tràn ngang */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

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
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-naptien-columns",
  "--remote-debugging-port=9395", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9395/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
  const cards = [...document.querySelectorAll('.card')];
  const depCard = cards.find((c) => (c.textContent || "").includes("Phương thức thanh toán"));
  const mCol = document.querySelector('[data-col="methods"]');
  const pCol = document.querySelector('[data-col="panel"]');
  const rect = (el) => el ? { left: Math.round(el.getBoundingClientRect().left), right: Math.round(el.getBoundingClientRect().right), top: Math.round(el.getBoundingClientRect().top + window.scrollY), bottom: Math.round(el.getBoundingClientRect().bottom + window.scrollY), width: Math.round(el.getBoundingClientRect().width) } : null;
  const img = document.querySelector('img[alt*="VietQR"]');
  const wrap = img ? img.closest('.max-w-3xl') : null;
  const acctEl = [...document.querySelectorAll('dl div')].find((d) => (d.textContent || "").includes("Số tài khoản"));
  const imgR = img ? img.getBoundingClientRect() : null;
  const acctR = acctEl ? acctEl.getBoundingClientRect() : null;
  const bonus = cards.find((c) => (c.textContent || "").includes("Thưởng nạp hiện tại"));
  const hist = cards.find((c) => (c.textContent || "").includes("Lịch sử nạp"));
  const mBtns = mCol ? [...mCol.querySelectorAll('button')] : [];
  const btnTops = mBtns.map((b) => Math.round(b.getBoundingClientRect().top));
  return {
    methods: ["QR ngân hàng", "PayPal", "Stripe", "USDT"].filter((x) => tx.includes(x)),
    mRect: rect(mCol), pRect: rect(pCol),
    methodBtnCount: mBtns.length,
    btnStackedVertically: btnTops.length > 1 && btnTops.every((t, i) => i === 0 || t > btnTops[i - 1]),
    contentCount: ((document.body.innerText || "").match(/SMM DEMO01/g) || []).length,
    hasBalanceCard: tx.includes("Số dư hiện tại"),
    hasDeclareForm: tx.includes("Khai báo để đối soát") || tx.includes("Gửi khai báo nạp"),
    wrapHasAll: !!wrap && ["0123456789", "Vietcombank", "NGUYEN VAN A", "Ví MoMo", "0901234567", "Nạp tối thiểu"].every((x) => (wrap.textContent || "").includes(x)),
    qrAboveRows: !!imgR && !!acctR && imgR.bottom <= acctR.top + 2,
    imgInPanel: !!imgR && !!pCol && imgR.left >= pCol.getBoundingClientRect().left - 1 && imgR.right <= pCol.getBoundingClientRect().right + 1,
    panelText: pCol ? (pCol.textContent || "") : "",
    depBottom: depCard ? Math.round(depCard.getBoundingClientRect().bottom + window.scrollY) : 0,
    bonusWidth: bonus ? Math.round(bonus.getBoundingClientRect().width) : 0,
    bonusTop: bonus ? Math.round(bonus.getBoundingClientRect().top + window.scrollY) : 0,
    histWidth: hist ? Math.round(hist.getBoundingClientRect().width) : 0,
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
  };
})()`;

const clickMethod = (name) => `(() => {
  const col = document.querySelector('[data-col="methods"]');
  const b = col ? [...col.querySelectorAll('button')].find((x) => (x.textContent || "").includes(${JSON.stringify(name)})) : null;
  if (!b) return false; b.click(); return true;
})()`;

async function main() {
  ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
  };
  const t = await send("Target.createTarget", { url: "about:blank" });
  sessionId = (await send("Target.attachToTarget", { targetId: t.targetId, flatten: true })).sessionId;
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  try { await send("Browser.grantPermissions", { origin: BASE, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] }); } catch { /* bản chrome cũ có thể không hỗ trợ */ }
  await setViewport(1440, 1100, false);
  await send("Network.setCookie", { name: "smmv2_session", value: demoToken, url: BASE + "/", path: "/" });
  await send("Network.setCookie", { name: "smmv2-lang", value: "vi", url: BASE + "/", path: "/" });
  await navigate(`${BASE}/`, 2500);
  await evaluate(`(() => { try { localStorage.setItem("smmv2-lang", "vi"); document.cookie = "smmv2-lang=vi; path=/; max-age=31536000; samesite=lax"; } catch (e) {} return true; })()`);

  // --- Desktop: 2 cột — methods trái, panel phải ---
  await navigate(`${BASE}/dashboard/nap-tien`, 4000);
  const s0 = await evaluate(STATE);
  console.log("DESKTOP", JSON.stringify(s0));
  ok(s0.methods.length === 4, `đủ 4 phương thức (${s0.methods.join(", ")})`);
  ok(!!s0.mRect && !!s0.pRect, "có đủ 2 cột methods/panel");
  ok(s0.mRect && s0.pRect && s0.mRect.right <= s0.pRect.left + 1, `cột methods nằm bên TRÁI cột panel (methods right=${s0.mRect?.right} ≤ panel left=${s0.pRect?.left})`);
  ok(s0.methodBtnCount === 4 && s0.btnStackedVertically, "4 nút phương thức xếp DỌC trong cột trái");
  ok(s0.mRect && s0.pRect && s0.mRect.width < s0.pRect.width, `cột methods (${s0.mRect?.width}px) hẹp hơn cột panel (${s0.pRect?.width}px)`);
  ok(s0.wrapHasAll, "panel ngân hàng: QR + toàn bộ nội dung CK trong cùng khối hợp nhất");
  ok(s0.qrAboveRows, "QR nằm phía trên các dòng nội dung chuyển khoản");
  ok(s0.imgInPanel, "QR nằm trọn trong cột PHẢI (panel)");
  ok(s0.contentCount === 2, `nội dung CK chỉ hiện trong khối hợp nhất — 2 lần, thực tế ${s0.contentCount}`);
  ok(!s0.hasBalanceCard && !s0.hasDeclareForm, "vẫn giữ: không thẻ số dư, không form khai báo");
  ok(s0.bonusWidth >= 1000 && s0.histWidth >= 1000 && s0.bonusTop >= s0.depBottom - 4, `thưởng + lịch sử full-width dưới thẻ nạp (thưởng ${s0.bonusWidth}px, lịch sử ${s0.histWidth}px)`);
  await captureFullPage("2026-11-10-naptien-columns-desktop");

  // --- Nút chép ở dòng Số tài khoản ---
  const copied = await evaluate(`(() => {
    const row = [...document.querySelectorAll('dl div')].find((d) => (d.textContent || "").includes("Số tài khoản"));
    const btn = row ? row.querySelector('button') : null;
    if (!btn) return "nobtn";
    btn.click();
    return "clicked";
  })()`);
  ok(copied === "clicked", "bấm nút chép ở dòng Số tài khoản");
  await sleep(600);
  const copyFb = await evaluate(`(() => {
    const row = [...document.querySelectorAll('dl div')].find((d) => (d.textContent || "").includes("Số tài khoản"));
    const btn = row ? row.querySelector('button') : null;
    return btn ? btn.className.includes("emerald") : false;
  })()`);
  ok(copyFb === true, "nút chép hiện phản hồi đã chép (viền xanh + dấu tick)");

  // --- Chuyển PayPal / Stripe: form hiện trong cột phải ---
  ok(await evaluate(clickMethod("PayPal")) === true, "bấm chọn PayPal ở cột trái");
  await sleep(1000);
  const sPp = await evaluate(STATE);
  ok(sPp.panelText.includes("Thanh toán qua PayPal"), "panel PayPal hiện trong cột phải");
  ok(await evaluate(clickMethod("Stripe")) === true, "bấm chọn Stripe ở cột trái");
  await sleep(1000);
  const sSt = await evaluate(STATE);
  ok(sSt.panelText.includes("Thanh toán qua Stripe"), "panel Stripe hiện trong cột phải");

  // --- USDT: tạo phiên qua mock ---
  ok(await evaluate(clickMethod("USDT")) === true, "bấm chọn USDT ở cột trái");
  await sleep(1000);
  const submit = await evaluate(`(() => {
    const col = document.querySelector('[data-col="panel"]');
    const b = col ? [...col.querySelectorAll('button')].find((x) => (x.textContent || "").includes("Tạo phiên nạp USDT")) : null;
    if (!b) return false; b.click(); return true;
  })()`);
  ok(submit === true, "gửi form tạo phiên USDT trong cột phải");
  await sleep(5000);
  const afterUsdt = await evaluate(`(() => {
    const col = document.querySelector('[data-col="panel"]');
    const tx = col ? (col.textContent || "") : "";
    return { hasPending: tx.includes("Đang chờ thanh toán"), hasMockAddr: tx.includes("TMockBoltAddress"), hasCountdown: tx.includes("Hết hạn sau") };
  })()`);
  console.log("USDT_FLOW", JSON.stringify(afterUsdt));
  ok(afterUsdt.hasPending && afterUsdt.hasMockAddr && afterUsdt.hasCountdown, "phiên USDT tạo thành công: panel chờ + địa chỉ mock + đếm ngược trong cột phải");

  // --- Quay lại QR ngân hàng ---
  await navigate(`${BASE}/dashboard/nap-tien`, 4000);
  const s1 = await evaluate(STATE);
  ok(s1.wrapHasAll && s1.qrAboveRows && s1.imgInPanel, "quay lại panel ngân hàng: khối hợp nhất còn nguyên trong cột phải");

  // --- Mobile 390: một cột, methods trước panel sau ---
  await setViewport(390, 900, true);
  await navigate(`${BASE}/dashboard/nap-tien`, 4000);
  const sm = await evaluate(STATE);
  console.log("MOBILE", JSON.stringify(sm));
  ok(sm.overflowX === false, "mobile không tràn ngang");
  ok(!!sm.mRect && !!sm.pRect && sm.mRect.bottom <= sm.pRect.top + 2, "mobile: khối chọn phương thức nằm TRÊN panel");
  ok(sm.wrapHasAll && sm.qrAboveRows, "mobile: khối hợp nhất nguyên vẹn, QR trên nội dung dưới");
  await captureFullPage("2026-11-10-naptien-columns-mobile");

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => { try { chrome.kill(); } catch { /* noop */ } });
