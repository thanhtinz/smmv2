/** TASK 9 (fix6): CTA thẻ sản phẩm = "Xem sản phẩm" + mũi tên. */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });
let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; };

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--remote-debugging-port=9354", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9354/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
async function navigate(url, waitMs = 2600) { await send("Page.navigate", { url }); await sleep(waitMs); }
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
  sessionId = (await send("Target.attachToTarget", { targetId: t.targetId, flatten: true })).sessionId;
  await send("Page.enable");
  await send("Runtime.enable");
  await navigate(`${BASE}/`);
  await evaluate(`document.cookie = 'smmv2-lang=vi; path=/'; localStorage.setItem('smmv2-lang', 'vi'); 'set'`);
  await navigate(`${BASE}/`);
  const probe = await evaluate(`(() => {
    const ctas = [...document.querySelectorAll('a')].filter((a) => a.href.includes('/premium/') && a.textContent.includes('Xem sản phẩm'));
    const first = ctas[0];
    if (first) first.scrollIntoView({ block: 'center' });
    const old = [...document.querySelectorAll('a')].filter((a) => a.href.includes('/premium/') && (a.textContent.includes('Đặt mua') || a.textContent.includes('Chọn gói'))).length;
    const withArrow = ctas.filter((a) => a.querySelector('svg path[d^="M5 12h14"]')).length;
    return { ctaCount: ctas.length, withArrow, oldLabels: old };
  })()`);
  console.log(JSON.stringify(probe));
  ok(probe.ctaCount > 0, `thẻ có CTA "Xem sản phẩm": ${probe.ctaCount}`);
  ok(probe.withArrow === probe.ctaCount, `mọi CTA đều có icon mũi tên (${probe.withArrow}/${probe.ctaCount})`);
  ok(probe.oldLabels === 0, "không còn nhãn Đặt mua/Chọn gói trên thẻ");
  await sleep(600);
  await capture("2026-11-08-cardcta-desktop");
  await viewport(390, 844);
  await navigate(`${BASE}/`);
  await evaluate(`(() => { const a = [...document.querySelectorAll('a')].find((x) => x.href.includes('/premium/') && x.textContent.includes('Xem sản phẩm')); if (a) a.scrollIntoView({ block: 'center' }); return !!a; })()`);
  await sleep(600);
  await capture("2026-11-08-cardcta-390");
  console.log(failures === 0 ? "ALL PASS" : `${failures} FAIL`);
  chrome.kill();
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
