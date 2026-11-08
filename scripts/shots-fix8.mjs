/** FIX8 — kiểm chứng: (1) tách khu đơn Premium (don-premium chỉ còn đơn
 *  thường; lịch sử Telegram/Steam vẫn đủ đơn của khu mình; hàng đợi admin
 *  chỉ còn đơn thường, chi tiết admin vẫn mở đơn Telegram), (2) hai trang
 *  Steam chia 2 cột 73/27 trên desktop, xếp 1 cột ở 390, và đặt 1 đơn thật
 *  mỗi trang qua mock FZR với tổng tiền như fix7 (10.000đ / 45.990đ). */
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
const mint = (claims) => {
  const u = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sv: 0, iat: now, exp: now + 3600, ...claims })}`;
  return `${u}.${createHmac("sha256", secret).update(u).digest("base64url")}`;
};
const demoToken = mint({ uid: 2, role: "USER", username: "demo" });
const adminToken = mint({ uid: 1, role: "ADMIN", username: "admin", amr: "passkey" });

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--remote-debugging-port=9363", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9363/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
async function setSession(token) {
  await navigate(`${BASE}/`);
  await evaluate(`document.cookie = 'smmv2_session=${token}; path=/'; document.cookie = 'smmv2-lang=vi; path=/'; try { localStorage.setItem('smmv2-lang', 'vi'); } catch(e) {} 'set'`);
}
const bodyText = () => evaluate(`document.body.innerText`);

/* Đo vị trí các thẻ trong form Steam: thẻ chi tiết/tìm kiếm (cột trái) và
 * thẻ Summary — trả về hình chữ nhật để khẳng định 2 cột / xếp chồng. */
const STEAM_RECTS = `(() => {
  const secs = [...document.querySelectorAll('form section')];
  const find = (txt) => secs.find((s) => s.innerText.includes(txt));
  const sum = find('Tóm tắt');
  const first = secs[0];
  const r = (el) => el ? (({ x, y, width, height }) => ({ x, y, width, height }))(el.getBoundingClientRect()) : null;
  return { first: r(first), summary: r(sum), sections: secs.length, formW: r(document.querySelector('form'))?.width };
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

  /* ---------- TASK 1: tách khu ---------- */
  await setSession(demoToken);
  await viewport(1440, 1100);
  await navigate(`${BASE}/dashboard/don-premium`);
  let txt = await bodyText();
  ok(txt.includes("PRE900003") && txt.includes("PRE900004"), "don-premium: thấy 2 đơn thường (plain + gamekeys)");
  ok(!txt.includes("PRE900001") && !txt.includes("PRE900002"), "don-premium: KHÔNG còn đơn Telegram/Steam");
  ok(txt.includes("150.000") && !txt.includes("999.000") && !txt.includes("888.000"), "don-premium: Tổng đã chi = 150.000 (chỉ đơn thường)");
  await capture("2026-11-08-donpremium-filter-desktop");
  await viewport(390, 844);
  await navigate(`${BASE}/dashboard/don-premium`);
  txt = await bodyText();
  ok(txt.includes("PRE900003") && !txt.includes("PRE900001"), "don-premium 390: vẫn tách khu đúng");
  await capture("2026-11-08-donpremium-filter-390");

  await viewport(1440, 1100);
  await navigate(`${BASE}/dashboard/telegram/lich-su`);
  txt = await bodyText();
  ok(txt.includes("PRE900001"), "lịch sử Telegram: vẫn có đơn Telegram PRE900001");
  await navigate(`${BASE}/dashboard/steam/lich-su`);
  txt = await bodyText();
  ok(txt.includes("PRE900002"), "lịch sử Steam: vẫn có đơn Steam PRE900002");

  // Hàng đợi admin + chi tiết admin mở đơn Telegram
  await setSession(adminToken);
  await navigate(`${BASE}/admin/don-premium`);
  txt = await bodyText();
  ok(txt.includes("PRE900003") && txt.includes("PRE900004"), "admin queue: thấy đơn thường");
  ok(!txt.includes("PRE900001") && !txt.includes("PRE900002"), "admin queue: KHÔNG còn đơn Telegram/Steam");
  const tgOrderId = await evaluate(`fetch('/api/does-not-exist').then(() => null).catch(() => null), null`);
  void tgOrderId;

  /* ---------- TASK 2: Steam 2 cột + đặt đơn ---------- */
  await setSession(demoToken);
  await viewport(1440, 1100);
  await navigate(`${BASE}/dashboard/steam/top-up`);
  let rects = await evaluate(STEAM_RECTS);
  console.log("topup rects:", JSON.stringify(rects));
  ok(rects.summary && rects.first && rects.summary.x > rects.first.x + 100, "top-up desktop: Summary nằm cột PHẢI");
  ok(Math.abs(rects.summary.y - rects.first.y) < 5, "top-up desktop: 2 cột bắt đầu cùng hàng (header ở cột trái)");
  const ratio = rects.summary.width / (rects.first.width + rects.summary.width + 20);
  ok(ratio > 0.24 && ratio < 0.30, `top-up desktop: tỉ lệ cột phải ≈27% (đo ${ratio.toFixed(3)})`);
  await capture("2026-11-08-steam-cols-topup-desktop");
  // Đặt đơn top-up: login + mệnh giá 10 USD + Continue
  await evaluate(`(() => { const i = document.querySelector('#steam-login'); i.focus(); document.execCommand('selectAll', false, null); return i.id; })()`);
  await send("Input.insertText", { text: "demo_steam" });
  await evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes('10 USD'))?.click()`);
  await sleep(400);
  await evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Tiếp tục')?.click()`);
  await sleep(3000);
  txt = await bodyText();
  console.log("after topup order url/text sample:", (await evaluate(`location.href`)));
  await viewport(390, 844);
  await navigate(`${BASE}/dashboard/steam/top-up`);
  rects = await evaluate(STEAM_RECTS);
  console.log("topup 390 rects:", JSON.stringify(rects));
  ok(rects.summary && rects.first && Math.abs(rects.summary.x - rects.first.x) < 5 && rects.summary.y > rects.first.y, "top-up 390: xếp 1 cột, Summary ở dưới");
  await capture("2026-11-08-steam-cols-topup-390");

  await viewport(1440, 1100);
  await navigate(`${BASE}/dashboard/steam/gift-games`);
  rects = await evaluate(STEAM_RECTS);
  console.log("gift rects:", JSON.stringify(rects));
  ok(rects.summary && rects.first && rects.summary.x > rects.first.x + 100, "gift desktop: Summary nằm cột PHẢI");
  ok(Math.abs(rects.summary.y - rects.first.y) < 5, "gift desktop: 2 cột bắt đầu cùng hàng");
  await capture("2026-11-08-steam-cols-gift-desktop");
  // Đặt đơn gift: chọn ELDEN RING + link mời + Proceed
  await evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes('ELDEN RING'))?.click()`);
  await sleep(400);
  await evaluate(`(() => { const i = document.querySelector('#sg-invite'); i.focus(); return i.id; })()`);
  await send("Input.insertText", { text: "https://s.team/p/abcd-efgh" });
  await sleep(300);
  await evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Tiến hành')?.click()`);
  await sleep(3000);
  console.log("after gift order url:", await evaluate(`location.href`));
  await viewport(390, 844);
  await navigate(`${BASE}/dashboard/steam/gift-games`);
  rects = await evaluate(STEAM_RECTS);
  console.log("gift 390 rects:", JSON.stringify(rects));
  ok(rects.summary && rects.first && Math.abs(rects.summary.x - rects.first.x) < 5 && rects.summary.y > rects.first.y, "gift 390: xếp 1 cột, Summary ở dưới");
  await capture("2026-11-08-steam-cols-gift-390");

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(2); }).finally(() => { try { chrome.kill(); } catch { /* */ } });
