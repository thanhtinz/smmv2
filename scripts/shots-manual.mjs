/** Kiểm chứng khu Manual Services (2026-11-08): seed fixture (mock FZR) ->
 *  CDP: catalog (dải không khả dụng + 2 chip), popover info nguồn, tooltip
 *  loại giao, mua ms-2 replenishment qua UI (mock log: body đúng tài
 *  liệu), tách đơn, picker thêm lại ms-1 ở admin -> chụp 4 ảnh -> dọn
 *  fixture, khôi phục demo.
 *  Chạy: node scripts/shots-manual.mjs */
import { spawn, execSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
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
const fixture = (args) => execSync(`npx tsx scripts/fixture-manual.ts ${args}`, { cwd: "/home/hatch/workspace/smmv2", env: TSX_ENV, stdio: "pipe" }).toString();

let mock = null;
async function startMock() {
  mock = spawn("node", ["scripts/mock-fzr.mjs"], { cwd: "/home/hatch/workspace/smmv2", stdio: "ignore" });
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch("http://127.0.0.1:3998/__log"); if (r.ok) return; } catch {}
    await sleep(300);
  }
  throw new Error("mock không lên");
}
const mockLog = async () => (await (await fetch("http://127.0.0.1:3998/__log")).json()).log;

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--remote-debugging-port=9374", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9374/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch {}
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
const ev = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error("eval lỗi: " + JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result?.value;
};
async function nav(url, token) {
  await send("Page.navigate", { url: "about:blank" });
  await sleep(150);
  await send("Network.setCookie", { name: "smmv2_session", value: token, domain: "127.0.0.1", path: "/" });
  await send("Network.setCookie", { name: "smmv2-lang", value: "vi", domain: "127.0.0.1", path: "/" });
  await send("Page.navigate", { url: BASE + url });
  await sleep(1400);
}
async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const { writeFileSync } = await import("node:fs");
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name);
}

try {
  await startMock();
  console.log(fixture("seed").trim().split("\n").slice(-3).join("\n"));

  const ms2 = await prisma.premiumProduct.findFirst({ where: { providerProductId: "ms-2" }, select: { id: true } });
  const longP = await prisma.premiumProduct.findFirst({ where: { providerProductId: "fx-ms-long" }, select: { id: true } });
  ok(!!ms2 && !!longP, `fixture: có ms-2 (#${ms2?.id}) + long-info (#${longP?.id})`);

  ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
  };
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const att = await send("Target.attachToTarget", { targetId, flatten: true });
  sessionId = att.sessionId;
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");

  /* ---------- CATALOG ---------- */
  await nav("/dashboard/manual-services", demoToken);
  await nav("/dashboard/manual-services", demoToken); // lần 2: cookie ngôn ngữ đã chắc chắn áp
  const cat = await ev(`(() => {
    const cards = [...document.querySelectorAll('a[href^="/dashboard/manual-services/"]')].filter(a => /^\\/dashboard\\/manual-services\\/\\d+$/.test(a.getAttribute('href')));
    const band = document.querySelector('div.bg-amber-600');
    const fileChips = document.querySelectorAll('button[aria-expanded]').length;
    return { cards: cards.length, band: !!band, chips: fileChips, text: document.body.innerText.slice(0, 400) };
  })()`);
  ok(cat.cards === 4, `catalog: 4 thẻ dịch vụ (thấy ${cat.cards})`);
  ok(cat.band, "catalog: dải cam 'Tạm thời không khả dụng' hiện trên dịch vụ tạm ngưng");
  ok(cat.chips >= 3, `catalog: có chip bấm được trên thẻ (thấy ${cat.chips})`);
  await shot("2026-11-08-manual-catalog");

  /* ---------- POPOVER info nguồn (thẻ long-info) ---------- */
  await ev(`(() => { const a = [...document.querySelectorAll('a')].find(x => x.href.endsWith('/dashboard/manual-services/${longP.id}')); a?.scrollIntoView({ block: 'center' }); return !!a; })()`);
  await sleep(400);
  await ev(`(() => { const a = [...document.querySelectorAll('a')].find(x => x.href.endsWith('/dashboard/manual-services/${longP.id}')); const b = a?.querySelector('button[aria-expanded]'); b?.click(); return !!b; })()`);
  await sleep(500);
  const pop = await ev(`(() => { const p = [...document.querySelectorAll('div.fixed')].find(d => d.textContent.includes('Region: US')); return p ? p.textContent : null; })()`);
  ok(!!pop && pop.includes("Warranty: 24 hours"), "popover: hiện đúng info nguồn (Region/Warranty) khi bấm chip file");
  await shot("2026-11-08-manual-popover");
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await sleep(300);

  /* ---------- TOOLTIP loại giao (chip thứ hai, cùng thẻ) ---------- */
  await ev(`(() => { const a = [...document.querySelectorAll('a')].find(x => x.href.endsWith('/dashboard/manual-services/${longP.id}')); const bs = a?.querySelectorAll('button[aria-expanded]'); bs?.[1]?.click(); return bs?.length || 0; })()`);
  await sleep(500);
  const tip = await ev(`(() => { const p = [...document.querySelectorAll('div.fixed')].find(d => d.textContent.includes('Nạp bổ sung') || d.textContent.includes('Replenishment')); return p ? p.textContent : null; })()`);
  ok(!!tip, `tooltip loại giao: kind replenishment -> tiêu đề Nạp bổ sung/Replenishment (thấy: ${String(tip).slice(0, 60)})`);
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);

  /* ---------- CHI TIẾT ms-2 + MUA ---------- */
  await nav(`/dashboard/manual-services/${ms2.id}`, demoToken);
  const det = await ev(`(() => ({
    hasMinutes: document.body.innerText.includes('Giao khoảng') && document.body.innerText.includes('30'),
    hasNoteCard: document.body.innerText.includes('Nhập đúng ID người chơi và máy chủ'),
    inputs: [...document.querySelectorAll('input[name^="cf_"]')].map(i => i.name + ':' + (document.querySelector('label[for="' + i.id + '"]')?.textContent || '').trim()),
  }))()`);
  ok(det.hasMinutes, "chi tiết ms-2: offer hiện delivery_minutes (Giao khoảng 30 phút)");
  ok(det.hasNoteCard, "chi tiết ms-2: thẻ NOTE = info của NCC");
  ok(det.inputs.length === 2, `chi tiết ms-2: 2 trường replenishment trong tóm tắt (${JSON.stringify(det.inputs)})`);
  await shot("2026-11-08-manual-detail");

  await ev(`(() => {
    const set = (name, val) => { const i = document.querySelector('input[name="' + name + '"]'); const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(i, val); i.dispatchEvent(new Event('input', { bubbles: true })); };
    set('cf_0', 'player123'); set('cf_1', 'asia-1');
    return true;
  })()`);
  await sleep(300);
  await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Tiếp tục' && !x.disabled); b?.click(); return !!b; })()`);
  await sleep(2500);
  const afterBuyUrl = await ev(`location.pathname`);
  ok(afterBuyUrl === "/dashboard/manual-services/don-hang", `mua xong -> lịch sử Manual (${afterBuyUrl})`);
  const log = await mockLog();
  const manualOrders = (log || []).filter((r) => String(r.path || "").includes("manual-services/order"));
  const lastBody = manualOrders.length ? manualOrders[manualOrders.length - 1].body : null;
  ok(!!lastBody && lastBody.manual_service_id === "ms-2" && lastBody.product_id === "of-m1",
    `mock: order body đúng tài liệu (manual_service_id=ms-2, product_id=of-m1) — ${JSON.stringify(lastBody)}`);
  ok(!!lastBody && lastBody.fields?.player_id === "player123" && lastBody.fields?.server === "asia-1",
    `mock: fields gửi theo KEY của NCC (${JSON.stringify(lastBody?.fields)})`);
  const demo = await prisma.user.findFirst({ where: { username: "demo" }, select: { balance: true } });
  ok(demo.balance === 443000, `số dư demo sau mua = 443.000đ (thấy ${demo.balance})`);

  // Tách đơn: không lọt vào Đơn Premium thường của khách
  await nav("/dashboard/don-premium", demoToken);
  const inPremium = await ev(`document.body.innerText.includes('MLBB Diamonds')`);
  ok(!inPremium, "tách đơn: đơn manual KHÔNG hiện ở Đơn Premium thường");
  await nav("/dashboard/manual-services/don-hang", demoToken);
  const inManual = await ev(`document.body.innerText.includes('MLBB Diamonds')`);
  ok(inManual, "tách đơn: đơn hiện ở lịch sử Manual Services");

  /* ---------- ADMIN: picker thêm lại ms-1 ---------- */
  console.log(fixture("drop ms-1").trim());
  await nav("/admin/manual-services/san-pham", adminToken);
  const adm0 = await ev(`document.body.innerText.includes('TikTok Followers Boost')`);
  ok(!adm0, "admin: ms-1 đã bị xoá khỏi danh sách trước khi thêm lại");
  // Mở picker: gõ tìm TikTok -> Tìm -> chọn kết quả -> đặt giá -> Thêm dịch vụ
  await ev(`(() => { const i = document.querySelector('input[placeholder*="catalog FZR"]'); const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(i, 'TikTok'); i.dispatchEvent(new Event('input', { bubbles: true })); return !!i; })()`);
  await sleep(200);
  await ev(`(() => { [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Tìm')?.click(); return true; })()`);
  await sleep(1800);
  const found = await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('TikTok Followers Boost')); b?.click(); return !!b; })()`);
  ok(found, "admin picker: tìm thấy TikTok Followers Boost trong catalog nguồn");
  await sleep(1800); // editions + fields/kind tự nạp
  const kindShown = await ev(`(() => [...document.querySelectorAll('input')].some(i => i.value === 'standard'))()`);
  ok(kindShown, "admin picker: kind của category tự nạp vào form (standard)");
  await ev(`(() => { const i = document.querySelector('input[name="price"]'); if (i) { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(i, '75000'); i.dispatchEvent(new Event('input', { bubbles: true })); } return !!i; })()`);
  await sleep(200);
  await ev(`(() => { [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Thêm dịch vụ' && !b.disabled)?.click(); return true; })()`);
  await sleep(2500);
  const adm1 = await ev(`document.body.innerText.includes('TikTok Followers Boost') && document.body.innerText.includes('Tự thêm')`);
  ok(adm1, "admin picker: thêm lại ms-1 thành công, gói mang dấu Tự thêm (CUSTOM)");
  await shot("2026-11-08-manual-admin");

  // Hàng đợi đơn admin của khu
  await nav("/admin/manual-services", adminToken);
  const inQueue = await ev(`document.body.innerText.includes('MLBB Diamonds')`);
  ok(inQueue, "admin: đơn manual hiện ở hàng đợi Đơn hàng Manual Services");

  /* ---------- DỌN ---------- */
  console.log(fixture("clean").trim());
  const state = await prisma.premiumProduct.count({ where: { panelId: null } });
  const demo2 = await prisma.user.findFirst({ where: { username: "demo" }, select: { balance: true } });
  console.log(`sau clean: products=${state}, demo balance=${demo2.balance}`);
  ok(state === 9 && demo2.balance === 500000, "dọn fixture xong: 9 sản phẩm seed, demo 500.000đ");

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAIL`);
} catch (e) {
  console.error("LỖI:", e.message || e);
  try { console.log(fixture("clean").trim()); } catch {}
  process.exitCode = 1;
} finally {
  try { chrome.kill(); } catch {}
  try { mock?.kill(); } catch {}
  await prisma.$disconnect();
}
