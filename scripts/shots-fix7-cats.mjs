/** FIX7 TASK C: danh mục dạng dải pill (chỉ tên) — chụp trang chủ + trang
 *  danh sách, kiểm không icon/không số trong pill, chạy thử lọc. */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

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
const u = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ uid: 2, role: "USER", username: "demo", sv: 0, iat: now, exp: now + 3600 })}`;
const token = `${u}.${createHmac("sha256", secret).update(u).digest("base64url")}`;

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--remote-debugging-port=9359", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9359/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
async function navigate(url, waitMs = 2400) { await send("Page.navigate", { url }); await sleep(waitMs); }
async function capture(name, full = false) {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: full });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name);
}
async function viewport(width, height) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 500 });
}

const HOME_PILLS = `(() => {
  const sec = [...document.querySelectorAll('section')].find((s) => (s.textContent || '').includes('Danh mục sản phẩm'));
  if (!sec) return { found: false };
  const btns = [...sec.querySelectorAll('button')];
  return {
    found: true,
    pills: btns.map((b) => ({
      text: (b.textContent || '').trim(),
      hasSvg: !!b.querySelector('svg'),
      cls: b.className,
      h: Math.round(b.getBoundingClientRect().height),
    })),
  };
})()`;

const LIST_PILLS = `(() => {
  const form = document.querySelector('form.card');
  if (!form) return { found: false };
  const spans = [...form.querySelectorAll('label span')].filter((s) => s.className.includes('rounded-full'));
  return {
    found: true,
    pills: spans.map((s) => ({
      text: (s.textContent || '').trim(),
      hasSvg: !!s.querySelector('svg'),
      checked: getComputedStyle(s).backgroundColor !== 'rgb(255, 255, 255)',
      h: Math.round(s.getBoundingClientRect().height),
    })),
  };
})()`;

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
  await evaluate(`document.cookie = 'smmv2_session=${token}; path=/'; document.cookie = 'smmv2-lang=vi; path=/'; try { localStorage.setItem('smmv2-lang', 'vi'); } catch(e) {} 'set'`);

  // --- Trang chủ desktop ---
  await viewport(1440, 1100);
  await navigate(`${BASE}/`);
  let hp = await evaluate(HOME_PILLS);
  console.log("HOME pills:", JSON.stringify(hp.pills));
  ok(hp.found && hp.pills.length >= 2, `home: thấy dải pill (${hp.pills?.length})`);
  ok(hp.pills.every((p) => !p.hasSvg), "home: không pill nào có icon");
  ok(hp.pills.every((p) => !/\s\d+$/.test(p.text)), "home: tên pill không có số lượng ở cuối");
  ok(hp.pills.every((p) => p.h === hp.pills[0].h), "home: mọi pill cao bằng nhau");
  ok(hp.pills[0].cls.includes("bg-brand-600"), "home: pill Tất cả đang active = nền brand");
  await evaluate(`document.querySelector('section' + '')?.scrollIntoView(); [...document.querySelectorAll('section')].find((s) => (s.textContent || '').includes('Danh mục sản phẩm'))?.scrollIntoView({ block: 'center' }); 'scrolled'`);
  await sleep(500);
  await capture("2026-11-08-categories-pills-home-desktop");
  await capture("2026-11-08-categories-plain-home");
  // click thử 1 pill danh mục -> lưới nổi bật lọc tại chỗ
  const clicked = await evaluate(`(() => { const sec = [...document.querySelectorAll('section')].find((s) => (s.textContent || '').includes('Danh mục sản phẩm')); const b = [...sec.querySelectorAll('button')][1]; const name = b.textContent.trim(); b.click(); return name; })()`);
  await sleep(900);
  hp = await evaluate(HOME_PILLS);
  ok(hp.pills[1].cls.includes("bg-brand-600"), `home: bấm pill "${clicked}" -> active chuyển đúng`);
  const featuredCount = await evaluate(`document.querySelectorAll('#home-featured a[href^="/premium/"]').length`);
  console.log("featured cards sau lọc:", featuredCount);

  // --- Trang chủ 390 ---
  await viewport(390, 844);
  await navigate(`${BASE}/`);
  await evaluate(`[...document.querySelectorAll('section')].find((s) => (s.textContent || '').includes('Danh mục sản phẩm'))?.scrollIntoView({ block: 'center' }); 'scrolled'`);
  await sleep(500);
  await capture("2026-11-08-categories-pills-home-390");

  // --- Trang danh sách ---
  await viewport(1440, 1100);
  await navigate(`${BASE}/premium`);
  let lp = await evaluate(LIST_PILLS);
  console.log("LIST pills:", JSON.stringify(lp.pills));
  ok(lp.found && lp.pills.length >= 2, `listing: thấy pill (${lp.pills?.length})`);
  ok(lp.pills.every((p) => !p.hasSvg), "listing: không pill nào có icon");
  ok(lp.pills.every((p) => !/\s\d+$/.test(p.text)), "listing: không pill nào có số lượng ở cuối tên");
  await capture("2026-11-08-categories-pills-listing");
  await capture("2026-11-08-categories-plain-listing");
  // chọn pill thứ 2 + bấm Lọc -> URL có cat=
  await evaluate(`(() => { const form = document.querySelector('form.card'); const radios = form.querySelectorAll('input[name="cat"]'); radios[1].click(); const btn = [...form.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Lọc'); btn.click(); return 'go'; })()`);
  await sleep(2600);
  const url = await evaluate(`location.href`);
  ok(/cat=\d+/.test(url), `listing: lọc theo pill -> URL có cat (${url})`);
  lp = await evaluate(LIST_PILLS);
  ok(lp.pills[1].checked && !lp.pills[0].checked, "listing: đúng pill đã chọn giữ nền brand sau khi lọc, pill Tất cả về trắng");

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAIL`);
  chrome.kill();
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
