/* Kiểm chứng panel USDT sau Phase 2: phiên chờ do seed-bolt-shot tạo qua
 * boltCreateOrder (mock theo hợp đồng mới) phải hiện địa chỉ ví + số USDT
 * CHÍNH XÁC từ payment.amount + đếm ngược từ expireTimestamp trả về. */
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
const u = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ uid: 2, role: "USER", username: "demo", sv: 0, iat: now, exp: now + 3600 })}`;
const demoToken = `${u}.${createHmac("sha256", secret).update(u).digest("base64url")}`;

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=old", "--disable-gpu", "--no-sandbox", "--disable-setuid-sandbox", "--hide-scrollbars",
  "--user-data-dir=/tmp/chrome-usdt-p2", "--remote-debugging-port=9417", "--window-size=1280,1000",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9417/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
    await sleep(200);
  }
  throw new Error("chrome CDP không lên");
}
let msgId = 0;
const pending = new Map();
let ws, sessionId = null;
function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}
ws = new WebSocket(await wsUrl());
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
};
const targets = await send("Target.getTargets");
const pageTarget = targets.targetInfos.find((t) => t.type === "page");
sessionId = (await send("Target.attachToTarget", { targetId: pageTarget.targetId, flatten: true })).sessionId;
await send("Page.enable");
await send("Network.enable");
await send("Network.setCookie", { name: "smmv2_session", value: demoToken, url: BASE, path: "/" });
await send("Page.navigate", { url: `${BASE}/dashboard/nap-tien` });
await sleep(2500);
async function evalJs(expr) {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
  return r.result?.value;
}
// Bấm thẻ phương thức USDT trong lưới 2x2
await evalJs(`[...document.querySelectorAll('button')].find(b => /USDT/.test(b.textContent || ''))?.click()`);
await sleep(1200);
const text1 = await evalJs(`document.body.innerText`);
ok(/TMockBoltAddress123456789/.test(text1), "panel USDT hiện đúng địa chỉ ví mock trả về");
ok(/(Số USDT cần chuyển|USDT to send)\s*\n\s*20(\.0+)?\s*(\n|$)/.test(text1), "panel hiện số USDT chính xác từ payment.amount (20 USDT cho 500.000đ ÷ 25.000)");
const cd1 = await evalJs(`(document.body.innerText.match(/(\\d{1,2}):(\\d{2})\\s*(phút|giây)?/) || [])[0] || ''`);
ok(/\d{1,2}:\d{2}/.test(text1), `panel có đếm ngược phiên (mm:ss) — mẫu: ${cd1}`);
const grabExpiry = () => evalJs(`(() => { const m = document.body.innerText.match(/(?:Expires in|Hết hạn sau)\\s*(\\d+):(\\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; })()`);
const tA = await grabExpiry();
await sleep(2100);
const tB = await grabExpiry();
ok(tA != null && tB != null && tB < tA && tA - tB <= 3, `đếm ngược chạy theo expireTimestamp thật (30 phút): ${tA}s -> ${tB}s`);
chrome.kill();
console.log(failures ? `\n${failures} FAIL` : "\nALL PASS");
process.exit(failures ? 1 : 0);
