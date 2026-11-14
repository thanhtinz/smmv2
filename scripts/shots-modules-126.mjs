/** KIỂM CHỨNG + CHỤP ẢNH ĐỢT 126 — luật module bật/tắt + banner tự co giãn.
 *  Cần: server production :3000 + fixture-modules-126 ở trạng thái setup
 *  (banner mép 1920×640 + mã MOD126 + flash FLASH126 + 2FA admin tạm tắt).
 *  Dòng kiểm chứng:
 *   A. Admin → Mô-đun: đủ 19 công tắc → chụp toàn trang.
 *   B. Tắt module_promo QUA UI ADMIN THẬT → menu khách mất Ưu đãi +
 *      /uu-dai chuyển về trang chủ → bật lại qua UI → Ưu đãi + trang trở lại.
 *   C. hero_banner_enabled tắt (qua fixture set) → trang chủ mất banner;
 *      bật lại → banner trở lại.
 *   D. Banner-fit: khung hero khớp tỉ lệ 3:1 của ảnh ở desktop 1440
 *      (cao ≈ 480) + mobile 390 (cao ≈ 130) → chụp 2 ảnh; xoá banner →
 *      slide tự tạo giữ chiều cao cũ 380.
 *   E. module_flashsale tắt → khung FLASH126 biến mất; bật lại → trở lại.
 *   F. area_steam_enabled tắt → menu mất nhóm Steam + /dashboard/steam/
 *      top-up chuyển về trang chủ; bật lại → trở lại.
 *  Chạy: node scripts/shots-modules-126.mjs (in PASS/FAIL từng dòng). */
import { spawn, execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:3000";
const ROOT = "/home/hatch/workspace/smmv2";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });
let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fixtureSet = (key, val) => execSync(`npx tsx scripts/fixture-modules-126.ts set ${key} ${val}`, { cwd: ROOT, encoding: "utf8" }).trim();

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=old", "--disable-gpu", "--no-sandbox", "--disable-setuid-sandbox", "--hide-scrollbars",
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-modules126",
  "--remote-debugging-port=9426", "--window-size=1440,900",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9426/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
async function shot(name, full = false) {
  const r = await send("Page.captureScreenshot", { format: "png", ...(full ? { captureBeyondViewport: true } : {}) });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name);
}
const setViewport = (w, h, mobile) => send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: !!mobile });
const bodyText = () => evaluate(`document.body.innerText`);
const setField = (name, val) => evaluate(`(() => { const el = document.querySelector('[name="${name}"]'); if (!el) throw new Error('thiếu field ${name}'); el.focus(); el.value = ${JSON.stringify(val)}; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
async function setLangVi() {
  await navigate(BASE + "/", 1500);
  await evaluate(`(() => { try { localStorage.setItem('smmv2-lang', 'vi'); } catch {} document.cookie = 'smmv2-lang=vi; path=/'; return true; })()`);
}
async function login(username, password) {
  await send("Network.clearBrowserCookies");
  await setLangVi();
  await navigate(`${BASE}/login`, 2500);
  await setField("login", username);
  await setField("password", password);
  await evaluate(`(() => { const b = document.querySelector('form button[type="submit"], form button'); if (!b) throw new Error('thiếu nút submit'); b.click(); return true; })()`);
  await sleep(3200);
}
const heroProbe = () => evaluate(`(() => {
  const img = document.querySelector('img[src="/banner-fixture-126.jpg"]');
  const frame = img ? img.closest('section')?.querySelector(':scope > div') : null;
  const r = frame ? frame.getBoundingClientRect() : null;
  const hero = document.querySelector('main')?.previousElementSibling;
  return {
    hasBanner: !!img,
    frameW: r ? Math.round(r.width) : 0,
    frameH: r ? Math.round(r.height) : 0,
    ratio: r && r.height ? +(r.width / r.height).toFixed(3) : 0,
    heroH: hero ? Math.round(hero.getBoundingClientRect().height) : 0,
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  };
})()`);
const navText = () => evaluate(`(() => [...document.querySelectorAll('aside, nav')].map((e) => e.innerText || '').join('\\n'))()`);
/** Mở một nhóm dropdown trong menu khách (nhóm thu gọn không render chữ
 *  của mục con — phải bấm mở trước khi soi nội dung, như người dùng thật). */
const openNavGroup = async (label) => {
  await evaluate(`(() => { const b = [...document.querySelectorAll('aside button, nav button')].find((x) => x.innerText.trim().startsWith(${JSON.stringify(label)})); if (b) b.click(); return !!b; })()`);
  await sleep(600);
};
const autoHeroProbe = () => evaluate(`(() => {
  // Hero là <section> nằm NGOÀI <main> (con trực tiếp của khung trang).
  const hero = [...document.querySelectorAll('section')].find((s) => !s.closest('main'));
  const frame = hero ? hero.querySelector(':scope > div') : null;
  const r = frame ? frame.getBoundingClientRect() : null;
  return { frameH: r ? Math.round(r.height) : 0, hasBanner: !!document.querySelector('img[src="/banner-fixture-126.jpg"]') };
})()`);

async function main() {
  ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
  };
  const targets = await (await fetch("http://127.0.0.1:9426/json/list")).json();
  const page = targets.find((t) => t.type === "page");
  sessionId = (await send("Target.attachToTarget", { targetId: page.id, flatten: true })).sessionId;
  await send("Page.enable");
  await send("Runtime.enable");

  // ---------- A. Trang Mô-đun admin ----------
  await login("admin", "Admin@123");
  await navigate(`${BASE}/admin/mo-dun`, 2500);
  const modCount = await evaluate(`document.querySelectorAll('#modules-form input[type="checkbox"]').length`);
  ok(modCount === 19, `A1 trang Mô-đun đủ 19 công tắc (đếm được ${modCount})`);
  const modText = await bodyText();
  for (const name of ["Banner trang chủ", "Flash Sale", "Khu Steam", "Khu Game Key", "Khu Gift Card", "Khu Top-Up", "Khu Manual Services", "Pass (gói thành viên)", "Trang trí mùa lễ hội", "Mã giảm giá"]) {
    ok(modText.includes(name), `A2 có hàng module "${name}"`);
  }
  await shot("2026-11-13-modules-admin", true);

  // ---------- B. module_promo qua UI admin thật ----------
  const togglePromo = (wantOn) => evaluate(`(() => {
    const rows = [...document.querySelectorAll('#modules-form label')];
    const row = rows.find((x) => x.innerText.includes('Mã giảm giá'));
    if (!row) return 'no-row';
    const cb = row.querySelector('input[type="checkbox"]');
    if (cb.checked !== ${wantOn}) cb.click();
    return cb.checked ? 'on' : 'off';
  })()`);
  const saveModules = async () => {
    await evaluate(`(() => { const b = document.querySelector('#modules-form button[type="submit"], #modules-form button'); b.click(); return true; })()`);
    await sleep(3000);
  };
  ok((await togglePromo(false)) === "off", "B1 bỏ tick Mã giảm giá ở UI admin");
  await saveModules();
  await login("demo", "Demo@123");
  await navigate(`${BASE}/dashboard`, 2500);
  await openNavGroup("Tài chính");
  let t = await navText();
  ok(t.includes("Tài chính") && t.includes("Lịch sử số dư"), "B0 probe menu đọc được nhóm Tài chính (kiểm chứng probe không rỗng)");
  ok(!t.includes("Ưu đãi"), "B2 promo tắt → menu khách không còn mục Ưu đãi");
  await navigate(`${BASE}/uu-dai`, 2000);
  ok((await evaluate(`location.pathname`)) === "/", "B3 promo tắt → mở thẳng /uu-dai bị chuyển về trang chủ");
  // Bật lại qua UI admin
  await login("admin", "Admin@123");
  await navigate(`${BASE}/admin/mo-dun`, 2500);
  ok((await togglePromo(true)) === "on", "B4 tick lại Mã giảm giá ở UI admin");
  await saveModules();
  await login("demo", "Demo@123");
  await navigate(`${BASE}/uu-dai`, 2500);
  t = await bodyText();
  ok(t.includes("MOD126"), "B5 promo bật lại → /uu-dai hiện lại + thấy mã MOD126");
  await navigate(`${BASE}/dashboard`, 2500);
  await openNavGroup("Tài chính");
  t = await navText();
  ok(t.includes("Ưu đãi"), "B6 promo bật lại → menu có lại mục Ưu đãi");

  // ---------- D. Banner-fit (trước C để còn banner) ----------
  await navigate(`${BASE}/`, 3000);
  let hp = await heroProbe();
  ok(hp.hasBanner, "D1 trang chủ có banner fixture");
  ok(Math.abs(hp.ratio - 3) <= 0.06, `D2 khung hero khớp tỉ lệ ảnh 3:1 (đo ${hp.ratio}, khung ${hp.frameW}×${hp.frameH})`);
  ok(Math.abs(hp.frameH - 480) <= 8, `D3 desktop 1440 → cao khung ≈ 480 (đo ${hp.frameH})`);
  ok(!hp.overflowX, "D4 không tràn ngang desktop");
  await shot("2026-11-13-banner-fit-desktop");
  await setViewport(390, 844, true);
  await navigate(`${BASE}/`, 3000);
  hp = await heroProbe();
  ok(Math.abs(hp.ratio - 3) <= 0.06, `D5 mobile 390 khung vẫn tỉ lệ 3:1 (đo ${hp.ratio}, khung ${hp.frameW}×${hp.frameH})`);
  ok(Math.abs(hp.frameH - 130) <= 8, `D6 mobile 390 → cao khung ≈ 130 (đo ${hp.frameH})`);
  await shot("2026-11-13-banner-fit-mobile");
  await setViewport(1440, 900, false);

  // ---------- C. hero_banner_enabled ----------
  fixtureSet("hero_banner_enabled", "0");
  await navigate(`${BASE}/`, 3000);
  hp = await heroProbe();
  ok(!hp.hasBanner, "C1 tắt module banner → trang chủ không còn banner admin");
  await shot("2026-11-13-modules-banner-off");
  fixtureSet("hero_banner_enabled", "1");
  await navigate(`${BASE}/`, 3000);
  hp = await heroProbe();
  ok(hp.hasBanner, "C2 bật lại module banner → banner hiện lại");

  // ---------- E. module_flashsale ----------
  t = await bodyText();
  ok(t.includes("FLASH126"), "E1 flash bật → khung FLASH126 hiện ở trang chủ");
  fixtureSet("module_flashsale", "0");
  await navigate(`${BASE}/`, 3000);
  t = await bodyText();
  ok(!t.includes("FLASH126"), "E2 flash tắt → khung FLASH126 biến mất");
  fixtureSet("module_flashsale", "1");
  await navigate(`${BASE}/`, 3000);
  t = await bodyText();
  ok(t.includes("FLASH126"), "E3 flash bật lại → khung trở lại");

  // ---------- D2. Không banner → slide tự tạo giữ chiều cao cũ ----------
  execSync(`node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.homeBanner.deleteMany({}).then(()=>p.\\$disconnect())"`, { cwd: ROOT });
  await navigate(`${BASE}/`, 3000);
  const ap = await autoHeroProbe();
  ok(!ap.hasBanner && ap.frameH === 380, `D7 không còn banner → hero slide tự tạo cao 380 như cũ (đo ${ap.frameH})`);

  // ---------- F. area_steam_enabled ----------
  await navigate(`${BASE}/dashboard`, 2500);
  await openNavGroup("Steam");
  t = await navText();
  ok(t.includes("Gift Games"), "F1 steam bật → menu có nhóm Steam (mở ra thấy mục Gift Games)");
  fixtureSet("area_steam_enabled", "0");
  await navigate(`${BASE}/dashboard`, 2500);
  t = await navText();
  ok(!t.includes("Steam"), "F2 steam tắt → menu mất nhóm Steam");
  await navigate(`${BASE}/dashboard/steam/top-up`, 2000);
  ok((await evaluate(`location.pathname`)) === "/", "F3 steam tắt → mở thẳng trang Steam Top-Up bị chuyển về trang chủ");
  await shot("2026-11-13-modules-steam-off");
  fixtureSet("area_steam_enabled", "1");
  await navigate(`${BASE}/dashboard/steam/top-up`, 2500);
  ok((await evaluate(`location.pathname`)) === "/dashboard/steam/top-up", "F4 steam bật lại → trang Steam Top-Up mở lại bình thường");

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAIL`);
  chrome.kill();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error("ERR", e); chrome.kill(); process.exit(2); });
