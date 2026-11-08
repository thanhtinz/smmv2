// Ảnh + ma trận highlight WS10: menu khách không còn dropdown Premium,
// 2 mục phẳng sau Trang chủ; heading danh sách = "Tất cả sản phẩm".
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
const CHROME = "/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome";
const PORT = 9349, BASE = "http://127.0.0.1:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const proc = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, "--no-sandbox", "--disable-gpu", "--window-size=1440,1100", "--user-data-dir=/tmp/chrome-fix5-mp", "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessChecks", "--allow-insecure-localhost", "about:blank"], { stdio: "ignore" });
async function cdp() { for (let i = 0; i < 40; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json`); if (r.ok) { const t = (await r.json()).find((x) => x.type === "page"); if (t) return t.webSocketDebuggerUrl; } } catch {} await sleep(400); } throw new Error("no cdp"); }
let id = 0; const pending = new Map();
const ws = new WebSocket(await cdp());
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Page.enable"); await send("Runtime.enable");
async function evl(expr) { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result?.result?.value; }
async function nav(url) { await send("Page.navigate", { url }); await sleep(3200); }
async function shot(name) { const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(`/home/hatch/workspace/smm-anh/${name}`, Buffer.from(r.result.data, "base64")); console.log("shot", name); }
async function setLangVi() { await evl(`(() => { try { localStorage.setItem('smmv2-lang','vi'); document.cookie = 'smmv2-lang=vi; path=/'; } catch(e){} })()`); }
async function login() {
  await nav(`${BASE}/login`); await setLangVi();
  await evl(`(() => { const pick = (sel, val) => { const el = document.querySelector(sel); if (!el) return false; const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(el, val); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; }; pick('input[name="login"]', 'demo'); pick('input[name="password"]', 'Demo@123'); return true; })()`);
  await evl(`(() => { const f = [...document.querySelectorAll('form')].find((x) => x.querySelector('input[name="password"]')); f && f.requestSubmit(); return !!f; })()`);
  await sleep(3000);
}
const fails = [];
const check = (c, l) => { console.log((c ? "PASS " : "FAIL ") + l); if (!c) fails.push(l); };
const pillsOf = () => evl(`(() => { const aside = document.querySelector('aside'); if (!aside) return []; return [...aside.querySelectorAll('a')].filter((a) => a.className.includes('bg-brand-50')).map((a) => a.innerText.trim().split('\\n')[0]); })()`);
const menuLabels = () => evl(`(() => { const aside = document.querySelector('aside'); if (!aside) return ''; return aside.innerText; })()`);

await login();
// Ma trận highlight trên các trang dashboard (có sidebar desktop)
for (const [path, expect] of [
  ["/dashboard/ho-so", ["Hồ sơ"]],
  ["/dashboard/don-premium", ["Đơn Premium của tôi"]],
  ["/dashboard/premium", []],
  ["/dashboard/premium/youtube-premium", []],
  ["/dashboard/dat-hang", ["Đặt đơn SMM"]],
]) {
  await nav(`${BASE}${path}`);
  const pills = await pillsOf();
  const same = JSON.stringify(pills) === JSON.stringify(expect);
  check(same, `matrix ${path} -> [${pills.join(" | ") || "—"}] (kỳ vọng [${expect.join(" | ") || "—"}])`);
}
// Cấu trúc menu: không còn nhóm Premium, có 2 mục phẳng theo đúng thứ tự
await nav(`${BASE}/dashboard/ho-so`);
const labels = await menuLabels();
check(!labels.includes("Mua Premium"), "menu: không còn mục 'Mua Premium'");
const idxHome = labels.indexOf("Trang chủ"), idxAll = labels.indexOf("Tất cả sản phẩm"), idxMine = labels.indexOf("Đơn Premium của tôi"), idxSmm = labels.indexOf("Đơn SMM");
check(idxAll > idxHome && idxMine > idxAll && idxSmm > idxMine, `menu: thứ tự Trang chủ < Tất cả sản phẩm < Đơn Premium của tôi < Đơn SMM (${idxHome},${idxAll},${idxMine},${idxSmm})`);
await shot("2026-11-07-fix5-menu-premium-desktop.png");
// /premium (mặt tiền, đã đăng nhập): heading + mở ngăn kéo mobile
await nav(`${BASE}/premium`); await setLangVi(); await nav(`${BASE}/premium`);
const h1 = await evl(`document.querySelector('h1')?.innerText || ''`);
check(h1.includes("Tất cả sản phẩm"), `listing /premium heading: "${h1}"`);
await evl(`(() => { const b = document.querySelector('header button'); b && b.click(); return true; })()`);
await sleep(1200);
const drawerText = await evl(`document.body.innerText`);
check(drawerText.includes("Tất cả sản phẩm") && drawerText.includes("Đơn Premium của tôi"), "drawer: có 2 mục phẳng mới");
await shot("2026-11-07-fix5-menu-premium-listing.png");
// Mobile 390: ngăn kéo
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await nav(`${BASE}/dashboard/ho-so`);
await evl(`(() => { const b = document.querySelector('header button'); b && b.click(); return true; })()`);
await sleep(1200);
await shot("2026-11-07-fix5-menu-premium-mobile.png");
console.log(fails.length ? `FAILURES: ${fails.length}` : "ALL PASS");
ws.close(); proc.kill(); process.exit(fails.length ? 1 : 0);
