/** Kiểm chứng CDP cho đợt Top-Up phía khách + admin 10 sản phẩm/trang
 *  (2026-11-08):
 *  - Catalog /dashboard/top-up: 28 game -> trang 1 có 24 thẻ + "Trang 1/2",
 *    trang 2 có 4 thẻ; tìm kiếm thu đúng; sao yêu thích lọc đúng.
 *  - Chi tiết: MLBB có NOTE thật + 2 trường text trong thẻ tóm tắt, bố cục
 *    2 cột trên PC (tóm tắt bên phải); Genshin: trường Server là <select>.
 *  - Mua thật MLBB qua UI: mock nhận validate-id + order với fields theo
 *    KEY {player_id, zone_id}; đơn chỉ hiện ở lịch sử Top-Up, vắng ở Đơn
 *    Premium của khách; số dư trừ đúng 55.500đ.
 *  - Tách catalog: /premium + trang chủ KHÔNG còn sản phẩm topups.
 *  - Menu: dropdown Top-Up có "Nạp game"; highlight duy nhất đúng lá.
 *  - Admin 10/trang: /admin/top-up/san-pham 28 danh mục -> "Trang 1/3",
 *    trang 3 = 8; /admin/premium 37 sản phẩm -> "Trang 1/4".
 *  Chạy: mock FZR (script tự spawn) + fixture-topup seed (script tự chạy),
 *  dọn fixture ở cuối. */
import { spawn, execSync } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });
let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const envRaw = readFileSync("/home/hatch/workspace/smmv2/.env", "utf8");
const envVal = (k) => {
  let v = (envRaw.split("\n").find((l) => l.startsWith(k)) || "").split("=").slice(1).join("=").trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v;
};
process.env.DATABASE_URL = envVal("DATABASE_URL");
process.env.PRISMA_QUERY_ENGINE_LIBRARY = "/home/hatch/workspace/smmv2/node_modules/@prisma/engines/libquery_engine-debian-openssl-3.0.x.so.node";
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

const secret = envVal("AUTH_SECRET");
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const mint = (claims) => {
  const u = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sv: 0, iat: now, exp: now + 3600, ...claims })}`;
  return `${u}.${createHmac("sha256", secret).update(u).digest("base64url")}`;
};
const demoToken = mint({ uid: 2, role: "USER", username: "demo" });
const adminToken = mint({ uid: 1, role: "ADMIN", username: "admin", amr: "passkey" });

const TSX_ENV = {
  ...process.env,
  PRISMA_QUERY_ENGINE_LIBRARY: process.env.PRISMA_QUERY_ENGINE_LIBRARY,
  PRISMA_SCHEMA_ENGINE_BINARY: "/home/hatch/workspace/smmv2/node_modules/@prisma/engines/schema-engine-debian-openssl-3.0.x",
};
const fixture = (args) => execSync(`npx tsx scripts/fixture-topup.ts ${args}`, { cwd: "/home/hatch/workspace/smmv2", env: TSX_ENV, stdio: "pipe" }).toString();

const mock = spawn("node", ["scripts/mock-fzr.mjs"], { cwd: "/home/hatch/workspace/smmv2", stdio: "ignore" });
async function waitMock() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch("http://127.0.0.1:3998/__log"); if (r.ok) return; } catch {}
    await sleep(300);
  }
  throw new Error("mock không lên");
}

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--remote-debugging-port=9367", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9367/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch {}
    await sleep(200);
  }
  throw new Error("chrome CDP không lên");
}
let msgId = 0;
const pending = new Map();
let ws; let sessionId = null;
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
  await evaluate(`document.cookie = 'smmv2_session=${token}; path=/'; document.cookie = 'smmv2-lang=vi; path=/'; try { localStorage.setItem('smmv2-lang', 'vi'); localStorage.removeItem('smmv2-tu-fav-v1'); } catch(e) {} 'set'`);
}
const bodyText = () => evaluate(`document.body.innerText`);
const SET_VALUE = `(el, v) => { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }`;
const cardCount = () => evaluate(`[...document.querySelectorAll('a[href^="/dashboard/top-up/"]')].filter((a) => /^\\/dashboard\\/top-up\\/\\d+$/.test(a.getAttribute('href'))).length`);

async function main() {
  await waitMock();
  console.log(fixture("seed"));
  const mlbb = await prisma.premiumProduct.findFirst({ where: { providerProductId: "tp-1" }, select: { id: true, name: true } });
  const genshin = await prisma.premiumProduct.findFirst({ where: { providerProductId: "tp-2" }, select: { id: true } });
  ok(!!mlbb && !!genshin, `fixture: có MLBB (#${mlbb?.id}) + Genshin (#${genshin?.id})`);
  const totalTu = await prisma.premiumProduct.count({ where: { variants: { some: { providerGroup: "topups" } } } });
  ok(totalTu === 28, `fixture: 28 sản phẩm topups (thấy ${totalTu})`);

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
  await viewport(1440, 1100);

  /* ============ KHÁCH — catalog phân trang ============================ */
  await setSession(demoToken);
  await navigate(`${BASE}/dashboard/top-up`, 4000);
  let txt = await bodyText();
  ok(txt.includes("Top-up games and services"), "Catalog: có thẻ header 'Top-up games and services'");
  ok((await cardCount()) === 24, `Catalog trang 1: 24 thẻ game (thấy ${await cardCount()})`);
  ok(txt.includes("Trang 1/2 · 28 game"), "Catalog: nhãn 'Trang 1/2 · 28 game'");
  // Menu: dropdown Top-Up có mục Nạp game + highlight duy nhất
  const navInfo = await evaluate(`(() => {
    const act = [...document.querySelectorAll('aside a, nav a')].filter((a) => a.className.includes('bg-brand-50'));
    return act.map((a) => a.textContent.trim());
  })()`);
  ok(navInfo.length === 1 && navInfo[0] === "Nạp game", `Menu: đúng 1 lá highlight = 'Nạp game' (thấy ${JSON.stringify(navInfo)})`);
  await capture("2026-11-08-topup-catalog-desktop");
  await evaluate(`[...document.querySelectorAll('a')].find((a) => a.textContent.trim() === 'Trang sau')?.click(); 'next'`);
  await sleep(2800);
  txt = await bodyText();
  ok((await cardCount()) === 4, `Catalog trang 2: 4 thẻ game (thấy ${await cardCount()})`);
  ok(txt.includes("Trang 2/2 · 28 game"), "Catalog: nhãn 'Trang 2/2 · 28 game'");
  ok(txt.includes("Mobile Legends: Bang Bang") && txt.includes("Genshin Impact"), "Catalog trang 2: có MLBB + Genshin");

  /* ============ KHÁCH — tìm kiếm ====================================== */
  await navigate(`${BASE}/dashboard/top-up?q=Genshin`, 3200);
  txt = await bodyText();
  ok((await cardCount()) === 1 && txt.includes("Genshin Impact"), "Tìm 'Genshin': đúng 1 thẻ");

  /* ============ KHÁCH — chi tiết MLBB: fields + NOTE + 2 cột ========== */
  await navigate(`${BASE}/dashboard/top-up/${mlbb.id}`, 4000);
  txt = await bodyText();
  ok(txt.includes("Nạp kim cương MLBB theo ID người chơi."), "Chi tiết MLBB: hiện NOTE thật của NCC");
  ok(txt.includes("Player ID") && txt.includes("Zone ID"), "Chi tiết MLBB: 2 trường tuỳ chỉnh có nhãn trong tóm tắt");
  ok(txt.includes("55.500đ"), "Chi tiết MLBB: giá 86 Diamonds = 55.500đ");
  const fieldKinds = await evaluate(`(() => {
    const c0 = document.querySelector('[name="cf_0"]'); const c1 = document.querySelector('[name="cf_1"]');
    return { c0: c0 ? c0.tagName : null, c1: c1 ? c1.tagName : null };
  })()`);
  ok(fieldKinds.c0 === "INPUT" && fieldKinds.c1 === "INPUT", `Chi tiết MLBB: cf_0/cf_1 là INPUT (${JSON.stringify(fieldKinds)})`);
  const cols = await evaluate(`(() => {
    const heads = [...document.querySelectorAll('h2')];
    const products = heads.find((h) => h.textContent.trim() === 'Gói nạp');
    const summary = heads.find((h) => h.textContent.trim() === 'Tóm tắt đơn');
    if (!products || !summary) return null;
    const pr = products.closest('section').getBoundingClientRect();
    const sr = summary.closest('section').getBoundingClientRect();
    return { px: Math.round(pr.x), pw: Math.round(pr.width), sx: Math.round(sr.x), sy: Math.round(sr.y), py: Math.round(pr.y), ph: Math.round(pr.height) };
  })()`);
  ok(!!cols && cols.sx > cols.px + cols.pw - 40 && cols.sy < cols.py + cols.ph, `Chi tiết PC: tóm tắt nằm cột PHẢI cạnh thẻ gói nạp (${JSON.stringify(cols)})`);
  await capture("2026-11-08-topup-detail-desktop");

  /* ============ KHÁCH — Genshin: trường select ======================== */
  await navigate(`${BASE}/dashboard/top-up/${genshin.id}`, 4000);
  const serverField = await evaluate(`(() => {
    const sels = [...document.querySelectorAll('select')];
    const s = sels.find((x) => [...x.options].some((o) => o.value === 'asia'));
    return s ? { name: s.getAttribute('name'), options: [...s.options].map((o) => o.value) } : null;
  })()`);
  ok(!!serverField && serverField.options.join(",") === "asia,america,europe", `Genshin: trường Server là SELECT asia/america/europe (${JSON.stringify(serverField)})`);

  /* ============ KHÁCH — yêu thích ===================================== */
  await navigate(`${BASE}/dashboard/top-up/${mlbb.id}`, 4000);
  await evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Thêm vào yêu thích'))?.click(); 'fav'`);
  await sleep(700);
  await navigate(`${BASE}/dashboard/top-up`, 3500);
  await evaluate(`(() => { const b = document.querySelector('form button[title]'); if (b) b.click(); return !!b; })()`);
  await sleep(3000);
  txt = await bodyText();
  ok((await cardCount()) === 1 && txt.includes("Mobile Legends: Bang Bang"), "Yêu thích: lọc sao chỉ còn MLBB");

  /* ============ KHÁCH — mua thật MLBB ================================= */
  await navigate(`${BASE}/dashboard/top-up/${mlbb.id}`, 4000);
  await evaluate(`(() => { const a = document.querySelector('[name="cf_0"]'); const b = document.querySelector('[name="cf_1"]'); if (a) (${SET_VALUE})(a, 'player123'); if (b) (${SET_VALUE})(b, '2001'); return { a: !!a, b: !!b }; })()`);
  await sleep(500);
  const contEnabled = await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Tiếp tục'); return b ? !b.disabled : null; })()`);
  ok(contEnabled === true, "Mua MLBB: nút Tiếp tục bật sau khi điền đủ trường");
  await evaluate(`[...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Tiếp tục')?.click(); 'buy'`);
  await sleep(6000);
  const afterUrl = await evaluate(`location.href`);
  ok(afterUrl.includes("/dashboard/top-up/don-hang"), `Mua MLBB: chuyển về lịch sử Top-Up (${afterUrl})`);
  txt = await bodyText();
  const order = await prisma.premiumOrder.findFirst({ where: { user: { username: "demo" } }, orderBy: { id: "desc" }, include: { variant: true } });
  ok(!!order && order.total === 55500, `Đơn MLBB: tổng 55.500đ (thấy ${order?.total})`);
  ok(!!order && (order.buyerInfo || "").includes("Player ID: player123") && (order.buyerInfo || "").includes("Zone ID: 2001"), `Đơn MLBB: buyerInfo có nhãn + giá trị (${JSON.stringify(order?.buyerInfo)})`);
  ok(!!order && txt.includes(order.code), `Lịch sử Top-Up: thấy mã đơn ${order?.code}`);
  const demoAfter = await prisma.user.findFirst({ where: { username: "demo" } });
  ok(demoAfter?.balance === 444500, `Số dư demo sau mua: 444.500đ (thấy ${demoAfter?.balance})`);
  const mockLog = (await (await fetch("http://127.0.0.1:3998/__log")).json()).log || [];
  const flat = mockLog.map((e) => ({ p: e.path || e.url || "", b: e.body || {} }));
  const valHit = flat.find((e) => e.p.includes("/topups/validate-id") && e.b.fields?.player_id === "player123" && e.b.fields?.zone_id === "2001");
  const ordHit = flat.find((e) => e.p.includes("/topups/order") && e.b.fields?.player_id === "player123" && e.b.offer_id === "tp-1-86");
  ok(!!valHit, "Mock: validate-id nhận fields theo KEY {player_id, zone_id}");
  ok(!!ordHit, "Mock: order nhận {category_id, offer_id: tp-1-86, fields theo KEY}");
  await navigate(`${BASE}/dashboard/don-premium`, 4000);
  txt = await bodyText();
  ok(!!order && !txt.includes(order.code), "Tách đơn: Đơn Premium của khách KHÔNG có đơn MLBB");

  /* ============ KHÁCH — tách catalog khỏi /premium + trang chủ ======== */
  const premHtml = await (await fetch(`${BASE}/premium`)).text();
  ok(!premHtml.includes("Mobile Legends") && !premHtml.includes("Fixture TopUp"), "/premium: KHÔNG còn sản phẩm topups");
  ok(premHtml.includes("YouTube Premium"), "/premium: vẫn còn sản phẩm thường (YouTube Premium)");
  const homeHtml = await (await fetch(`${BASE}/`)).text();
  ok(!homeHtml.includes("Mobile Legends") && !homeHtml.includes("Fixture TopUp"), "Trang chủ: KHÔNG còn sản phẩm topups trong các mục Premium");

  /* ============ KHÁCH — mobile ======================================== */
  await viewport(390, 844);
  await navigate(`${BASE}/dashboard/top-up`, 4000);
  ok((await cardCount()) === 24, "Catalog mobile: trang 1 có 24 thẻ (2 cột)");
  await capture("2026-11-08-topup-catalog-mobile");
  await navigate(`${BASE}/dashboard/top-up/${mlbb.id}`, 4000);
  const mCols = await evaluate(`(() => {
    const heads = [...document.querySelectorAll('h2')];
    const products = heads.find((h) => h.textContent.trim() === 'Gói nạp');
    const summary = heads.find((h) => h.textContent.trim() === 'Tóm tắt đơn');
    if (!products || !summary) return null;
    const pr = products.closest('section').getBoundingClientRect();
    const sr = summary.closest('section').getBoundingClientRect();
    return { px: Math.round(pr.x), sx: Math.round(sr.x), sy: Math.round(sr.y), pend: Math.round(pr.y + pr.height) };
  })()`);
  ok(!!mCols && mCols.sx === mCols.px && mCols.sy >= mCols.pend - 4, `Chi tiết mobile: 1 cột, tóm tắt nằm DƯỚI thẻ gói nạp (${JSON.stringify(mCols)})`);
  await capture("2026-11-08-topup-detail-mobile");

  /* ============ ADMIN — 10 sản phẩm/trang ============================= */
  await viewport(1440, 1100);
  await setSession(adminToken);
  await navigate(`${BASE}/admin/top-up/san-pham`, 4500);
  txt = await bodyText();
  ok(txt.includes("Trang 1/3 · 28 danh mục"), "Admin Top-Up: 'Trang 1/3 · 28 danh mục'");
  const adminCount = () => evaluate(`[...document.querySelectorAll('input')].filter((i) => /Fixture TopUp|Mobile Legends|Genshin Impact|Telegram \\(V2\\)/.test(i.value || '')).length`);
  ok((await adminCount()) === 10, `Admin Top-Up trang 1: 10 sản phẩm (thấy ${await adminCount()})`);
  await capture("2026-11-08-admin10-topup");
  await navigate(`${BASE}/admin/top-up/san-pham?page=3`, 4000);
  ok((await adminCount()) === 8, `Admin Top-Up trang 3: 8 sản phẩm (thấy ${await adminCount()})`);
  await navigate(`${BASE}/admin/premium`, 4500);
  txt = await bodyText();
  ok(txt.includes("Trang 1/4 · 37 sản phẩm"), "Admin Premium: 'Trang 1/4 · 37 sản phẩm' (10/trang)");

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAIL`);
}

main()
  .catch((e) => { console.error("ERR", e); failures++; })
  .finally(async () => {
    try { console.log(fixture("clean")); } catch (e) { console.error("clean err", e); }
    const demo = await prisma.user.findFirst({ where: { username: "demo" } });
    const prods = await prisma.premiumProduct.count({ where: { panelId: null } });
    console.log(`sau clean: demo balance=${demo?.balance}, products=${prods}`);
    await prisma.$disconnect();
    mock.kill(); chrome.kill();
    process.exit(failures ? 1 : 0);
  });
