/** TASK 7 (fix6): menu admin mobile — bấm nhóm trong ngăn kéo phải mở nhóm
 *  và vào được trang con; trước khi sửa, click nổi bọt lên <nav onClick>
 *  làm ngăn kéo đóng ngay. node scripts/shots-fix6-adminnav.mjs before|after */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

const PHASE = process.argv[2] || "before";
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
const u = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ uid: 1, role: "ADMIN", username: "admin", sv: 0, amr: "passkey", iat: now, exp: now + 3600 })}`;
const token = `${u}.${createHmac("sha256", secret).update(u).digest("base64url")}`;

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--remote-debugging-port=9352", "--window-size=390,844",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9352/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
async function viewport(width, height) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 500 });
}

const drawerState = () => evaluate(`(() => {
  const drawer = document.querySelector('div[class*="z-[80]"]');
  const sysBtn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith('Hệ thống'));
  const sysLink = drawer ? drawer.querySelector('a[href="/admin/he-thong"]') : null;
  return { drawerOpen: !!drawer, sysVisible: !!sysLink && sysLink.offsetParent !== null };
})()`);

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
  await viewport(390, 844);
  await navigate(`${BASE}/`);
  await evaluate(`document.cookie = 'smmv2_session=${token}; path=/'; document.cookie = 'smmv2-lang=vi; path=/'; localStorage.setItem('smmv2-lang', 'vi'); 'set'`);
  await navigate(`${BASE}/admin`);
  console.log("URL:", await evaluate("location.href"));
  // mở ngăn kéo bằng nút burger
  await evaluate(`document.querySelector('button[aria-label="Mở menu"]')?.click(); 'burger'`);
  await sleep(800);
  let st = await drawerState();
  ok(st.drawerOpen, "ngăn kéo admin mở được ở 390px");
  // cuộn nav tới nhóm Hệ thống rồi bấm mở nhóm — CHỈ trong ngăn kéo (z-[80]),
  // tránh bấm nhầm bản sao ở sidebar desktop đang ẩn
  await evaluate(`(() => { const d = document.querySelector('div[class*="z-[80]"]'); const b = d ? [...d.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith('Hệ thống')) : null; if (b) { b.scrollIntoView({ block: 'center' }); } return !!b; })()`);
  await sleep(400);
  await evaluate(`(() => { const d = document.querySelector('div[class*="z-[80]"]'); const b = d ? [...d.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith('Hệ thống')) : null; if (b) { b.click(); return true; } return false; })()`);
  await sleep(800);
  st = await drawerState();
  console.log("sau khi bấm nhóm Hệ thống:", JSON.stringify(st));
  if (PHASE === "before") {
    ok(!st.drawerOpen || !st.sysVisible, "BEFORE (tái hiện lỗi): bấm nhóm -> ngăn kéo đóng / trang con không hiện");
    await capture("2026-11-08-adminnav-before-390");
  } else {
    ok(st.drawerOpen, "AFTER: ngăn kéo vẫn mở sau khi bấm nhóm");
    ok(st.sysVisible, "AFTER: trang con /admin/he-thong hiện trong nhóm đã mở");
    await capture("2026-11-08-adminnav-after-390");
    // bấm vào trang con: phải điều hướng tới đúng trang + đúng 1 lá được highlight
    await evaluate(`(() => { const d = document.querySelector('div[class*="z-[80]"]'); d?.querySelector('a[href="/admin/he-thong"]')?.click(); return 1; })()`);
    await sleep(2600);
    const url = await evaluate("location.href");
    ok(url.includes("/admin/he-thong"), `AFTER: vào được trang con (${url})`);
    // mở lại ngăn kéo: nhóm Hệ thống tự mở, lá Hệ thống là lá thắng duy nhất
    await evaluate(`document.querySelector('button[aria-label="Mở menu"]')?.click(); 'burger2'`);
    await sleep(800);
    const hl = await evaluate(`(() => {
      const drawer = document.querySelector('div[class*="z-[80]"]');
      if (!drawer) return { drawerOpen: false };
      const actives = [...drawer.querySelectorAll('a')].filter((a) => a.className.includes('from-brand-600'));
      return { drawerOpen: true, activeCount: actives.length, activeHref: actives[0]?.getAttribute('href'), sysVisible: !!drawer.querySelector('a[href="/admin/he-thong"]') };
    })()`);
    console.log("highlight:", JSON.stringify(hl));
    ok(hl.drawerOpen && hl.sysVisible, "AFTER: mở lại ngăn kéo ở trang con — nhóm tự mở");
    ok(hl.activeCount === 1 && hl.activeHref === "/admin/he-thong", "AFTER: đúng 1 lá được highlight (Hệ thống)");
    await capture("2026-11-08-adminnav-after-opened-390");
  }
  console.log(failures === 0 ? "ALL PASS" : `${failures} FAIL`);
  chrome.kill();
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
