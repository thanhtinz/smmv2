// Đo TRƯỚC cho WS11-A (khoảng cách hero) + WS5 amendment (hàng lọc ngày).
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
const CHROME = "/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome";
const PORT = 9351, BASE = "http://127.0.0.1:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const proc = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, "--no-sandbox", "--disable-gpu", "--window-size=1440,1100", "--user-data-dir=/tmp/chrome-fix5-before", "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessChecks", "--allow-insecure-localhost", "about:blank"], { stdio: "ignore" });
async function cdp() { for (let i = 0; i < 40; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json`); if (r.ok) { const t = (await r.json()).find((x) => x.type === "page"); if (t) return t.webSocketDebuggerUrl; } } catch {} await sleep(400); } throw new Error("no cdp"); }
let id = 0; const pending = new Map();
const ws = new WebSocket(await cdp());
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Page.enable"); await send("Runtime.enable");
async function evl(expr) { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); return r.result?.result?.value; }
async function nav(url) { await send("Page.navigate", { url }); await sleep(3200); }
async function shot(name) { const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(`/home/hatch/workspace/smm-anh/${name}`, Buffer.from(r.result.data, "base64")); console.log("shot", name); }
async function setLangVi() { await evl(`(() => { try { localStorage.setItem('smmv2-lang','vi'); document.cookie = 'smmv2-lang=vi; path=/'; } catch(e){} })()`); }
// Hero gap: header bottom vs hero section top
await nav(`${BASE}/`); await setLangVi(); await nav(`${BASE}/`);
const gap = await evl(`(() => { const h = document.querySelector('header').getBoundingClientRect(); const hero = document.querySelector('main section'); if (!hero) return null; const r = hero.getBoundingClientRect(); return { headerBottom: Math.round(h.bottom), heroTop: Math.round(r.top), gap: Math.round(r.top - h.bottom) }; })()`);
console.log("HERO GAP BEFORE:", JSON.stringify(gap));
await shot("2026-11-07-fix5-header-hero-before.png");
// Hàng lọc ngày: đăng nhập demo -> lịch sử Telegram
await nav(`${BASE}/login`);
await evl(`(() => { const pick = (sel, val) => { const el = document.querySelector(sel); if (!el) return false; const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(el, val); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; }; pick('input[name="login"]', 'demo'); pick('input[name="password"]', 'Demo@123'); return true; })()`);
await evl(`(() => { const f = [...document.querySelectorAll('form')].find((x) => x.querySelector('input[name="password"]')); f && f.requestSubmit(); return !!f; })()`);
await sleep(3000);
await nav(`${BASE}/dashboard/telegram/lich-su`); await setLangVi(); await nav(`${BASE}/dashboard/telegram/lich-su`);
const heights = await evl(`(() => [...document.querySelectorAll('input, select')].slice(0, 8).map((el) => ({ tag: el.tagName, type: el.type || '', h: Math.round(el.getBoundingClientRect().height), fs: getComputedStyle(el).fontSize })))()`);
console.log("FILTER HEIGHTS BEFORE:", JSON.stringify(heights));
await shot("2026-11-07-fix5-dates-before.png");
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await nav(`${BASE}/dashboard/telegram/lich-su`);
await shot("2026-11-07-fix5-dates-before-390.png");
ws.close(); proc.kill(); process.exit(0);
