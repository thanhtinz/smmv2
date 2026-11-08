/** Fix2: kiểm chứng trang Telegram GIỮ MỘT CỘT ở mọi bề rộng (1440 + 1920 + 390),
 *  cả 2 tab Stars/Premium — chụp viewport + full page. */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });
const stamp = "2026-11-07-fix2";
const shots = JSON.parse(readFileSync("/tmp/shots.json", "utf8"));

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--remote-debugging-port=9338", "--window-size=1920,1200",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9338/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
async function navigate(url, waitMs = 2200) { await send("Page.navigate", { url }); await sleep(waitMs); }
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
const clickPremiumTab = `(() => { const b = [...document.querySelectorAll('form button')].find((x) => x.textContent.trim() === 'Premium'); if (b) { b.click(); return true; } return false; })()`;
// Đo hình học các khối chính: cột trang (max-w wrapper), summary — để chứng minh 1 cột.
const measure = `(() => {
  const h1 = document.querySelector('h1');
  const col = h1 ? h1.closest('div.mx-auto') : null;
  const r = col ? col.getBoundingClientRect() : null;
  const main = document.querySelector('main');
  const mr = main ? main.getBoundingClientRect() : null;
  return { colW: r ? Math.round(r.width) : null, colX: r ? Math.round(r.x) : null, mainW: mr ? Math.round(mr.width) : null, vw: window.innerWidth };
})()`;

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
  await send("Network.setCookie", { name: "smmv2_session", value: shots.demo, domain: "127.0.0.1", path: "/" });
  await send("Network.setCookie", { name: "smmv2-lang", value: "en", domain: "127.0.0.1", path: "/" });

  for (const w of [1440, 1920]) {
    await viewport(w, 1100);
    await navigate(`${BASE}/dashboard/telegram`);
    console.log(`MEASURE ${w} stars:`, JSON.stringify(await evaluate(measure)));
    await capture(`${stamp}-telegram-stars-${w}`);
    await captureFull(`${stamp}-telegram-stars-${w}-full`);
    console.log("CLICK premium", w, await evaluate(clickPremiumTab));
    await sleep(600);
    await capture(`${stamp}-telegram-premium-${w}`);
    await captureFull(`${stamp}-telegram-premium-${w}-full`);
  }

  await viewport(390, 844);
  await navigate(`${BASE}/dashboard/telegram`);
  await capture(`${stamp}-telegram-stars-390`);
  await captureFull(`${stamp}-telegram-stars-390-full`);

  ws.close();
  chrome.kill();
  console.log("DONE");
  process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
