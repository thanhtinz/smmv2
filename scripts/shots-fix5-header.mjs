// Kiểm WS11 (khoảng cách hero SAU, tìm kiếm header, nút Telegram nổi) +
// WS5 amendment (hàng lọc ngày SAU). Nút nổi: script tự chèn 2 dòng widget
// (Telegram + Zalo) qua API test riêng — ở đây chỉ chụp trạng thái trang chủ
// theo tham số môi trường WIDGETS=on|off do script cha điều khiển qua DB.
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
const CHROME = "/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome";
const PORT = 9352, BASE = "http://127.0.0.1:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const proc = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, "--no-sandbox", "--disable-gpu", "--window-size=1440,1100", "--user-data-dir=/tmp/chrome-fix5-header", "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessChecks", "--allow-insecure-localhost", "about:blank"], { stdio: "ignore" });
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

// 1) Hero gap SAU (desktop)
await nav(`${BASE}/`); await setLangVi(); await nav(`${BASE}/`);
const gap = await evl(`(() => { const h = document.querySelector('header').getBoundingClientRect(); const hero = document.querySelector('main section'); const r = hero.getBoundingClientRect(); return Math.round(r.top - h.bottom); })()`);
console.log("HERO GAP AFTER (desktop):", gap);
check(gap === 24, `hero gap desktop = 24px (thực tế ${gap})`);
await shot("2026-11-07-fix5-header-hero-after.png");

// 2) Tìm kiếm header — desktop: bấm kính lúp, ô mở rộng, gõ + Enter
const hasSearchBtn = await evl(`!!document.querySelector('header button[aria-label="Tìm kiếm"]')`);
check(hasSearchBtn, "header: có nút kính lúp tìm kiếm");
await evl(`document.querySelector('header button[aria-label="Tìm kiếm"]').click()`);
await sleep(500);
const expanded = await evl(`(() => { const i = document.querySelector('header form[action="/premium"] input[name="q"]'); if (!i) return null; const r = i.getBoundingClientRect(); return { w: Math.round(r.width), visible: r.width > 100 }; })()`);
check(expanded && expanded.visible, `header search desktop mở rộng (w=${expanded?.w})`);
await shot("2026-11-07-fix5-header-search-desktop.png");
await evl(`(() => { const i = document.querySelector('header form[action="/premium"] input[name="q"]'); const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(i, 'youtube'); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); i.form.requestSubmit(); return true; })()`);
await sleep(3200);
const afterSearch = await evl(`({ url: location.href, h1: document.querySelector('h1')?.innerText || '', hasYt: document.body.innerText.includes('YouTube Premium'), hasNetflix: document.body.innerText.includes('Netflix') })`);
check(afterSearch.url.includes("/premium") && afterSearch.url.includes("q=youtube"), `search submit -> ${afterSearch.url}`);
check(afterSearch.hasYt && !afterSearch.hasNetflix, "search: kết quả đã lọc (có YouTube, không Netflix)");

// 3) Hàng lọc ngày SAU (desktop) — lịch sử Telegram cần đăng nhập
await nav(`${BASE}/login`);
await evl(`(() => { const pick = (sel, val) => { const el = document.querySelector(sel); if (!el) return false; const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(el, val); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; }; pick('input[name="login"]', 'demo'); pick('input[name="password"]', 'Demo@123'); return true; })()`);
await evl(`(() => { const f = [...document.querySelectorAll('form')].find((x) => x.querySelector('input[name="password"]')); f && f.requestSubmit(); return !!f; })()`);
await sleep(3000);
await nav(`${BASE}/dashboard/telegram/lich-su`); await setLangVi(); await nav(`${BASE}/dashboard/telegram/lich-su`);
const heights = await evl(`(() => [...document.querySelectorAll('input, select')].filter((el) => el.type !== 'hidden').slice(0, 6).map((el) => ({ type: el.type || el.tagName, h: Math.round(el.getBoundingClientRect().height), fs: getComputedStyle(el).fontSize })))()`);
console.log("FILTER HEIGHTS AFTER:", JSON.stringify(heights));
const dates = heights.filter((x) => x.type === "date");
check(dates.length > 0 && dates.every((d) => d.fs === "13px"), "dates: cỡ chữ giá trị 13px gọn");
check(dates.every((d) => heights.filter((x) => x.type === "text").every((t) => Math.abs(t.h - d.h) <= 1)), "dates: chiều cao bằng ô text cùng hàng (±1px)");
await shot("2026-11-07-fix5-dates-after.png");

// 4) Mobile 390: hero gap + panel tìm kiếm trượt xuống + hàng lọc ngày
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await nav(`${BASE}/`);
const gapM = await evl(`(() => { const h = document.querySelector('header').getBoundingClientRect(); const hero = document.querySelector('main section'); const r = hero.getBoundingClientRect(); return Math.round(r.top - h.bottom); })()`);
console.log("HERO GAP AFTER (mobile):", gapM);
check(gapM === 20, `hero gap mobile = 20px (thực tế ${gapM})`);
await evl(`document.querySelector('header button[aria-label="Tìm kiếm"]').click()`);
await sleep(600);
const panel = await evl(`(() => { const f = [...document.querySelectorAll('header form')].find((x) => x.className.includes('absolute')); if (!f) return null; const r = f.getBoundingClientRect(); return { w: Math.round(r.width), top: Math.round(r.top) }; })()`);
check(!!panel && panel.w >= 380, `mobile: panel tìm kiếm full-width (w=${panel?.w})`);
await shot("2026-11-07-fix5-header-search-390.png");
await nav(`${BASE}/dashboard/telegram/lich-su`);
await shot("2026-11-07-fix5-dates-after-390.png");
console.log(fails.length ? `FAILURES: ${fails.length}` : "ALL PASS");
ws.close(); proc.kill(); process.exit(fails.length ? 1 : 0);
