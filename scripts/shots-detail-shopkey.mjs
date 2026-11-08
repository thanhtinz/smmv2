/** Kiểm chứng khôi phục bố cục shopkey trang chi tiết Premium (lệnh Tín
 *  2026-11-08) + lớp phủ tìm kiếm header (task 2):
 *  - guest + đăng nhập: hero 31/69, lưới 73/27, hộp đặt hàng cột phải;
 *  - trạng thái WS9 trong bố cục split: gói bị chặn hiện "Hết hàng" + nút
 *    disabled, gói theo dõi kho hiện "Còn 7 trong kho", có huy hiệu giao hàng;
 *  - đặt 1 đơn THẬT qua form split (đối chiếu tiền như WS4) rồi dọn;
 *  - header search: mở = lớp phủ trong thanh (che nút, không đẩy trang),
 *    Esc đóng trả lại nút. node scripts/shots-detail-shopkey.mjs */
import { spawn, execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });
let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; };
function tsx(script, args) {
  return execSync(
    `bash -c 'set -a; source .env; set +a; export PRISMA_QUERY_ENGINE_LIBRARY=$PWD/node_modules/@prisma/engines/libquery_engine-debian-openssl-3.0.x.so.node PRISMA_SCHEMA_ENGINE_BINARY=$PWD/node_modules/@prisma/engines/schema-engine-debian-openssl-3.0.x; npx tsx scripts/${script} ${args}'`,
    { cwd: "/home/hatch/workspace/smmv2", encoding: "utf8" }
  ).trim();
}
const fixture = JSON.parse(tsx("test-detail-shopkey.ts", "fixture"));
const cheap = JSON.parse(tsx("test-fix5-detail.ts", "cheapest"));
const before = JSON.parse(tsx("test-fix5-detail.ts", "lastorder demo"));
console.log("fixture:", JSON.stringify(fixture));
console.log("cheap:", JSON.stringify(cheap), "before:", JSON.stringify(before));

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--remote-debugging-port=9343", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9343/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
const clickVariantByName = (name) => evaluate(`(() => {
  const b = [...document.querySelectorAll('button[type="button"]')].find((x) => x.innerText.includes(${JSON.stringify(name)}));
  if (b) { b.click(); return true; }
  return false;
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
  await evaluate("localStorage.setItem('smmv2-lang', 'vi'); document.cookie = 'smmv2-lang=vi; path=/'; 'set'");
  await sleep(1200);

  // ============ TASK 2 — header search overlay (guest, trang chủ) ============
  await viewport(390, 844);
  await navigate(`${BASE}/`);
  const closed390 = await evaluate(`(() => {
    const h = document.querySelector('header');
    const anchor = document.querySelector('main') || document.body;
    return { headerH: h.offsetHeight, anchorY: anchor.getBoundingClientRect().top + window.scrollY, hasInput: !!document.querySelector('header input[name="q"]') };
  })()`);
  ok(!closed390.hasInput, "search 390: đóng — chưa có ô nhập trong header");
  await capture("2026-11-08-search-overlay-390-closed");
  await evaluate(`document.querySelector('header button[aria-expanded]').click(); 'clicked'`);
  await sleep(700);
  const open390 = await evaluate(`(() => {
    const inp = document.querySelector('header input[name="q"]');
    const form = inp ? inp.closest('form') : null;
    const fr = form ? form.getBoundingClientRect() : null;
    const h = document.querySelector('header');
    const anchor = document.querySelector('main') || document.body;
    const cart = document.querySelector('header a[href="/gio-hang"]');
    let covered = null;
    if (cart) { const r = cart.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); covered = !!(el && form && form.contains(el)); }
    return { hasInput: !!inp, focused: document.activeElement === inp, formTop: fr ? fr.top : null, formH: fr ? fr.height : null, headerH: h.offsetHeight, anchorY: anchor.getBoundingClientRect().top + window.scrollY, cartCovered: covered };
  })()`);
  console.log("open390:", JSON.stringify(open390));
  ok(open390.hasInput && open390.focused, "search 390: mở — ô nhập hiện và được focus");
  ok(open390.formTop === 0 && Math.abs(open390.formH - open390.headerH) <= 2, "search 390: lớp phủ nằm TRONG thanh header (top=0, cao bằng header)");
  ok(open390.anchorY === closed390.anchorY && open390.headerH === closed390.headerH, "search 390: nội dung trang KHÔNG bị đẩy xuống");
  ok(open390.cartCovered === true, "search 390: lớp phủ che nút giỏ hàng");
  await capture("2026-11-08-search-overlay-390");
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); 'esc'`);
  await sleep(300);
  // Esc được gắn ở onKeyDown của form (React) — dispatch trên input cho chắc
  await evaluate(`(() => { const inp = document.querySelector('header input[name="q"]'); if (inp) { inp.focus(); inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); } return 'esc2'; })()`);
  await sleep(500);
  const afterEsc = await evaluate(`!!document.querySelector('header input[name="q"]')`);
  ok(!afterEsc, "search 390: Esc đóng lớp phủ, trả lại các nút");

  await viewport(1440, 1100);
  await navigate(`${BASE}/`);
  const closedDesk = await evaluate(`(() => { const h = document.querySelector('header'); const anchor = document.querySelector('main') || document.body; return { headerH: h.offsetHeight, anchorY: anchor.getBoundingClientRect().top + window.scrollY }; })()`);
  await capture("2026-11-08-search-overlay-desktop-closed");
  await evaluate(`document.querySelector('header button[aria-expanded]').click(); 'clicked'`);
  await sleep(700);
  const openDesk = await evaluate(`(() => {
    const inp = document.querySelector('header input[name="q"]');
    const form = inp ? inp.closest('form') : null;
    const fr = form ? form.getBoundingClientRect() : null;
    const h = document.querySelector('header');
    const anchor = document.querySelector('main') || document.body;
    const cart = document.querySelector('header a[href="/gio-hang"]');
    let covered = null;
    if (cart) { const r = cart.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); covered = !!(el && form && form.contains(el)); }
    return { hasInput: !!inp, formTop: fr ? fr.top : null, formH: fr ? fr.height : null, formLeft: fr ? fr.left : null, headerH: h.offsetHeight, anchorY: anchor.getBoundingClientRect().top + window.scrollY, cartCovered: covered, vw: window.innerWidth };
  })()`);
  console.log("openDesk:", JSON.stringify(openDesk));
  ok(openDesk.hasInput, "search desktop: mở — ô nhập hiện");
  ok(openDesk.formTop === 0 && Math.abs(openDesk.formH - openDesk.headerH) <= 2, "search desktop: lớp phủ trong thanh, không xổ hàng");
  ok(openDesk.anchorY === closedDesk.anchorY, "search desktop: nội dung không bị đẩy");
  ok(openDesk.cartCovered === true, "search desktop: lớp phủ che cụm nút phải (giỏ hàng)");
  await capture("2026-11-08-search-overlay-desktop");
  await evaluate(`(() => { const b = [...document.querySelectorAll('header form button')].find((x) => x.getAttribute('aria-label')); if (b) b.click(); return 'x'; })()`);
  await sleep(400);

  // ============ TASK 1 — chi tiết Premium bố cục split ============
  // --- GUEST
  await navigate(`${BASE}/premium/${cheap.slug}`);
  const guest = await evaluate(`(() => {
    const txt = document.body.innerText;
    const hero = [...document.querySelectorAll('div')].find((d) => d.className.includes('from-brand-700'));
    const grid = hero ? hero.querySelector('.md\\\\:grid-cols-\\\\[minmax\\\\(0\\\\,31fr\\\\)_minmax\\\\(0\\\\,69fr\\\\)\\\\]') : null;
    let ratio = null;
    if (grid && grid.children.length >= 2) ratio = grid.children[0].getBoundingClientRect().width / grid.getBoundingClientRect().width;
    return { hasTitle: txt.includes(${JSON.stringify(cheap.productName)}), hasVariants: txt.includes('Chọn gói sản phẩm'), ratio };
  })()`);
  console.log("guest:", JSON.stringify(guest));
  ok(guest.hasTitle && guest.hasVariants, "guest split: hero + mục Chọn gói sản phẩm");
  ok(guest.ratio !== null && guest.ratio > 0.24 && guest.ratio < 0.4, `guest split: hero chia ~31/69 (đo ${(guest.ratio || 0).toFixed(2)})`);
  await capture("2026-11-08-detail-shopkey-guest");

  // --- ĐĂNG NHẬP
  await navigate(`${BASE}/login`);
  console.log("login:", await fillSubmit({ login: "demo", password: "Demo@123" }));
  await waitUrl((u) => !u.includes("/login"));
  await navigate(`${BASE}/premium/${cheap.slug}`);
  const splitGeo = await evaluate(`(() => {
    const buy = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Đặt hàng ngay');
    const vbtn = [...document.querySelectorAll('button[type="button"]')].find((x) => x.innerText.includes(${JSON.stringify(cheap.variantName)}));
    const br = buy ? buy.getBoundingClientRect() : null;
    const vr = vbtn ? vbtn.getBoundingClientRect() : null;
    const txt = document.body.innerText;
    return { buyX: br ? br.left : null, variantW: vr ? vr.width : null, vw: window.innerWidth, hasDeliveryBadge: txt.includes('Giao nhanh') || txt.includes('Giao chậm'), hasInfoBox: txt.includes('Thông tin đặt hàng') };
  })()`);
  console.log("splitGeo:", JSON.stringify(splitGeo));
  ok(splitGeo.buyX !== null && splitGeo.buyX > splitGeo.vw * 0.62, "split: hộp đặt hàng nằm cột PHẢI");
  ok(splitGeo.variantW !== null && splitGeo.variantW < splitGeo.vw * 0.62, "split: danh sách gói nằm cột TRÁI ~73%");
  ok(splitGeo.hasDeliveryBadge, "split: hàng gói có huy hiệu Giao nhanh/Giao chậm (WS9)");
  ok(splitGeo.hasInfoBox, "split: hộp đặt hàng có khối Thông tin đặt hàng");

  // --- TRẠNG THÁI WS9: hết hàng + kho theo dõi
  console.log("apply fixture:", tsx("test-detail-shopkey.ts", `apply ${fixture.block.id} ${fixture.tracked.id}`));
  await navigate(`${BASE}/premium/${fixture.slug}`);
  const soldState = await evaluate(`(() => {
    const txt = document.body.innerText;
    const blocked = [...document.querySelectorAll('button[type="button"]')].find((x) => x.innerText.includes(${JSON.stringify(fixture.block.name)}));
    return { hasSoldOut: txt.includes('Hết hàng'), blockedDisabled: blocked ? blocked.disabled : null, hasTracked: txt.includes('Còn 7') && txt.includes('trong kho') };
  })()`);
  console.log("soldState:", JSON.stringify(soldState));
  ok(soldState.hasSoldOut, "WS9 split: gói bị chặn hiện chữ Hết hàng");
  ok(soldState.blockedDisabled === true, "WS9 split: nút gói hết hàng bị disabled");
  ok(soldState.hasTracked, "WS9 split: gói theo dõi kho hiện 'Còn 7 trong kho'");
  await capture("2026-11-08-detail-shopkey-soldout");
  console.log("restore fixture:", tsx("test-detail-shopkey.ts", `restore ${fixture.block.id} ${fixture.tracked.id}`));

  // --- Ảnh chính (trạng thái thường)
  await navigate(`${BASE}/premium/${cheap.slug}`);
  await sleep(600);
  await capture("2026-11-08-detail-shopkey-desktop");
  await captureFull("2026-11-08-detail-shopkey-full");
  await viewport(390, 844);
  await navigate(`${BASE}/premium/${cheap.slug}`);
  await capture("2026-11-08-detail-shopkey-390");
  await viewport(1440, 1100);
  await navigate(`${BASE}/premium/${cheap.slug}`);
  await sleep(600);

  // --- ĐẶT ĐƠN THẬT qua form split
  console.log("variant clicked:", await clickVariantByName(cheap.variantName));
  await sleep(500);
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
  console.log("order clicked:", submitted);
  const afterOrder = await waitUrl((u) => u.includes("msg=") || u.includes("/dashboard/don-premium") || u.includes("err="), 16000);
  console.log("after order URL:", decodeURIComponent(afterOrder).slice(0, 200));
  await sleep(1500);
  const after = JSON.parse(tsx("test-fix5-detail.ts", "lastorder demo"));
  console.log("after:", JSON.stringify(after));
  ok(after.order && after.order.id !== (before.order?.id || 0), "split: đơn mới đã được tạo");
  if (after.order) {
    ok(after.order.variantId === cheap.variantId, "split: đơn đúng gói đã chọn");
    ok(after.order.quantity === 1 && after.order.total === cheap.price, `split: tổng đơn = giá gói × 1 (${after.order.total} == ${cheap.price})`);
    ok(after.balance === before.balance - cheap.price, `split: số dư trừ đúng (${before.balance} -> ${after.balance})`);
    console.log("cleanup:", tsx("test-fix5-detail.ts", `cleanup ${after.order.id}`));
  }

  ws.close();
  chrome.kill();
  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
