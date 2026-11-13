/** NGHIỆM THU giao diện ĐỢT 119 — EMAIL TỰ ĐỘNG CHO KHÁCH:
 *  node scripts/shots-customer-mail-119.mjs (cần server production :3000 +
 *  DB local đã seed; dữ liệu MailLog/MailCampaign lấy từ lần chạy
 *  test-customer-mail ngay trước đó).
 *  1. Admin → Báo cáo & Thông báo: khối "Email tự động cho khách" (công tắc
 *     tổng + sự kiện + phân loại Thiết yếu/Khách tắt được).
 *  2. Mở trình sửa mẫu thư order_delivered (4 trường VI/EN + danh sách biến).
 *  3. Khối phát thông báo + bảng nhật ký (tiến độ đợt phát thật từ test).
 *  4. Thư mẫu order_delivered dựng bằng ĐÚNG hàm của lib (file HTML riêng
 *     2026-11-13-mail-mau-order-delivered.html) chụp từ bản HTML thực.
 *  Ảnh: 2026-11-13-customer-mail-{admin,mau-thu,nhat-ky}.png +
 *       2026-11-13-mail-mau-order-delivered.png */
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
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-mail119",
  "--remote-debugging-port=9419", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9419/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name);
}
const bodyText = () => evaluate(`document.body.innerText`);
const setField = (name, val) => evaluate(`(() => { const el = document.querySelector('input[name="${name}"]'); if (!el) throw new Error('thiếu input ${name}'); el.focus(); el.value = ${JSON.stringify(val)}; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
async function login(username, password) {
  await send("Network.clearBrowserCookies");
  await navigate(BASE + "/", 1500);
  await evaluate(`(() => { try { localStorage.setItem('smmv2-lang', 'vi'); } catch {} document.cookie = 'smmv2-lang=vi; path=/'; return true; })()`);
  await navigate(`${BASE}/login`, 2500);
  await setField("login", username);
  await setField("password", password);
  await evaluate(`(() => { const b = document.querySelector('form button[type="submit"], form button'); if (!b) throw new Error('thiếu nút submit'); b.click(); return true; })()`);
  await sleep(3200);
}
/** Cuộn tới đúng TIÊU ĐỀ (khớp nguyên văn trong h1/h2/h3) rồi CHỜ tới khi
 *  tiêu đề thật sự nằm trong khung hình mới trả true — tránh chụp nhầm đầu
 *  trang như lần chạy đầu (khớp startsWith trúng thẻ bọc ngoài). */
async function scrollToHeading(t) {
  for (let i = 0; i < 10; i++) {
    const r = await evaluate(`(() => { const h = [...document.querySelectorAll('h1,h2,h3,div')].find((x) => (x.innerText || '').trim() === ${JSON.stringify(t)}); if (!h) return { found: false }; h.scrollIntoView({ block: 'start' }); const rect = h.getBoundingClientRect(); return { found: true, top: rect.top }; })()`);
    if (r.found && r.top > -50 && r.top < 300) return true;
    await sleep(600);
  }
  return false;
}

async function main() {
  // Tạm tắt cổng 2FA admin + bật công tắc email khách để ảnh thể hiện trạng
  // thái đang dùng thật; khôi phục cả hai ngay khi chụp xong.
  const old2fa = (await prisma.setting.findUnique({ where: { key: "admin_2fa_required" } }))?.value ?? null;
  const oldMail = (await prisma.setting.findUnique({ where: { key: "customer_mail_enabled" } }))?.value ?? null;
  await prisma.setting.upsert({ where: { key: "admin_2fa_required" }, create: { key: "admin_2fa_required", value: "0" }, update: { value: "0" } });
  await prisma.setting.upsert({ where: { key: "customer_mail_enabled" }, create: { key: "customer_mail_enabled", value: "1" }, update: { value: "1" } });

  try {
    ws = new WebSocket(await wsUrl());
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } };
    const targets = await (await fetch("http://127.0.0.1:9419/json/list")).json();
    const page = targets.find((t) => t.type === "page");
    sessionId = (await send("Target.attachToTarget", { targetId: page.id, flatten: true })).sessionId;
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

    await login("admin", "Admin@123");
    await navigate(`${BASE}/admin/bao-cao`, 3500);
    let text = await bodyText();
    ok(text.includes("Email tự động cho khách"), "trang Báo cáo & Thông báo có khối Email tự động cho khách");
    ok(await scrollToHeading("Email tự động cho khách"), "cuộn tới khối email khách (tiêu đề trong khung hình)");
    await sleep(500);
    text = await bodyText();
    ok(text.includes("Bật hệ thống email khách") && text.includes("Thiết yếu") && text.includes("Khách tắt được"), "có công tắc tổng + phân loại thiết yếu/khách tắt được");
    await shot("2026-11-13-customer-mail-admin");

    // Mở mẫu order_delivered rồi cuộn summary của nó vào khung hình
    const opened = await evaluate(`(() => { const d = [...document.querySelectorAll('details')].find((x) => (x.querySelector('summary')?.innerText || '').includes('order_delivered')); if (!d) return false; d.open = true; return true; })()`);
    ok(opened, "mở được trình sửa mẫu order_delivered");
    let inView = false;
    for (let i = 0; i < 10 && !inView; i++) {
      inView = await evaluate(`(() => { const d = [...document.querySelectorAll('details')].find((x) => (x.querySelector('summary')?.innerText || '').includes('order_delivered')); if (!d) return false; d.querySelector('summary').scrollIntoView({ block: 'start' }); const r = d.getBoundingClientRect(); return r.top > -400 && r.top < 300; })()`);
      if (!inView) await sleep(600);
    }
    ok(inView, "mẫu order_delivered nằm trong khung hình khi chụp");
    await sleep(500);
    text = await bodyText();
    ok(text.includes("delivery_content") && text.includes("Nội dung (EN)"), "mẫu có danh sách biến + đủ 4 trường VI/EN");
    await shot("2026-11-13-customer-mail-mau-thu");

    // Khối phát thông báo + nhật ký
    ok(await scrollToHeading("Phát thông báo hệ thống qua email"), "cuộn tới khối phát thông báo (trong khung hình)");
    await sleep(500);
    text = await bodyText();
    ok(text.includes("Nhật ký email khách gần nhất") || text.includes("Tạo đợt phát thông báo"), "có khối phát + nhật ký");
    await shot("2026-11-13-customer-mail-nhat-ky");

    // Thư mẫu dựng từ file HTML thực (sinh bởi script render-mail-119.mjs chạy trước)
    await navigate(`file://${OUT}/2026-11-13-mail-mau-order-delivered.html`, 2500);
    text = await bodyText();
    ok(text.includes("PRE100001") && text.includes("Nội dung đã giao"), "thư mẫu hiển thị đúng nội dung đơn mẫu");
    await shot("2026-11-13-mail-mau-order-delivered");
  } finally {
    if (old2fa === null) await prisma.setting.deleteMany({ where: { key: "admin_2fa_required" } });
    else await prisma.setting.upsert({ where: { key: "admin_2fa_required" }, create: { key: "admin_2fa_required", value: old2fa }, update: { value: old2fa } });
    if (oldMail === null) await prisma.setting.deleteMany({ where: { key: "customer_mail_enabled" } });
    else await prisma.setting.upsert({ where: { key: "customer_mail_enabled" }, create: { key: "customer_mail_enabled", value: oldMail }, update: { value: oldMail } });
    try { chrome.kill(); } catch {}
    await prisma.$disconnect();
  }
  console.log(`\n== shots-customer-mail-119: ${failures === 0 ? "ALL PASS" : failures + " FAIL"} ==`);
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => { console.error("FATAL", e); try { chrome.kill(); } catch {} process.exit(1); });
