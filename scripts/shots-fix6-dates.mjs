/** TASK 4 (fix6): đo chiều cao/cỡ chữ THẬT của mọi ô date/time/datetime-local
 *  + ô kề cùng hàng trong Chromium, trước/sau khi siết CSS vòng 2.
 *  node scripts/shots-fix6-dates.mjs before|after */
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
const mint = (uid, role, username, extra = {}) => {
  const u = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ uid, role, username, sv: 0, iat: now, exp: now + 3600, ...extra })}`;
  return `${u}.${createHmac("sha256", secret).update(u).digest("base64url")}`;
};
const TOKENS = { demo: mint(2, "USER", "demo"), admin: mint(1, "ADMIN", "admin", { amr: "passkey" }) };

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--remote-debugging-port=9349", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9349/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
async function capture(name) {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name);
}
async function viewport(width, height) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 500 });
}
async function loginAs(who) {
  await send("Network.setCookie", { name: "smmv2_session", value: TOKENS[who], domain: "127.0.0.1", path: "/" });
}

const measure = () => evaluate(`(() => {
  const fields = [...document.querySelectorAll('input[type="date"], input[type="time"], input[type="datetime-local"]')].map((el) => {
    const cs = getComputedStyle(el);
    // ô kề: input/select khác trong cùng form (hoặc cùng thẻ cha gần nhất)
    const form = el.closest('form') || el.parentElement?.parentElement;
    const sibs = form ? [...form.querySelectorAll('input:not([type="date"]):not([type="time"]):not([type="datetime-local"]):not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), select')].filter((s) => s.offsetParent !== null).map((s) => ({ tag: s.tagName + ':' + (s.getAttribute('type') || s.name || ''), h: s.offsetHeight })) : [];
    return { type: el.type, name: el.name || '', cls: (el.className || '').slice(0, 60), h: el.offsetHeight, font: cs.fontSize, sibs: sibs.slice(0, 4) };
  });
  return { url: location.pathname, fields };
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
  await send("Network.setCookie", { name: "smmv2-lang", value: "vi", domain: "127.0.0.1", path: "/" });

  const report = [];
  const check = (m, label) => {
    console.log(`--- ${label} (${m.url}) ---`);
    for (const f of m.fields) {
      console.log(`  ${f.type}[${f.name}] h=${f.h} font=${f.font} cls="${f.cls}" sibs=${JSON.stringify(f.sibs)}`);
      report.push({ label, ...f });
      if (f.sibs.length) {
        const target = f.sibs[0].h;
        if (PHASE === "after") ok(Math.abs(f.h - target) <= 1, `${label} ${f.type}[${f.name}]: cao ${f.h}px ≈ ô kề ${target}px`);
      }
    }
    if (!m.fields.length) console.log("  (không thấy ô date/time — trang có thể đã chuyển hướng)");
  };

  await loginAs("demo");
  await navigate(`${BASE}/dashboard/don-hang`);
  await evaluate("localStorage.setItem('smmv2-lang', 'vi'); document.cookie = 'smmv2-lang=vi; path=/'; 'set'");
  check(await measure(), "SMM lọc đơn (demo)");
  if (PHASE === "after") { await viewport(390, 844); await navigate(`${BASE}/dashboard/don-hang`); await capture("2026-11-08-dates-after-don-hang-390"); await viewport(1440, 1100); }
  await navigate(`${BASE}/dashboard/telegram/lich-su`);
  check(await measure(), "Telegram lịch sử (demo)");
  if (PHASE === "after") { await viewport(390, 844); await navigate(`${BASE}/dashboard/telegram/lich-su`); await capture("2026-11-08-dates-after-tg-390"); await viewport(1440, 1100); }

  await loginAs("admin");
  await navigate(`${BASE}/admin/khuyen-mai`);
  check(await measure(), "Admin flash-sale");
  if (PHASE === "after") await capture("2026-11-08-dates-after-flash-desktop");
  await navigate(`${BASE}/admin/ma-giam-gia`);
  check(await measure(), "Admin mã giảm giá");
  await navigate(`${BASE}/admin/bao-cao`);
  check(await measure(), "Admin báo cáo (time + export)");
  await navigate(`${BASE}/admin/nap-tien`);
  check(await measure(), "Admin nạp tiền");
  await navigate(`${BASE}/admin/telegram`);
  check(await measure(), "Admin telegram");

  writeFileSync(`/tmp/dates-${PHASE}.json`, JSON.stringify(report, null, 1));
  console.log(failures === 0 ? "ALL PASS" : `${failures} FAIL`);
  chrome.kill();
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
