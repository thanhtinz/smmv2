/** Fix5 WS2+WS3: kiểm chứng khung mới (header trắng khu khách + footer sáng)
 *  và nút giỏ CHỈ còn trong trang chi tiết. Chạy: node scripts/shots-fix5-frame.mjs */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });
let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; };

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--remote-debugging-port=9341", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9341/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
async function navigate(url, waitMs = 2000) { await send("Page.navigate", { url }); await sleep(waitMs); }
async function capture(name) {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name);
}
async function captureFull(name) {
  const m = await send("Page.getLayoutMetrics");
  const cs = m.cssContentSize || m.contentSize;
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: cs.width, height: Math.min(cs.height, 4500), scale: 1 } });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name, `${cs.width}x${cs.height}`);
}
async function viewport(width, height) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 500 });
}
async function waitUrl(pred, timeoutMs = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const u = await evaluate("location.href");
    if (pred(u)) return u;
    await sleep(400);
  }
  return await evaluate("location.href");
}
const countCartBtns = () => evaluate(`document.querySelectorAll('button[aria-label="Thêm vào giỏ"], button[aria-label="Add to cart"]').length`);
const headerInfo = () => evaluate(`(() => {
  const h = document.querySelector('header');
  if (!h) return null;
  const cs = getComputedStyle(h);
  return { bg: cs.backgroundColor, text: h.innerText.replace(/\\s+/g, ' ').slice(0, 160) };
})()`);
const fillSubmit = (fields) => evaluate(`(() => {
  const names = Object.keys(${JSON.stringify(fields)});
  const form = [...document.querySelectorAll('form')].find((f) => names.every((n) => f.querySelector('[name="' + n + '"]')));
  if (!form) return 'no-matching-form';
  for (const [name, value] of Object.entries(${JSON.stringify(fields)})) {
    const inp = form.querySelector('[name="' + name + '"]');
    inp.focus(); inp.value = value; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true }));
  }
  form.requestSubmit();
  return 'submitted';
})()`);

async function main() {
  ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
  };
  const t = await send("Target.createTarget", { url: "about:blank" });
  const att = await send("Target.attachToTarget", { targetId: t.targetId, flatten: true });
  sessionId = att.sessionId;
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Network.setCookie", { name: "smmv2-lang", value: "vi", domain: "127.0.0.1", path: "/" });
  await navigate(`${BASE}/login`);
  await evaluate("localStorage.setItem('smmv2-lang', 'vi'); 'set'");
  await sleep(1500);

  // --- KHÁCH: trang đăng nhập trong khung mới
  await viewport(1440, 1100);
  await navigate(`${BASE}/login`);
  await capture("2026-11-07-fix5-frame-login-desktop");
  const loginHdr = await headerInfo();
  ok(loginHdr && loginHdr.bg === "rgb(255, 255, 255)", `login: header TRẮNG (${loginHdr?.bg})`);

  // --- KHÁCH: trang chủ
  await navigate(`${BASE}/`);
  await capture("2026-11-07-fix5-frame-home-guest-desktop");
  await capture("2026-11-07-fix5-cart-home");
  await captureFull("2026-11-07-fix5-frame-home-guest-full");
  const homeHdr = await headerInfo();
  ok(homeHdr && homeHdr.bg === "rgb(255, 255, 255)", "trang chủ khách: header trắng");
  ok(homeHdr && /Đăng nhập/.test(homeHdr.text) && /Đăng ký/.test(homeHdr.text), "header khách có Đăng nhập + Đăng ký");
  ok((await countCartBtns()) === 0, "WS2: trang chủ KHÔNG còn nút giỏ trên thẻ");

  // --- KHÁCH: trang chủ 390
  await viewport(390, 844);
  await navigate(`${BASE}/`);
  await capture("2026-11-07-fix5-frame-home-guest-390");
  await viewport(1440, 1100);

  // --- KHÁCH: /premium
  await navigate(`${BASE}/premium`);
  await capture("2026-11-07-fix5-frame-premium-guest-desktop");
  await capture("2026-11-07-fix5-cart-listing");
  ok((await countCartBtns()) === 0, "WS2: /premium KHÔNG còn nút giỏ trên thẻ");
  const firstDetail = await evaluate(`(() => { const a = [...document.querySelectorAll('a[href^="/premium/"]')].find((x) => /\\/premium\\/[a-z0-9-]+$/.test(x.getAttribute('href'))); return a ? a.getAttribute('href') : null; })()`);
  console.log("first detail:", firstDetail);

  // --- ĐĂNG NHẬP demo
  await navigate(`${BASE}/login`);
  console.log("login:", await fillSubmit({ login: "demo", password: "Demo@123" }));
  const landed = await waitUrl((u) => !u.includes("/login"));
  ok(new URL(landed).pathname === "/", "đăng nhập demo -> trang chủ");

  // --- ĐÃ ĐĂNG NHẬP: trang chủ + dashboard (header phải GIỐNG HỆT)
  await navigate(`${BASE}/`);
  await capture("2026-11-07-fix5-frame-home-loggedin-desktop");
  const liHdr = await headerInfo();
  ok(liHdr && liHdr.bg === "rgb(255, 255, 255)" && /500\.000/.test(liHdr.text) && /demo/.test(liHdr.text), "trang chủ đã đăng nhập: header trắng + số dư + tên khách");
  await navigate(`${BASE}/dashboard/ho-so`);
  await capture("2026-11-07-fix5-frame-dashboard-desktop");
  const dashHdr = await headerInfo();
  ok(dashHdr && dashHdr.bg === liHdr.bg, "header dashboard == header cửa hàng (cùng component)");

  // --- CHI TIẾT: nút giỏ PHẢI còn trong hộp đặt hàng
  if (firstDetail) {
    await navigate(`${BASE}${firstDetail}`);
    await sleep(800);
    const n = await countCartBtns();
    ok(n >= 1, `WS2: trang chi tiết CÒN nút giỏ ở hộp đặt hàng (${n})`);
    await capture("2026-11-07-fix5-cart-detail");
  } else {
    ok(false, "không tìm thấy link chi tiết sản phẩm");
  }

  ws.close();
  chrome.kill();
  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
