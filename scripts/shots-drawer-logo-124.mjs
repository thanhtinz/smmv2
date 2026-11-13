/** KIỂM CHỨNG ĐỢT 124 — CĂN GIỮA LOGO TRONG NGĂN KÉO MENU MOBILE.
 *  node scripts/shots-drawer-logo-124.mjs (cần server production :3000 + DB local đã seed).
 *  Chẩn đoán gốc: HỘP logo vốn đã giữa sẵn (đo CDP trước đợt: lệch 0px cả hai
 *  trạng thái) — cái lệch là TRỌNG TÂM THỊ GIÁC của artwork: khối icon trái
 *  nặng mực hơn phần chữ phải, trọng tâm mực lệch trái ~8,2px ở khổ hiển thị
 *  168px nên mắt thấy logo tựa trái. Đợt này dịch img phải đúng 8px
 *  (translate-x-2 trong MobileSideNav) để trọng tâm thị giác về giữa.
 *  Script đo ở 390px, cả khách + đã đăng nhập (demo): (1) hộp logo phải nằm ở
 *  +8px ±1,5px so với tâm ngăn kéo (đúng mức dịch chủ đích); (2) quét pixel
 *  (sharp) trên ảnh chụp: trọng tâm mực của logo so với tâm ngăn kéo ≤ 2px.
 *  Chụp 1 ảnh ngăn kéo đã đăng nhập làm bằng chứng. */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import sharp from "sharp";

const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });
let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=old", "--disable-gpu", "--no-sandbox", "--disable-setuid-sandbox", "--hide-scrollbars",
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-logo124",
  "--remote-debugging-port=9424", "--window-size=390,844",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9424/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
async function navigate(url, wait = 2600) { await send("Page.navigate", { url }); await sleep(wait); }
async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name);
}
const setField = (name, val) => evaluate(`(() => { const el = document.querySelector('[name="${name}"]'); if (!el) throw new Error('thiếu field ${name}'); el.focus(); el.value = ${JSON.stringify(val)}; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
async function login(username, password) {
  await send("Network.clearBrowserCookies");
  await navigate(`${BASE}/`, 1500);
  await evaluate(`(() => { try { localStorage.setItem('smmv2-lang', 'vi'); } catch {} document.cookie = 'smmv2-lang=vi; path=/'; return true; })()`);
  await navigate(`${BASE}/login`, 2500);
  await setField("login", username);
  await setField("password", password);
  await evaluate(`(() => { const b = document.querySelector('form button[type="submit"], form button'); if (!b) throw new Error('thiếu nút submit'); b.click(); return true; })()`);
  await sleep(3200);
}
const setViewport = (w, h, mobile) => send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: !!mobile });

/** Mở ngăn kéo mobile rồi đo: hộp ngăn kéo + hộp img logo ở đầu ngăn kéo.
 *  Bấm lặp + chờ tối đa ~6s: trang vừa tải cần hydrate mới nhận click. */
async function measureDrawer(label) {
  let opened = false;
  for (let i = 0; i < 8 && !opened; i++) {
    await evaluate(`(() => { const b = document.querySelector('button[aria-label="Mở menu"], button[aria-label="Open menu"]'); if (b) b.click(); return !!b; })()`).catch(() => {});
    await sleep(750);
    opened = await evaluate(`!!document.querySelector('div.fixed.inset-y-0.left-0')`).catch(() => false);
  }
  if (!opened) { ok(false, `${label}: không mở được ngăn kéo`); return null; }
  const m = await evaluate(`(() => {
    const panel = document.querySelector('div.fixed.inset-y-0.left-0');
    if (!panel) return null;
    const pr = panel.getBoundingClientRect();
    const img = panel.querySelector('div img, div span');
    if (!img) return { panel: { x: pr.x, w: pr.width }, img: null };
    const ir = img.getBoundingClientRect();
    return { panel: { x: pr.x, w: pr.width }, img: { x: ir.x, w: ir.width, h: ir.height, tag: img.tagName } };
  })()`);
  if (!m || !m.img) { ok(false, `${label}: không tìm thấy ngăn kéo/logo`); return null; }
  const drawerCenter = m.panel.x + m.panel.w / 2;
  const imgCenter = m.img.x + m.img.w / 2;
  const off = Math.round((imgCenter - drawerCenter) * 10) / 10;
  console.log(`MEASURE ${label}: panel x=${m.panel.x} w=${m.panel.w} | logo <${m.img.tag}> x=${m.img.x} w=${m.img.w} h=${m.img.h} | tâm hộp lệch = ${off}px`);
  ok(Math.abs(off - 8) <= 1.5, `${label}: hộp logo dịch phải đúng mức quang học 8px ±1,5px (thực tế ${off}px)`);
  return m;
}

/** Trọng tâm mực của logo trên ảnh chụp (dải đầu ngăn kéo y 4..76, x 0..280):
 *  trọng lượng mỗi cột = tổng độ đậm (245 − độ sáng, cắt ở 0) của pixel. */
async function opticalOffset(pngPath, drawerW = 280) {
  const { data, info } = await sharp(pngPath).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  let sumW = 0, sumX = 0;
  for (let x = 0; x < drawerW; x++) {
    let colW = 0;
    for (let y = 4; y < 76; y++) {
      const i = (y * info.width + x) * ch;
      const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      colW += Math.max(0, 245 - lum);
    }
    sumW += colW; sumX += colW * x;
  }
  const centroid = sumX / sumW;
  return Math.round((centroid - drawerW / 2) * 10) / 10;
}

async function main() {
  ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
  };
  const targets = await (await fetch("http://127.0.0.1:9424/json/list")).json();
  const page = targets.find((t) => t.type === "page");
  sessionId = (await send("Target.attachToTarget", { targetId: page.id, flatten: true })).sessionId;
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await setViewport(390, 844, true);

  // Trạng thái KHÁCH (chưa đăng nhập): trang chủ khung công khai.
  await navigate(`${BASE}/`, 2800);
  await measureDrawer("khách 390px");

  // Trạng thái ĐÃ ĐĂNG NHẬP (demo).
  await login("demo", "Demo@123");
  await navigate(`${BASE}/`, 2400);
  await measureDrawer("đã đăng nhập 390px");
  await shot("2026-11-13-drawer-logo-giua-mobile");
  const optOff = await opticalOffset(`${OUT}/2026-11-13-drawer-logo-giua-mobile.png`);
  console.log(`OPTICAL trọng tâm mực logo lệch tâm ngăn kéo = ${optOff}px`);
  ok(Math.abs(optOff) <= 2, `trọng tâm thị giác của logo vào giữa ngăn kéo ≤ 2px (thực tế ${optOff}px)`);

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAIL`);
  chrome.kill();
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error("ERR", e.message); try { chrome.kill(); } catch {} process.exit(2); });
