/** Fix5 WS4: trang chi tiết Premium MỘT CỘT kiểu Telegram — chụp guest +
 *  đăng nhập, đặt 1 đơn THẬT bằng form mới và đối chiếu tiền với công thức cũ
 *  (giá gói × số lượng; không flash/promo ở local). node scripts/shots-fix5-detail.mjs */
import { spawn, execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });
let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; };
function tsx(args) {
  return execSync(
    "bash -c 'set -a; source .env; set +a; export PRISMA_QUERY_ENGINE_LIBRARY=$PWD/node_modules/@prisma/engines/libquery_engine-debian-openssl-3.0.x.so.node PRISMA_SCHEMA_ENGINE_BINARY=$PWD/node_modules/@prisma/engines/schema-engine-debian-openssl-3.0.x; npx tsx scripts/test-fix5-detail.ts " + args + "'",
    { cwd: "/home/hatch/workspace/smmv2", encoding: "utf8" }
  ).trim();
}
const cheap = JSON.parse(tsx("cheapest"));
console.log("cheapest:", JSON.stringify(cheap));
const before = JSON.parse(tsx("lastorder demo"));
console.log("before:", JSON.stringify(before));

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--remote-debugging-port=9342", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9342/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
async function navigate(url, waitMs = 2000) { await send("Page.navigate", { url }); await sleep(waitMs); }
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
  console.log("SHOT", name, `${cs.width}x${cs.height}`);
}
async function viewport(width, height) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 500 });
}
async function waitUrl(pred, timeoutMs = 14000) {
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

  // --- GUEST: trang chi tiết mới
  await viewport(1440, 1100);
  await navigate(`${BASE}/premium/${cheap.slug}`);
  const guestText = await evaluate("document.body.innerText");
  ok(guestText.includes(cheap.productName), "guest: thấy tên sản phẩm ở thẻ header");
  ok(guestText.includes("Chọn gói") || guestText.includes("Choose a plan"), "guest: có thẻ Chọn gói (số 1)");
  await capture("2026-11-07-fix5-detail-guest-desktop");

  // --- ĐĂNG NHẬP + vào lại trang chi tiết
  await navigate(`${BASE}/login`);
  console.log("login:", await fillSubmit({ login: "demo", password: "Demo@123" }));
  await waitUrl((u) => !u.includes("/login"));
  await navigate(`${BASE}/premium/${cheap.slug}`);
  const formText = await evaluate("document.body.innerText");
  ok(formText.includes("Chọn gói") && formText.includes("Thông tin") && formText.includes("Tóm tắt"), "đăng nhập: đủ 3 thẻ Chọn gói / Thông tin / Tóm tắt");
  // Chọn đúng gói rẻ nhất (bấm thẻ gói chứa tên gói)
  const clicked = await evaluate(`(() => {
    const btns = [...document.querySelectorAll('button[type="button"]')];
    const b = btns.find((x) => x.innerText.includes(${JSON.stringify(cheap.variantName)}));
    if (b) { b.click(); return true; }
    return false;
  })()`);
  console.log("variant clicked:", clicked);
  await sleep(600);
  await capture("2026-11-07-fix5-detail-desktop");
  await captureFull("2026-11-07-fix5-detail-full");
  const summary = await evaluate("document.body.innerText");
  const fmt = (n) => n.toLocaleString("vi-VN");
  ok(summary.includes(fmt(cheap.price)), `tóm tắt hiện đúng giá gói ${fmt(cheap.price)}`);
  await viewport(390, 844);
  await navigate(`${BASE}/premium/${cheap.slug}`);
  await capture("2026-11-07-fix5-detail-390");
  await viewport(1440, 1100);
  await navigate(`${BASE}/premium/${cheap.slug}`);
  await sleep(600);

  // --- ĐẶT ĐƠN THẬT qua form mới (gói rẻ nhất, số lượng 1)
  const clicked2 = await evaluate(`(() => {
    const btns = [...document.querySelectorAll('button[type="button"]')];
    const b = btns.find((x) => x.innerText.includes(${JSON.stringify(cheap.variantName)}));
    if (b) { b.click(); return true; }
    return false;
  })()`);
  await sleep(500);
  // Sản phẩm MANUAL không trường tuỳ chỉnh -> ô buyerInfo BẮT BUỘC (như trang cũ);
  // điền trước khi bấm đặt hàng, nếu không trình duyệt chặn submit.
  const filledInfo = await evaluate(`(() => {
    const inp = document.querySelector('input[name="buyerInfo"]');
    if (!inp) return 'none';
    inp.focus(); inp.value = 'demo@example.com'; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true }));
    return 'filled';
  })()`);
  console.log("buyerInfo:", filledInfo);
  const submitted = await evaluate(`(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Đặt hàng ngay');
    if (b) { b.click(); return true; }
    return false;
  })()`);
  console.log("variant2:", clicked2, "order clicked:", submitted);
  const afterOrder = await waitUrl((u) => u.includes("msg=") || u.includes("/dashboard/don-premium") || u.includes("err="), 16000);
  console.log("after order URL:", decodeURIComponent(afterOrder).slice(0, 200));
  await sleep(1500);
  const after = JSON.parse(tsx("lastorder demo"));
  console.log("after:", JSON.stringify(after));
  ok(after.order && after.order.id !== (before.order?.id || 0), "đơn mới đã được tạo");
  if (after.order) {
    ok(after.order.variantId === cheap.variantId, "đơn đúng gói đã chọn");
    ok(after.order.quantity === 1 && after.order.total === cheap.price, `tổng đơn = giá gói × 1 (${after.order.total} == ${cheap.price})`);
    ok(after.balance === before.balance - cheap.price, `số dư bị trừ đúng (${before.balance} -> ${after.balance})`);
    console.log("cleanup:", tsx(`cleanup ${after.order.id}`));
  }

  ws.close();
  chrome.kill();
  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
