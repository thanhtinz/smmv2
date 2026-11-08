// Ảnh WS9: thẻ gói có huy hiệu Giao nhanh/Giao chậm + Hết hàng + đếm kho;
// trang admin sửa gói có trường kho/loại giao; AUTO_STOCK giữ hành vi cũ.
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
const CHROME = "/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome";
const PORT = 9348, BASE = "http://127.0.0.1:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const proc = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, "--no-sandbox", "--disable-gpu", "--window-size=1440,1100", "--user-data-dir=/tmp/chrome-fix5-stock", "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessChecks", "--allow-insecure-localhost", "about:blank"], { stdio: "ignore" });
async function cdp() {
  for (let i = 0; i < 40; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json`); if (r.ok) { const t = (await r.json()).find((x) => x.type === "page"); if (t) return t.webSocketDebuggerUrl; } } catch {} await sleep(400); }
  throw new Error("no cdp");
}
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
async function login(user, pass) {
  await nav(`${BASE}/login`); await setLangVi();
  await evl(`(() => { const pick = (sel, val) => { const el = document.querySelector(sel); if (!el) return false; const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(el, val); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; }; pick('input[name="login"]', ${JSON.stringify(user)}); pick('input[name="password"]', ${JSON.stringify(pass)}); return true; })()`);
  await evl(`(() => { const f = [...document.querySelectorAll('form')].find((x) => x.querySelector('input[name="password"]')); f && f.requestSubmit(); return !!f; })()`);
  await sleep(3000);
}
const fails = [];
const check = (c, l) => { console.log((c ? "PASS " : "FAIL ") + l); if (!c) fails.push(l); };

// 1) Chi tiết (đã đăng nhập demo): v1 kho 2 + Giao chậm; v2 Hết hàng; v3 Giao nhanh
await login("demo", "Demo@123");
await nav(`${BASE}/premium/youtube-premium`); await setLangVi(); await nav(`${BASE}/premium/youtube-premium`);
const detailText = await evl(`document.body.innerText`);
check(detailText.includes("Giao chậm"), "detail: huy hiệu Giao chậm (mặc định MANUAL)");
check(detailText.includes("Giao nhanh"), "detail: huy hiệu Giao nhanh (ghi đè FAST)");
check(detailText.includes("Hết hàng"), "detail: gói bị cờ hiện Hết hàng");
check(detailText.includes("Còn 2") && detailText.includes("trong kho"), "detail: hiện số kho theo dõi 'Còn 2 trong kho'");
const soldOutBtn = await evl(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('Hết hàng')); return b ? b.disabled : null; })()`);
check(soldOutBtn === true, "detail: thẻ gói Hết hàng bị disabled (không chọn được)");
await shot("2026-11-07-fix5-stock-detail.png");

// 2) AUTO_STOCK: netflix — hành vi cũ (đếm dòng kho / giao tay)
await nav(`${BASE}/premium/netflix-premium`); await setLangVi(); await nav(`${BASE}/premium/netflix-premium`);
const autoText = await evl(`document.body.innerText`);
check(autoText.includes("trong kho") || autoText.includes("giao tay"), "AUTO_STOCK: vẫn hiện đếm kho/giao tay như cũ");
check(autoText.includes("Giao nhanh"), "AUTO_STOCK: mặc định Giao nhanh");

// 3) Admin: mở modal Gói bán của YouTube — thấy trường kho + loại giao hàng
await login("admin", "Admin@123");
await nav(`${BASE}/admin/premium`); await setLangVi(); await nav(`${BASE}/admin/premium`);
await evl(`(() => { const rows = [...document.querySelectorAll('tr')]; const yt = rows.find((r) => r.innerText.includes('YouTube')); const btn = yt ? [...yt.querySelectorAll('button')].find((b) => b.innerText.includes('Gói')) : [...document.querySelectorAll('button')].find((b) => b.innerText.includes('Gói bán')); btn && btn.click(); return !!btn; })()`);
await sleep(1500);
const adminText = await evl(`document.body.innerText`);
check(adminText.includes("Loại giao hàng"), "admin: có chọn Loại giao hàng trong sửa gói");
check(adminText.includes("Hết hàng (chặn đặt)"), "admin: có cờ Hết hàng (chặn đặt)");
const hasStockInput = await evl(`!!document.querySelector('input[name="stockQty"]')`);
check(hasStockInput === true, "admin: có ô Số lượng kho (stockQty)");
await shot("2026-11-07-fix5-stock-admin.png");

console.log(fails.length ? `FAILURES: ${fails.length}` : "ALL PASS");
ws.close(); proc.kill(); process.exit(fails.length ? 1 : 0);
