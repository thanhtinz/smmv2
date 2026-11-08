/** FIX11 — kiểm chứng qua CDP (máy chủ dev :3000):
 *  Task 1: khoảng trống trên hero trang chủ = 40px (390) / 48px (1440).
 *  Task 2: khu Gift Card — danh mục (phân trang 24/trang, tìm kiếm, sao yêu
 *  thích, 2 cột mobile), chi tiết (mệnh giá cuộn + thẻ NOTE của NCC), mua
 *  thật qua mock FZR (mã GC-CODE-1, chỉ hiện ở lịch sử Gift Card), admin.
 *  Task 3: thẻ Đồng bộ & markup theo khu + picker Game Key (tìm từ nguồn,
 *  tra mã sai báo lỗi).
 *  Chạy sau fixture-giftcard.ts seed, mock FZR đang chạy ở 3998. */
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
const mint = (claims) => {
  const u = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sv: 0, iat: now, exp: now + 3600, ...claims })}`;
  return `${u}.${createHmac("sha256", secret).update(u).digest("base64url")}`;
};
const demoToken = mint({ uid: 2, role: "USER", username: "demo" });
const adminToken = mint({ uid: 1, role: "ADMIN", username: "admin", amr: "passkey" });

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=old", "--disable-gpu", "--no-sandbox", "--disable-setuid-sandbox", "--hide-scrollbars",
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-fix11",
  "--remote-debugging-port=9365", "--window-size=1440,1100",
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
async function navigate(url, waitMs = 3200) { await send("Page.navigate", { url }); await sleep(waitMs); }
async function capture(name, full = false) {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: full });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name);
}
async function viewport(width, height) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 500 });
}
async function setSession(token) {
  await navigate(`${BASE}/`);
  await evaluate(`document.cookie = 'smmv2_session=${token}; path=/'; document.cookie = 'smmv2-lang=vi; path=/'; try { localStorage.setItem('smmv2-lang', 'vi'); } catch(e) {} 'set'`);
}
const bodyText = () => evaluate(`document.body.innerText`);
const CARDS = `[...document.querySelectorAll('a[href^="/dashboard/gift-card/"]')].filter((a) => { const seg = (a.getAttribute('href') || '').split('/'); return seg.length === 4 && seg[3] !== '' && !Number.isNaN(parseInt(seg[3])); })`;
const cardCount = () => evaluate(`(${CARDS}).length`);

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

  /* ================= TASK 1 — khoảng trống hero ================= */
  const measureGap = () => evaluate(`(() => {
    const header = document.querySelector('header');
    if (!header) return null;
    const hb = header.getBoundingClientRect().bottom;
    const cands = [...document.querySelectorAll('div')].map((d) => d.getBoundingClientRect())
      .filter((r) => r.width >= window.innerWidth - 2 && r.height >= 200 && r.top >= hb - 1);
    if (!cands.length) return null;
    const top = Math.min(...cands.map((r) => r.top));
    return Math.round(top - hb);
  })()`);
  await viewport(390, 844);
  await navigate(`${BASE}/`, 5000);
  const gapM = await measureGap();
  ok(gapM === 40, `hero mobile: khoảng trống header->hero = ${gapM}px (kỳ vọng 40)`);
  await capture("2026-11-08-herogap2-390");
  await viewport(1440, 1000);
  await navigate(`${BASE}/`, 3500);
  const gapD = await measureGap();
  ok(gapD === 48, `hero desktop: khoảng trống header->hero = ${gapD}px (kỳ vọng 48)`);
  await capture("2026-11-08-herogap2-desktop");

  /* ================= TASK 2 — Gift Card ================= */
  await setSession(demoToken);
  await viewport(1440, 1100);
  await navigate(`${BASE}/dashboard/gift-card`, 4500);
  let n = await cardCount();
  ok(n === 24, `catalog desktop trang 1: 24 thẻ (thấy ${n})`);
  let txt = await bodyText();
  ok(txt.includes("Trang 1/2") && txt.includes("33 danh mục"), "catalog: phân trang Trang 1/2 · 33 danh mục");
  ok(txt.includes("Gift Cards & Codes"), "catalog: thẻ header Gift Cards & Codes");
  const cols = await evaluate(`(() => { const cards = ${CARDS}; if (!cards.length) return 0; const y = cards[0].getBoundingClientRect().y; return cards.filter((x) => Math.abs(x.getBoundingClientRect().y - y) < 4).length; })()`);
  ok(cols >= 4, `catalog desktop: hàng đầu ${cols} cột (>= 4)`);
  await capture("2026-11-08-giftcard-catalog-desktop");
  await navigate(`${BASE}/dashboard/gift-card?page=2`);
  n = await cardCount();
  ok(n === 9, `catalog trang 2: 9 thẻ (thấy ${n})`);
  await navigate(`${BASE}/dashboard/gift-card?q=Amazon`);
  n = await cardCount();
  ok(n === 1, `tìm "Amazon": 1 danh mục (thấy ${n})`);

  // Yêu thích: mở App Store & iTunes (TR), bấm sao ở chi tiết, lọc ở danh mục
  await navigate(`${BASE}/dashboard/gift-card?q=App+Store`);
  const appleHref = await evaluate(`(() => { const a = (${CARDS})[0]; return a ? a.getAttribute('href') : null; })()`);
  ok(!!appleHref, `tìm thấy thẻ App Store (${appleHref})`);
  const appleId = parseInt(String(appleHref || "").split("/").pop() || "0");
  await evaluate(`localStorage.setItem('smmv2-gc-fav-v1', JSON.stringify([${appleId}])); 'ok'`);
  await navigate(`${BASE}/dashboard/gift-card`, 4500);
  await evaluate(`[...document.querySelectorAll('button')].find((b) => (b.title || '').includes('yêu thích'))?.click()`);
  for (let i = 0; i < 10; i++) { await sleep(1200); n = await cardCount(); if (n === 1) break; }
  ok(n === 1, `lọc sao yêu thích: chỉ còn 1 danh mục (thấy ${n})`);
  txt = await bodyText();
  ok(txt.includes("App Store & iTunes (TR)"), "lọc sao: đúng danh mục App Store (TR)");

  await viewport(390, 844);
  await navigate(`${BASE}/dashboard/gift-card`);
  const colsM = await evaluate(`(() => { const cards = ${CARDS}; if (!cards.length) return 0; const y = cards[0].getBoundingClientRect().y; return cards.filter((x) => Math.abs(x.getBoundingClientRect().y - y) < 4).length; })()`);
  ok(colsM === 2, `catalog mobile: 2 cột (thấy ${colsM})`);
  await capture("2026-11-08-giftcard-catalog-mobile");

  /* ---------- Chi tiết App Store (TR): NOTE + mệnh giá ---------- */
  await navigate(`${BASE}${appleHref}`, 4000);
  txt = await bodyText();
  ok(txt.includes("Gift cards") && txt.includes("Tóm tắt đơn"), "chi tiết: có thẻ Gift cards + Tóm tắt đơn");
  ok(txt.includes("Region: TR"), "chi tiết: thẻ NOTE hiện ghi chú thật của NCC (Region: TR)");
  ok(txt.includes("50 TRY") && txt.includes("890đ"), "chi tiết: mệnh giá 50 TRY giá 890đ (tỉ giá 1000, markup 0)");
  ok((txt.includes("Thêm vào yêu thích") || txt.includes("Đã lưu yêu thích")) && txt.includes("Quay lại danh mục"), "chi tiết: nút yêu thích + quay lại danh mục");
  await capture("2026-11-08-giftcard-detail");

  /* ---------- Mua thật 50 TRY x1 ---------- */
  await evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes('50 TRY'))?.click()`);
  await sleep(800);
  await evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Tiếp tục')?.click()`);
  await sleep(3500);
  const url1 = await evaluate(`location.href`);
  ok(String(url1).includes("/dashboard/gift-card/don-hang"), `mua xong -> chuyển về lịch sử Gift Card (${url1})`);
  txt = await bodyText();
  const codeMatch = txt.match(/PRE\d+/);
  const orderCode = codeMatch ? codeMatch[0] : "";
  ok(!!orderCode && txt.includes("App Store"), `lịch sử Gift Card: thấy đơn ${orderCode}`);
  // Đồng bộ trạng thái phía admin để lấy mã về
  await setSession(adminToken);
  await viewport(1440, 1100);
  await navigate(`${BASE}/admin/gift-card`);
  const detailHref = await evaluate(`(() => { const a = [...document.querySelectorAll('a[href^="/admin/don-premium/"]')].find((x) => x.textContent.includes('${orderCode}')); return a ? a.getAttribute('href') : null; })()`);
  ok(!!detailHref, `admin queue Gift Card: mở được chi tiết đơn ${orderCode}`);
  await navigate(`${BASE}${detailHref}`);
  await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.name === 'kind' && x.value === 'sync'); if (b) b.click(); return !!b; })()`);
  await sleep(3000);
  await setSession(demoToken);
  await viewport(390, 844);
  await navigate(`${BASE}/dashboard/gift-card/don-hang`);
  await evaluate(`[...document.querySelectorAll('summary')].find((s) => s.textContent.includes('Chi tiết giao'))?.click(); 'ok'`);
  await sleep(600);
  txt = await bodyText();
  ok(txt.includes("GC-CODE-1"), "lịch sử Gift Card: mã GC-CODE-1 đã giao trong Chi tiết giao");
  await capture("2026-11-08-giftcard-history");
  await navigate(`${BASE}/dashboard/ho-so`);
  txt = await bodyText();
  ok(txt.includes("499.110"), "số dư demo sau mua = 499.110đ (500.000 - 890)");

  /* ---------- Tách khu ---------- */
  await navigate(`${BASE}/dashboard/don-premium`);
  txt = await bodyText();
  ok(orderCode !== "" && !txt.includes(orderCode), "Đơn Premium của tôi: KHÔNG có đơn Gift Card vừa mua");
  await setSession(adminToken);
  await viewport(1440, 1100);
  await navigate(`${BASE}/admin/gift-card`);
  txt = await bodyText();
  ok(orderCode !== "" && txt.includes(orderCode), "admin Đơn Gift Card: thấy đơn vừa mua");
  ok(txt.includes("Gift Card"), "admin nav: có nhóm Gift Card");
  await navigate(`${BASE}/admin/don-premium`);
  txt = await bodyText();
  ok(orderCode !== "" && !txt.includes(orderCode), "admin hàng đợi Premium: KHÔNG có đơn Gift Card");
  await navigate(`${BASE}/admin/gift-card/san-pham`, 4500);
  txt = await bodyText();
  const gcNameInForm = await evaluate(`[...document.querySelectorAll('input')].some((i) => i.value === 'App Store & iTunes (TR) · Instant use')`);
  ok(gcNameInForm === true && txt.includes("gcat-apple-tr"), "admin Sản phẩm Gift Card: category + Category ID thật");
  ok(txt.includes("Tồn kho NCC: 80"), "admin Sản phẩm Gift Card: mệnh giá 50 TRY tồn kho NCC 80");
  ok(txt.includes("Đồng bộ & markup của khu này"), "admin Sản phẩm Gift Card: có thẻ Đồng bộ & markup của khu");
  await capture("2026-11-08-giftcard-admin");

  /* ================= TASK 3 — Picker + sync khu (Game Key) ================= */
  await navigate(`${BASE}/admin/game-key/san-pham`, 4500);
  txt = await bodyText();
  ok(txt.includes("Đồng bộ & markup của khu này"), "admin Game Key: có thẻ Đồng bộ & markup của khu");
  const pickerHead = await evaluate(`document.body.textContent.includes('Chọn từ catalog nhà cung cấp')`);
  ok(pickerHead === true, "admin Game Key: form thêm game dùng picker từ nguồn");
  await evaluate(`window.scrollTo(0, 0); 'top'`);
  await capture("2026-11-08-sync-page");
  // Tìm trong picker: gõ ELDEN -> Tìm -> kết quả từ mock (thử lại chờ hydrate)
  await evaluate(`(() => { const i = [...document.querySelectorAll('input')].find((x) => (x.placeholder || '').includes('Tìm theo tên trong catalog')); if (i) { i.scrollIntoView({ block: 'center' }); i.focus(); document.execCommand('selectAll', false, null); document.execCommand('insertText', false, 'ELDEN'); } return !!i; })()`);
  let foundElden = false;
  for (let i = 0; i < 4 && !foundElden; i++) {
    await evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Tìm')?.click()`);
    await sleep(2600);
    foundElden = await evaluate(`[...document.querySelectorAll('button')].some((x) => x.textContent.includes('Elden Ring') && x.textContent.includes('gk-1'))`);
  }
  ok(foundElden, "picker Game Key: tìm 'ELDEN' ra ELDEN RING từ catalog mock");
  await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Elden Ring') && x.textContent.includes('gk-1')); if (b) b.click(); return !!b; })()`);
  await sleep(2500);
  txt = await bodyText();
  ok(txt.includes("Đã chọn: Elden Ring"), "picker Game Key: chọn xong hiện 'Đã chọn: Elden Ring'");
  await capture("2026-11-08-sync-picker");
  // Tra mã sai -> lỗi rõ, không lưu
  await evaluate(`(() => { const i = [...document.querySelectorAll('input')].find((x) => (x.placeholder || '').includes('dán mã phía FZR')); if (i) { i.focus(); document.execCommand('insertText', false, 'gk-khong-ton-tai'); } return !!i; })()`);
  await evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Kiểm tra mã')?.click()`);
  let lookupErr = false;
  for (let i = 0; i < 6 && !lookupErr; i++) { await sleep(1200); lookupErr = await evaluate(`document.body.textContent.includes('Không tìm thấy mã')`); }
  ok(lookupErr, "picker Game Key: tra mã sai -> báo 'Không tìm thấy mã', không lưu");

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
