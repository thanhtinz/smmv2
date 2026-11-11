/** Đo chiều cao các khối ở trang /dashboard/nap-tien (đợt cân bằng 2026-11-10).
 *  Dùng: node scripts/measure-naptien.mjs <nhãn>
 *  In ra: từng thẻ/khối trực tiếp trong lưới chính (top/bottom/height + đoạn chữ đầu),
 *  đáy cột trái/phải và chênh lệch. */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

const BASE = "http://127.0.0.1:3000";
const label = process.argv[2] || "measure";
const envRaw = readFileSync("/home/hatch/workspace/smmv2/.env", "utf8");
let secret = envRaw.split("\n").find((l) => l.startsWith("AUTH_SECRET")).split("=").slice(1).join("=").trim();
if ((secret.startsWith('"') && secret.endsWith('"')) || (secret.startsWith("'") && secret.endsWith("'"))) secret = secret.slice(1, -1);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const mint = (claims) => {
  const u = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sv: 0, iat: now, exp: now + 3600, ...claims })}`;
  return `${u}.${createHmac("sha256", secret).update(u).digest("base64url")}`;
};
const demoToken = mint({ uid: 2, role: "USER", username: "demo" });

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=old", "--disable-gpu", "--no-sandbox", "--disable-setuid-sandbox", "--hide-scrollbars",
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-naptien-measure",
  "--remote-debugging-port=9391", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9391/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
async function navigate(url, waitMs = 3200) { await send("Page.navigate", { url }); await sleep(waitMs); }

const MEASURE = `(() => {
  const docY = (el) => Math.round(el.getBoundingClientRect().bottom + window.scrollY);
  const docT = (el) => Math.round(el.getBoundingClientRect().top + window.scrollY);
  // Lưới chính của trang: phần tử grid chứa thẻ "Nạp tiền"
  const cards = [...document.querySelectorAll('.card')];
  const depCard = cards.find((c) => (c.textContent || "").includes("Phương thức thanh toán"));
  if (!depCard) return { err: "không thấy thẻ nạp", text: (document.body.textContent || "").slice(0, 200) };
  const grid = depCard.parentElement;
  const blocks = [...grid.children].map((el) => ({
    tag: el.tagName, cls: (el.className || "").slice(0, 60),
    text: (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 45),
    top: docT(el), bottom: docY(el), height: Math.round(el.getBoundingClientRect().height),
    left: Math.round(el.getBoundingClientRect().left), width: Math.round(el.getBoundingClientRect().width),
  }));
  // Các thẻ con trong từng cột (nếu cột là div xếp dọc)
  const inner = [...grid.children].map((el) => [...el.querySelectorAll(':scope > .card, :scope > div.card')].map((c) => ({
    text: (c.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 40),
    top: docT(c), bottom: docY(c), height: Math.round(c.getBoundingClientRect().height),
  })));
  const cols = {};
  const leftBlocks = blocks.filter((b) => b.left < 720);
  const rightBlocks = blocks.filter((b) => b.left >= 720);
  cols.leftBottom = leftBlocks.length ? Math.max(...leftBlocks.map((b) => b.bottom)) : 0;
  cols.rightBottom = rightBlocks.length ? Math.max(...rightBlocks.map((b) => b.bottom)) : 0;
  cols.leftTop = leftBlocks.length ? Math.min(...leftBlocks.map((b) => b.top)) : 0;
  cols.rightTop = rightBlocks.length ? Math.min(...rightBlocks.map((b) => b.top)) : 0;
  return { gridCls: (grid.className || "").slice(0, 80), blocks, inner, cols, diff: Math.abs(cols.leftBottom - cols.rightBottom) };
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
  await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await send("Network.setCookie", { name: "smmv2_session", value: demoToken, url: BASE + "/", path: "/" });
  await send("Network.setCookie", { name: "smmv2-lang", value: "vi", url: BASE + "/", path: "/" });
  await navigate(`${BASE}/`, 2000);
  await evaluate(`(() => { try { localStorage.setItem("smmv2-lang", "vi"); document.cookie = "smmv2-lang=vi; path=/; max-age=31536000; samesite=lax"; } catch (e) {} return true; })()`);
  await navigate(`${BASE}/dashboard/nap-tien`, 4000);
  const r = await evaluate(MEASURE);
  console.log(`=== ${label} ===`);
  console.log(JSON.stringify(r, null, 1));
  try { chrome.kill(); } catch { /* noop */ }
}
main().catch((e) => { console.error(e); process.exit(1); });
