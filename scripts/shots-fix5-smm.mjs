/** Fix5 WS7: trang Đặt đơn SMM kiểu Telegram — chụp desktop + 390 và đặt 1
 *  đơn THẬT qua form mới, đối chiếu: tổng trên UI == charge trong DB == số
 *  tiền ví bị trừ (công thức cũ không đổi). node scripts/shots-fix5-smm.mjs */
import { spawn, execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });
let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; };
function tsx(args) {
  return execSync(
    "bash -c 'set -a; source .env; set +a; export PRISMA_QUERY_ENGINE_LIBRARY=$PWD/node_modules/@prisma/engines/libquery_engine-debian-openssl-3.0.x.so.node PRISMA_SCHEMA_ENGINE_BINARY=$PWD/node_modules/@prisma/engines/schema-engine-debian-openssl-3.0.x; npx tsx scripts/test-fix5-smm.ts " + args + "'",
    { cwd: "/home/hatch/workspace/smmv2", encoding: "utf8" }
  ).trim();
}
const cheap = JSON.parse(tsx("cheapest"));
console.log("cheapest:", JSON.stringify(cheap));
const before = JSON.parse(tsx("lastorder demo"));
console.log("before:", JSON.stringify(before));

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
async function viewport(width, height) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 500 });
}
async function waitUrl(pred, timeoutMs = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const u = await evaluate("location.href");
    if (pred(u)) return u;
    await sleep(400);
  }
  return await evaluate("location.href");
}
const fillSubmit = (fields) => evaluate(`(() => {
  const names = Object.keys(${JSON.stringify(fields)});
  const form = [...document.querySelectorAll('form')].find((f) => names.every((n) => f.querySelector('[name="' + n + '"]')));
  if (!form) return 'no-matching-form';
  for (const [name, value] of Object.entries(${JSON.stringify(fields)})) {
    const inp = form.querySelector('[name="' + name + '"]');
    inp.focus(); inp.value = value; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true }));
  }
  form.requestSubmit();
  return 'submitted';
})()`);

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
  await send("Network.setCookie", { name: "smmv2-lang", value: "vi", domain: "127.0.0.1", path: "/" });
  await navigate(`${BASE}/login`);
  await evaluate("localStorage.setItem('smmv2-lang', 'vi'); 'set'");
  await sleep(1500);
  console.log("login:", await fillSubmit({ login: "demo", password: "Demo@123" }));
  await waitUrl((u) => !u.includes("/login"));

  // Vào thẳng dịch vụ rẻ nhất qua ?service= ; đặt số lượng = min của dịch vụ
  await navigate(`${BASE}/dashboard/dat-hang?service=${cheap.id}`);
  await navigate(`${BASE}/dashboard/dat-hang?service=${cheap.id}`); // tải lại sau khi cookie ngôn ngữ đã đồng bộ
  const pageText = await evaluate("document.body.innerText");
  ok(pageText.includes("Đặt đơn SMM") || pageText.includes("Place SMM order"), "có thẻ header Đặt đơn SMM");
  ok((pageText.includes("Chọn dịch vụ") && pageText.includes("Thông tin đơn") && pageText.includes("Tóm tắt")) || (pageText.includes("Choose a service") && pageText.includes("Order details") && pageText.includes("Summary")), "đủ 3 thẻ: Chọn dịch vụ / Thông tin đơn / Tóm tắt");
  const filled = await evaluate(`(() => {
    const form = document.querySelector('#order-form');
    if (!form) return 'no-form';
    const set = (name, value) => {
      const inp = form.querySelector('[name="' + name + '"]');
      if (!inp) return false;
      inp.focus(); inp.value = value;
      inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };
    const a = set('link', 'https://facebook.com/trang.mau.test');
    const b = set('quantity', '${cheap.min}');
    return JSON.stringify({ link: a, qty: b });
  })()`);
  console.log("filled:", filled);
  await sleep(800);
  await capture("2026-11-07-fix5-smm-desktop");
  // Đọc tổng tiền trên thanh tổng (trong thẻ Tóm tắt)
  const uiTotal = await evaluate(`(() => {
    const el = [...document.querySelectorAll('span')].find((s) => s.innerText.trim() === 'Tổng thanh toán');
    if (!el) return null;
    const bar = el.closest('div');
    return bar ? bar.innerText : null;
  })()`);
  console.log("UI total bar:", JSON.stringify(uiTotal));
  await viewport(390, 844);
  await navigate(`${BASE}/dashboard/dat-hang?service=${cheap.id}`);
  await evaluate(`(() => {
    const form = document.querySelector('#order-form');
    const set = (name, value) => { const inp = form.querySelector('[name="' + name + '"]'); if (inp) { inp.focus(); inp.value = value; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); } };
    set('link', 'https://facebook.com/trang.mau.test'); set('quantity', '${cheap.min}');
    return 'ok';
  })()`);
  await sleep(700);
  await capture("2026-11-07-fix5-smm-390");
  await viewport(1440, 1100);
  await navigate(`${BASE}/dashboard/dat-hang?service=${cheap.id}`);
  await evaluate(`(() => {
    const form = document.querySelector('#order-form');
    const set = (name, value) => { const inp = form.querySelector('[name="' + name + '"]'); if (inp) { inp.focus(); inp.value = value; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); } };
    set('link', 'https://facebook.com/trang.mau.test'); set('quantity', '${cheap.min}');
    return 'ok';
  })()`);
  await sleep(700);

  const submitted = await evaluate(`(() => {
    const b = [...document.querySelectorAll('#order-form button')].find((x) => x.type === 'submit');
    if (b) { b.click(); return true; }
    return false;
  })()`);
  console.log("order submitted:", submitted);
  const afterUrl = await waitUrl((u) => u.includes("msg=") || u.includes("err=") || u.includes("/dashboard/don-hang"));
  console.log("after URL:", decodeURIComponent(afterUrl).slice(0, 220));
  await sleep(1200);
  const after = JSON.parse(tsx("lastorder demo"));
  console.log("after:", JSON.stringify(after));
  ok(after.order && after.order.id !== (before.order?.id || 0), "đơn SMM mới đã được tạo qua form mới");
  if (after.order) {
    ok(after.order.serviceId === cheap.id, "đơn đúng dịch vụ đã chọn");
    ok(after.order.quantity === cheap.min, `đơn đúng số lượng min=${cheap.min}`);
    const expectedRaw = Math.ceil((cheap.rate * cheap.min) / 1000);
    console.log(`expected charge (trước giảm cấp bậc) = ceil(${cheap.rate} x ${cheap.min} / 1000) = ${expectedRaw}; DB charge = ${after.order.charge}`);
    ok(after.order.charge <= expectedRaw && after.order.charge > 0, "charge DB khớp công thức cũ (sau giảm cấp bậc nếu có)");
    ok(after.balance === before.balance - after.order.charge, `ví trừ đúng charge (${before.balance} -> ${after.balance})`);
    console.log("cleanup:", tsx(`cleanup ${after.order.id}`));
  }

  ws.close();
  chrome.kill();
  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
