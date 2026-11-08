/** Fix3: bỏ trang tổng quan + trang chủ là nhà của site + storefront theo theme
 *  chung sáng/tối. Kiểm chứng: đăng nhập thật đáp "/", /dashboard nảy về "/",
 *  trang chủ sáng 1440/390 + tối 1440, /premium + /gio-hang sáng; đo màu nền
 *  thực tế và xác nhận không còn khối thống kê nào trên trang chủ. */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });
const stamp = "2026-11-07-fix3";

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--remote-debugging-port=9339", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9339/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
async function navigate(url, waitMs = 2200) { await send("Page.navigate", { url }); await sleep(waitMs); }
async function capture(name) {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name);
}
async function captureFull(name) {
  const m = await send("Page.getLayoutMetrics");
  const cs = m.cssContentSize || m.contentSize;
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: cs.width, height: Math.min(cs.height, 4500), scale: 1 } });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name, `${cs.width}x${cs.height}`);
}
async function viewport(width, height) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 500 });
}

const probe = `(() => {
  const bodyBg = getComputedStyle(document.body).backgroundColor;
  const txt = document.body.innerText || "";
  const stats = ["Số dư khả dụng", "Thống kê đơn hàng", "Tổng đơn hàng", "Giao dịch thành công"].filter((s) => txt.includes(s));
  const darkEls = [...document.querySelectorAll("div,section,header,footer")].slice(0, 400).filter((el) => {
    const bg = getComputedStyle(el).backgroundColor;
    return bg === "rgb(7, 9, 13)" || bg === "rgb(10, 15, 30)";
  }).length;
  return { bodyBg, statsFound: stats, pitchDarkEls: darkEls, darkMode: document.documentElement.classList.contains("dark"), path: location.pathname };
})()`;

async function main() {
  ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
  };
  const t = await send("Target.createTarget", { url: "about:blank" });
  const att = await send("Target.attachToTarget", { targetId: t.targetId, flatten: true });
  sessionId = att.sessionId;
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Network.setCookie", { name: "smmv2-lang", value: "vi", domain: "127.0.0.1", path: "/" });

  // 1) Trang chủ SÁNG — khách vãng lai
  await viewport(1440, 1000);
  await navigate(`${BASE}/`);
  console.log("PROBE home light:", JSON.stringify(await evaluate(probe)));
  await capture(`${stamp}-home-light-desktop`);
  await captureFull(`${stamp}-home-light-desktop-full`);
  await viewport(390, 844);
  await navigate(`${BASE}/`);
  await capture(`${stamp}-home-light-390`);
  await captureFull(`${stamp}-home-light-390-full`);

  // 2) /premium + /gio-hang sáng
  await viewport(1440, 1000);
  await navigate(`${BASE}/premium`);
  await capture(`${stamp}-premium-light-desktop`);
  await navigate(`${BASE}/gio-hang`);
  console.log("PROBE cart light:", JSON.stringify(await evaluate(probe)));
  await capture(`${stamp}-cart-light-desktop`);

  // 3) Trang chủ TỐI (bật dark mode thật qua localStorage rồi tải lại)
  await evaluate(`localStorage.setItem("smmv2-mode", "dark"); localStorage.setItem("smmv2-lang", "vi"); "ok"`);
  await navigate(`${BASE}/`);
  console.log("PROBE home dark:", JSON.stringify(await evaluate(probe)));
  await capture(`${stamp}-home-dark-desktop`);
  await evaluate(`localStorage.setItem("smmv2-mode", "light"); "ok"`);

  // 4) Đăng nhập THẬT bằng form -> phải đáp "/"; vào /dashboard -> nảy về "/"
  await navigate(`${BASE}/login`, 1500);
  await evaluate(`(() => {
    const set = (el, v) => { const p = Object.getPrototypeOf(el); const d = Object.getOwnPropertyDescriptor(p, "value"); d.set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };
    set(document.querySelector('input[name="login"]'), "demo");
    set(document.querySelector('input[name="password"]'), "Demo@123");
    document.querySelector('form').requestSubmit();
    return "submitted";
  })()`);
  await sleep(3500);
  console.log("AFTER LOGIN path:", await evaluate(`location.pathname`));
  await capture(`${stamp}-home-loggedin-desktop`);
  await navigate(`${BASE}/dashboard`, 2500);
  console.log("AFTER /dashboard path:", await evaluate(`location.pathname`));
  await evaluate(`fetch("/logout", { method: "POST" }).catch(() => null); "ok"`).catch(() => null);

  ws.close();
  chrome.kill();
  console.log("DONE");
  process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
