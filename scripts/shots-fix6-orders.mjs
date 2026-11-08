/** TASK 3 (fix6): audit + kiểm chứng giao diện các trang đơn hàng.
 *  node scripts/shots-fix6-orders.mjs before|after
 *  before = trạng thái cũ (bảng/h1), after = sau khi dựng lại kiểu thẻ chung. */
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
const secretLine = envRaw.split("\n").find((l) => l.startsWith("AUTH_SECRET"));
let secret = secretLine.split("=").slice(1).join("=").trim();
if ((secret.startsWith('"') && secret.endsWith('"')) || (secret.startsWith("'") && secret.endsWith("'"))) secret = secret.slice(1, -1);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const unsigned = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ uid: 2, role: "USER", username: "demo", sv: 2, iat: now, exp: now + 3600 })}`;
const token = `${unsigned}.${createHmac("sha256", secret).update(unsigned).digest("base64url")}`;

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--remote-debugging-port=9346", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9346/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
async function captureFull(name) {
  const m = await send("Page.getLayoutMetrics");
  const cs = m.cssContentSize || m.contentSize;
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: cs.width, height: Math.min(cs.height, 6000), scale: 1 } });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name, `${cs.width}x${Math.round(cs.height)}`);
}
async function viewport(width, height) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 500 });
}

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
  await send("Network.setCookie", { name: "smmv2_session", value: token, domain: "127.0.0.1", path: "/" });
  await send("Network.setCookie", { name: "smmv2-lang", value: "vi", domain: "127.0.0.1", path: "/" });
  await navigate(`${BASE}/dashboard/don-hang`);
  await evaluate("localStorage.setItem('smmv2-lang', 'vi'); document.cookie = 'smmv2-lang=vi; path=/'; 'set'");
  const who = await evaluate("document.body.innerText.includes('SMM100101') || document.body.innerText.includes('Demo')");
  ok(!!who, "đăng nhập bằng cookie JWT chạy (thấy dữ liệu demo)");

  const probe = () => evaluate(`(() => ({
    tables: document.querySelectorAll('table').length,
    lavender: document.body.innerHTML.includes('ece8ff'),
    h1plain: !!document.querySelector('h1'),
  }))()`);

  // ---- SMM history ----
  await navigate(`${BASE}/dashboard/don-hang`);
  let p = await probe();
  console.log("don-hang probe:", JSON.stringify(p));
  if (PHASE === "before") ok(p.tables >= 1, "BEFORE: danh sách đơn SMM còn bảng cũ");
  if (PHASE === "after") { ok(p.tables === 0, "AFTER: danh sách đơn SMM hết bảng — thẻ/row"); ok(p.lavender, "AFTER: có header card tím"); }
  await captureFull(`2026-11-08-orders-${PHASE}-don-hang`);

  // ---- SMM detail (trang mẫu NEW từ fix5) ----
  await navigate(`${BASE}/dashboard/don-hang/SMM100101`);
  await captureFull(`2026-11-08-orders-${PHASE}-don-hang-detail`);

  // ---- SMM placement (trang mẫu NEW từ fix5) ----
  await navigate(`${BASE}/dashboard/dat-hang`);
  await captureFull(`2026-11-08-orders-${PHASE}-dat-hang`);

  // ---- Premium orders ----
  await navigate(`${BASE}/dashboard/don-premium`);
  p = await probe();
  console.log("don-premium probe:", JSON.stringify(p));
  if (PHASE === "after") ok(p.lavender, "AFTER: đơn Premium có header card tím");
  await captureFull(`2026-11-08-orders-${PHASE}-don-premium`);
  // mở modal chi tiết (phải còn nguyên sau khi dựng lại khung)
  const opened = await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Chi tiết'); if (b) { b.click(); return true; } return false; })()`);
  await sleep(1200);
  const modal = await evaluate(`(() => ({ open: document.body.innerText.includes('Thông tin đơn hàng'), code: document.body.innerText.includes('PRE100201') || document.body.innerText.includes('PRE100202') }))()`);
  ok(opened && modal.open, "modal chi tiết đơn Premium mở được, có mục Thông tin đơn hàng");
  await capture(`2026-11-08-orders-${PHASE}-don-premium-modal`);
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); document.body.click(); 'x'`);
  await sleep(500);

  // ---- Telegram history ----
  await navigate(`${BASE}/dashboard/telegram/lich-su`);
  p = await probe();
  console.log("tg-history probe:", JSON.stringify(p));
  if (PHASE === "before") ok(p.tables >= 1, "BEFORE: lịch sử Telegram còn bảng cũ");
  if (PHASE === "after") { ok(p.tables === 0, "AFTER: lịch sử Telegram hết bảng — thẻ/row"); ok(p.lavender, "AFTER: lịch sử Telegram có header card tím"); }
  await captureFull(`2026-11-08-orders-${PHASE}-tg-history`);

  // ---- Bulk placement frame ----
  await navigate(`${BASE}/dashboard/dat-hang-loat`);
  p = await probe();
  console.log("bulk probe:", JSON.stringify(p));
  if (PHASE === "after") ok(p.lavender, "AFTER: đặt hàng loạt có header card tím");
  await captureFull(`2026-11-08-orders-${PHASE}-bulk`);

  if (PHASE === "after") {
    await viewport(390, 844);
    await navigate(`${BASE}/dashboard/don-hang`);
    await capture("2026-11-08-orders-after-don-hang-390");
    await navigate(`${BASE}/dashboard/don-premium`);
    await capture("2026-11-08-orders-after-don-premium-390");
  }

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAIL`);
  chrome.kill();
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
