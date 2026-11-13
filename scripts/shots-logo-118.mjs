/**
 * Chụp kiểm chứng đợt 118 (header khách desktop dùng LUÔN logo ngang, bỏ
 * icon vuông + tên chữ): desktop 1440 (trang chủ + cận cảnh), đăng nhập
 * dashboard (chip số dư), khổ trung gian 1024/768, mobile 390 (hồi quy),
 * và chuỗi ưu tiên logo admin tự tải trên header desktop.
 * Chạy khi server production đang ở 127.0.0.1:3000 + PG local đã seed.
 */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
const CHROME = "/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, extra = "") { results.push(`${ok ? "PASS" : "FAIL"} ${name} ${extra}`); console.log(`${ok ? "PASS" : "FAIL"} ${name} ${extra}`); }

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

function launch(port, dir, w, h) {
  return spawn(CHROME, [
    "--headless=old", "--disable-gpu", "--no-sandbox", "--disable-setuid-sandbox", "--hide-scrollbars",
    `--user-data-dir=${dir}`, `--remote-debugging-port=${port}`, `--window-size=${w},${h}`,
    "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
    "about:blank",
  ], { stdio: "ignore" });
}
async function wsUrl(port) {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch {}
    await sleep(200);
  }
  throw new Error("chrome CDP không lên");
}
function makeClient(ws) {
  let msgId = 0; const pending = new Map(); let sessionId = null;
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++msgId; pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } };
  return { send, setSession: (s) => { sessionId = s; } };
}
async function attach(port) {
  const ws = new WebSocket(await wsUrl(port));
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const c = makeClient(ws);
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find((t) => t.type === "page");
  c.setSession((await c.send("Target.attachToTarget", { targetId: page.id, flatten: true })).sessionId);
  await c.send("Page.enable"); await c.send("Runtime.enable");
  return c;
}
async function ev(c, expr) {
  const r = await c.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || "eval error");
  return r.result?.value;
}
async function nav(c, url, wait = 3000) { await c.send("Page.navigate", { url }); await sleep(wait); }
async function waitFor(c, selector, tries = 20) {
  for (let i = 0; i < tries; i++) {
    const ok = await ev(c, `!!document.querySelector(${JSON.stringify(selector)})`).catch(() => false);
    if (ok) return true;
    await sleep(700);
  }
  return false;
}
async function shot(c, name, clip = null) {
  const params = { format: "png", ...(clip ? { clip: { ...clip, scale: 1 } } : {}) };
  const r = await c.send("Page.captureScreenshot", params);
  writeFileSync(`${OUT}/${name}`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name);
}
async function setLangVi(c) {
  await ev(c, `(() => { try { localStorage.setItem('smmv2-lang', 'vi'); } catch {} document.cookie = 'smmv2-lang=vi; path=/'; return true; })()`);
}
// Đo header: logo trong link thương hiệu (link đầu tiên chứa img ở header),
// tràn ngang toàn trang, chồng lấn logo ↔ cụm phải.
const MEASURE = `(() => {
  const header = document.querySelector('header');
  if (!header) return null;
  const brandLink = [...header.querySelectorAll('a')].find((a) => a.querySelector('img'));
  const imgs = brandLink ? [...brandLink.querySelectorAll('img')].map((i) => {
    const r = i.getBoundingClientRect();
    return { src: i.getAttribute('src'), w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), right: Math.round(r.right), visible: r.width > 0 && r.height > 0 };
  }) : [];
  const linkText = brandLink ? (brandLink.textContent || '').trim() : '(no link)';
  const headerImgs = [...header.querySelectorAll('img')].map((i) => i.getAttribute('src'));
  const right = header.querySelector('.ml-auto');
  const rr = right ? right.getBoundingClientRect() : null;
  const logoRight = imgs.length ? imgs[0].right : 0;
  const overlap = rr ? Math.max(0, logoRight - Math.round(rr.x)) : 0;
  const overflow = Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const headerH = Math.round(header.getBoundingClientRect().height);
  return { imgs, linkText, headerImgs, overlap, overflow, headerH, rightX: rr ? Math.round(rr.x) : null };
})()`;

/* ================= DESKTOP 1440 — khách chưa đăng nhập ================= */
const chrome1 = launch(9421, "/home/hatch/workspace/.chrome-cdp-118a", 1440, 1000);
try {
  const c = await attach(9421);
  await nav(c, BASE + "/");
  await setLangVi(c);
  await nav(c, BASE + "/");
  await waitFor(c, "header a img");
  const m = await ev(c, MEASURE);
  console.log("DESKTOP 1440:", JSON.stringify(m));
  check("desktop: đúng 1 ảnh logo trong link thương hiệu", m.imgs.length === 1, JSON.stringify(m.imgs));
  check("desktop: logo là bản NGANG gói sẵn", m.imgs.length === 1 && m.imgs[0].src === "/brand/logo-full.jpg");
  check("desktop: header không còn icon vuông", !m.headerImgs.includes("/brand/logo-icon.jpg"), JSON.stringify(m.headerImgs));
  check("desktop: không còn tên chữ cạnh logo", m.linkText === "", JSON.stringify(m.linkText));
  check("desktop: logo không đè cụm phải", m.overlap === 0, `overlap=${m.overlap}`);
  check("desktop: tràn ngang = 0", m.overflow === 0, `overflow=${m.overflow}`);
  check("desktop: chiều cao header giữ nguyên 64px", m.headerH === 64 || m.headerH === 65, `h=${m.headerH}`);
  await shot(c, "2026-11-13-logo-ngang-header-desktop.png");
  const box = await ev(c, `(() => { const i = [...document.querySelectorAll('header a img')].find((x) => x.offsetWidth); if (!i) return null; const r = i.getBoundingClientRect(); return { x: Math.max(0, r.x - 14), y: Math.max(0, r.y - 10), width: r.width + 28, height: r.height + 20 }; })()`);
  if (box) await shot(c, "2026-11-13-logo-ngang-can-canh.png", box);
  check("có box cận cảnh logo ngang", !!box);

  /* ---- Ưu tiên logo admin tự tải trên header desktop ---- */
  await prisma.setting.upsert({ where: { key: "logo_url" }, create: { key: "logo_url", value: "/home-strip/game-key.jpg" }, update: { value: "/home-strip/game-key.jpg" } });
  await nav(c, BASE + "/");
  const mCustom = await ev(c, MEASURE);
  console.log("CUSTOM logo_url:", JSON.stringify(mCustom.imgs));
  check("đặt logo_url → header desktop dùng logo admin (qua logo_url)", mCustom.imgs.length === 1 && mCustom.imgs[0].src === "/home-strip/game-key.jpg");
  await prisma.setting.upsert({ where: { key: "logo_menu_url" }, create: { key: "logo_menu_url", value: "/home-strip/steam.jpg" }, update: { value: "/home-strip/steam.jpg" } });
  await nav(c, BASE + "/");
  const mMenu = await ev(c, MEASURE);
  console.log("CUSTOM logo_menu_url:", JSON.stringify(mMenu.imgs));
  check("đặt thêm logo_menu_url → menu thắng logo_url ở header", mMenu.imgs.length === 1 && mMenu.imgs[0].src === "/home-strip/steam.jpg");
  await prisma.setting.deleteMany({ where: { key: { in: ["logo_url", "logo_menu_url"] } } });
  await nav(c, BASE + "/");
  const mBack = await ev(c, MEASURE);
  check("xoá setting → header về logo ngang gói sẵn", mBack.imgs.length === 1 && mBack.imgs[0].src === "/brand/logo-full.jpg");

  /* ---- Đăng nhập demo → dashboard (chip số dư) ---- */
  await nav(c, BASE + "/login");
  await ev(c, `(() => {
    const set = (el, v) => { const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value'); d.set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    const u = document.querySelector('input[name="login"]') || document.querySelector('form input[type="text"]');
    const p = document.querySelector('input[name="password"]') || document.querySelector('form input[type="password"]');
    if (u) set(u, 'demo'); if (p) set(p, 'Demo@123');
    return !!(u && p);
  })()`);
  await sleep(400);
  await ev(c, `(() => { document.querySelector('form button[type="submit"]')?.click() || document.querySelector('form')?.requestSubmit(); return true; })()`);
  await sleep(3500);
  await nav(c, BASE + "/dashboard/nap-tien", 3500);
  const md = await ev(c, MEASURE);
  console.log("DASHBOARD:", JSON.stringify(md));
  check("dashboard: đúng 1 logo ngang", md.imgs.length === 1 && md.imgs[0].src === "/brand/logo-full.jpg", JSON.stringify(md.imgs));
  check("dashboard: không icon vuông, không tên chữ cạnh logo", !md.headerImgs.includes("/brand/logo-icon.jpg") && md.linkText === "");
  check("dashboard: logo không đè cụm phải (chip số dư)", md.overlap === 0, `overlap=${md.overlap}`);
  check("dashboard: tràn ngang = 0", md.overflow === 0, `overflow=${md.overflow}`);
  await shot(c, "2026-11-13-logo-ngang-header-dang-nhap.png");
} finally { chrome1.kill(); }

/* ================= KHỔ TRUNG GIAN + MOBILE (resize cùng 1 chrome) ================= */
const chrome2 = launch(9422, "/home/hatch/workspace/.chrome-cdp-118b", 1024, 900);
try {
  const c = await attach(9422);
  for (const w of [1024, 768, 390]) {
    await c.send("Emulation.setDeviceMetricsOverride", { width: w, height: 900, deviceScaleFactor: 1, mobile: w < 500 });
    await nav(c, BASE + "/");
    await waitFor(c, "header a img");
    const m = await ev(c, MEASURE);
    console.log(`WIDTH ${w}:`, JSON.stringify(m));
    check(`khổ ${w}: đúng 1 logo ngang`, m.imgs.length === 1 && m.imgs[0].src === "/brand/logo-full.jpg", JSON.stringify(m.imgs));
    check(`khổ ${w}: logo không đè cụm phải`, m.overlap === 0, `overlap=${m.overlap}`);
    check(`khổ ${w}: tràn ngang = 0`, m.overflow === 0, `overflow=${m.overflow}`);
    if (w === 1024) await shot(c, "2026-11-13-logo-ngang-header-1024.png");
    if (w === 390) await shot(c, "2026-11-13-logo-ngang-header-mobile.png");
  }
} finally { chrome2.kill(); }

await prisma.$disconnect();
const fails = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\nTỔNG: ${results.length - fails}/${results.length} PASS`);
process.exit(fails ? 1 : 0);
