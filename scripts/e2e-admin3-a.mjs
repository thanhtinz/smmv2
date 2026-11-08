/** FIX8 TASK 4 E2E-A (v2) — sửa giá admin họ Premium Telegram + Top-Up Steam,
 *  khách thấy + đơn tính đúng giá mới, rồi trả giá cũ.
 *  Premium 3 tháng: 12.990 -> 13.500. Top-Up 10 USD: 10.000 -> 10.500.
 *  Chọn tử theo name/id + click đúng văn bản trong <main> (tránh topbar). */
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
  "--remote-debugging-port=9368", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9368/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
async function adminSetPrice(rowMarker, price) {
  const done = await evaluate(`(() => {
    const forms = [...document.querySelectorAll('form')];
    for (const f of forms) {
      const priceInput = f.querySelector('input[name="price"]');
      if (!priceInput) continue;
      const row = f.closest('div');
      if (row && row.textContent.includes(${JSON.stringify(rowMarker)})) {
        priceInput.value = ${JSON.stringify(String(price))};
        priceInput.dispatchEvent(new Event('input', { bubbles: true }));
        const btn = f.querySelector('button[type="submit"], button');
        if (btn) { btn.click(); return true; }
      }
    }
    return false;
  })()`);
  await sleep(2800);
  return done;
}
/** Click nút trong <main> có textContent KHỚP NGUYÊN VĂN. */
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
/** Click nút trong <main> chứa đoạn text. */
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

  /* ===== Họ Premium: 3 tháng -> 13.500 ===== */
  await asUser(ADMIN);
  await navigate(`${BASE}/admin/telegram/san-pham`);
  ok(await adminSetPrice("Thời hạn: 3 tháng", 13500), "admin: đã lưu giá 3 tháng = 13.500");

  await asUser(DEMO);
  await navigate(`${BASE}/dashboard/telegram`);
  ok(await clickExact("Premium"), "khách: đã chuyển tab Premium");
  const shown = await evaluate(`document.body.innerText.includes('13.500')`);
  ok(shown, "trang khách Telegram: gói 3 tháng HIỂN THỊ 13.500đ");
  ok(await fill('input[name="username"]', "@demo_user"), "khách: đã nhập username");
  await clickContains("3 tháng");
  await clickExact("Tiếp tục");
  await sleep(3500);
  const afterOrder = await evaluate(`location.pathname + ' | ' + document.body.innerText.slice(0, 200)`);
  console.log("sau đặt đơn premium:", afterOrder.replace(/\n/g, " "));
  await navigate(`${BASE}/dashboard/telegram/lich-su`);
  const hist = await evaluate(`document.body.innerText`);
  ok(/13\.500/.test(hist), "đơn Premium tính đúng 13.500đ (lịch sử Telegram)");

  /* ===== Họ Top-Up: 10 USD -> 10.500 ===== */
  await asUser(ADMIN);
  await navigate(`${BASE}/admin/steam/san-pham`);
  ok(await adminSetPrice("Mệnh giá: 10 USD", 10500), "admin: đã lưu giá 10 USD = 10.500");

  await asUser(DEMO);
  await navigate(`${BASE}/dashboard/steam/top-up`);
  await clickContains("10 USD");
  const sum = await evaluate(`document.body.innerText.includes('10.500')`);
  ok(sum, "trang khách Top-Up: Summary hiện 10.500đ");
  ok(await fill("#steam-login", "demo_steam"), "khách: đã nhập Steam login");
  await clickExact("Tiếp tục");
  await sleep(3500);
  await navigate(`${BASE}/dashboard/steam/lich-su`);
  const shist = await evaluate(`document.body.innerText`);
  ok(/10\.500/.test(shist), "đơn Top-Up tính đúng 10.500đ (lịch sử Steam)");

  /* ===== Trả giá cũ ===== */
  await asUser(ADMIN);
  await navigate(`${BASE}/admin/telegram/san-pham`);
  await adminSetPrice("Thời hạn: 3 tháng", 12990);
  await navigate(`${BASE}/admin/steam/san-pham`);
  await adminSetPrice("Mệnh giá: 10 USD", 10000);
  console.log("đã trả giá cũ: Premium 3 tháng 12.990, Top-Up 10 USD 10.000");

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(2); }).finally(() => { try { chrome.kill(); } catch { /* */ } });
