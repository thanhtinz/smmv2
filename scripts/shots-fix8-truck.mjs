/** FIX8 TASK 3 — icon xe tải cho badge Giao nhanh: chụp hàng thẻ trang chủ
 *  (tag trên ảnh) + hàng gói ở trang chi tiết (DeliveryBadge), kiểm tra path
 *  xe tải có mặt và path sấm sét KHÔNG còn trong 2 khu vực đó. */
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
  "--remote-debugging-port=9364", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9364/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
async function captureClip(name, clip) {
  const r = await send("Page.captureScreenshot", { format: "png", clip: { ...clip, scale: 2 }, captureBeyondViewport: true });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name);
}

const TRUCK_PROBE = `(() => {
  const all = [...document.querySelectorAll('svg path')];
  const truck = all.filter((p) => (p.getAttribute('d') || '').includes('M14 18V6a2')).length;
  const bolt = all.filter((p) => (p.getAttribute('d') || '').includes('4.5 13.5')).length;
  const fastBadges = [...document.querySelectorAll('span')].filter((s) => s.textContent.trim() === 'Giao nhanh').length;
  return { truck, bolt, fastBadges };
})()`;

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

  // Hàng thẻ trang chủ (khách): tag Giao nhanh trên ảnh
  await navigate(`${BASE}/`);
  let probe = await evaluate(TRUCK_PROBE);
  console.log("home probe:", JSON.stringify(probe));
  ok(probe.fastBadges > 0, `trang chủ: có tag Giao nhanh (${probe.fastBadges})`);
  ok(probe.truck > 0, "trang chủ: icon xe tải đã render");
  await evaluate(`window.scrollTo(0, 500)`);
  await sleep(700);
  await capture("2026-11-08-fasttruck-card");

  // Trang chi tiết (đăng nhập demo): hàng gói có DeliveryBadge
  await evaluate(`document.cookie = 'smmv2_session=${token}; path=/'; document.cookie = 'smmv2-lang=vi; path=/'; try { localStorage.setItem('smmv2-lang', 'vi'); } catch(e) {} 'set'`);
  await navigate(`${BASE}/dashboard/premium/youtube-premium`);
  probe = await evaluate(TRUCK_PROBE);
  console.log("detail probe:", JSON.stringify(probe));
  ok(probe.truck > 0, "chi tiết: icon xe tải trong hàng gói");
  ok(probe.bolt === 0, "chi tiết: không còn sấm sét ở khu vực gói/composer");
  const clip = await evaluate(`(() => {
    const el = [...document.querySelectorAll('span')].find((s) => s.textContent.trim() === 'Giao nhanh');
    if (!el) return null;
    const card = el.closest('button') || el.parentElement;
    const r = card.getBoundingClientRect();
    return { x: Math.max(0, r.x - 10), y: Math.max(0, r.y + window.scrollY - 10), width: Math.min(760, r.width + 20), height: r.height + 20 };
  })()`);
  if (clip) await captureClip("2026-11-08-fasttruck-detail", clip); else await capture("2026-11-08-fasttruck-detail");

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(2); }).finally(() => { try { chrome.kill(); } catch { /* */ } });
