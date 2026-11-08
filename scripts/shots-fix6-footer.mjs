/** TASK 12 (fix6): footer — before/after + kiểm kê link + bản dark.
 *  node scripts/shots-fix6-footer.mjs before|after */
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
  "--remote-debugging-port=9357", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9357/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
const toFooter = () => evaluate(`(() => { const f = document.querySelector('footer'); if (f) { f.scrollIntoView({ block: 'start' }); return true; } return false; })()`);

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
  await navigate(`${BASE}/premium`);
  ok(await toFooter(), "thấy footer");
  await sleep(600);
  const inv = await evaluate(`(() => {
    const f = document.querySelector('footer');
    const links = [...f.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    const heads = [...f.querySelectorAll('div')].map((d) => d.childElementCount === 0 ? d.textContent.trim() : '').filter(Boolean);
    return { links, text: f.textContent.replace(/\\s+/g, ' ').slice(0, 400), overflowX: f.scrollWidth > f.clientWidth };
  })()`);
  console.log("footer links:", JSON.stringify(inv.links));
  console.log("footer text:", inv.text);
  for (const href of ["/premium", "/dashboard/dich-vu", "/register", "/login", "/dashboard/nap-tien", "/dashboard/ticket"]) {
    ok(inv.links.includes(href), `link còn nguyên: ${href}`);
  }
  ok(!inv.overflowX, "footer không tràn ngang");
  await capture(`2026-11-08-footer-desktop-${PHASE}`);
  await viewport(390, 844);
  await navigate(`${BASE}/premium`);
  await toFooter();
  await sleep(600);
  await capture(`2026-11-08-footer-390-${PHASE}`);
  if (PHASE === "after") {
    await viewport(1440, 1100);
    await navigate(`${BASE}/premium`);
    await evaluate(`document.documentElement.classList.add('dark'); 'dark'`);
    await toFooter();
    await sleep(600);
    const darkBg = await evaluate(`getComputedStyle(document.querySelector('footer')).backgroundColor`);
    console.log("footer bg (dark):", darkBg);
    await capture("2026-11-08-footer-dark-after");
  }
  console.log(failures === 0 ? "ALL PASS" : `${failures} FAIL`);
  chrome.kill();
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
