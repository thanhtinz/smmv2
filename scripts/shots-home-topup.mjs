/** NGHIỆM THU mục "Top-Up Game" trang chủ (đợt 107, lệnh Tín 2026-11-12):
 *  node scripts/shots-home-topup.mjs (cần server production :3000 + đã chạy
 *  home-topup-fixture.ts seed: 25 game topups, đã bán 43/17/9/5/2, review
 *  4.0(2) + 5.0(1)).
 *  1. Vị trí: dưới khối Danh mục, trên Sản phẩm nổi bật. Đầu hiện 10 ô;
 *     ô đầu "4.0 (2) | Đã bán 43" (đơn CANCELED không tính), ô hai
 *     "5.0 (1) | Đã bán 17", ô ba chỉ "Đã bán 9" (0 review).
 *  2. "Xem thêm": 10 -> 20 -> 25, hết thì nút ẩn.
 *  3. Ô "Tìm game": gõ ZingSpeed + Enter -> /dashboard/top-up?q=ZingSpeed
 *     với danh sách đã lọc sẵn đúng tham số q trang Top-Up đang đọc.
 *  4. Bấm ô game -> đúng trang chi tiết /dashboard/top-up/<id>.
 *  5. Không tràn ngang 1440 + 390. Ảnh section desktop + mobile. */
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
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-ht",
  "--remote-debugging-port=9415", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9415/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
const bodyText = () => evaluate(`document.body.innerText`);
const setField = (name, val) => evaluate(`(() => { const el = document.querySelector('input[name="${name}"]'); if (!el) throw new Error('thiếu input ${name}'); el.focus(); el.value = ${JSON.stringify(val)}; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
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

// Helpers bám vào đúng section chứa h2 "Top-Up Game"
const SEC = `(() => { const h = [...document.querySelectorAll('h2')].find((x) => x.innerText.trim() === 'Top-Up Game'); return h ? h.closest('section') : null; })()`;
const tileCount = () => evaluate(`(() => { const s = ${SEC}; return s ? s.querySelectorAll('a[href^="/dashboard/top-up/"]').length : -1; })()`);
const tileText = (i) => evaluate(`(() => { const s = ${SEC}; const a = s ? s.querySelectorAll('a[href^="/dashboard/top-up/"]')[${i}] : null; return a ? a.innerText.replace(/\\s+/g, ' ').trim() : ''; })()`);
const tileHref = (i) => evaluate(`(() => { const s = ${SEC}; const a = s ? s.querySelectorAll('a[href^="/dashboard/top-up/"]')[${i}] : null; return a ? a.getAttribute('href') : ''; })()`);

async function main() {
  ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } };
  const targets = await (await fetch("http://127.0.0.1:9415/json/list")).json();
  const page = targets.find((t) => t.type === "page");
  sessionId = (await send("Target.attachToTarget", { targetId: page.id, flatten: true })).sessionId;
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

  await login("demo", "Demo@123");
  await navigate(`${BASE}/`, 3500);

  /* ---- 1. Vị trí + nội dung đầu mục ---- */
  const pos = await evaluate(`(() => {
    const top = (el) => el ? el.getBoundingClientRect().top + window.scrollY : -1;
    const h = [...document.querySelectorAll('h2')].find((x) => x.innerText.trim() === 'Top-Up Game');
    const cat = [...document.querySelectorAll('h2')].find((x) => x.innerText.trim() === 'Danh mục sản phẩm');
    const feat = document.querySelector('#home-featured');
    return { sec: top(h), cat: top(cat), feat: top(feat) };
  })()`);
  ok(pos.sec > 0 && pos.cat > 0 && pos.sec > pos.cat, `mục nằm DƯỚI khối Danh mục (cat=${Math.round(pos.cat)} < sec=${Math.round(pos.sec)})`);
  ok(pos.feat > pos.sec, `mục nằm TRÊN Sản phẩm nổi bật (sec=${Math.round(pos.sec)} < feat=${Math.round(pos.feat)})`);
  ok((await tileCount()) === 10, `đầu hiện đúng 10 ô (thấy ${await tileCount()})`);
  const t0 = await tileText(0);
  ok(t0.includes("Liên Quân Fixture") && t0.includes("4.0 (2)") && t0.includes("|") && t0.includes("Đã bán 43"), `ô đầu đúng meta mẫu "4.0 (2) | Đã bán 43": ${t0}`);
  const t1 = await tileText(1);
  ok(t1.includes("Genshin Fixture") && t1.includes("5.0 (1)") && t1.includes("Đã bán 17"), `ô hai "5.0 (1) | Đã bán 17": ${t1}`);
  const t2 = await tileText(2);
  ok(t2.includes("ZingSpeed Fixture") && t2.includes("Đã bán 9") && !t2.includes("(") && !t2.includes("|"), `ô ba 0 review chỉ hiện "Đã bán 9": ${t2}`);
  const overflowD = await evaluate(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
  ok(overflowD <= 1, `desktop không tràn ngang (overflow=${overflowD})`);

  // Ảnh desktop: cuộn mục vào khung hình rồi chụp viewport
  await evaluate(`(() => { const s = ${SEC}; if (s) window.scrollTo(0, s.getBoundingClientRect().top + window.scrollY - 70); return true; })()`);
  await sleep(700);
  await shot("2026-11-13-home-topup-desktop");

  /* ---- 2. Xem thêm +10 ---- */
  const clickMore = () => evaluate(`(() => { const s = ${SEC}; const b = s ? [...s.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Xem thêm') : null; if (!b) return false; b.click(); return true; })()`);
  ok(await clickMore(), "bấm Xem thêm lần 1");
  await sleep(600);
  ok((await tileCount()) === 20, `sau lần 1 hiện 20 ô (thấy ${await tileCount()})`);
  ok(await clickMore(), "bấm Xem thêm lần 2");
  await sleep(600);
  ok((await tileCount()) === 25, `sau lần 2 hiện đủ 25 ô (thấy ${await tileCount()})`);
  ok(!(await clickMore()), "hết game thì nút Xem thêm ẩn");

  /* ---- 3. Tìm game -> /dashboard/top-up?q= ---- */
  await evaluate(`(() => { const s = ${SEC}; const inp = s.querySelector('form input[name="q"]'); const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(inp, 'ZingSpeed'); inp.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await evaluate(`(() => { const s = ${SEC}; const f = s.querySelector('form'); f.requestSubmit ? f.requestSubmit() : f.submit(); return true; })()`);
  await sleep(3500);
  const url = await evaluate(`location.href`);
  ok(url.includes("/dashboard/top-up") && url.includes("q=ZingSpeed"), `tìm nhảy đúng /dashboard/top-up?q=ZingSpeed (${url})`);
  let text = await bodyText();
  ok(text.includes("ZingSpeed Fixture") && !text.includes("Liên Quân Fixture"), "danh sách Top-Up đã lọc sẵn theo từ khoá");
  const qVal = await evaluate(`(document.querySelector('input[name="q"]') || {}).value || ''`);
  ok(qVal === "ZingSpeed", `ô tìm ở trang Top-Up giữ sẵn từ khoá (${qVal})`);

  /* ---- 4. Bấm ô -> chi tiết ---- */
  await navigate(`${BASE}/`, 3000);
  const href0 = await tileHref(0);
  await evaluate(`(() => { const s = ${SEC}; const a = s.querySelectorAll('a[href^="/dashboard/top-up/"]')[0]; a.click(); return true; })()`);
  await sleep(3500);
  const url2 = await evaluate(`location.href`);
  ok(href0 && url2.includes(href0), `bấm ô đầu sang đúng chi tiết ${href0} (${url2})`);
  text = await bodyText();
  ok(text.includes("Liên Quân Fixture"), "trang chi tiết hiện đúng game đã bấm");

  /* ---- 5. Mobile 390 ---- */
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await navigate(`${BASE}/`, 3500);
  ok((await tileCount()) === 10, `mobile đầu hiện 10 ô (thấy ${await tileCount()})`);
  const overflowM = await evaluate(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
  ok(overflowM <= 1, `mobile không tràn ngang (overflow=${overflowM})`);
  await evaluate(`(() => { const s = ${SEC}; if (s) window.scrollTo(0, s.getBoundingClientRect().top + window.scrollY - 56); return true; })()`);
  await sleep(700);
  await shot("2026-11-13-home-topup-mobile");

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAIL`);
  chrome.kill();
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}
main().catch(async (e) => { console.error(e); chrome.kill(); await prisma.$disconnect().catch(() => {}); process.exit(1); });
