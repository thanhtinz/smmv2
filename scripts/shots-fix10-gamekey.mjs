/** FIX10 — kiểm chứng khu Game Key qua CDP: danh mục (phân trang 24 + lọc
 *  nền tảng/vùng + tìm kiếm + lọc sao yêu thích), chi tiết (editions, tồn
 *  kho, hết hàng), mua thật 1 key qua mock FZR (chỉ hiện ở lịch sử Game Key,
 *  vắng ở Đơn Premium), admin (hàng đợi + sản phẩm + nhóm nav). Chạy sau khi
 *  fixture-gamekey.ts seed. */
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
let cronSecret = (envRaw.split("\n").find((l) => l.startsWith("CRON_SECRET")) || "").split("=").slice(1).join("=").trim();
if ((cronSecret.startsWith('"') && cronSecret.endsWith('"')) || (cronSecret.startsWith("'") && cronSecret.endsWith("'"))) cronSecret = cronSecret.slice(1, -1);

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
async function navigate(url, waitMs = 2600) { await send("Page.navigate", { url }); await sleep(waitMs); }
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
const CARDS = `[...document.querySelectorAll('a[href^="/dashboard/game-key/"]')].filter((a) => { const seg = (a.getAttribute('href') || '').split('/'); return seg.length === 4 && seg[3] !== '' && !Number.isNaN(parseInt(seg[3])); })`;
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

  await setSession(demoToken);

  /* ---------- Danh mục desktop: phân trang + cột ---------- */
  await viewport(1440, 1100);
  await navigate(`${BASE}/dashboard/game-key`);
  let n = await cardCount();
  ok(n === 24, `catalog desktop trang 1: 24 thẻ game (thấy ${n})`);
  let txt = await bodyText();
  ok(txt.includes("Trang 1/2") && txt.includes("30 game"), "catalog: phân trang Trang 1/2 · 30 game");
  const cols = await evaluate(`(() => { const cards = ${CARDS}; if (!cards.length) return 0; const y = cards[0].getBoundingClientRect().y; return cards.filter((x) => Math.abs(x.getBoundingClientRect().y - y) < 4).length; })()`);
  ok(cols >= 4, `catalog desktop: hàng đầu có ${cols} cột (>= 4)`);
  await capture("2026-11-08-gamekey-catalog-desktop");
  await navigate(`${BASE}/dashboard/game-key?page=2`);
  n = await cardCount();
  ok(n === 6, `catalog trang 2: 6 thẻ (thấy ${n})`);

  /* ---------- Lọc nền tảng / vùng / tìm kiếm ---------- */
  await navigate(`${BASE}/dashboard/game-key?platform=Steam`);
  n = await cardCount();
  ok(n === 17, `lọc platform=Steam: 17 game (thấy ${n})`);
  await navigate(`${BASE}/dashboard/game-key?region=CIS`);
  n = await cardCount();
  ok(n === 4, `lọc region=CIS: 4 game (thấy ${n})`);
  await navigate(`${BASE}/dashboard/game-key?q=Zenith`);
  n = await cardCount();
  ok(n === 1, `tìm "Zenith": 1 game (thấy ${n})`);

  /* ---------- Lọc sao yêu thích ---------- */
  const eldenHref = await evaluate(`(() => { const a = (${CARDS}).find((x) => x.textContent.includes('Elden Ring')); return a ? a.getAttribute('href') : null; })()`);
  // eldenHref tìm trên trang tìm kiếm hiện tại có thể trống -> về catalog gốc
  let href = eldenHref;
  if (!href) {
    await navigate(`${BASE}/dashboard/game-key?q=Elden`);
    href = await evaluate(`(() => { const a = (${CARDS})[0]; return a ? a.getAttribute('href') : null; })()`);
  }
  ok(!!href, `tìm thấy thẻ Elden Ring (${href})`);
  const eldenId = parseInt(String(href || "").split("/").pop() || "0");
  await evaluate(`localStorage.setItem('smmv2-gk-fav-v1', JSON.stringify([${eldenId}])); 'ok'`);
  await navigate(`${BASE}/dashboard/game-key`);
  await evaluate(`[...document.querySelectorAll('button')].find((b) => (b.title || '').includes('yêu thích'))?.click()`);
  await sleep(2200);
  n = await cardCount();
  ok(n === 1, `lọc sao yêu thích: chỉ còn 1 game (thấy ${n})`);
  txt = await bodyText();
  ok(txt.includes("Elden Ring"), "lọc sao: game hiện ra là Elden Ring");

  /* ---------- Danh mục mobile ---------- */
  await viewport(390, 844);
  await navigate(`${BASE}/dashboard/game-key`);
  const colsM = await evaluate(`(() => { const cards = ${CARDS}; if (!cards.length) return 0; const y = cards[0].getBoundingClientRect().y; return cards.filter((x) => Math.abs(x.getBoundingClientRect().y - y) < 4).length; })()`);
  ok(colsM === 2, `catalog mobile: 2 cột (thấy ${colsM})`);
  await capture("2026-11-08-gamekey-catalog-mobile");

  /* ---------- Chi tiết Elden Ring ---------- */
  await navigate(`${BASE}${href}`);
  txt = await bodyText();
  ok(txt.includes("Chọn phiên bản") && txt.includes("Tóm tắt đơn"), "chi tiết: có thẻ Chọn phiên bản + Tóm tắt đơn");
  ok(txt.includes("59.990") && txt.includes("Còn 101 key trong kho"), "chi tiết: edition std 59.990đ + Còn 101 key trong kho");
  ok(txt.includes("79.990"), "chi tiết: edition Deluxe 79.990đ");
  ok(txt.includes("GLOBAL") && txt.includes("Steam"), "chi tiết: chip Steam + GLOBAL");
  await capture("2026-11-08-gamekey-detail");

  /* ---------- Chi tiết BG3: edition hết hàng bị khoá ---------- */
  await navigate(`${BASE}/dashboard/game-key?q=Baldur`);
  const bg3Href = await evaluate(`(() => { const a = (${CARDS})[0]; return a ? a.getAttribute('href') : null; })()`);
  await navigate(`${BASE}${bg3Href}`);
  const stdDisabled = await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes("Baldur's Gate 3") && x.textContent.includes('49.500')); return b ? b.disabled : null; })()`);
  ok(stdDisabled === true, "BG3: edition tồn kho 0 bị khoá (disabled) + nhãn Hết hàng");
  txt = await bodyText();
  ok(txt.includes("Hết hàng"), "BG3: hiện nhãn Hết hàng");

  /* ---------- Mua thật Elden Ring std x1 ---------- */
  await viewport(390, 844);
  await navigate(`${BASE}${href}`);
  await evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Tiếp tục')?.click()`);
  await sleep(3500);
  const url1 = await evaluate(`location.href`);
  ok(String(url1).includes("/dashboard/game-key/don-hang"), `mua xong -> chuyển về lịch sử Game Key (${url1})`);
  txt = await bodyText();
  const codeMatch = txt.match(/PRE\d+/);
  const orderCode = codeMatch ? codeMatch[0] : "";
  ok(!!orderCode && txt.includes("Elden Ring"), `lịch sử Game Key: thấy đơn ${orderCode} của Elden Ring`);
  // Đơn FZR chạy vòng đời chung: tạo xong PENDING (provider processing) ->
  // đồng bộ trạng thái (cron poll / nút đồng bộ ở chi tiết admin) lấy key về.
  // Ở đây bấm đúng nút Đồng bộ phía admin (pollFzrPremiumOrder không skipYoung).
  await setSession(adminToken);
  await viewport(1440, 1100);
  await navigate(`${BASE}/admin/game-key`);
  const detailHref = await evaluate(`(() => { const a = [...document.querySelectorAll('a[href^="/admin/don-premium/"]')].find((x) => x.textContent.includes('${orderCode}')); return a ? a.getAttribute('href') : null; })()`);
  ok(!!detailHref, `admin queue: mở được chi tiết đơn ${orderCode}`);
  await navigate(`${BASE}${detailHref}`);
  await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.name === 'kind' && x.value === 'sync'); if (b) b.click(); return !!b; })()`);
  await sleep(3000);
  await setSession(demoToken);
  await viewport(390, 844);
  await navigate(`${BASE}/dashboard/game-key/don-hang`);
  await evaluate(`[...document.querySelectorAll('summary')].find((s) => s.textContent.includes('Chi tiết giao'))?.click(); 'ok'`);
  await sleep(600);
  txt = await bodyText();
  ok(txt.includes("XXXX-YYYY-ZZZZ"), "lịch sử Game Key: key đã giao XXXX-YYYY-ZZZZ trong Chi tiết giao");
  await capture("2026-11-08-gamekey-history");
  // Số dư sau mua: 500.000 - 59.990 = 440.010
  await navigate(`${BASE}/dashboard/ho-so`);
  txt = await bodyText();
  ok(txt.includes("440.010"), "số dư demo sau mua = 440.010đ");

  /* ---------- Tách khu: đơn Game Key vắng ở Đơn Premium ---------- */
  await navigate(`${BASE}/dashboard/don-premium`);
  txt = await bodyText();
  ok(orderCode !== "" && !txt.includes(orderCode), "Đơn Premium của tôi: KHÔNG có đơn Game Key vừa mua");
  ok(!txt.includes("Elden Ring"), "Đơn Premium của tôi: không lẫn game Elden Ring");

  /* ---------- Admin ---------- */
  await setSession(adminToken);
  await viewport(1440, 1100);
  await navigate(`${BASE}/admin/game-key`);
  txt = await bodyText();
  ok(orderCode !== "" && txt.includes(orderCode), "admin Đơn Game Key: thấy đơn vừa mua");
  ok(txt.includes("Game Key"), "admin nav: có nhóm Game Key");
  await navigate(`${BASE}/admin/don-premium`);
  txt = await bodyText();
  ok(orderCode !== "" && !txt.includes(orderCode), "admin hàng đợi Premium: KHÔNG có đơn Game Key");
  await navigate(`${BASE}/admin/game-key/san-pham`, 4500);
  await evaluate(`window.scrollTo(0, document.body.scrollHeight); 'scrolled'`);
  await sleep(1200);
  txt = await bodyText();
  ok(txt.includes("Elden Ring") && txt.includes("Nền tảng: Steam") && txt.includes("Vùng: GLOBAL"), "admin Sản phẩm Game Key: game + nền tảng/vùng thật");
  ok(txt.includes("Tồn kho NCC: 101"), "admin Sản phẩm Game Key: Tồn kho NCC 101");
  const zenithInForm = await evaluate(`[...document.querySelectorAll('input')].some((i) => i.value === 'Fixture Zenith Blade')`);
  ok(zenithInForm === true, "admin Sản phẩm Game Key: thấy cả game fixture (Fixture Zenith Blade ở cuối danh sách)");
  await capture("2026-11-08-gamekey-admin");

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
