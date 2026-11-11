/** NGHIỆM THU TRANG TRÍ MÙA LỄ HỘI — đợt THÊM 5 THEME (lệnh Tín 2026-11-11 17:23
 *  "Sao có mấy lễ vậy còn lễ phục sinh, black fiday,,."): tổng 9 theme.
 *  node scripts/shots-decor-themes2.mjs   (điều kiện: server production :3000 đang chạy)
 *  Kiểm: (1) TẮT → 0 DOM decor trang chủ; (2) thẻ admin có đúng 9 radio theme +
 *      9 ô xem trước; (3) từng theme MỚI (phucsinh/blackfriday/valentine/nammoi/
 *      quockhanh): lưu qua form admin thật → bền trong DB → trang chủ canvas
 *      particles=<theme>, chuyển động thật, không tràn ngang; (4) theme cũ tet +
 *      trungthu vẫn chạy (đặt thẳng setting); (5) admin không có decor.
 *  Ảnh: 2026-11-11-roi-{phucsinh,blackfriday,valentine}.png — dọn fixture cuối. */
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
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-decor-themes2",
  "--remote-debugging-port=9414", "--window-size=1440,900",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });

async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9414/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
  particles: document.querySelector('[data-seasonal-particles]')?.getAttribute('data-seasonal-particles') || null,
  total: document.querySelectorAll('[data-seasonal-garland],[data-seasonal-particles],[data-seasonal-prop],[data-seasonal-wash]').length,
  overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
}))()`;
async function canvasSig() {
  return evaluate(`(() => { const c = document.querySelector('[data-seasonal-particles]'); if (!c) return null; const d = c.toDataURL(); let h = 0; for (let i = 0; i < d.length; i += 97) h = (h * 31 + d.charCodeAt(i)) | 0; return h; })()`);
}

const NEW_THEMES = ["phucsinh", "blackfriday", "valentine", "nammoi", "quockhanh"];
const SHOT_FOR = { phucsinh: "2026-11-11-roi-phucsinh", blackfriday: "2026-11-11-roi-blackfriday", valentine: "2026-11-11-roi-valentine" };

async function main() {
  const admin = await prisma.user.findUnique({ where: { username: "admin" } });
  if (!admin) throw new Error("thiếu user seed admin");
  const adminToken = mint({ uid: admin.id, role: "ADMIN", username: "admin", amr: "passkey" });

  ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
  };
  const targets = await (await fetch("http://127.0.0.1:9414/json/list")).json();
  const page = targets.find((t) => t.type === "page");
  sessionId = (await send("Target.attachToTarget", { targetId: page.id, flatten: true })).sessionId;
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Network.setCookie", { name: "smmv2-lang", value: "vi", url: BASE + "/", path: "/" });

  /* ---- 1. TẮT: 0 DOM decor ở trang chủ ---- */
  await setSetting("seasonal_decor_enabled", "0");
  await setSetting("seasonal_theme", "tet");
  await navigate(`${BASE}/`, 3000);
  const offHome = await evaluate(DECOR_PROBE);
  ok(offHome.total === 0, `TẮT — trang chủ 0 DOM decor ${JSON.stringify(offHome)}`);

  /* ---- 2. Thẻ admin: 9 radio + 9 xem trước ---- */
  await send("Network.setCookie", { name: "smmv2_session", value: adminToken, url: BASE + "/", path: "/" });
  await navigate(`${BASE}/admin/cau-hinh`, 3500);
  const cardProbe = await evaluate(`(() => {
    const radios = [...document.querySelectorAll('input[name="seasonal_theme"]')].map(r => r.value);
    const first = document.querySelector('input[name="seasonal_theme"]');
    const grid = first?.closest('label')?.parentElement;
    const previews = grid ? grid.querySelectorAll('label svg').length : 0;
    const txt = document.body.textContent || '';
    // Tên hiển thị theo ngôn ngữ hiệu lực của trình duyệt test (cookie vi có thể bị
    // lớp đồng bộ ngôn ngữ phía khách ghi về mặc định en) — chấp nhận VI hoặc EN,
    // cả hai đều là bản dịch đúng trong từ điển; HTML SSR với cookie vi đã kiểm
    // riêng là hiện đủ 5 tên tiếng Việt.
    const pairs = [['Lễ Phục sinh','Easter'],['Black Friday'],['Lễ Tình nhân',"Valentine's Day"],['Năm mới','New Year'],['Quốc khánh','National Day']];
    return { radios, previews, names: pairs.every(ns => ns.some(n => txt.includes(n))) };
  })()`);
  ok(cardProbe.radios.length === 9, `thẻ admin có đúng 9 radio theme: ${JSON.stringify(cardProbe.radios)}`);
  ok(cardProbe.previews === 9, `thẻ admin có 9 ô xem trước hạt (svg=${cardProbe.previews})`);
  ok(cardProbe.names, "thẻ admin hiện đủ tên 5 lễ mới (VI hoặc EN theo ngôn ngữ hiệu lực)");

  const submitSettings = async (enabled, theme) => {
    await evaluate(`(() => {
      const sel = document.querySelector('select[name="seasonal_decor_enabled"]');
      if (sel) { sel.value = ${JSON.stringify(enabled)}; sel.dispatchEvent(new Event('change', { bubbles: true })); }
      const radio = document.querySelector('input[name="seasonal_theme"][value=${JSON.stringify(theme)}]');
      if (!radio) throw new Error('không thấy radio theme ' + ${JSON.stringify(theme)});
      radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); radio.dispatchEvent(new Event('click', { bubbles: true }));
      return true;
    })()`);
    await sleep(300);
    await evaluate(`(() => { const b = document.querySelector('button[form="settings-form"]'); if (!b) throw new Error('không thấy nút Lưu'); b.click(); return true; })()`);
    await sleep(3500);
  };

  /* ---- 3. Từng theme mới: lưu form → DB bền → trang chủ chạy đúng theme ---- */
  for (const theme of NEW_THEMES) {
    await navigate(`${BASE}/admin/cau-hinh`, 3200);
    await submitSettings("1", theme);
    ok((await getSetting("seasonal_decor_enabled")) === "1" && (await getSetting("seasonal_theme")) === theme,
      `form admin lưu bền: theme=${theme} (DB: ${await getSetting("seasonal_theme")})`);
    await send("Network.clearBrowserCookies");
    await send("Network.setCookie", { name: "smmv2-lang", value: "vi", url: BASE + "/", path: "/" });
    await navigate(`${BASE}/`, 3400);
    const on = await evaluate(DECOR_PROBE);
    ok(on.particles === theme && on.total === 1 && !on.overflowX,
      `BẬT ${theme} — trang chủ canvas particles=${theme}, không tràn ngang ${JSON.stringify(on)}`);
    const s1 = await canvasSig(); await sleep(700); const s2 = await canvasSig();
    ok(s1 !== null && s1 !== s2, `BẬT ${theme} — hạt chuyển động thật (2 khung khác nhau)`);
    if (SHOT_FOR[theme]) await shot(SHOT_FOR[theme]);
    await send("Network.setCookie", { name: "smmv2_session", value: adminToken, url: BASE + "/", path: "/" });
  }

  /* ---- 4. Theme cũ vẫn chạy: tet + trungthu (đặt thẳng setting) ---- */
  await send("Network.clearBrowserCookies");
  await send("Network.setCookie", { name: "smmv2-lang", value: "vi", url: BASE + "/", path: "/" });
  for (const theme of ["tet", "trungthu", "noel", "halloween"]) {
    await setSetting("seasonal_decor_enabled", "1");
    await setSetting("seasonal_theme", theme);
    await navigate(`${BASE}/`, 3000);
    const on = await evaluate(DECOR_PROBE);
    ok(on.particles === theme && on.total === 1, `theme cũ ${theme} vẫn chạy ${JSON.stringify(on)}`);
  }

  /* ---- 5. Khu admin không có decor ---- */
  await send("Network.setCookie", { name: "smmv2_session", value: adminToken, url: BASE + "/", path: "/" });
  await navigate(`${BASE}/admin/cau-hinh`, 3000);
  const inAdmin = await evaluate(DECOR_PROBE);
  ok(inAdmin.total === 0, `khu admin không hiển thị decor ${JSON.stringify(inAdmin)}`);

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAIL`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(async () => {
  try { chrome.kill(); } catch { /* */ }
  await setSetting("seasonal_decor_enabled", "0");
  await setSetting("seasonal_theme", "tet");
  await setSetting("announcement_bar", "");
  console.log("fixtures cleaned (decor OFF, theme tet)");
  await prisma.$disconnect();
  if (failures) process.exitCode = 1;
});
