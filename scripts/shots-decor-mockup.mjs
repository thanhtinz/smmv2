/** MOCKUP trang trí mùa lễ hội — CHỈ ĐỂ DUYỆT THIẾT KẾ (2026-11-11).
 *  Bật decor qua settings (fixture local), chụp trang chủ từng theme.
 *  node scripts/shots-decor-mockup.mjs   (điều kiện: server production :3000) */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });
const prisma = new PrismaClient();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function setSetting(key, value) {
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=old", "--disable-gpu", "--no-sandbox", "--disable-setuid-sandbox", "--hide-scrollbars",
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-decor",
  "--remote-debugging-port=9407", "--window-size=1440,900",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });

async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9407/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name);
}
async function canvasSig() {
  return evaluate(`(() => { const c = document.querySelector('[data-seasonal-particles]'); if (!c) return null; const d = c.toDataURL(); let hsh = 0; for (let i = 0; i < d.length; i += 97) hsh = (hsh * 31 + d.charCodeAt(i)) | 0; return hsh; })()`);
}

async function main() {
  const url = await wsUrl();
  ws = new WebSocket(url);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
  };
  const targets = await (await fetch("http://127.0.0.1:9407/json/list")).json();
  const page = targets.find((t) => t.type === "page");
  const att = await send("Target.attachToTarget", { targetId: page.id, flatten: true });
  sessionId = att.sessionId;
  await send("Page.enable");
  await send("Runtime.enable");

  // Fixture: dải thông báo dùng chính tagline mặc định của site để thấy lớp màu nhấn
  await setSetting("announcement_bar", "SMM Panel & Tài khoản Premium — tự động 24/7");
  await setSetting("seasonal_decor_enabled", "1");

  const themes = ["tet", "noel", "halloween", "trungthu"];
  for (const theme of themes) {
    await setSetting("seasonal_theme", theme);
    await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: `${BASE}/` });
    await sleep(3400);
    const info = await evaluate(`(() => ({
      garland: !!document.querySelector('[data-seasonal-garland]'),
      particles: !!document.querySelector('[data-seasonal-particles]'),
      prop: document.querySelector('[data-seasonal-prop]')?.getAttribute('data-seasonal-prop') || null,
      propBox: (() => { const el = document.querySelector('[data-seasonal-prop]'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })(),
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
    }))()`);
    const s1 = await canvasSig(); await sleep(700); const s2 = await canvasSig();
    console.log(theme, JSON.stringify(info), "animating:", s1 !== null && s1 !== s2);
    await shot(`2026-11-11-decor-mockup-${theme}-desktop`);
  }
  // Mobile — Tết
  await setSetting("seasonal_theme", "tet");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send("Page.navigate", { url: `${BASE}/` });
  await sleep(3400);
  const minfo = await evaluate(`(() => ({ garland: !!document.querySelector('[data-seasonal-garland]'), prop: document.querySelector('[data-seasonal-prop]')?.getAttribute('data-seasonal-prop') || null, propBox: (() => { const el = document.querySelector('[data-seasonal-prop]'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })(), overflowX: document.documentElement.scrollWidth > window.innerWidth + 1 }))()`);
  console.log("tet-mobile", JSON.stringify(minfo));
  await shot("2026-11-11-decor-mockup-tet-mobile");

  // Dọn fixture: tắt decor, trả announcement về rỗng như seed
  await setSetting("seasonal_decor_enabled", "0");
  await setSetting("seasonal_theme", "tet");
  await setSetting("announcement_bar", "");
  console.log("fixtures cleaned");
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(async () => { try { chrome.kill(); } catch {} await prisma.$disconnect(); });
