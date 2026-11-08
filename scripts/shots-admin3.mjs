/** FIX8 TASK 4 — chụp 2 trang admin họ Telegram/Steam mới (toàn trang). */
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
const payload = { uid: 1, role: "ADMIN", username: "admin", sv: 0, amr: "passkey", iat: now, exp: now + 3600 };
const u = `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}`;
const token = `${u}.${createHmac("sha256", secret).update(u).digest("base64url")}`;

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--remote-debugging-port=9365", "--window-size=1440,1000",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9365/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
async function captureFull(name) {
  const h = await evaluate("Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0)");
  const r = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 1440, height: Math.min(h, 4000), scale: 1 }, captureBeyondViewport: true });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name, "h=", h);
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
  await evaluate(`document.cookie = 'smmv2_session=${token}; path=/'; document.cookie = 'smmv2-lang=vi; path=/'; 'set'`);

  await navigate(`${BASE}/admin/telegram/san-pham`);
  const tg = await evaluate(`(() => { const t = document.body.innerText; return {
    stars: t.includes('Gói Stars'), premium: t.includes('Gói Premium'),
    p3: t.includes('3 tháng'), p12: t.includes('12 tháng'),
    pricing: t.includes('Markup (%)'), add: t.includes('Thêm gói'),
    ownership: t.includes('Quyền sở hữu khi đồng bộ') }; })()`);
  console.log("telegram page:", JSON.stringify(tg));
  ok(tg.stars && tg.premium && tg.p3 && tg.p12 && tg.pricing && tg.add && tg.ownership, "admin Telegram: đủ 2 họ + thẻ giá NCC + form thêm + ghi chú đồng bộ");
  await captureFull("2026-11-08-admin3-telegram-products");

  await navigate(`${BASE}/admin/steam/san-pham`);
  const st = await evaluate(`(() => { const t = document.body.innerText; return {
    topup: t.includes('Gói Top-Up'), gift: t.includes('Game gift'),
    denoms: t.includes('100 USD'), game: t.includes('ELDEN RING'), appid: t.includes('1245620'),
    addGame: t.includes('Thêm game'), addDenom: t.includes('Thêm mệnh giá') }; })()`);
  console.log("steam page:", JSON.stringify(st));
  ok(st.topup && st.gift && st.denoms && st.game && st.appid && st.addGame && st.addDenom, "admin Steam: đủ 2 họ + mệnh giá + game/appid + 2 form thêm");
  await captureFull("2026-11-08-admin3-steam-products");

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(2); }).finally(() => { try { chrome.kill(); } catch { /* */ } });
