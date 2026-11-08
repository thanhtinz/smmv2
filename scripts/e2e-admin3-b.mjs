/** FIX8 TASK 4 E2E-B — họ Stars + Game gift: giá chốt theo báo giá FZR nên
 *  đòn bẩy giá ở admin là markup nhà cung cấp. Markup 0 -> 100:
 *  Stars 50 sao: 750đ -> 1.500đ. Gift ELDEN RING: 45.990đ -> 91.980đ.
 *  Sau đó trả markup về 0. */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

const BASE = "http://127.0.0.1:3000";
let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; };

const envRaw = readFileSync("/home/hatch/workspace/smmv2/.env", "utf8");
let secret = envRaw.split("\n").find((l) => l.startsWith("AUTH_SECRET")).split("=").slice(1).join("=").trim();
if ((secret.startsWith('"') && secret.endsWith('"')) || (secret.startsWith("'") && secret.endsWith("'"))) secret = secret.slice(1, -1);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
function mint(uid, role, username, extra = {}) {
  const u = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ uid, role, username, sv: 0, iat: now, exp: now + 3600, ...extra })}`;
  return `${u}.${createHmac("sha256", secret).update(u).digest("base64url")}`;
}
const ADMIN = mint(1, "ADMIN", "admin", { amr: "passkey" });
const DEMO = mint(2, "USER", "demo");

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--remote-debugging-port=9369", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9369/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
async function navigate(url, waitMs = 2200) { await send("Page.navigate", { url }); await sleep(waitMs); }
async function asUser(token) {
  await navigate(`${BASE}/`, 1200);
  await evaluate(`document.cookie = 'smmv2_session=${token}; path=/'; document.cookie = 'smmv2-lang=vi; path=/'; 'set'`);
}
async function adminSetMarkup(markup) {
  const done = await evaluate(`(() => {
    const input = document.querySelector('form input[name="markupPercent"]');
    if (!input) return false;
    input.value = ${JSON.stringify(String(markup))};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const btn = input.closest('form').querySelector('button[type="submit"], button');
    if (btn) { btn.click(); return true; }
    return false;
  })()`);
  await sleep(2800);
  return done;
}
async function clickExact(text) {
  const r = await evaluate(`(() => {
    const main = document.querySelector('main') || document.body;
    const el = [...main.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(text)});
    if (el) { el.click(); return true; }
    return false;
  })()`);
  await sleep(700);
  return r;
}
async function clickContains(text) {
  const r = await evaluate(`(() => {
    const main = document.querySelector('main') || document.body;
    const el = [...main.querySelectorAll('button')].find((b) => b.textContent.includes(${JSON.stringify(text)}));
    if (el) { el.click(); return el.textContent.trim().slice(0, 50); }
    return null;
  })()`);
  await sleep(700);
  return r;
}
async function fill(selector, value) {
  const r = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    el.focus();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await sleep(300);
  return r;
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

  /* ===== Họ Stars: markup 0 -> 100, 50 sao = 1.500đ ===== */
  await asUser(ADMIN);
  await navigate(`${BASE}/admin/telegram/san-pham`);
  ok(await adminSetMarkup(100), "admin Telegram: đã lưu markup = 100%");

  await asUser(DEMO);
  await navigate(`${BASE}/dashboard/telegram`);
  ok(await fill('input[name="username"]', "@demo_user"), "khách: đã nhập username");
  ok(await fill('input[name="amount"]', "50"), "khách: đã nhập 50 sao");
  const starTotal = await evaluate(`document.body.innerText.includes('1.500')`);
  ok(starTotal, "trang khách Stars: tổng 50 sao hiện 1.500đ (30đ/sao theo markup mới)");
  await clickExact("Tiếp tục");
  await sleep(3500);
  await navigate(`${BASE}/dashboard/telegram/lich-su`);
  const thist = await evaluate(`document.body.innerText`);
  ok(/1\.500/.test(thist), "đơn Stars tính đúng 1.500đ (lịch sử Telegram)");

  await asUser(ADMIN);
  await navigate(`${BASE}/admin/telegram/san-pham`);
  await adminSetMarkup(0);
  console.log("đã trả markup Telegram về 0");

  /* ===== Họ Gift: markup 0 -> 100, ELDEN RING = 91.980đ ===== */
  await navigate(`${BASE}/admin/steam/san-pham`);
  ok(await adminSetMarkup(100), "admin Steam: đã lưu markup = 100%");

  await asUser(DEMO);
  await navigate(`${BASE}/dashboard/steam/gift-games`);
  await clickContains("ELDEN RING");
  await clickContains("Bản gift");
  ok(await fill("#sg-invite", "https://s.team/p/demo-user"), "khách: đã nhập link mời");
  await clickExact("Tiến hành");
  await sleep(4000);
  await navigate(`${BASE}/dashboard/steam/lich-su`);
  const ghist = await evaluate(`document.body.innerText`);
  ok(/91\.980/.test(ghist), "đơn Gift tính đúng 91.980đ (offer 45.99 x tỉ giá 1000 x markup 100%)");
  await navigate(`${BASE}/dashboard/steam/gift-games`);
  const gdisp = await evaluate(`document.body.innerText.includes('91.980')`);
  ok(gdisp, "trang khách Gift: giá hiển thị đã cập nhật 91.980đ sau khi chốt giá");

  await asUser(ADMIN);
  await navigate(`${BASE}/admin/steam/san-pham`);
  await adminSetMarkup(0);
  console.log("đã trả markup Steam về 0");

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(2); }).finally(() => { try { chrome.kill(); } catch { /* */ } });
