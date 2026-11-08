/** TASK 8 (fix6): nút "Tạo mới khóa API" che nút khác ở 390px — đo hộp các
 *  nút trong hàng API key ở tab Kết nối API (Hồ sơ). before|after */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

const PHASE = process.argv[2] || "before";
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
const u = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ uid: 2, role: "USER", username: "demo", sv: 0, iat: now, exp: now + 3600 })}`;
const token = `${u}.${createHmac("sha256", secret).update(u).digest("base64url")}`;

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--remote-debugging-port=9353", "--window-size=390,844",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9353/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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

const measure = () => evaluate(`(() => {
  const regen = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Tạo mới khóa API'));
  if (!regen) return { found: false };
  // hàng chứa: form của nút tạo mới + ApiKeyReveal (input key + mắt + copy)
  const row = regen.closest('form').parentElement;
  const keyInput = row.querySelector('input');
  const eye = row.querySelector('button[aria-label*="key"], button[title*="key"]');
  const allBtns = [...row.querySelectorAll('button')].map((b) => { const r = b.getBoundingClientRect(); return { text: (b.textContent || b.getAttribute('aria-label') || '').trim().slice(0, 24), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; });
  const rects = allBtns.map((b) => ({ ...b, x2: b.x + b.w, y2: b.y + b.h }));
  let overlaps = [];
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], c = rects[j];
    if (a.x < c.x2 && c.x < a.x2 && a.y < c.y2 && c.y < a.y2) overlaps.push(a.text + ' <> ' + c.text);
  }
  const kr = keyInput.getBoundingClientRect();
  const docW = document.documentElement.clientWidth;
  const scrollW = document.documentElement.scrollWidth;
  return { found: true, btns: allBtns, overlaps, keyInputW: Math.round(kr.width), rowScrollW: row.scrollWidth, rowClientW: row.clientWidth, docW, scrollW };
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
  await send("Network.enable");
  await viewport(390, 844);
  await navigate(`${BASE}/`);
  await evaluate(`document.cookie = 'smmv2_session=${token}; path=/'; document.cookie = 'smmv2-lang=vi; path=/'; localStorage.setItem('smmv2-lang', 'vi'); 'set'`);
  await navigate(`${BASE}/dashboard/ho-so?tab=api`);
  await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Tạo mới khóa API')); if (b) b.scrollIntoView({ block: 'center' }); return !!b; })()`);
  await sleep(600);
  const m = await measure();
  console.log(JSON.stringify(m, null, 1));
  ok(m.found, "thấy nút Tạo mới khóa API ở tab API");
  if (PHASE === "before") {
    ok(m.overlaps.length > 0 || m.rowScrollW > m.rowClientW || m.scrollW > m.docW, "BEFORE (tái hiện): có chồng lấn hoặc tràn ngang trong hàng API key");
  } else {
    ok(m.overlaps.length === 0, "AFTER: không nút nào chồng lên nhau");
    ok(m.rowScrollW <= m.rowClientW + 1, "AFTER: hàng API key không tràn ngang");
    ok(m.scrollW <= m.docW + 1, "AFTER: trang không tràn ngang");
  }
  await capture(`2026-11-08-apikey-${PHASE}-390`);
  if (PHASE === "after") {
    await viewport(1440, 1100);
    await navigate(`${BASE}/dashboard/ho-so?tab=api`);
    await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Tạo mới khóa API')); if (b) b.scrollIntoView({ block: 'center' }); return !!b; })()`);
    await sleep(600);
    await capture("2026-11-08-apikey-after-desktop");
  }
  console.log(failures === 0 ? "ALL PASS" : `${failures} FAIL`);
  chrome.kill();
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
