/** FIX8 TASK 4 — thêm gói tự thêm qua UI admin (3 họ) rồi chạy ĐỒNG BỘ FZR
 *  thật (mock) và xác nhận gói tự thêm còn nguyên (giá + đang bán), gói đồng
 *  bộ vẫn cập nhật bình thường. */
import { spawn } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

const BASE = "http://127.0.0.1:3000";
let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; };

const envRaw = readFileSync("/home/hatch/workspace/smmv2/.env", "utf8");
let secret = envRaw.split("\n").find((l) => l.startsWith("AUTH_SECRET")).split("=").slice(1).join("=").trim();
if ((secret.startsWith('"') && secret.endsWith('"')) || (secret.startsWith("'") && secret.endsWith("'"))) secret = secret.slice(1, -1);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const u = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ uid: 1, role: "ADMIN", username: "admin", sv: 0, amr: "passkey", iat: now, exp: now + 3600 })}`;
const ADMIN = `${u}.${createHmac("sha256", secret).update(u).digest("base64url")}`;

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--remote-debugging-port=9370", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9370/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
/** Điền form thêm theo name các ô rồi bấm nút submit chứa text. */
async function submitAddForm(fields, buttonText) {
  const r = await evaluate(`(() => {
    const forms = [...document.querySelectorAll('form')];
    for (const f of forms) {
      const first = f.querySelector('input[name="${Object.keys(fields)[0]}"]');
      if (!first) continue;
      for (const [name, value] of Object.entries(${JSON.stringify(fields)})) {
        const el = f.querySelector('input[name="' + name + '"]');
        if (el) { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); }
      }
      const btn = [...f.querySelectorAll('button')].find((b) => b.textContent.includes(${JSON.stringify(buttonText)}));
      if (btn) { btn.click(); return true; }
    }
    return false;
  })()`);
  await sleep(3000);
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
  await navigate(`${BASE}/`, 1200);
  await evaluate(`document.cookie = 'smmv2_session=${ADMIN}; path=/'; document.cookie = 'smmv2-lang=vi; path=/'; 'set'`);

  await navigate(`${BASE}/admin/telegram/san-pham`);
  ok(await submitAddForm({ months: "24", price: "699000" }, "Thêm gói"), "admin Telegram: đã gửi form thêm gói 24 tháng");
  const tg = await evaluate(`document.body.innerText`);
  ok(tg.includes("24 tháng") && tg.includes("Tự thêm"), "gói 24 tháng xuất hiện với nhãn Tự thêm");

  await navigate(`${BASE}/admin/steam/san-pham`);
  ok(await submitAddForm({ amount: "15", price: "15000" }, "Thêm mệnh giá"), "admin Steam: đã gửi form thêm mệnh giá 15 USD");
  ok(await submitAddForm({ appid: "730", name: "Counter-Strike 2", price: "39990" }, "Thêm game"), "admin Steam: đã gửi form thêm game appid 730");
  const st = await evaluate(`document.body.innerText`);
  ok(st.includes("15 USD") && st.includes("Counter-Strike 2"), "mệnh giá 15 USD + game CS2 xuất hiện ở admin Steam");

  writeFileSync("/tmp/fix8-adds-done", "1");
  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(2); }).finally(() => { try { chrome.kill(); } catch { /* */ } });
