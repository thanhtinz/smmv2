/** NGHIỆM THU gói thành viên PASS (lệnh Tín 2026-11-12):
 *  node scripts/shots-pass.mjs (cần server production :3000 + đã chạy
 *  pass-shots-fixture.ts setup; DATABASE_URL trỏ DB local).
 *  1. Trang /pass (demo đang còn hạn Pass): hero + 3 thẻ giá đúng cấu hình
 *     admin (49.000/129.000/399.000, badge Tiết kiệm nhất ở kỳ rẻ nhất/tháng),
 *     thẻ quyền lợi đúng % (hoàn 10%, giảm 5%), khối quà + FAQ từ bài viết.
 *  2. Bấm Gia hạn qua UI thật: ví trừ đúng 49.000, hạn dời tiếp (PASS_PURCHASE).
 *  3. Bấm Nhận quà tháng này: đơn 0đ DELIVERED giao từ kho; trang báo đã nhận.
 *  4. Mobile 390: không tràn ngang. Admin: tab Cấu hình > Pass có đủ trường +
 *     bộ chọn quà. Tắt pass_enabled -> /pass chuyển hướng về trang chủ.
 *  Ảnh: 2026-11-13-pass-page-desktop.png, -mobile.png, -admin.png. */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });
let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; };

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=old", "--disable-gpu", "--no-sandbox", "--disable-setuid-sandbox", "--hide-scrollbars",
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-pass",
  "--remote-debugging-port=9414", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9414/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
    await sleep(200);
  }
  throw new Error("chrome CDP không lên");
}
let msgId = 0; const pending = new Map(); let ws; let sessionId = null;
function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
}
async function evaluate(expr) {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || "eval error");
  return r.result?.value;
}
async function navigate(url, wait = 3000) { await send("Page.navigate", { url }); await sleep(wait); }
async function shot(name, full = false) {
  const r = await send("Page.captureScreenshot", { format: "png", ...(full ? { captureBeyondViewport: true } : {}) });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name);
}
const bodyText = () => evaluate(`document.body.innerText`);
const setField = (name, val) => evaluate(`(() => { const el = document.querySelector('input[name="${name}"]'); if (!el) throw new Error('thiếu input ${name}'); el.focus(); el.value = ${JSON.stringify(val)}; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
async function setLangVi() {
  await navigate(BASE + "/", 1500);
  await evaluate(`(() => { try { localStorage.setItem('smmv2-lang', 'vi'); } catch {} document.cookie = 'smmv2-lang=vi; path=/'; return true; })()`);
}
async function login(username, password) {
  await send("Network.clearBrowserCookies");
  await setLangVi();
  await navigate(`${BASE}/login`, 2500);
  await setField("login", username);
  await setField("password", password);
  await evaluate(`(() => { const b = document.querySelector('form button[type="submit"], form button'); if (!b) throw new Error('thiếu nút submit'); b.click(); return true; })()`);
  await sleep(3200);
}
const clickByText = (t) => evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === ${JSON.stringify(t)}); if (!b) return false; b.scrollIntoView({ block: 'center' }); b.click(); return true; })()`);
async function waitForText(substr, tries = 12) {
  for (let i = 0; i < tries; i++) { const t = await bodyText(); if (t.includes(substr)) return t; await sleep(900); }
  return bodyText();
}

async function main() {
  const demo = await prisma.user.findUnique({ where: { username: "demo" } });
  const giftVariantId = Number((await prisma.setting.findUnique({ where: { key: "pass_gift_variant_id" } }))?.value);
  const giftProd = await prisma.premiumProduct.findFirst({ where: { variants: { some: { id: giftVariantId } } } });
  const bal0 = demo.balance; const exp0 = demo.passExpiresAt;

  ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } };
  const targets = await (await fetch("http://127.0.0.1:9414/json/list")).json();
  const page = targets.find((t) => t.type === "page");
  sessionId = (await send("Target.attachToTarget", { targetId: page.id, flatten: true })).sessionId;
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

  /* ---- 1. Trang /pass desktop ---- */
  await login("demo", "Demo@123");
  await navigate(`${BASE}/pass`, 3500);
  let text = await bodyText();
  ok(text.includes("49.000") && text.includes("129.000") && text.includes("399.000"), "3 thẻ giá đúng cấu hình admin");
  ok(text.includes("Tiết kiệm nhất"), "có badge Tiết kiệm nhất");
  ok(text.includes("10%") && text.includes("5%"), "quyền lợi hiện đúng % hoàn/giảm đã cấu hình");
  ok(text.includes("Đang còn hạn tới"), "thành viên thấy trạng thái + hạn dùng");
  ok(giftProd && text.includes(giftProd.name), `khối quà hiện sản phẩm thật (${giftProd?.name})`);
  ok(text.includes("Mua Pass bằng cách nào?"), "FAQ lấy từ bài viết admin (pass-faq)");
  ok(text.includes("Số dư ví của bạn:"), "hiện số dư ví ở khu vực mua");
  await shot("2026-11-13-pass-page-desktop", true);

  /* ---- 2. Gia hạn qua UI ---- */
  const clicked = await clickByText("Gia hạn");
  ok(clicked, "bấm được nút Gia hạn");
  text = await waitForText("Đã mua Pass 1 tháng");
  const demo2 = await prisma.user.findUnique({ where: { id: demo.id } });
  ok(demo2.balance === bal0 - 49000, `gia hạn trừ đúng 49.000 qua UI (bal=${demo2.balance})`);
  ok(demo2.passExpiresAt && exp0 && demo2.passExpiresAt > exp0, "hạn dời tiếp sau gia hạn");
  ok(text.includes("Đã mua Pass 1 tháng"), "trang báo gia hạn thành công");

  /* ---- 3. Nhận quà qua UI ---- */
  const giftClicked = await clickByText("Nhận quà tháng này");
  ok(giftClicked, "bấm được nút Nhận quà tháng này");
  text = await waitForText("Đã nhận tháng này");
  const claim = await prisma.passGiftClaim.findFirst({ where: { userId: demo.id } });
  ok(!!claim?.orderCode, "có lượt nhận quà ghi mã đơn");
  const gOrder = claim?.orderCode ? await prisma.premiumOrder.findUnique({ where: { code: claim.orderCode } }) : null;
  ok(!!gOrder && gOrder.total === 0 && gOrder.status === "DELIVERED", `đơn quà 0đ đã giao (${gOrder?.status})`);
  ok(text.includes("Đã nhận tháng này"), "trang báo đã nhận quà tháng này");

  /* ---- 4. Mobile ---- */
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await navigate(`${BASE}/pass`, 3000);
  const overflow = await evaluate(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
  ok(overflow <= 1, `mobile không tràn ngang (overflow=${overflow})`);
  await shot("2026-11-13-pass-page-mobile", true);

  /* ---- 5. Admin: tab Cấu hình > Pass ---- */
  // Admin seed chưa bật 2FA mà admin_2fa_required mặc định "1" -> bị đưa về
  // trang hồ sơ để thiết lập 2FA. Tắt yêu cầu này TRONG DB LOCAL để chụp,
  // khôi phục nguyên trạng ngay sau đó.
  const old2fa = (await prisma.setting.findUnique({ where: { key: "admin_2fa_required" } }))?.value ?? null;
  await prisma.setting.upsert({ where: { key: "admin_2fa_required" }, create: { key: "admin_2fa_required", value: "0" }, update: { value: "0" } });
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await login("admin", "Admin@123");
  await navigate(`${BASE}/admin/cau-hinh`, 3500);
  // SettingsTabs là tab client (không đọc ?tab=) — bấm tab "Pass" thật
  await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Pass'); if (b) b.click(); return !!b; })()`);
  await sleep(1200);
  text = await bodyText();
  ok(text.includes("Gói thành viên Pass"), "admin có mục Gói thành viên Pass");
  ok(text.includes("Giá 12 tháng") && text.includes("Hoàn tiền mỗi đơn (%)") && text.includes("Giảm thêm khi thanh toán (%)"), "đủ trường giá + % quyền lợi");
  const picker = await evaluate(`(() => { const sels = [...document.querySelectorAll('select')]; const names = sels.map((s) => s.getAttribute('name')); return { hasProduct: names.includes('pass_gift_product_id'), hasVariant: names.includes('pass_gift_variant_id'), productVal: (sels.find((s) => s.getAttribute('name') === 'pass_gift_product_id') || {}).value || '' }; })()`);
  ok(picker.hasProduct && picker.hasVariant && picker.productVal !== "", "bộ chọn quà sản phẩm + gói đã gắn đúng giá trị");
  await evaluate(`(() => { const el = [...document.querySelectorAll('h2')].find((h) => h.innerText.includes('Gói thành viên Pass')); if (el) el.scrollIntoView({ block: 'start' }); return true; })()`);
  await sleep(600);
  await shot("2026-11-13-pass-admin", false);
  if (old2fa === null) await prisma.setting.deleteMany({ where: { key: "admin_2fa_required" } });
  else await prisma.setting.update({ where: { key: "admin_2fa_required" }, data: { value: old2fa } });

  /* ---- 6. Tắt tính năng -> /pass về trang chủ, menu mất mục ---- */
  await prisma.setting.update({ where: { key: "pass_enabled" }, data: { value: "0" } });
  const res = await fetch(`${BASE}/pass`, { redirect: "manual" });
  ok(res.status >= 300 && res.status < 400 && (res.headers.get("location") || "").endsWith("/"), `/pass khi tắt -> chuyển hướng trang chủ (${res.status})`);
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAIL`);
  chrome.kill();
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}
main().catch(async (e) => { console.error(e); chrome.kill(); await prisma.$disconnect().catch(() => {}); process.exit(1); });
