/**
 * Chụp màn hình kiểm chứng bằng CDP trực tiếp (Chrome headless trong máy):
 *   node scripts/shots.mjs
 * Đọc /tmp/shots.json {demo, admin, cart} do seed-shots.ts tạo. Ảnh vào
 * ~/workspace/smm-anh/ với tên có ngày + hậu tố duy nhất.
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });
const stamp = "2026-11-07-batch2";
const shots = JSON.parse(readFileSync("/tmp/shots.json", "utf8"));

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--remote-debugging-port=9333", "--window-size=1440,1000",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9333/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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

  // Trang chủ (khách vãng lai)
  await viewport(1440, 1000);
  await navigate(`${BASE}/`);
  await capture(`${stamp}-home-desktop`);
  await viewport(390, 844);
  await navigate(`${BASE}/`, 1800);
  await capture(`${stamp}-home-mobile`);

  // Phiên demo
  await send("Network.setCookie", { name: "smmv2_session", value: shots.demo, domain: "127.0.0.1", path: "/" });
  await viewport(1440, 1000);
  await navigate(`${BASE}/dashboard/telegram`);
  await capture(`${stamp}-telegram-stars-desktop`);
  await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Premium'); if (b) b.click(); return !!b; })()`);
  await sleep(700);
  await capture(`${stamp}-telegram-premium-desktop`);
  await viewport(390, 844);
  await navigate(`${BASE}/dashboard/telegram`, 1800);
  await capture(`${stamp}-telegram-stars-mobile`);
  await viewport(1440, 1000);
  await navigate(`${BASE}/dashboard/telegram/lich-su`);
  await capture(`${stamp}-telegram-history-desktop`);

  // Giỏ hàng (seed localStorage trước khi trang tải)
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `try { localStorage.setItem('smmv2-cart-v1', ${JSON.stringify(JSON.stringify(shots.cart))}); } catch (e) {}` });
  await navigate(`${BASE}/gio-hang`);
  await capture(`${stamp}-cart-desktop`);
  await viewport(390, 844);
  await navigate(`${BASE}/gio-hang`, 1800);
  await capture(`${stamp}-cart-mobile`);

  // Trang nạp tiền — chọn phương thức USDT (BoltUtil)
  await viewport(1440, 1000);
  await navigate(`${BASE}/dashboard/nap-tien`);
  await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('USDT')); if (b) b.click(); return !!b; })()`);
  await sleep(800);
  await capture(`${stamp}-deposit-usdt-desktop`);
  await viewport(390, 844);
  await navigate(`${BASE}/dashboard/nap-tien`, 1800);
  await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('USDT')); if (b) b.click(); return !!b; })()`);
  await sleep(800);
  await capture(`${stamp}-deposit-usdt-mobile`);

  // Admin Telegram
  await send("Network.setCookie", { name: "smmv2_session", value: shots.admin, domain: "127.0.0.1", path: "/" });
  await viewport(1440, 1000);
  await navigate(`${BASE}/admin/telegram`);
  await capture(`${stamp}-admin-telegram-desktop`);

  ws.close();
  chrome.kill();
  console.log("DONE");
  process.exit(0);
}

main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
