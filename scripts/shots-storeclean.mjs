/** Đợt tách sản phẩm khu riêng khỏi cửa hàng chung (2026-11-08) — kiểm chứng
 *  qua CDP: (1) khách xem / và /premium không thấy sản phẩm của 8 nhóm FZR;
 *  (2) từng khu riêng vẫn liệt kê sản phẩm của mình; (3) mua thật 1 sản phẩm
 *  THƯỜNG qua trang chi tiết vẫn chạy (trừ tiền đúng, đơn tạo đúng).
 *  Chạy sau khi đã seed các fixture FZR (mock :3998) + build + start. */
import { spawn, execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });
let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tsx = (cmd) => execFileSync("npx", ["tsx", "scripts/storeclean-helper.ts", ...cmd.split(" ")], { cwd: "/home/hatch/workspace/smmv2", env: { ...process.env }, encoding: "utf8" }).trim();

const DEDICATED_NAMES = ["Telegram Stars", "Nạp Steam Wallet", "Cyberpunk 2077", "EA SPORTS FC 25", "Xbox Game Pass Key", "Fixture Gift Card", "Mobile Legends", "Genshin Impact", "TikTok Followers Boost", "MLBB Diamonds"];
const REGULAR_NAMES = ["YouTube Premium", "Netflix Premium 4K", "Spotify Premium"];

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--remote-debugging-port=9377", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9377/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
    await sleep(200);
  }
  throw new Error("chrome CDP không lên");
}
let msgId = 0;
const pending = new Map();
let ws; let sessionId = null;
function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
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
async function waitUrl(pred, timeoutMs = 14000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) { const u = await evaluate("location.href"); if (pred(u)) return u; await sleep(400); }
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
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } };
  const t = await send("Target.createTarget", { url: "about:blank" });
  const att = await send("Target.attachToTarget", { targetId: t.targetId, flatten: true });
  sessionId = att.sessionId;
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCookie", { name: "smmv2-lang", value: "vi", domain: "127.0.0.1", path: "/" });

  // --- KHÁCH: trang chủ + /premium sạch sản phẩm khu riêng
  await navigate(`${BASE}/`);
  await evaluate("localStorage.setItem('smmv2-lang', 'vi'); 'set'");
  let text = await evaluate("document.body.innerText");
  for (const n of DEDICATED_NAMES) ok(!text.includes(n), `guest /: không thấy "${n}"`);
  for (const n of REGULAR_NAMES.slice(1)) ok(text.includes(n), `guest /: thấy sản phẩm thường "${n}"`);
  // YouTube Premium là sản phẩm thường CŨ nhất — nằm sau nút "Tải thêm" của
  // lưới nổi bật (hiện 8 thẻ đầu); bấm tải thêm rồi kiểm lại.
  await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('Tải thêm') || x.innerText.includes('Load more')); if (b) b.click(); return !!b; })()`);
  await sleep(900);
  text = await evaluate("document.body.innerText");
  ok(text.includes("YouTube Premium"), `guest /: thấy sản phẩm thường "YouTube Premium" (sau Tải thêm)`);
  await capture("2026-11-08-storeclean-home");
  await navigate(`${BASE}/premium`);
  text = await evaluate("document.body.innerText");
  for (const n of DEDICATED_NAMES) ok(!text.includes(n), `guest /premium: không thấy "${n}"`);
  for (const n of REGULAR_NAMES) ok(text.includes(n), `guest /premium: thấy "${n}"`);
  await capture("2026-11-08-storeclean-premium");

  // --- ĐĂNG NHẬP demo
  await navigate(`${BASE}/login`);
  console.log("login:", await fillSubmit({ login: "demo", password: "Demo@123" }));
  await waitUrl((u) => !u.includes("/login"));

  // --- TỪNG KHU RIÊNG vẫn liệt kê sản phẩm của mình
  const areas = [
    ["/dashboard/game-key", "Elden Ring", "Game Key"],
    ["/dashboard/gift-card", "App Store", "Gift Card"],
    ["/dashboard/top-up?q=Mobile+Legends", "Mobile Legends", "Top-Up (tìm theo tên — 31 game, MLBB không ở trang 1)"],
    ["/dashboard/manual-services", "TikTok Followers Boost", "Manual Services"],
    ["/dashboard/steam/gift-games", "ELDEN RING", "Steam Gift"],
    ["/dashboard/telegram", "Stars", "Telegram"],
  ];
  for (const [path, needle, label] of areas) {
    await navigate(`${BASE}${path}`);
    const body = await evaluate("document.body.innerText");
    ok(body.includes(needle), `khu ${label} (${path}): còn thấy "${needle}"`);
  }

  // --- MUA THẬT sản phẩm thường
  const cheap = JSON.parse(tsx("cheapest"));
  const before = JSON.parse(tsx("state"));
  console.log("cheapest regular:", JSON.stringify(cheap), "balance before:", before.balance);
  await navigate(`${BASE}/premium/${cheap.slug}`);
  const clicked = await evaluate(`(() => {
    const btns = [...document.querySelectorAll('button[type="button"]')];
    const b = btns.find((x) => x.innerText.includes(${JSON.stringify(cheap.variantName)}));
    if (b) { b.click(); return true; }
    return false;
  })()`);
  console.log("variant clicked:", clicked);
  await sleep(500);
  await evaluate(`(() => {
    const inp = document.querySelector('input[name="buyerInfo"]');
    if (inp) { inp.focus(); inp.value = 'demo@example.com'; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); }
    return 'ok';
  })()`);
  const submitted = await evaluate(`(() => {
    const b = [...document.querySelectorAll('button')].find((x) => ['Đặt hàng ngay', 'Order now', 'Đặt hàng'].includes(x.innerText.replace(/\\s+/g, ' ').trim()));
    if (b) { b.click(); return true; }
    return false;
  })()`);
  console.log("order clicked:", submitted);
  const afterUrl = await waitUrl((u) => u.includes("msg=") || u.includes("err=") || u.includes("/dashboard/don-premium"), 16000);
  console.log("after order URL:", decodeURIComponent(afterUrl).slice(0, 160));
  await sleep(1200);
  const after = JSON.parse(tsx("lastorder"));
  const stateAfter = JSON.parse(tsx("state"));
  ok(after && after.id > before.maxOrderId, "mua sản phẩm thường: đơn mới được tạo");
  if (after) {
    ok(after.variantId === cheap.variantId, "đơn đúng gói đã chọn");
    ok(after.total === cheap.price, `tổng đơn = giá gói (${after.total} == ${cheap.price})`);
    ok(stateAfter.balance === before.balance - cheap.price, `số dư trừ đúng (${before.balance} -> ${stateAfter.balance})`);
    console.log("ORDER_ID", after.id);
  }

  ws.close(); chrome.kill();
  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); try { chrome.kill(); } catch {} process.exit(1); });
