/** FIX7 TASK B: 3 trang danh sách đơn (SMM / Premium / Telegram mẫu) chụp
 *  cạnh nhau + đo khung (header card, hàng stat, thẻ lọc, thẻ đơn) + chạy
 *  thử bộ lọc của 2 trang dựng lại + modal Premium. */
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
const u = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ uid: 2, role: "USER", username: "demo", sv: 0, iat: now, exp: now + 3600 })}`;
const token = `${u}.${createHmac("sha256", secret).update(u).digest("base64url")}`;

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--remote-debugging-port=9358", "--window-size=1440,1200",
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
async function captureFull(name) {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name);
}
async function viewport(width, height) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 500 });
}

const SKELETON = `(() => {
  const main = document.querySelector('main') || document.body;
  const headerCard = main.querySelector('.bg-gradient-to-br');
  const form = main.querySelector('form.card');
  const grid = [...main.querySelectorAll('div')].find((d) => d.className.includes('xl:grid-cols-4') && d.className.includes('grid-cols-2'));
  const statCards = grid ? [...grid.children] : [];
  const rect = (el) => el ? { w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) } : null;
  return {
    header: rect(headerCard),
    stats: statCards.length,
    filter: rect(form),
    text: (main.textContent || '').replace(/\\s+/g, ' ').slice(0, 20000),
  };
})()`;

async function visit(key, path) {
  await navigate(`${BASE}${path}`);
  const sk = await evaluate(SKELETON);
  console.log(`\n== ${key} ${path} ==`, JSON.stringify({ header: sk.header, stats: sk.stats, filter: sk.filter }));
  return sk;
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
  await send("Network.enable");
  await navigate(`${BASE}/`);
  await evaluate(`document.cookie = 'smmv2_session=${token}; path=/'; document.cookie = 'smmv2-lang=vi; path=/'; try { localStorage.setItem('smmv2-lang', 'vi'); } catch(e) {} 'set'`);

  const pages = [
    ["telegram", "/dashboard/telegram/lich-su"],
    ["smm", "/dashboard/don-hang"],
    ["premium", "/dashboard/don-premium"],
  ];
  const sks = {};
  await viewport(1440, 1200);
  for (const [key, path] of pages) { sks[key] = await visit(key, path); await captureFull(`2026-11-08-ordersmatch-${key}-desktop`); }
  for (const key of ["smm", "premium"]) {
    ok(sks[key].stats === 4, `${key}: đủ 4 thẻ thống kê (thực: ${sks[key].stats})`);
    ok(!!sks[key].filter, `${key}: có thẻ lọc`);
    ok(Math.abs(sks[key].header.w - sks.telegram.header.w) <= 2, `${key}: header card cùng bề ngang trang mẫu (${sks[key].header.w} vs ${sks.telegram.header.w})`);
    ok(Math.abs(sks[key].header.h - sks.telegram.header.h) <= 2, `${key}: header card cùng chiều cao trang mẫu (${sks[key].header.h} vs ${sks.telegram.header.h})`);
  }
  ok(sks.smm.text.includes("SMM100101") && sks.smm.text.includes("SMM100102"), "smm: thấy 2 đơn mẫu");
  ok(sks.smm.text.includes("Tổng đã chi"), "smm: stat Tổng đã chi");
  ok(sks.premium.text.includes("PRE100201"), "premium: thấy đơn mẫu PRE100201");
  ok(sks.telegram.text.includes("PRE100203"), "telegram (mẫu): thấy đơn PRE100203");

  // --- chạy thử bộ lọc SMM: trạng thái Hoàn thành ---
  await evaluate(`(() => { const s = document.querySelector('select[name="st"]'); return s ? s.value : 'no-page'; })()`);
  await navigate(`${BASE}/dashboard/don-hang`);
  await evaluate(`(() => { const s = document.querySelector('select[name="st"]'); s.value = 'COMPLETED'; s.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('form.card button').click(); return 'go'; })()`);
  await sleep(2800);
  let body = await evaluate(`document.body.textContent.replace(/\\s+/g, ' ')`);
  ok(body.includes("SMM100102") && !body.includes("SMM100101"), "smm lọc COMPLETED: chỉ còn đơn hoàn thành");
  ok(await evaluate(`location.search.includes('st=COMPLETED')`), "smm lọc: URL có st=COMPLETED");
  // --- tìm kiếm SMM theo mã ---
  await navigate(`${BASE}/dashboard/don-hang?f=1&q=SMM100103`);
  body = await evaluate(`document.body.textContent.replace(/\\s+/g, ' ')`);
  ok(body.includes("SMM100103") && !body.includes("SMM100102"), "smm tìm theo mã: chỉ còn SMM100103");

  // --- bộ lọc Premium: trạng thái Đã giao ---
  await navigate(`${BASE}/dashboard/don-premium`);
  await evaluate(`(() => { const s = document.querySelector('select[name="status"]'); s.value = 'DELIVERED'; s.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('form.card button').click(); return 'go'; })()`);
  await sleep(2800);
  body = await evaluate(`document.body.textContent.replace(/\\s+/g, ' ')`);
  ok(body.includes("PRE100201") && !body.includes("PRE100202"), "premium lọc DELIVERED: chỉ còn đơn đã giao");
  // --- modal Premium còn mở được ---
  await navigate(`${BASE}/dashboard/don-premium`);
  await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Chi tiết'); if (b) b.click(); return !!b; })()`);
  await sleep(900);
  body = await evaluate(`document.body.textContent.replace(/\\s+/g, ' ')`);
  ok(body.includes("Chi tiết đơn hàng"), "premium: bấm Chi tiết mở được modal");

  await viewport(390, 844);
  for (const [key, path] of pages) { await navigate(`${BASE}${path}`); await captureFull(`2026-11-08-ordersmatch-${key}-390`); }

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAIL`);
  chrome.kill();
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
