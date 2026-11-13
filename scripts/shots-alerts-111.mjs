/** NGHIỆM THU đợt 111 — định tuyến email theo sự kiện + cảnh báo kho:
 *  node scripts/shots-alerts-111.mjs (cần server production :3000, DB local đã seed).
 *  Vào Admin → Báo cáo & Thông báo: kiểm tra khối "Email nhận riêng theo sự
 *  kiện" có đủ 8 ô (kèm ô sự kiện stock), ô ngưỡng sắp hết kho, và pill sự
 *  kiện "Kho sản phẩm (hết / sắp hết)" trong danh sách sự kiện được báo tin.
 *  Ảnh: 2026-11-13-alerts-routing-admin.png (clip đúng khối mới). */
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
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-alerts111",
  "--remote-debugging-port=9417", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9417/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
const bodyText = () => evaluate(`document.body.innerText`);
const setField = (name, val) => evaluate(`(() => { const el = document.querySelector('input[name="${name}"]'); if (!el) throw new Error('thiếu input ${name}'); el.focus(); el.value = ${JSON.stringify(val)}; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
async function login(username, password) {
  await send("Network.clearBrowserCookies");
  await navigate(BASE + "/", 1500);
  await evaluate(`(() => { try { localStorage.setItem('smmv2-lang', 'vi'); } catch {} document.cookie = 'smmv2-lang=vi; path=/'; return true; })()`);
  await navigate(`${BASE}/login`, 2500);
  await setField("login", username);
  await setField("password", password);
  await evaluate(`(() => { const b = document.querySelector('form button[type="submit"], form button'); if (!b) throw new Error('thiếu nút submit'); b.click(); return true; })()`);
  await sleep(3200);
}

async function main() {
  // Admin seed chưa bật 2FA mà admin_2fa_required mặc định "1" -> tạm tắt cho
  // phiên chụp, khôi phục ngay sau khi đăng nhập xong (mẫu shots-pass).
  const old2fa = (await prisma.setting.findUnique({ where: { key: "admin_2fa_required" } }))?.value ?? null;
  await prisma.setting.upsert({ where: { key: "admin_2fa_required" }, create: { key: "admin_2fa_required", value: "0" }, update: { value: "0" } });

  ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } };
  const targets = await (await fetch("http://127.0.0.1:9417/json/list")).json();
  const page = targets.find((t) => t.type === "page");
  sessionId = (await send("Target.attachToTarget", { targetId: page.id, flatten: true })).sessionId;
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

  await login("admin", "Admin@123");
  // GIỮ admin_2fa_required="0" cho tới khi chụp xong: cổng kiểm tra chạy ở
  // MỌI request vào /admin — khôi phục sớm là trang đích lại bị dẫn về trang
  // bắt thiết lập 2FA. Khôi phục ở cuối main().

  await navigate(`${BASE}/admin/bao-cao`, 3500);
  const text = await bodyText();
  ok(text.includes("Email nhận riêng theo sự kiện"), "có khối Email nhận riêng theo sự kiện");
  ok(text.includes("Kho sản phẩm (hết / sắp hết)"), "sự kiện stock hiện trong trang (pill + ô email)");
  ok(text.includes("Ngưỡng cảnh báo sắp hết kho"), "có ô ngưỡng sắp hết kho");
  const inputs = await evaluate(`(() => [...document.querySelectorAll('input')].map(i => i.name).filter(Boolean))()`);
  for (const k of ["premium_order", "deposit_pending", "deposit_success", "ticket", "new_user", "risk", "low_balance", "stock"])
    ok(inputs.includes(`alert_email_to_${k}`), `có ô email riêng: ${k}`);
  ok(inputs.includes("alert_stock_low_threshold"), "có input alert_stock_low_threshold");
  ok(await evaluate(`!!document.querySelector('input[name="ev"][value="stock"]')`), "có checkbox sự kiện stock trong danh sách báo tin");

  // Cuộn khối mới vào giữa khung và chụp clip quanh nó
  const clip = await evaluate(`(() => {
    const inputs = [...document.querySelectorAll('input[name^="alert_email_to_"]')];
    if (!inputs.length) return null;
    const head = [...document.querySelectorAll('div')].find(d => d.childNodes.length && [...d.childNodes].some(n => n.nodeType === 3 && n.textContent.includes('Email nhận riêng theo sự kiện')));
    const first = head || inputs[0];
    first.scrollIntoView({ block: 'start' });
    const y = window.scrollY + first.getBoundingClientRect().top - 16;
    window.scrollTo(0, y);
    const th = document.querySelector('input[name="alert_stock_low_threshold"]');
    const bottom = th ? window.scrollY + th.getBoundingClientRect().bottom + 70 : y + 700;
    return { x: 290, y, width: 1120, height: Math.min(bottom - y, 1200) };
  })()`);
  await sleep(700);
  if (clip) {
    const r = await send("Page.captureScreenshot", { format: "png", clip: { ...clip, scale: 1 }, captureBeyondViewport: true });
    writeFileSync(`${OUT}/2026-11-13-alerts-routing-admin.png`, Buffer.from(r.data, "base64"));
    console.log("SHOT 2026-11-13-alerts-routing-admin");
  } else ok(false, "không tính được clip chụp");

  if (old2fa === null) await prisma.setting.deleteMany({ where: { key: "admin_2fa_required" } });
  else await prisma.setting.upsert({ where: { key: "admin_2fa_required" }, create: { key: "admin_2fa_required", value: old2fa }, update: { value: old2fa } });
  console.log(failures ? `\n== shots-alerts-111: ${failures} FAIL ==` : "\n== shots-alerts-111: ALL PASS ==");
  chrome.kill();
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}
main().catch(async (e) => { console.error("FATAL", e); try { chrome.kill(); } catch {} await prisma.$disconnect().catch(() => {}); process.exit(1); });
