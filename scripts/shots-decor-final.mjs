/** NGHIỆM THU TRANG TRÍ MÙA LỄ HỘI — bản triển khai chính thức (Tín duyệt thiết kế 2026-11-11).
 *  node scripts/shots-decor-final.mjs   (điều kiện: server production :3000 đang chạy)
 *  Kiểm: (1) decor TẮT → 0 DOM decor ở trang chủ + trang dashboard;
 *  (2) thẻ admin "Trang trí mùa lễ hội" render + lưu qua form thật: OFF→ON/tet
 *      rồi tet→noel, đọc lại DB xác nhận bền; trang chủ/dashboard đi theo theme đã lưu;
 *  (3) canvas chuyển động thật (2 khung khác nhau); (4) bấm xuyên qua decor
 *      (pointer-events none + elementFromPoint trên thẻ sản phẩm không phải decor).
 *  Ảnh: 2026-11-11-decor-final-{tet-desktop,admin,dashboard}.png — dọn fixture ở cuối. */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });
const prisma = new PrismaClient();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; };

const envRaw = readFileSync("/home/hatch/workspace/smmv2/.env", "utf8");
let secret = envRaw.split("\n").find((l) => l.startsWith("AUTH_SECRET")).split("=").slice(1).join("=").trim();
if ((secret.startsWith('"') && secret.endsWith('"')) || (secret.startsWith("'") && secret.endsWith("'"))) secret = secret.slice(1, -1);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const mint = (claims) => {
  const u = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sv: 0, iat: now, exp: now + 3600, ...claims })}`;
  return `${u}.${createHmac("sha256", secret).update(u).digest("base64url")}`;
};

async function setSetting(key, value) {
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
}
async function getSetting(key) {
  const r = await prisma.setting.findUnique({ where: { key } });
  return r?.value;
}

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=old", "--disable-gpu", "--no-sandbox", "--disable-setuid-sandbox", "--hide-scrollbars",
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-decor-final",
  "--remote-debugging-port=9411", "--window-size=1440,900",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });

async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9411/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
async function navigate(url, wait = 3000) {
  await send("Page.navigate", { url });
  await sleep(wait);
}
const DECOR_PROBE = `(() => ({
  garland: document.querySelector('[data-seasonal-garland]')?.getAttribute('data-seasonal-garland') || null,
  particles: document.querySelector('[data-seasonal-particles]')?.getAttribute('data-seasonal-particles') || null,
  prop: document.querySelector('[data-seasonal-prop]')?.getAttribute('data-seasonal-prop') || null,
  wash: document.querySelector('[data-seasonal-wash]')?.getAttribute('data-seasonal-wash') || null,
  any: document.querySelectorAll('[data-seasonal-garland],[data-seasonal-particles],[data-seasonal-prop],[data-seasonal-wash]').length,
  overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
}))()`;
async function canvasSig() {
  return evaluate(`(() => { const c = document.querySelector('[data-seasonal-particles]'); if (!c) return null; const d = c.toDataURL(); let h = 0; for (let i = 0; i < d.length; i += 97) h = (h * 31 + d.charCodeAt(i)) | 0; return h; })()`);
}

async function main() {
  const admin = await prisma.user.findUnique({ where: { username: "admin" } });
  const demo = await prisma.user.findUnique({ where: { username: "demo" } });
  if (!admin || !demo) throw new Error("thiếu user seed admin/demo");
  const adminToken = mint({ uid: admin.id, role: "ADMIN", username: "admin", amr: "passkey" });
  const demoToken = mint({ uid: demo.id, role: "USER", username: "demo" });

  ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
  };
  const targets = await (await fetch("http://127.0.0.1:9411/json/list")).json();
  const page = targets.find((t) => t.type === "page");
  sessionId = (await send("Target.attachToTarget", { targetId: page.id, flatten: true })).sessionId;
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Network.setCookie", { name: "smmv2-lang", value: "vi", url: BASE + "/", path: "/" });

  // Fixture nền: dải thông báo (để thấy lớp màu nhấn như bản mockup) — dọn ở cuối.
  await setSetting("announcement_bar", "SMM Panel & Tài khoản Premium — tự động 24/7");

  /* ---- 1. TẮT: 0 DOM decor ở trang chủ + dashboard ---- */
  await setSetting("seasonal_decor_enabled", "0");
  await setSetting("seasonal_theme", "tet");
  await navigate(`${BASE}/`, 3000);
  const offHome = await evaluate(DECOR_PROBE);
  ok(offHome.any === 0, `TẮT — trang chủ 0 DOM decor ${JSON.stringify(offHome)}`);
  await send("Network.setCookie", { name: "smmv2_session", value: demoToken, url: BASE + "/", path: "/" });
  await navigate(`${BASE}/dashboard/ho-so`, 3000);
  const offDash = await evaluate(DECOR_PROBE);
  ok(offDash.any === 0, `TẮT — dashboard 0 DOM decor ${JSON.stringify(offDash)}`);

  /* ---- 2. Thẻ admin + lưu qua form thật: ON + tet ---- */
  await send("Network.setCookie", { name: "smmv2_session", value: adminToken, url: BASE + "/", path: "/" });
  await navigate(`${BASE}/admin/cau-hinh`, 3500);
  const cardProbe = await evaluate(`(() => {
    const sel = document.querySelector('select[name="seasonal_decor_enabled"]');
    const radios = [...document.querySelectorAll('input[name="seasonal_theme"]')].map(r => r.value);
    const heads = (document.body.innerText || '').includes('Trang trí mùa lễ hội') || (document.body.innerText || '').includes('Seasonal decorations');
    return { hasSelect: !!sel, selectVal: sel?.value, radios, hasTitle: heads, url: location.pathname };
  })()`);
  ok(cardProbe.hasSelect && cardProbe.radios.length === 4, `thẻ admin render: select + 4 radio theme ${JSON.stringify(cardProbe)}`);
  ok(cardProbe.hasTitle, "thẻ admin có tiêu đề 'Trang trí mùa lễ hội'");
  await evaluate(`(() => { const el = document.querySelector('select[name="seasonal_decor_enabled"]'); el?.scrollIntoView({ block: 'center' }); return !!el; })()`);
  await sleep(600);
  await shot("2026-11-11-decor-final-admin");

  const submitSettings = async (enabled, theme) => {
    await evaluate(`(() => {
      const sel = document.querySelector('select[name="seasonal_decor_enabled"]');
      if (sel) { sel.value = ${JSON.stringify(enabled)}; sel.dispatchEvent(new Event('change', { bubbles: true })); }
      const radio = document.querySelector('input[name="seasonal_theme"][value=${JSON.stringify(theme)}]');
      if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); radio.dispatchEvent(new Event('click', { bubbles: true })); }
      return true;
    })()`);
    await sleep(300);
    await evaluate(`(() => { const b = document.querySelector('button[form="settings-form"]'); if (!b) throw new Error('không thấy nút Lưu'); b.click(); return true; })()`);
    await sleep(3500);
  };
  await submitSettings("1", "tet");
  ok((await getSetting("seasonal_decor_enabled")) === "1" && (await getSetting("seasonal_theme")) === "tet",
    `form admin lưu bền: enabled=1 theme=tet (DB: ${await getSetting("seasonal_decor_enabled")}/${await getSetting("seasonal_theme")})`);

  /* ---- 3. Trang chủ theo theme đã lưu (tet): đủ lớp + chuyển động + bấm xuyên ---- */
  await navigate(`${BASE}/`, 3400);
  const onTet = await evaluate(DECOR_PROBE);
  ok(onTet.garland === "tet" && onTet.particles === "tet" && onTet.prop === "tet" && onTet.wash === "tet",
    `BẬT tet — trang chủ đủ 4 lớp decor tet ${JSON.stringify(onTet)}`);
  ok(!onTet.overflowX, "BẬT tet — không tràn ngang");
  const s1 = await canvasSig(); await sleep(700); const s2 = await canvasSig();
  ok(s1 !== null && s1 !== s2, "canvas hạt rơi chuyển động thật (2 khung khác nhau)");
  const clickProbe = await evaluate(`(() => {
    const layers = [...document.querySelectorAll('[data-seasonal-garland],[data-seasonal-particles],[data-seasonal-prop],[data-seasonal-wash]')];
    const peNone = layers.every(el => getComputedStyle(el).pointerEvents === 'none');
    const card = [...document.querySelectorAll('a,button')].find(el => { const r = el.getBoundingClientRect(); return r.width > 40 && r.height > 20 && r.top > 200 && r.top < innerHeight - 100; });
    let under = null;
    if (card) { const r = card.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); under = el ? (el.closest('[data-seasonal-garland],[data-seasonal-particles],[data-seasonal-prop],[data-seasonal-wash]') ? 'DECOR' : 'OK') : 'NONE'; }
    return { peNone, under };
  })()`);
  ok(clickProbe.peNone && clickProbe.under === "OK", `bấm xuyên decor: pointer-events none + elementFromPoint không phải decor ${JSON.stringify(clickProbe)}`);
  await shot("2026-11-11-decor-final-tet-desktop");

  /* ---- 4. Đổi theme qua admin: tet → noel, dashboard đi theo ---- */
  await navigate(`${BASE}/admin/cau-hinh`, 3500);
  await submitSettings("1", "noel");
  ok((await getSetting("seasonal_theme")) === "noel", `form admin lưu bền: theme=noel (DB: ${await getSetting("seasonal_theme")})`);
  await send("Network.setCookie", { name: "smmv2_session", value: demoToken, url: BASE + "/", path: "/" });
  await navigate(`${BASE}/dashboard/ho-so`, 3400);
  const onDash = await evaluate(DECOR_PROBE);
  ok(onDash.garland === "noel" && onDash.particles === "noel" && onDash.prop === "noel",
    `dashboard theo theme đã lưu (noel): vòng + hạt + người tuyết ${JSON.stringify(onDash)}`);
  ok(!onDash.overflowX, "dashboard noel — không tràn ngang");
  await shot("2026-11-11-decor-final-dashboard");

  /* ---- 5. Admin KHÔNG có decor dù đang bật ---- */
  await send("Network.setCookie", { name: "smmv2_session", value: adminToken, url: BASE + "/", path: "/" });
  await navigate(`${BASE}/admin/cau-hinh`, 3000);
  const inAdmin = await evaluate(DECOR_PROBE);
  ok(inAdmin.any === 0, `khu admin không hiển thị decor ${JSON.stringify(inAdmin)}`);

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAIL`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(async () => {
  try { chrome.kill(); } catch { /* */ }
  // Dọn fixture: decor TẮT, theme tet, dải thông báo về rỗng như seed
  await setSetting("seasonal_decor_enabled", "0");
  await setSetting("seasonal_theme", "tet");
  await setSetting("announcement_bar", "");
  console.log("fixtures cleaned (decor OFF, theme tet)");
  await prisma.$disconnect();
  if (failures) process.exitCode = 1;
});
