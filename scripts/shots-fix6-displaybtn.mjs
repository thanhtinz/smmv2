/** TASK 15 (fix6): nút Cài đặt hiển thị trên header — before/after 390 + desktop.
 *  node scripts/shots-fix6-displaybtn.mjs before|after */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const PHASE = process.argv[2] || "before";
const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });
let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; };

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--remote-debugging-port=9361", "--window-size=390,844",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9361/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
async function navigate(url, waitMs = 2400) { await send("Page.navigate", { url }); await sleep(waitMs); }
async function capture(name) {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name);
}
async function viewport(width, height) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 500 });
}

const probe = () => evaluate(`(() => {
  const btn = document.querySelector('button[aria-label="Display settings"], button[title="Cài đặt hiển thị"], button[title="Display settings"]');
  if (!btn) return { found: false };
  const r = btn.getBoundingClientRect();
  const svg = btn.querySelector('svg');
  const dot = [...btn.querySelectorAll('span')].some((s) => s.style && s.style.background && s.className.includes('rounded-full') && s.className.includes('w-4'));
  return { found: true, w: Math.round(r.width), h: Math.round(r.height), text: btn.textContent.trim(), svgSize: svg ? Math.round(svg.getBoundingClientRect().width) : 0, hasDot: dot, aria: btn.getAttribute('aria-label') };
})()`);

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
  await viewport(390, 844);
  await navigate(`${BASE}/`);
  await evaluate(`document.cookie = 'smmv2-lang=vi; path=/'; localStorage.setItem('smmv2-lang', 'vi'); localStorage.setItem('smmv2-accent', 'rose'); document.documentElement.setAttribute('data-accent', 'rose'); 'set'`);
  await navigate(`${BASE}/`);
  const p390 = await probe();
  console.log("390:", JSON.stringify(p390));
  await capture(`2026-11-08-displaybtn-390-${PHASE}`);
  await viewport(1440, 1100);
  await navigate(`${BASE}/`);
  const pDesk = await probe();
  console.log("desktop:", JSON.stringify(pDesk));
  await capture(`2026-11-08-displaybtn-desktop-${PHASE}`);
  if (PHASE === "after") {
    ok(p390.found && p390.svgSize >= 20, `icon trigger ở 390px >= 20px (thực tế ${p390.svgSize})`);
    ok(!p390.hasDot, "không còn chấm màu trên trigger");
    ok(pDesk.text.includes("Cài đặt"), "desktop hiện nhãn 'Cài đặt'");
  }
  console.log(failures === 0 ? "ALL PASS" : `${failures} FAIL`);
  chrome.kill();
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
