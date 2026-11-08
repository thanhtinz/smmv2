/** Fix5 WS5: đo chiều cao ô date vs ô chữ/select trong cùng hàng lọc ở 390px
 *  (trang dòng tiền /dashboard/giao-dich + lịch sử Telegram) + chụp sau khi sửa.
 *  Chromium không tái hiện được control native của iOS Safari; phép đo chứng
 *  minh các ô dùng chung một hộp CSS và rule mới có mặt trong CSS đã build. */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });
let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; };

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--remote-debugging-port=9343", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9343/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
async function viewport(width, height) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 500 });
}

const MEASURE = `(() => {
  const form = [...document.querySelectorAll('form')].find((f) => f.querySelector('input[type="date"]'));
  if (!form) return null;
  const out = {};
  for (const el of form.querySelectorAll('input, select')) {
    const key = el.type ? el.type + (el.name ? ':' + el.name : '') : el.tagName.toLowerCase();
    const r = el.getBoundingClientRect();
    if (r.height > 0) out[key] = Math.round(r.height * 100) / 100;
  }
  return out;
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
  await send("Network.setCookie", { name: "smmv2-lang", value: "vi", domain: "127.0.0.1", path: "/" });
  await navigate(`${BASE}/login`);
  await evaluate("localStorage.setItem('smmv2-lang', 'vi'); 'set'");
  await sleep(1500);
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
  console.log("login:", await fillSubmit({ login: "demo", password: "Demo@123" }));
  await sleep(2500);

  // Trang dòng tiền: hàng lọc có date + text + select cùng cỡ !py-2
  await viewport(390, 844);
  await navigate(`${BASE}/dashboard/giao-dich`);
  const m1 = await evaluate(MEASURE);
  console.log("giao-dich heights:", JSON.stringify(m1));
  if (m1) {
    const hs = Object.values(m1);
    ok(Math.max(...hs) - Math.min(...hs) <= 1, `dòng tiền 390: mọi ô lọc cùng chiều cao (min ${Math.min(...hs)} max ${Math.max(...hs)})`);
  } else ok(false, "dòng tiền: tìm thấy form có ô date");
  await capture("2026-11-07-fix5-ios-cashflow-390");

  // Lịch sử Telegram: cặp ô date cạnh nhãn + nút
  await navigate(`${BASE}/dashboard/telegram/lich-su`);
  const m2 = await evaluate(MEASURE);
  console.log("telegram-history heights:", JSON.stringify(m2));
  if (m2) {
    const ds = Object.entries(m2).filter(([k]) => k.startsWith("date")).map(([, v]) => v);
    ok(ds.length >= 2 && Math.max(...ds) - Math.min(...ds) <= 1, "lịch sử Telegram 390: hai ô date bằng chiều cao nhau");
  } else ok(false, "lịch sử Telegram: tìm thấy form có ô date");
  await capture("2026-11-07-fix5-ios-telegram-390");

  ws.close();
  chrome.kill();
  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
