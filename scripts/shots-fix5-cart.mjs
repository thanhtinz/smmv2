// E2E WS13: giỏ 3 bước — seed 2 dòng qua localStorage (đúng định dạng
// CartItem của nút thêm ở trang chi tiết), chạy bước 1 -> 2 -> 3 thật,
// kiểm trạng thái thiếu số dư + xoá tất cả + giỏ trống.
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
const CHROME = "/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome";
const PORT = 9354, BASE = "http://127.0.0.1:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const proc = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, "--no-sandbox", "--disable-gpu", "--window-size=1440,1200", "--user-data-dir=/tmp/chrome-fix5-cart3", "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessChecks", "--allow-insecure-localhost", "about:blank"], { stdio: "ignore" });
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
const fails = [];
const check = (c, l) => { console.log((c ? "PASS " : "FAIL ") + l); if (!c) fails.push(l); };
const seedCart = (items) => evl(`(() => { localStorage.setItem('smmv2-cart-v1', ${JSON.stringify(JSON.stringify(items))}); return true; })()`);
const LINE_A = { variantId: 1, productId: 1, productName: "YouTube Premium", variantName: "1 tháng — slot Family", image: null, price: 55000, qty: 1, custom: {}, buyerInfo: "demo@example.com", stockCap: null, delivery: "SLOW", group: null };
const LINE_B = { variantId: 4, productId: 2, productName: "Netflix Premium 4K", variantName: "1 tháng — 1 profile 4K", image: null, price: 70000, qty: 1, custom: {}, buyerInfo: null, stockCap: 3, delivery: "FAST", group: null };

// Đăng nhập demo
await nav(`${BASE}/login`); await setLangVi();
await evl(`(() => { const pick = (sel, val) => { const el = document.querySelector(sel); if (!el) return false; const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(el, val); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; }; pick('input[name="login"]', 'demo'); pick('input[name="password"]', 'Demo@123'); return true; })()`);
await evl(`(() => { const f = [...document.querySelectorAll('form')].find((x) => x.querySelector('input[name="password"]')); f && f.requestSubmit(); return !!f; })()`);
await sleep(3000);

// --- Trạng thái thiếu số dư trước: 2 x 499.000 > 500.000 ---
await seedCart([{ ...LINE_A, variantId: 3, variantName: "1 năm — slot Family", price: 499000, qty: 2, delivery: "FAST" }]);
await nav(`${BASE}/gio-hang`); await setLangVi(); await nav(`${BASE}/gio-hang`);
let text = await evl(`document.body.innerText`);
check(text.includes("Nạp thêm tiền"), "insufficient: nút chính = 'Nạp thêm tiền'");
const napHref = await evl(`(() => { const a = [...document.querySelectorAll('a')].find((x) => x.innerText.includes('Nạp thêm tiền')); return a ? a.getAttribute('href') : null; })()`);
check(napHref === "/dashboard/nap-tien", `insufficient: link tới trang nạp (${napHref})`);
await shot("2026-11-07-fix5-cart-insufficient.png");

// --- Bước 1 với 2 sản phẩm ---
await seedCart([LINE_A, LINE_B]);
await nav(`${BASE}/gio-hang`); await setLangVi(); await nav(`${BASE}/gio-hang`);
text = await evl(`document.body.innerText`);
for (const s of ["GIỎ HÀNG", "XÁC NHẬN", "HOÀN TẤT", "Danh sách sản phẩm (2)", "Tóm tắt đơn hàng", "Mã giảm giá", "Xác nhận đơn hàng", "Xem đơn hàng đã đặt", "Cập nhật giá", "Xóa tất cả", "2 sản phẩm", "125.000"]) check(text.includes(s), `step1: có "${s}"`);
check(!text.includes("Sản phẩm gợi ý"), "step1: không có mục gợi ý");
// Tìm trong giỏ: gõ "netflix" -> chỉ còn Netflix
await evl(`(() => { const i = [...document.querySelectorAll('input')].find((x) => x.placeholder && x.placeholder.includes('Tìm trong giỏ')); const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(i, 'netflix'); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
await sleep(700);
text = await evl(`document.body.innerText`);
check(text.includes("Netflix Premium 4K") && !text.includes("slot Family"), "step1: tìm trong giỏ lọc đúng (chỉ Netflix)");
await evl(`(() => { const i = [...document.querySelectorAll('input')].find((x) => x.placeholder && x.placeholder.includes('Tìm trong giỏ')); const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
await sleep(500);
await shot("2026-11-07-fix5-cart-step1.png");
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await shot("2026-11-07-fix5-cart-step1-390.png");
await send("Emulation.clearDeviceMetricsOverride", {});
await sleep(600);
// Cập nhật giá -> ghi chú thành công
await evl(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('Cập nhật giá')); b && b.click(); return !!b; })()`);
await sleep(2500);
text = await evl(`document.body.innerText`);
check(text.includes("Đã cập nhật giá mới nhất"), "step1: Cập nhật giá -> hiện ghi chú");

// --- Bước 2 ---
await evl(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Xác nhận đơn hàng'); b && b.click(); return !!b; })()`);
await sleep(900);
text = await evl(`document.body.innerText`);
for (const s of ["Số dư ví", "Sau thanh toán còn", "500.000", "375.000", "Thanh toán bằng ví", "Quay lại"]) check(text.includes(s), `step2: có "${s}"`);
await shot("2026-11-07-fix5-cart-step2.png");

// --- Bước 3: thanh toán thật ---
await evl(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('Thanh toán bằng ví')); b && b.click(); return !!b; })()`);
await sleep(4500);
text = await evl(`document.body.innerText`);
check(text.includes("Đặt hàng thành công"), "step3: thông báo thành công");
const codes = await evl(`(() => { const m = document.body.innerText.match(/PRE\\d{6}/g); return m ? [...new Set(m)] : []; })()`);
console.log("order codes:", JSON.stringify(codes));
check(codes.length === 2, `step3: đủ 2 mã đơn (${codes.length})`);
await shot("2026-11-07-fix5-cart-step3.png");

// --- Xoá tất cả + giỏ trống ---
await seedCart([LINE_A]);
await nav(`${BASE}/gio-hang`);
await evl(`(() => { window.confirm = () => true; const b = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('Xóa tất cả')); b && b.click(); return !!b; })()`);
await sleep(900);
text = await evl(`document.body.innerText`);
check(text.includes("Giỏ hàng đang trống"), "clear-all: giỏ trống sau khi xoá tất cả");
check(!text.includes("Sản phẩm gợi ý"), "empty: không có mục gợi ý");
check(!text.includes("GIỎ HÀNG"), "empty: ẩn thanh bước tiến");
await shot("2026-11-07-fix5-cart-empty.png");
console.log(fails.length ? `FAILURES: ${fails.length}` : "ALL PASS");
ws.close(); proc.kill(); process.exit(fails.length ? 1 : 0);
