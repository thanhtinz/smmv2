/** TASK 13 (fix6): đo chiều cao thẻ PremiumCard theo từng khu (trang chủ:
 *  nổi bật / bán chạy / đã xem; listing /premium; liên quan ở chi tiết).
 *  node scripts/shots-fix6-cards.mjs before|after */
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
  "--remote-debugging-port=9358", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9358/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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

const measureExpr = `(() => {
  const cards = [...document.querySelectorAll('a[href^="/premium/"]')].filter((a) => a.querySelector('div'));
  const bySection = {};
  for (const a of cards) {
    const sec = a.closest('section');
    let key = 'no-section';
    if (sec) {
      const h = sec.querySelector('h2');
      key = h ? h.textContent.trim() : 'section?';
    }
    const r = a.getBoundingClientRect();
    (bySection[key] = bySection[key] || []).push({ name: a.querySelector('.line-clamp-2')?.textContent.trim().slice(0, 26), h: Math.round(r.height) });
  }
  return bySection;
})()`;

function report(tag, data) {
  for (const [sec, list] of Object.entries(data)) {
    const hs = list.map((x) => x.h);
    const min = Math.min(...hs), max = Math.max(...hs);
    console.log(`${tag} | ${sec}: n=${list.length} min=${min} max=${max} variance=${max - min}`);
    if (PHASE === "after" && list.length > 1) ok(max - min === 0, `khu "${sec}" cao đều (0px)`);
  }
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
  await evaluate(`document.cookie = 'smmv2-lang=vi; path=/'; localStorage.setItem('smmv2-lang', 'vi'); localStorage.setItem('smmv2-recent-v1', JSON.stringify([{productId: 1, at: Date.now()}, {productId: 2, at: Date.now()}])); 'set'`);
  await navigate(`${BASE}/`);
  await sleep(800);
  report("HOME", await evaluate(measureExpr));
  await evaluate(`(() => { const h = [...document.querySelectorAll('h2')].find((x) => x.textContent.includes('Sản phẩm nổi bật')); if (h) h.scrollIntoView({ block: 'start' }); return 1; })()`);
  await sleep(600);
  await capture(`2026-11-08-cards-home-${PHASE}`);
  await navigate(`${BASE}/premium`);
  report("LISTING", await evaluate(measureExpr));
  await evaluate("window.scrollTo(0, 500); 's'");
  await sleep(500);
  await capture(`2026-11-08-cards-listing-${PHASE}`);
  await navigate(`${BASE}/premium/youtube-premium`);
  await evaluate(`(() => { const h = [...document.querySelectorAll('h2')].find((x) => x.textContent.includes('Sản phẩm liên quan')); if (h) h.scrollIntoView({ block: 'center' }); return 1; })()`);
  await sleep(600);
  report("DETAIL-RELATED", await evaluate(measureExpr));
  console.log(failures === 0 ? "ALL PASS" : `${failures} FAIL`);
  chrome.kill();
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
