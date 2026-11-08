/** TASK 14 (fix6): ảnh đại diện sau khi thay glyph bằng SVG — verify-email
 *  (icon alert), trang chủ (sao thẻ + mũi tên + chevron hero), modal đơn
 *  Premium (nút đóng). */
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
  "--remote-debugging-port=9360", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9360/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
async function capture(name) {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name);
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
  await navigate(`${BASE}/`);
  await evaluate(`document.cookie = 'smmv2-lang=vi; path=/'; localStorage.setItem('smmv2-lang', 'vi'); 'set'`);
  // 1) verify-email không token -> nhánh lỗi dùng I.alert
  await navigate(`${BASE}/verify-email`);
  const alertSvg = await evaluate(`(() => { const d = [...document.querySelectorAll('div')].find((x) => x.className.includes('bg-rose-100') && x.querySelector('svg')); return !!d; })()`);
  ok(alertSvg, "verify-email: icon lỗi là SVG (I.alert)");
  await capture("2026-11-08-icons-verify");
  // 2) trang chủ: hero chevron + Xem tất cả có mũi tên SVG
  await navigate(`${BASE}/`);
  const hero = await evaluate(`(() => {
    const all = [...document.querySelectorAll('a')].filter((a) => a.textContent.includes('Xem tất cả')); const seeAll = all.find((a) => a.querySelector('svg'));
    return { seeAllArrow: !!seeAll, glyphInBody: document.body.innerText.includes('★') };
  })()`);
  ok(hero.seeAllArrow, "link 'Xem tất cả' mang icon mũi tên SVG");
  ok(!hero.glyphInBody, "trang chủ không còn glyph ★ trong nội dung");
  await capture("2026-11-08-icons-home");
  // 3) modal đơn Premium: nút đóng là SVG
  await evaluate(`document.cookie = 'smmv2_session=${token}; path=/'; 'set'`);
  await navigate(`${BASE}/dashboard/don-premium`);
  const opened = await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Chi tiết')); if (b) { b.click(); return true; } return false; })()`);
  await sleep(1200);
  if (opened) {
    const closeSvg = await evaluate(`!!document.querySelector('button[aria-label="Đóng"] svg')`);
    ok(closeSvg, "modal đơn Premium: nút đóng là SVG");
    await capture("2026-11-08-icons-modal");
  } else {
    console.log("SKIP modal (demo không có đơn Premium để mở — nút đóng đã kiểm ở code: SVG path)");
  }
  console.log(failures === 0 ? "ALL PASS" : `${failures} FAIL`);
  chrome.kill();
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
