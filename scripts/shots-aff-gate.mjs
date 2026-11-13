/**
 * NGHIỆM THU CỔNG THAM GIA AFFILIATE (yêu cầu bổ sung của Tín 2026-11-12,
 * mẫu ldshop /account/aff). Điều kiện: production server :3000 đang chạy.
 * Luồng trên MỘT tài khoản mới tinh:
 *  1) Hộp "Chia sẻ kiếm tiền" khi CHƯA tham gia: huy hiệu % vẫn hiện, mở
 *     hộp thấy lời mời + nút "Đăng ký tham gia" — KHÔNG có bảng hoa hồng
 *     dự kiến, KHÔNG có link cá nhân.
 *  2) Route /dashboard/kiem-tien khi chưa tham gia: hiện trang GIỚI THIỆU
 *     chương trình (tỉ lệ thật 6%, mức rút 10.000đ, 4 bước, quy định) —
 *     KHÔNG có DOM của dashboard. Chụp aff-intro.
 *  3) Bấm "Đăng ký tham gia" → DB có affiliateEnrolledAt, trang chuyển
 *     thành dashboard; tải lại vẫn vào thẳng dashboard.
 *  4) Hộp chia sẻ sau khi tham gia: hiện đủ bảng hoa hồng dự kiến + link
 *     cá nhân kèm mã của chính tài khoản.
 */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL || "postgresql://postgres@127.0.0.1:5433/postgres" } } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; };

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=old", "--disable-gpu", "--no-sandbox", "--disable-setuid-sandbox", "--hide-scrollbars",
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-affgate",
  "--remote-debugging-port=9415", "--window-size=1440,900",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });

let msgId = 0; const pending = new Map(); let ws; let sessionId = null;
function send(method, params = {}) { const id = ++msgId; return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }); }
async function evaluate(expr) { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || "eval error"); return r.result?.value; }
async function navigate(url, wait = 2800) { await send("Page.navigate", { url }); await sleep(wait); }
const bodyText = () => evaluate(`document.body.innerText`);
const setField = (name, val) => evaluate(`(() => { const el = document.querySelector('input[name="${name}"]'); if (!el) throw new Error('thiếu input ${name}'); el.focus(); el.value = ${JSON.stringify(val)}; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);

async function main() {
  for (let i = 0; i < 50; i++) { try { const r = await fetch("http://127.0.0.1:9415/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) { ws = new WebSocket(j.webSocketDebuggerUrl); break; } } catch {} await sleep(200); }
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } };
  const targets = await (await fetch("http://127.0.0.1:9415/json/list")).json();
  const page = targets.find((t) => t.type === "page");
  sessionId = (await send("Target.attachToTarget", { targetId: page.id, flatten: true })).sessionId;
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  // Ngôn ngữ VI chắc chắn (localStorage + cookie sau khi vào trang gốc)
  await navigate(BASE + "/", 1500);
  await evaluate(`(() => { try { localStorage.setItem('smmv2-lang', 'vi'); } catch {} document.cookie = 'smmv2-lang=vi; path=/'; return true; })()`);

  /* ---- Đăng ký tài khoản mới ---- */
  const name = `gateuser${Math.floor(Math.random() * 9000 + 1000)}`;
  await navigate(`${BASE}/register`, 2500);
  await setField("username", name);
  await setField("email", `${name}@fixture.local`);
  await setField("password", "Gate@12345");
  await setField("confirmPassword", "Gate@12345");
  await evaluate(`(() => { const c = document.querySelector('input[name="terms"]'); if (c && !c.checked) c.click(); return true; })()`);
  await evaluate(`document.querySelector('form button[type="submit"], form button').click()`);
  await sleep(3500);
  const me = await prisma.user.findUnique({ where: { username: name }, select: { id: true, affiliateEnrolledAt: true, refCode: true } });
  ok(!!me && me.affiliateEnrolledAt === null, `tài khoản mới ${name} chưa tham gia (affiliateEnrolledAt = null)`);

  /* ---- 1. Hộp chia sẻ khi chưa tham gia ---- */
  await navigate(`${BASE}/premium/youtube-premium`, 3200);
  const badge = await evaluate(`(() => { const b = document.querySelector('button[aria-label="Kiếm tiền"]'); if (!b) return null; const s = b.querySelector('span')?.innerText || ''; b.click(); return s; })()`);
  ok(badge === "6%", `huy hiệu % vẫn hiện khi chưa tham gia (${badge})`);
  await sleep(900);
  const modalBefore = await bodyText();
  ok(modalBefore.includes("Bạn chưa tham gia chương trình giới thiệu bạn bè"), "hộp: hiện lời mời tham gia");
  ok(modalBefore.includes("Đăng ký tham gia"), "hộp: có nút Đăng ký tham gia");
  ok(!modalBefore.includes("Hoa hồng dự kiến"), "hộp: KHÔNG có bảng hoa hồng dự kiến");
  const linkBefore = await evaluate(`[...document.querySelectorAll('[role="dialog"] input')].some(i => (i.value || '').includes('?aff='))`);
  ok(linkBefore === false, "hộp: KHÔNG có link cá nhân");
  await evaluate(`document.querySelector('[role="dialog"] button[aria-label="Đóng"]')?.click()`);
  await sleep(500);

  /* ---- 2. Trang giới thiệu chương trình ---- */
  await navigate(`${BASE}/dashboard/kiem-tien`, 3000);
  const introText = await bodyText();
  ok(introText.includes("Giới thiệu bạn bè, nhận hoa hồng trên mỗi đơn hàng"), "intro: tiêu đề chương trình");
  ok(introText.includes("Cách hoạt động") && introText.includes("Rút về ví chính"), "intro: đủ 4 bước cách hoạt động");
  ok(introText.includes("Quyền lợi & quy định"), "intro: có mục quyền lợi & quy định");
  ok(introText.includes("6%") && introText.includes("10.000"), "intro: tỉ lệ 6% + mức rút 10.000đ từ cấu hình");
  ok(!introText.includes("Số dư hoa hồng khả dụng"), "intro: KHÔNG có DOM dashboard");
  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  writeFileSync(`${OUT}/2026-11-12-aff-intro.png`, Buffer.from(shot.data, "base64"));
  console.log("SHOT 2026-11-12-aff-intro");

  /* ---- 3. Bấm tham gia → dashboard ---- */
  await evaluate(`(() => { const b = [...document.querySelectorAll('form button[type="submit"]')].find(x => x.innerText.includes('Đăng ký tham gia')); if (!b) throw new Error('không thấy nút Đăng ký tham gia'); b.click(); return true; })()`);
  await sleep(3500);
  const dashText = await bodyText();
  ok(dashText.includes("Số dư hoa hồng khả dụng"), "sau khi bấm: hiện dashboard hoa hồng");
  const meAfter = await prisma.user.findUnique({ where: { username: name }, select: { affiliateEnrolledAt: true } });
  ok(!!meAfter?.affiliateEnrolledAt, `DB đã ghi mốc tham gia (${meAfter?.affiliateEnrolledAt?.toISOString?.() || meAfter?.affiliateEnrolledAt})`);
  await navigate(`${BASE}/dashboard/kiem-tien`, 2800);
  const dashText2 = await bodyText();
  ok(dashText2.includes("Số dư hoa hồng khả dụng"), "lần vào sau: vào thẳng dashboard");

  /* ---- 4. Hộp chia sẻ sau khi tham gia ---- */
  await navigate(`${BASE}/premium/youtube-premium`, 3200);
  await evaluate(`document.querySelector('button[aria-label="Kiếm tiền"]').click()`);
  await sleep(900);
  const modalAfter = await bodyText();
  ok(modalAfter.includes("Hoa hồng dự kiến"), "hộp sau tham gia: có bảng hoa hồng dự kiến");
  const linkAfter = await evaluate(`(() => { const i = [...document.querySelectorAll('[role="dialog"] input')].find(x => (x.value || '').includes('?aff=')); return i ? i.value : ''; })()`);
  const myCode = (await prisma.user.findUnique({ where: { username: name }, select: { refCode: true } }))?.refCode;
  ok(!!myCode && linkAfter.includes(`?aff=${myCode}`), `hộp sau tham gia: link cá nhân kèm mã của chính mình (${linkAfter})`);

  console.log(`\n${failures === 0 ? "ALL PASS" : "FAILURES"}: ${failures} fail`);
  chrome.kill();
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}
main().catch(async (e) => { console.error("ERR", e); chrome.kill(); await prisma.$disconnect().catch(() => {}); process.exit(1); });
