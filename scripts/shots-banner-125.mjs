/** KIỂM CHỨNG + CHỤP ẢNH ĐỢT 125 — banner trang chủ khi shop trống.
 *  node scripts/shots-banner-125.mjs (cần server production :3000 + fixture
 *  125 ở trạng thái setup: catalog trống + 1 banner fixture active).
 *  Đo thật: ảnh banner nằm trong hero có chiều cao đúng khổ hero
 *  (desktop 380px / mobile 240px), thẻ "Chưa có sản phẩm nào phù hợp."
 *  vẫn còn bên dưới, trang không tràn ngang. */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });
let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=old", "--disable-gpu", "--no-sandbox", "--disable-setuid-sandbox", "--hide-scrollbars",
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-banner125",
  "--remote-debugging-port=9425", "--window-size=1440,900",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9425/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
const setViewport = (w, h, mobile) => send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: !!mobile });

const probe = (imgSel) => evaluate(`(() => {
  const img = document.querySelector('img[src="${imgSel}"]');
  const heroBox = img ? img.closest('div.relative') : null;
  const r = heroBox ? heroBox.getBoundingClientRect() : null;
  return {
    hasImg: !!img,
    heroH: r ? Math.round(r.height) : 0,
    heroW: r ? Math.round(r.width) : 0,
    emptyCard: document.body.innerText.includes("Chưa có sản phẩm nào phù hợp."),
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  };
})()`);

async function main() {
  ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
  };
  // Luồng attach theo đúng script đợt 124 đã chạy được: /json/list + page.id
  // (bản đầu dùng setAutoAttach/getTargets bị Chrome trả "Not allowed").
  const targets = await (await fetch("http://127.0.0.1:9425/json/list")).json();
  const page = targets.find((t) => t.type === "page");
  sessionId = (await send("Target.attachToTarget", { targetId: page.id, flatten: true })).sessionId;
  await send("Page.enable");
  await send("Runtime.enable");

  // Ghim ngôn ngữ VI (mặc định khách mới = EN, thẻ trống sẽ ra tiếng Anh —
  // khẳng định emptyCard ở dưới soi bản VI nên phải đặt cookie trước).
  await navigate(`${BASE}/`, 1500);
  await evaluate(`(() => { try { localStorage.setItem('smmv2-lang', 'vi'); } catch {} document.cookie = 'smmv2-lang=vi; path=/'; return true; })()`);

  // Desktop 1440
  await setViewport(1440, 900, false);
  await navigate(`${BASE}/`, 3500);
  const d = await probe("/banner-fixture-125.jpg");
  ok(d.hasImg, "desktop: HTML/DOM có ảnh banner fixture trong hero");
  ok(Math.abs(d.heroH - 380) <= 2, `desktop: chiều cao hero = ${d.heroH}px (kỳ vọng 380)`);
  ok(d.heroW >= 1430, `desktop: hero tràn bề ngang (${d.heroW}px)`);
  ok(d.emptyCard, "desktop: thẻ 'Chưa có sản phẩm nào phù hợp.' vẫn còn bên dưới hero");
  ok(!d.overflowX, "desktop: không tràn ngang");
  await shot("2026-11-13-banner-shop-trong-desktop");

  // Mobile 390
  await setViewport(390, 844, true);
  await navigate(`${BASE}/`, 3500);
  const m = await probe("/banner-fixture-125.jpg");
  ok(m.hasImg, "mobile: có ảnh banner fixture trong hero");
  ok(Math.abs(m.heroH - 240) <= 2, `mobile: chiều cao hero = ${m.heroH}px (kỳ vọng 240)`);
  ok(m.emptyCard, "mobile: thẻ trống vẫn còn");
  ok(!m.overflowX, "mobile: không tràn ngang");
  await shot("2026-11-13-banner-shop-trong-mobile");

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAIL`);
  process.exitCode = failures ? 1 : 0;
  ws.close(); chrome.kill();
}
main().catch((e) => { console.error(e); try { chrome.kill(); } catch {} process.exit(1); });
