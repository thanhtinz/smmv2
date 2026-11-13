/**
 * NGHIỆM THU GIỚI THIỆU BẠN BÈ / AFFILIATE (lệnh Tín 2026-11-12).
 * Điều kiện: production server :3000 đang chạy + đã chạy scripts/aff-fixture.ts.
 * Luồng kiểm thật trên trình duyệt:
 *  1) Khách mở /?aff=MÃ → cookie aff_ref được đặt + click được đếm 1 lần
 *     (mở lại vẫn 1 — chống trùng theo visitor/ngày).
 *  2) Đăng ký (không kèm ?ref=) → banner hiện người giới thiệu, tài khoản
 *     mới được gắn referredById đúng người.
 *  3) Khách vãng lai mở trang sản phẩm → nút Kiếm tiền có, mở hộp thấy lời
 *     mời đăng nhập (không có link cá nhân).
 *  4) affdemo đăng nhập → trang Giới thiệu bạn bè hiện đúng số liệu sổ
 *     (105.000đ khả dụng, 8 click, thành viên + hoa hồng theo người) → chụp.
 *  5) Hộp "Chia sẻ kiếm tiền": huy hiệu 6%, dòng hoa hồng dự kiến tính đúng
 *     theo giá gói, link chứa ?aff=MÃ → chụp. Đổi setting lên 8% → huy hiệu
 *     và hộp cập nhật theo (không hardcode).
 *  6) Tim yêu thích: bấm → localStorage có slug; tải lại trang vẫn đỏ.
 *  7) affpoor (5.000đ < tối thiểu): nút Rút tiền bị khoá + dòng "Cần thêm".
 *  8) affdemo rút tiền thật qua UI → DB: số dư hoa hồng 0, ví +105.000,
 *     đủ 2 chân sổ (AffiliateTxn WITHDRAW + Transaction AFFILIATE_WITHDRAW).
 * Ảnh: 2026-11-12-aff-page-{desktop,mobile}.png, 2026-11-12-aff-modal.png
 */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL || "postgresql://postgres@127.0.0.1:5433/postgres" } } });
const FX = JSON.parse(readFileSync("/tmp/aff-fixture.json", "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; };

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=old", "--disable-gpu", "--no-sandbox", "--disable-setuid-sandbox", "--hide-scrollbars",
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-aff",
  "--remote-debugging-port=9413", "--window-size=1440,900",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });

async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9413/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch {}
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
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || "eval error");
  return r.result?.value;
}
async function shot(name, full = false) {
  const params = { format: "png", ...(full ? { captureBeyondViewport: true } : {}) };
  const r = await send("Page.captureScreenshot", params);
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name);
}
async function navigate(url, wait = 2800) { await send("Page.navigate", { url }); await sleep(wait); }
const bodyText = () => evaluate(`document.body.innerText`);
const setField = (name, val) => evaluate(`(() => { const el = document.querySelector('input[name="${name}"]'); if (!el) throw new Error('thiếu input ${name}'); el.focus(); el.value = ${JSON.stringify(val)}; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
async function submitForm() {
  await evaluate(`(() => { const b = document.querySelector('form button[type="submit"], form button'); if (!b) throw new Error('thiếu nút submit'); b.click(); return true; })()`);
  await sleep(3000);
}
async function login(username) {
  await send("Network.clearBrowserCookies");
  await setLangVi();
  await navigate(`${BASE}/login`, 2500);
  await setField("login", username);
  await setField("password", "Aff@12345");
  await submitForm();
}
const fmt = (n) => n.toLocaleString("vi-VN");
async function setLangVi() {
  await navigate(BASE + "/", 1500);
  await evaluate(`(() => { try { localStorage.setItem('smmv2-lang', 'vi'); } catch {} document.cookie = 'smmv2-lang=vi; path=/'; return true; })()`);
}

async function main() {
  ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
  };
  const targets = await (await fetch("http://127.0.0.1:9413/json/list")).json();
  const page = targets.find((t) => t.type === "page");
  sessionId = (await send("Target.attachToTarget", { targetId: page.id, flatten: true })).sessionId;
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  /* ---- 1. Click qua ?aff= ---- */
  await send("Network.clearBrowserCookies");
  await setLangVi();
  const clicksBefore = await prisma.affiliateClick.count({ where: { referrerId: FX.demoId } });
  await navigate(`${BASE}/?aff=${FX.demoCode}`, 3000);
  const cookie1 = await evaluate(`document.cookie`);
  ok(cookie1.includes(`aff_ref=${FX.demoCode}`), `cookie aff_ref được đặt (${FX.demoCode})`);
  const clicksAfter1 = await prisma.affiliateClick.count({ where: { referrerId: FX.demoId } });
  ok(clicksAfter1 === clicksBefore + 1, `click được đếm: ${clicksBefore} → ${clicksAfter1}`);
  await navigate(`${BASE}/?aff=${FX.demoCode}`, 2500);
  const clicksAfter2 = await prisma.affiliateClick.count({ where: { referrerId: FX.demoId } });
  ok(clicksAfter2 === clicksAfter1, `mở lại cùng ngày không đếm trùng: ${clicksAfter2}`);

  /* ---- 2. Đăng ký gắn người giới thiệu từ cookie ---- */
  await navigate(`${BASE}/register`, 2500);
  const regText = await bodyText();
  ok(regText.includes("affdemo") && regText.includes("giới thiệu"), "trang đăng ký hiện banner người giới thiệu từ cookie");
  const newName = `affnewbie${Math.floor(Math.random() * 900 + 100)}`;
  await setField("username", newName);
  await setField("email", `${newName}@fixture.local`);
  await setField("password", "Aff@12345");
  await setField("confirmPassword", "Aff@12345");
  await evaluate(`(() => { const c = document.querySelector('input[name="terms"]'); if (c && !c.checked) c.click(); return true; })()`);
  await submitForm();
  const newUser = await prisma.user.findUnique({ where: { username: newName }, select: { referredById: true } });
  ok(newUser?.referredById === FX.demoId, `tài khoản mới gắn đúng người giới thiệu (referredById=${newUser?.referredById})`);

  /* ---- 3. Khách vãng lai: hộp kiếm tiền mời đăng nhập ---- */
  await send("Network.clearBrowserCookies");
  await setLangVi();
  await navigate(`${BASE}/premium/${FX.slug}`, 3000);
  const guestEarn = await evaluate(`(() => { const b = document.querySelector('button[aria-label="Kiếm tiền"]'); if (!b) return null; const badge = b.querySelector('span')?.innerText || ''; b.click(); return badge; })()`);
  ok(guestEarn === "6%", `khách vãng lai thấy nút Kiếm tiền, huy hiệu ${guestEarn}`);
  await sleep(800);
  const guestModal = await bodyText();
  ok(guestModal.includes("Chia sẻ kiếm tiền") && guestModal.includes("Đăng nhập để lấy link giới thiệu"), "hộp của khách: mời đăng nhập, không lộ link cá nhân");
  await evaluate(`document.querySelector('[role="dialog"] button[aria-label="Đóng"]')?.click()`);
  await sleep(500);

  /* ---- 4. Trang Giới thiệu bạn bè của affdemo ---- */
  await login("affdemo");
  await navigate(`${BASE}/dashboard/kiem-tien`, 3000);
  const affText = await bodyText();
  ok(affText.includes("Giới thiệu bạn bè"), "trang affiliate tải đúng tiêu đề");
  ok(affText.includes("105.000"), "số dư hoa hồng khả dụng 105.000đ");
  ok(affText.includes("125.000"), "tổng kiếm được 125.000đ (Từ đơn hàng)");
  ok(affText.includes("20.000"), "đã rút 20.000đ");
  ok(affText.includes("affmember1") && affText.includes("75.000"), "thành viên 1 + hoa hồng theo người 75.000đ");
  ok(affText.includes("affmember2") && affText.includes("50.000"), "thành viên 2 + hoa hồng theo người 50.000đ");
  const linkVal = await evaluate(`(() => { const i = [...document.querySelectorAll('input')].find(x => (x.value || '').includes('?aff=')); return i ? i.value : ''; })()`);
  ok(linkVal.endsWith(`?aff=${FX.demoCode}`), `link giới thiệu đúng dạng ?aff=MÃ: ${linkVal}`);
  await shot("2026-11-12-aff-page-desktop", true);
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await navigate(`${BASE}/dashboard/kiem-tien`, 2500);
  await shot("2026-11-12-aff-page-mobile", true);
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  /* ---- 5. Hộp Chia sẻ kiếm tiền + % theo cấu hình ---- */
  await navigate(`${BASE}/premium/${FX.slug}`, 3000);
  const v0 = FX.variants[0];
  const expectComm = Math.floor((v0.price * 6) / 100);
  await evaluate(`document.querySelector('button[aria-label="Kiếm tiền"]').click()`);
  await sleep(900);
  const modalText = await bodyText();
  ok(modalText.includes("Hoa hồng dự kiến"), "hộp có mục Hoa hồng dự kiến");
  ok(modalText.includes(fmt(v0.price)) && modalText.includes(`+${fmt(expectComm)}`), `dòng gói đầu: ${fmt(v0.price)}đ → +${fmt(expectComm)}đ`);
  const modalLink = await evaluate(`(() => { const i = [...document.querySelectorAll('[role="dialog"] input')].find(x => (x.value || '').includes('?aff=')); return i ? i.value : ''; })()`);
  ok(modalLink.includes(`/premium/${FX.slug}?aff=${FX.demoCode}`), `link sản phẩm kèm mã: ${modalLink}`);
  ok(modalText.includes("Xem thống kê hoa hồng"), "hộp có nút Xem thống kê hoa hồng");
  await shot("2026-11-12-aff-modal");
  await evaluate(`document.querySelector('[role="dialog"] button[aria-label="Đóng"]')?.click()`);
  await sleep(500);
  // Đổi % lên 8 → huy hiệu cập nhật theo cấu hình, không hardcode
  await prisma.setting.upsert({ where: { key: "affiliate_percent" }, create: { key: "affiliate_percent", value: "8" }, update: { value: "8" } });
  await navigate(`${BASE}/premium/${FX.slug}`, 3000);
  const badge8 = await evaluate(`document.querySelector('button[aria-label="Kiếm tiền"] span')?.innerText || ''`);
  ok(badge8 === "8%", `đổi cấu hình → huy hiệu thành ${badge8}`);
  await prisma.setting.update({ where: { key: "affiliate_percent" }, data: { value: "6" } });

  /* ---- 6. Yêu thích ---- */
  // Chờ hydration xong mới bấm (poll: bấm lại nếu lần đầu trúng lúc React
  // chưa gắn handler — race của môi trường headless, không phải lỗi UX).
  let favStored = "";
  for (let i = 0; i < 6; i++) {
    await evaluate(`document.querySelector('button[aria-label="Yêu thích"]')?.click()`);
    await sleep(800);
    favStored = await evaluate(`(localStorage.getItem('smmv2-premium-fav-v1') || '')`);
    if (favStored.includes(FX.slug)) break;
  }
  ok(favStored.includes(FX.slug), `localStorage yêu thích có slug (${favStored})`);
  await navigate(`${BASE}/premium/${FX.slug}`, 2800);
  const favCls = await evaluate(`document.querySelector('button[aria-label="Yêu thích"]').className`);
  ok(String(favCls).includes("bg-rose-600"), "tải lại trang: tim vẫn đỏ (đã lưu)");

  /* ---- 7. Chưa đủ mức rút → nút khoá ---- */
  await login("affpoor");
  await navigate(`${BASE}/dashboard/kiem-tien`, 3000);
  const poorText = await bodyText();
  const poorDisabled = await evaluate(`[...document.querySelectorAll('button')].some(b => b.disabled && b.innerText.includes('Rút tiền'))`);
  ok(poorDisabled, "affpoor: nút Rút tiền bị khoá");
  ok(poorText.includes("Cần thêm") && poorText.includes("5.000"), "affpoor: hiện 'Cần thêm 5.000đ để rút tiền'");

  /* ---- 8. Rút tiền thật qua UI ---- */
  await login("affdemo");
  const walletBefore = (await prisma.user.findUnique({ where: { id: FX.demoId }, select: { balance: true } }))?.balance || 0;
  await navigate(`${BASE}/dashboard/kiem-tien`, 3000);
  await evaluate(`(() => { const b = [...document.querySelectorAll('form button[type="submit"]')].find(x => x.innerText.includes('Rút tiền') && !x.disabled); if (!b) throw new Error('không thấy nút Rút tiền đang bật'); b.click(); return true; })()`);
  await sleep(3500);
  const after = await prisma.user.findUnique({ where: { id: FX.demoId }, select: { balance: true, affiliateBalance: true } });
  ok(after?.affiliateBalance === 0, `sau rút: số dư hoa hồng = ${after?.affiliateBalance}`);
  ok(after?.balance === walletBefore + 105_000, `sau rút: ví chính ${walletBefore} → ${after?.balance}`);
  const wdRow = await prisma.affiliateTxn.findFirst({ where: { userId: FX.demoId, kind: "WITHDRAW", amount: -105_000 }, orderBy: { id: "desc" } });
  const wTx = await prisma.transaction.findFirst({ where: { userId: FX.demoId, type: "AFFILIATE_WITHDRAW", amount: 105_000 } });
  ok(!!wdRow && !!wTx, "đủ 2 chân sổ: AffiliateTxn WITHDRAW + Transaction AFFILIATE_WITHDRAW");

  console.log(`\n${failures === 0 ? "ALL PASS" : "FAILURES"}: ${failures} fail`);
  chrome.kill();
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}
main().catch(async (e) => { console.error("ERR", e); chrome.kill(); await prisma.$disconnect().catch(() => {}); process.exit(1); });
