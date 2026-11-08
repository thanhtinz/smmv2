/** TASK 10 (fix6): bộ ảnh đồng bộ màu — home/listing/detail/dashboard/order/admin. */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });

const envRaw = readFileSync("/home/hatch/workspace/smmv2/.env", "utf8");
let secret = envRaw.split("\n").find((l) => l.startsWith("AUTH_SECRET")).split("=").slice(1).join("=").trim();
if ((secret.startsWith('"') && secret.endsWith('"')) || (secret.startsWith("'") && secret.endsWith("'"))) secret = secret.slice(1, -1);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const mk = (claims) => { const u = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ ...claims, iat: now, exp: now + 3600 })}`; return `${u}.${createHmac("sha256", secret).update(u).digest("base64url")}`; };
const demoTok = mk({ uid: 2, role: "USER", username: "demo", sv: 0 });
const adminTok = mk({ uid: 1, role: "ADMIN", username: "admin", sv: 0, amr: "passkey" });

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--remote-debugging-port=9355", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9355/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
  // khách vãng lai: home + listing + detail
  await navigate(`${BASE}/`);
  await evaluate(`document.cookie = 'smmv2-lang=vi; path=/'; localStorage.setItem('smmv2-lang', 'vi'); 'set'`);
  await navigate(`${BASE}/`);
  await evaluate("window.scrollTo(0, 900); 's'");
  await sleep(500);
  await capture("2026-11-08-colors-home");
  await navigate(`${BASE}/premium`);
  await capture("2026-11-08-colors-listing");
  await navigate(`${BASE}/premium/youtube-premium`);
  await capture("2026-11-08-colors-detail");
  // demo: trang đặt đơn SMM (header card + huy hiệu số thứ tự nay là brand)
  await evaluate(`document.cookie = 'smmv2_session=${demoTok}; path=/'; 'set'`);
  await navigate(`${BASE}/dashboard/dat-hang`);
  await capture("2026-11-08-colors-order");
  await navigate(`${BASE}/dashboard/don-premium`);
  await capture("2026-11-08-colors-dashboard");
  // admin
  await evaluate(`document.cookie = 'smmv2_session=${adminTok}; path=/'; 'set'`);
  await navigate(`${BASE}/admin`);
  await capture("2026-11-08-colors-admin");
  chrome.kill();
  process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
