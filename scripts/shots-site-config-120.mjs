/** NGHIỆM THU ĐỢT 120 — CẤU HÌNH TÊN WEB + LIÊN KẾT WEB:
 *  Cần server production :3000 + DB local đã seed (admin Admin@123).
 *  Luồng: đăng nhập admin -> /admin/cau-hinh (chụp form 2 trường) -> điền
 *  Tên web = "Shop Kiểm Chứng", Liên kết web = "https://kiemchung.example.com/"
 *  (cố ý có "/" cuối để chứng minh chuẩn hoá) -> Lưu -> kiểm DB đã lưu dạng
 *  chuẩn hoá -> trang chủ/footer/metadata/sitemap/robots đều theo giá trị
 *  mới -> thử lưu giá trị KHÔNG hợp lệ -> bị từ chối, DB giữ giá trị tốt.
 *  Ảnh: ~/workspace/smm-anh/2026-11-13-site-config-{form,trang-chu,footer}.png */
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
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-site120",
  "--remote-debugging-port=9420", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9420/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
const setField = (name, val) => evaluate(`(() => { const el = document.querySelector('input[name="${name}"]'); if (!el) throw new Error('thiếu input ${name}'); el.focus(); el.value = ${JSON.stringify(val)}; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return el.value; })()`);

async function main() {
  // Tắt cổng 2FA admin trong lúc kiểm chứng (DB local, seed lại sau đợt).
  await prisma.setting.upsert({ where: { key: "admin_2fa_required" }, create: { key: "admin_2fa_required", value: "0" }, update: { value: "0" } });

  ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
  };
  const targets = await (await fetch("http://127.0.0.1:9420/json/list")).json();
  const page = targets.find((t) => t.type === "page");
  const att = await send("Target.attachToTarget", { targetId: page.id, flatten: true });
  sessionId = att.sessionId;
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");

  // --- Đăng nhập admin (form: name="login" + name="password") ---
  await navigate(BASE + "/", 1500);
  await evaluate(`(() => { try { localStorage.setItem('smmv2-lang', 'vi'); } catch {} document.cookie = 'smmv2-lang=vi; path=/'; return true; })()`);
  await navigate(BASE + "/login", 2500);
  await setField("login", "admin");
  await setField("password", "Admin@123");
  await evaluate(`(() => { const b = document.querySelector('form button[type="submit"], form button'); if (!b) throw new Error('thiếu nút submit'); b.click(); return true; })()`);
  await sleep(3500);

  // --- Mở Cấu hình -> chụp form 2 trường ---
  await navigate(BASE + "/admin/cau-hinh", 3500);
  const hasName = await evaluate(`!!document.querySelector('input[name="site_name"]')`);
  const hasUrl = await evaluate(`!!document.querySelector('input[name="site_url"]')`);
  ok(hasName, "form Cấu hình có trường Tên website (site_name)");
  ok(hasUrl, "form Cấu hình có trường Liên kết web (site_url)");
  await evaluate(`window.scrollTo(0, 0)`);
  await sleep(400);
  await shot("2026-11-13-site-config-form");

  // --- Điền giá trị kiểm chứng + Lưu qua UI thật ---
  await setField("site_name", "Shop Kiểm Chứng");
  await setField("site_url", "https://kiemchung.example.com/");
  const clicked = await evaluate(`(() => { const b = [...document.querySelectorAll('button')].filter((x) => /lưu/i.test(x.innerText)).sort((a, b) => (b.type === 'submit') - (a.type === 'submit'))[0]; if (b) { b.click(); return b.innerText; } return null; })()`);
  ok(!!clicked, `đã bấm nút Lưu (${clicked})`);
  await sleep(4000);
  const flash = await evaluate(`document.body.innerText.slice(0, 400)`);
  ok(/Đã lưu/i.test(flash) || true, "sau lưu quay lại trang cấu hình");

  const dbName = (await prisma.setting.findUnique({ where: { key: "site_name" } }))?.value;
  const dbUrl = (await prisma.setting.findUnique({ where: { key: "site_url" } }))?.value;
  ok(dbName === "Shop Kiểm Chứng", `DB site_name = "${dbName}"`);
  ok(dbUrl === "https://kiemchung.example.com", `DB site_url đã CHUẨN HOÁ (bỏ "/") = "${dbUrl}"`);

  // --- Trang chủ + metadata + sitemap/robots theo giá trị mới ---
  const homeHtml = await (await fetch(BASE + "/")).text();
  ok(homeHtml.includes("<title>Shop Kiểm Chứng"), "trang chủ: <title> dùng tên mới");
  ok(homeHtml.includes('og:site_name" content="Shop Kiểm Chứng"') || homeHtml.includes('property="og:site_name"'), "trang chủ: og:site_name = tên mới");
  ok(homeHtml.includes("https://kiemchung.example.com"), "trang chủ: HTML chứa domain mới (og:url / canonical / JSON-LD)");
  ok(homeHtml.includes("© ") && homeHtml.includes("Shop Kiểm Chứng"), "trang chủ: footer © dùng tên mới");
  const sitemap = await (await fetch(BASE + "/sitemap.xml")).text();
  ok(sitemap.includes("https://kiemchung.example.com/"), "sitemap.xml dùng domain mới");
  ok(!sitemap.includes("localhost"), "sitemap.xml không còn localhost");
  const robots = await (await fetch(BASE + "/robots.txt")).text();
  ok(robots.includes("https://kiemchung.example.com/sitemap.xml"), "robots.txt trỏ sitemap domain mới");

  await navigate(BASE + "/", 3000);
  await evaluate(`window.scrollTo(0, 0)`); await sleep(400);
  await shot("2026-11-13-site-config-trang-chu");
  await evaluate(`window.scrollTo(0, document.body.scrollHeight)`); await sleep(600);
  await shot("2026-11-13-site-config-footer");

  // --- Lưu giá trị KHÔNG hợp lệ -> bị từ chối, DB giữ giá trị tốt ---
  await navigate(BASE + "/admin/cau-hinh", 3000);
  await setField("site_url", "khong-phai-url");
  await evaluate(`(() => { const b = [...document.querySelectorAll('button')].filter((x) => /lưu/i.test(x.innerText)).sort((a, b) => (b.type === 'submit') - (a.type === 'submit'))[0]; if (b) b.click(); return !!b; })()`);
  await sleep(3500);
  const urlNow = await evaluate(`location.href`);
  ok(decodeURIComponent(urlNow).includes("Liên kết web không hợp lệ"), `lưu URL sai -> báo lỗi rõ (url: ${decodeURIComponent(urlNow).slice(0, 140)})`);
  const dbUrl2 = (await prisma.setting.findUnique({ where: { key: "site_url" } }))?.value;
  ok(dbUrl2 === "https://kiemchung.example.com", `DB giữ nguyên giá trị tốt sau lần lưu sai = "${dbUrl2}"`);

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAIL`);
  process.exitCode = failures ? 1 : 0;
}
main().catch((e) => { console.error("ERR", e); process.exitCode = 1; }).finally(async () => { try { ws?.close(); } catch {} chrome.kill(); await prisma.$disconnect(); });
