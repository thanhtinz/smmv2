/**
 * Chụp kiểm chứng đợt 117 (logo BNT Shop gói sẵn + header mobile 1 logo):
 * desktop (trang chủ header/footer/cận cảnh, đăng nhập, admin), mobile
 * (header 1 logo ngang, ngăn kéo), và test ưu tiên logo admin tự tải.
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

/* ================= DESKTOP ================= */
const chrome1 = launch(9419, "/home/hatch/workspace/.chrome-cdp-117a", 1440, 1000);
try {
  const c = await attach(9419);
  await nav(c, BASE + "/");
  await setLangVi(c);
  await nav(c, BASE + "/");
  await waitFor(c, "header");
  const head = await ev(c, `(() => {
    const header = document.querySelector('header');
    const imgs = [...header.querySelectorAll('a img')].map((i) => ({ src: i.getAttribute('src'), visible: !!(i.offsetWidth || i.offsetHeight) }));
    const fav = document.querySelector('link[rel="icon"]')?.getAttribute('href') || '';
    return { imgs, fav };
  })()`);
  console.log("HEADER:", JSON.stringify(head));
  check("desktop header dùng icon gói sẵn", head.imgs.some((i) => i.src === "/brand/logo-icon.jpg" && i.visible));
  check("favicon gói sẵn", head.fav.includes("/brand/favicon.png"), head.fav);
  await shot(c, "2026-11-13-logo-trang-chu-desktop.png");
  // Cận cảnh logo header ở kích thước thật
  const box = await ev(c, `(() => { const i = [...document.querySelectorAll('header a img')].find((x) => x.offsetWidth); if (!i) return null; const r = i.getBoundingClientRect(); return { x: Math.max(0, r.x - 14), y: Math.max(0, r.y - 10), width: r.width + 190, height: r.height + 20 }; })()`);
  if (box) await shot(c, "2026-11-13-logo-can-canh.png", box);
  check("có box cận cảnh logo", !!box);
  // Footer
  await ev(c, `(() => { document.querySelector('footer')?.scrollIntoView(); return true; })()`);
  await sleep(1200);
  const foot = await ev(c, `(() => { const f = document.querySelector('footer'); const i = f?.querySelector('img'); return i ? i.getAttribute('src') : null; })()`);
  check("footer dùng logo ngang gói sẵn", foot === "/brand/logo-full.jpg", String(foot));
  await shot(c, "2026-11-13-logo-footer.png");
  // Đăng nhập
  await nav(c, BASE + "/login");
  await shot(c, "2026-11-13-logo-dang-nhap.png");
  // Ưu tiên logo admin tự tải: đặt logo_url = ảnh khác, header phải đổi theo
  await prisma.setting.upsert({ where: { key: "logo_url" }, create: { key: "logo_url", value: "/home-strip/game-key.jpg" }, update: { value: "/home-strip/game-key.jpg" } });
  await nav(c, BASE + "/");
  const custom = await ev(c, `(() => [...document.querySelectorAll('header a img')].map((i) => i.getAttribute('src')))()`);
  check("admin tự tải logo → header dùng logo admin", custom.includes("/home-strip/game-key.jpg"), JSON.stringify(custom));
  await shot(c, "2026-11-13-logo-admin-tu-tai.png");
  await prisma.setting.deleteMany({ where: { key: "logo_url" } });
  await nav(c, BASE + "/");
  const back = await ev(c, `(() => [...document.querySelectorAll('header a img')].map((i) => i.getAttribute('src')))()`);
  check("xoá setting → về logo gói sẵn", back.includes("/brand/logo-icon.jpg"), JSON.stringify(back));
  // Admin: tắt cổng 2FA tạm để đăng nhập chụp (khôi phục cuối script)
  const old2fa = (await prisma.setting.findUnique({ where: { key: "admin_2fa_required" } }))?.value ?? null;
  await prisma.setting.upsert({ where: { key: "admin_2fa_required" }, create: { key: "admin_2fa_required", value: "0" }, update: { value: "0" } });
  await nav(c, BASE + "/login");
  await ev(c, `(() => {
    const set = (el, v) => { const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value'); d.set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    const u = document.querySelector('input[name="login"]') || document.querySelector('form input[type="text"]');
    const p = document.querySelector('input[name="password"]') || document.querySelector('form input[type="password"]');
    if (u) set(u, 'admin'); if (p) set(p, 'Admin@123');
    return !!(u && p);
  })()`);
  await sleep(400);
  await ev(c, `(() => { document.querySelector('form button[type="submit"]')?.click() || document.querySelector('form')?.requestSubmit(); return true; })()`);
  await sleep(3500);
  const url1 = await ev(c, `location.pathname`);
  console.log("sau login:", url1);
  await nav(c, BASE + "/admin", 3500);
  const adm = await ev(c, `(() => { const i = document.querySelector('aside img'); return i ? i.getAttribute('src') : null; })()`);
  check("admin sidebar dùng icon gói sẵn", adm === "/brand/logo-icon.jpg", String(adm));
  await shot(c, "2026-11-13-logo-admin.png");
  if (old2fa === null) await prisma.setting.deleteMany({ where: { key: "admin_2fa_required" } });
  else await prisma.setting.upsert({ where: { key: "admin_2fa_required" }, create: { key: "admin_2fa_required", value: old2fa }, update: { value: old2fa } });
} finally { chrome1.kill(); }

/* ================= MOBILE ================= */
const chrome2 = launch(9420, "/home/hatch/workspace/.chrome-cdp-117b", 390, 844);
try {
  const c = await attach(9420);
  await c.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await nav(c, BASE + "/");
  await setLangVi(c);
  await nav(c, BASE + "/");
  await waitFor(c, "header");
  const mob = await ev(c, `(() => {
    const header = document.querySelector('header');
    const vis = [...header.querySelectorAll('a img')].filter((i) => i.offsetWidth || i.offsetHeight).map((i) => ({ src: i.getAttribute('src'), w: Math.round(i.getBoundingClientRect().width), h: Math.round(i.getBoundingClientRect().height) }));
    return vis;
  })()`);
  console.log("MOBILE HEADER:", JSON.stringify(mob));
  check("mobile header ĐÚNG 1 logo", mob.length === 1, JSON.stringify(mob));
  check("mobile header là logo NGANG gói sẵn", mob.length === 1 && mob[0].src === "/brand/logo-full.jpg");
  await shot(c, "2026-11-13-logo-header-mobile.png");
  // Mở ngăn kéo
  await ev(c, `(() => { document.querySelector('header button')?.click(); return true; })()`);
  await sleep(1200);
  const drawer = await ev(c, `(() => { const d = [...document.querySelectorAll('div')].find((x) => x.className.includes('z-[80]')); if (!d) return null; const imgs = [...d.querySelectorAll('img')].map((i) => i.getAttribute('src')); return imgs; })()`);
  console.log("DRAWER:", JSON.stringify(drawer));
  check("ngăn kéo mobile đúng 1 logo ngang", Array.isArray(drawer) && drawer.length === 1 && drawer[0] === "/brand/logo-full.jpg", JSON.stringify(drawer));
  await shot(c, "2026-11-13-logo-drawer-mobile.png");
} finally { chrome2.kill(); }

await prisma.$disconnect();
const fails = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\nTỔNG: ${results.length - fails}/${results.length} PASS`);
process.exit(fails ? 1 : 0);
