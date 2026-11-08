/** FIX7 TASK A: đo kích thước mọi control trong AppTopBar (guest + demo +
 *  admin) ở 1440 và 390 — before|after. Chụp dải header logged-in. */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

const PHASE = process.argv[2] || "before";
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
const mk = (uid, role, username) => {
  const u = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ uid, role, username, sv: 0, iat: now, exp: now + 3600 })}`;
  return `${u}.${createHmac("sha256", secret).update(u).digest("base64url")}`;
};
const TOKENS = { demo: mk(2, "USER", "demo"), admin: mk(1, "ADMIN", "admin") };

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--remote-debugging-port=9357", "--window-size=1440,900",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9357/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
async function captureClip(name, w) {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, clip: { x: 0, y: 0, width: w, height: 64, scale: 1 } });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name);
}
async function viewport(width, height) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 500 });
}

const MEASURE = `(() => {
  const header = document.querySelector('header');
  if (!header) return { error: 'no header' };
  const vis = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden'; };
  const box = (el) => { if (!vis(el)) return null; const r = el.getBoundingClientRect(); return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }; };
  const byAttr = (sel) => header.querySelector(sel);
  const out = {};
  // cụm trái
  out.burger = box(byAttr('button[aria-label="Mở menu"]'));
  const logoLink = header.querySelector('a[href="/"]');
  out.logoLink = box(logoLink);
  out.logoTile = box(logoLink ? logoLink.querySelector('span') : null);
  // cụm phải
  out.search = box(byAttr('button[aria-label="Tìm kiếm"]'));
  out.bell = box(byAttr('button[aria-label="Thông báo"]'));
  const cart = byAttr('a[aria-label="Giỏ hàng"]');
  out.cart = box(cart);
  const badge = cart ? cart.querySelector('span') : null;
  out.cartBadge = box(badge);
  out.display = box(byAttr('button[title="Cài đặt hiển thị"]'));
  // chips + links theo text
  const els = [...header.querySelectorAll('span, a, button')];
  const findText = (txt) => els.find((e) => e.children.length === 0 && (e.textContent || '').trim() === txt) || els.find((e) => (e.textContent || '').trim() === txt);
  const lvl = els.find((e) => /^(VIP|Thường|Đại lý|Reseller|Thành viên)/.test((e.textContent || '').trim()) && e.tagName === 'SPAN' && e.className.includes('rounded-full'));
  out.levelChip = box(lvl);
  const bal = els.find((e) => e.tagName === 'SPAN' && e.className.includes('emerald'));
  out.balanceChip = box(bal);
  out.username = box(findText('demo') || findText('admin'));
  out.adminPanel = box([...header.querySelectorAll('a')].find((a) => (a.textContent || '').trim() === 'Admin Panel'));
  const logoutBtn = [...header.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'Đăng xuất');
  out.logout = box(logoutBtn);
  out.login = box([...header.querySelectorAll('a')].find((a) => (a.textContent || '').trim() === 'Đăng nhập'));
  out.register = box([...header.querySelectorAll('a')].find((a) => (a.textContent || '').trim() === 'Đăng ký'));
  return out;
})()`;

async function measureState(label, token) {
  await evaluate(`document.cookie = 'smmv2_session=; path=/; max-age=0'; 'clear'`);
  if (token) await evaluate(`document.cookie = 'smmv2_session=${token}; path=/'; 'set'`);
  await evaluate(`document.cookie = 'smmv2-lang=vi; path=/'; try { localStorage.setItem('smmv2-lang', 'vi'); } catch(e) {} 'lang'`);
  await navigate(`${BASE}/`);
  const m = await evaluate(MEASURE);
  console.log(`\n== ${label} ==`);
  for (const [k, v] of Object.entries(m)) console.log(`  ${k.padEnd(12)} ${v ? `${v.w} x ${v.h}` : "—"}`);
  return m;
}

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
  await navigate(`${BASE}/`);

  const res = {};
  await viewport(1440, 900); res.guest1440 = await measureState("GUEST 1440", null);
  await viewport(390, 844); res.guest390 = await measureState("GUEST 390", null);
  await viewport(1440, 900); res.demo1440 = await measureState("DEMO 1440", TOKENS.demo);
  await captureClip(`2026-11-08-header-${PHASE}-desktop`, 1440);
  await viewport(390, 844); res.demo390 = await measureState("DEMO 390", TOKENS.demo);
  await captureClip(`2026-11-08-header-${PHASE}-390`, 390);
  await viewport(1440, 900); res.admin1440 = await measureState("ADMIN 1440", TOKENS.admin);

  if (PHASE === "after") {
    const ctrls = ["burger", "logoTile", "search", "bell", "cart", "display", "levelChip", "balanceChip", "adminPanel", "logout", "login", "register"];
    for (const [state, m] of Object.entries(res)) {
      for (const c of ctrls) {
        if (m[c]) ok(Math.abs(m[c].h - 40) <= 1, `${state}.${c} cao 40±1 (thực: ${m[c].h})`);
      }
      for (const c of ["burger", "search", "bell", "cart"]) {
        if (m[c]) ok(Math.abs(m[c].w - 40) <= 1, `${state}.${c} vuông 40 (rộng thực: ${m[c].w})`);
      }
      if (m.display && state.endsWith("390")) ok(Math.abs(m.display.w - 40) <= 1, `${state}.display vuông 40 trên mobile (rộng thực: ${m.display.w})`);
    }
  } else {
    const d = res.demo1440;
    ok(d && d.cart && d.cart.h !== 40, "BEFORE: giỏ hàng lệch khỏi 40px (tái hiện lỗi)");
    ok(d && d.levelChip && d.levelChip.h < 36, "BEFORE: chip cấp bậc thấp hơn hẳn (tái hiện lỗi)");
  }
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAIL`);
  chrome.kill();
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
