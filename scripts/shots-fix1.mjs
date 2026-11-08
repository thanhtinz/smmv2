/**
 * Chụp kiểm chứng đợt fix1 (trang chủ shopkey + §B/§C) bằng CDP:
 *   node scripts/shots-fix1.mjs
 * Đọc /tmp/shots-fix1.json {demo, admin, cart} do seed-fix1.ts tạo.
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });
const stamp = "2026-11-07-fix1";
const shots = JSON.parse(readFileSync("/tmp/shots-fix1.json", "utf8"));

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--remote-debugging-port=9334", "--window-size=1440,1000",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9334/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || "eval error");
  return r.result?.value;
}
async function navigate(url, waitMs = 2200) {
  await send("Page.navigate", { url });
  await sleep(waitMs);
}
async function capture(name) {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name);
}
async function captureFull(name) {
  const m = await send("Page.getLayoutMetrics");
  const cs = m.cssContentSize || m.contentSize;
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: cs.width, height: cs.height, scale: 1 } });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name, `${cs.width}x${cs.height}`);
}
async function viewport(width, height) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 500 });
}

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

  // --- Khách vãng lai: trang chủ ---
  await viewport(1440, 1000);
  await navigate(`${BASE}/`);
  await capture(`${stamp}-home-desktop`);
  await captureFull(`${stamp}-home-desktop-full`);
  await evaluate(`window.scrollTo(0, 700)`);
  await sleep(500);
  await capture(`${stamp}-home-scrolled`);
  await evaluate(`window.scrollTo(0, 0)`);
  await viewport(390, 844);
  await navigate(`${BASE}/`, 1800);
  await capture(`${stamp}-home-390`);

  // --- Danh sách /premium (khách) ---
  await viewport(1440, 1000);
  await navigate(`${BASE}/premium`);
  await capture(`${stamp}-premium-guest-desktop`);
  await viewport(390, 844);
  await navigate(`${BASE}/premium`, 1800);
  await capture(`${stamp}-premium-guest-390`);

  // --- Chi tiết sản phẩm (khách) + mục đánh giá trống ---
  await viewport(1440, 1000);
  await navigate(`${BASE}/premium/youtube-premium`);
  await capture(`${stamp}-detail-guest-desktop`);
  await evaluate(`(() => { const el = [...document.querySelectorAll('h2')].find((e) => e.textContent.includes('Đánh giá')); if (el) el.scrollIntoView({ block: 'start' }); return !!el; })()`);
  await sleep(600);
  await capture(`${stamp}-detail-reviews`);

  // --- Đã xem gần đây: ghé 1 sản phẩm khác rồi về trang chủ ---
  await navigate(`${BASE}/premium/spotify-premium`, 1800);
  await navigate(`${BASE}/`, 2000);
  await evaluate(`window.scrollTo(0, document.body.scrollHeight)`);
  await sleep(600);
  await capture(`${stamp}-home-recent-desktop`);

  // --- Giỏ trống ---
  await viewport(1440, 1000);
  await navigate(`${BASE}/gio-hang`);
  await capture(`${stamp}-cart-empty-desktop`);

  // --- Giỏ có hàng ---
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `try { localStorage.setItem('smmv2-cart-v1', ${JSON.stringify(JSON.stringify(shots.cart))}); } catch (e) {}` });
  await navigate(`${BASE}/gio-hang`);
  await capture(`${stamp}-cart-full-desktop`);
  await viewport(390, 844);
  await navigate(`${BASE}/gio-hang`, 1800);
  await capture(`${stamp}-cart-full-390`);

  // --- Phiên demo: /premium phải ở khung cửa hàng công khai ---
  await send("Network.setCookie", { name: "smmv2_session", value: shots.demo, domain: "127.0.0.1", path: "/" });
  await viewport(1440, 1000);
  await navigate(`${BASE}/premium`);
  await capture(`${stamp}-premium-loggedin-desktop`);

  // --- Dashboard demo: menu + header ---
  await navigate(`${BASE}/dashboard`);
  await capture(`${stamp}-dashboard-desktop`);
  await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith('Đơn SMM')); if (b) b.click(); return !!b; })()`);
  await sleep(600);
  await capture(`${stamp}-dashboard-menu-smm`);

  // --- Admin: /admin/nap-tien tải trực tiếp ---
  await send("Network.setCookie", { name: "smmv2_session", value: shots.admin, domain: "127.0.0.1", path: "/" });
  await navigate(`${BASE}/admin/nap-tien`);
  await capture(`${stamp}-admin-naptien`);

  ws.close();
  chrome.kill();
  console.log("DONE");
  process.exit(0);
}

main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
