/** FIX7 TASK D + D': menu Steam (desktop + mobile), trang Top-Up (đặt 1 đơn
 *  thật qua mock FZR, tooltip cảnh báo ở ô Steam login), trang Gift Games
 *  (đặt 1 đơn thật), trang lịch sử Steam, highlight đúng 1 lá trên 3 route. */
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
  "--remote-debugging-port=9361", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9361/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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

const ACTIVE_LEAVES = `(() => {
  const nav = document.querySelector('aside nav') || document.querySelector('nav');
  if (!nav) return { count: -1, labels: [] };
  const act = [...nav.querySelectorAll('a')].filter((a) => a.className.includes('bg-brand-50') && a.className.includes('text-brand-700'));
  return { count: act.length, labels: act.map((a) => a.textContent.trim()) };
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
  await navigate(`${BASE}/`);
  await evaluate(`document.cookie = 'smmv2_session=${token}; path=/'; document.cookie = 'smmv2-lang=vi; path=/'; try { localStorage.setItem('smmv2-lang', 'vi'); } catch(e) {} 'set'`);

  // --- Menu Steam (desktop sidebar) ---
  await viewport(1440, 1100);
  await navigate(`${BASE}/dashboard/don-hang`);
  const menuState = await evaluate(`(() => {
    const nav = document.querySelector('aside nav') || document.querySelector('nav');
    const btns = [...nav.querySelectorAll('button')];
    const steamBtn = btns.find((b) => b.textContent.trim().startsWith('Steam'));
    if (steamBtn) steamBtn.click();
    return { found: !!steamBtn };
  })()`);
  ok(menuState.found, "menu desktop: thấy nhóm Steam");
  await sleep(600);
  const steamKids = await evaluate(`(() => {
    const nav = document.querySelector('aside nav') || document.querySelector('nav');
    return [...nav.querySelectorAll('a')].filter((a) => (a.getAttribute('href') || '').includes('/dashboard/steam/')).map((a) => a.textContent.trim());
  })()`);
  console.log("steam children:", JSON.stringify(steamKids));
  ok(steamKids.length === 3, `menu Steam có đúng 3 mục con (${steamKids.length})`);
  await capture("2026-11-08-steam-menu-desktop");

  // --- TOP-UP: mở trang, tooltip cảnh báo, đặt đơn ---
  await navigate(`${BASE}/dashboard/steam/top-up`);
  let hl = await evaluate(ACTIVE_LEAVES);
  ok(hl.count === 1 && hl.labels[0].includes("Top-Up"), `highlight top-up: đúng 1 lá (${JSON.stringify(hl.labels)})`);
  const tu = await evaluate(`(() => {
    const denoms = [...document.querySelectorAll('button')].filter((b) => /USD$/.test(b.textContent.trim().split('\\n')[0] || '') || /^\\d+ USD/.test(b.textContent.trim())).map((b) => b.textContent.replace(/\\s+/g, ' ').trim());
    return {
      h1: document.querySelector('h1')?.textContent.trim(),
      denoms,
      ratesBtn: [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Tỉ giá')),
      currPills: [...document.querySelectorAll('span')].filter((s) => ['USD','RUB','KZT','UAH'].includes(s.textContent.trim())).map((s) => s.textContent.trim()),
      summaryHas: ['Giảm giá','Sẽ nhận','Quy đổi USD','Cần thanh toán'].filter((x) => document.body.textContent.includes(x)),
    };
  })()`);
  console.log("TOPUP:", JSON.stringify(tu));
  ok(tu.h1 === "Steam Top-Up (CIS)", "top-up: tiêu đề đúng");
  ok(tu.denoms.length === 2, `top-up: 2 mệnh giá fixture (${tu.denoms.join(' | ')})`);
  ok(tu.ratesBtn, "top-up: có nút Tỉ giá (mock trả rates)");
  ok(tu.currPills.join(",") === "USD,RUB,KZT,UAH", "top-up: đủ 4 pill loại tiền");
  ok(tu.summaryHas.length === 4, "top-up: Summary đủ 4 dòng");
  await capture("2026-11-08-steam-topup-desktop", true);
  await capture("2026-11-08-steam-group", true);
  // D': tooltip cảnh báo
  await evaluate(`(() => { const inp = document.querySelector('#steam-login'); const wrap = inp.closest('.relative'); const btn = wrap.querySelector('button'); btn.click(); return 'warn'; })()`);
  await sleep(500);
  const tip = await evaluate(`(() => { const el = document.querySelector('[role="tooltip"]'); return el ? { text: el.textContent.trim(), visible: el.offsetParent !== null || true } : null; })()`);
  console.log("TOOLTIP:", JSON.stringify(tip));
  ok(!!tip && tip.text.includes("Nhập sai login"), "D': tooltip cảnh báo hiện đúng nội dung");
  await capture("2026-11-08-steam-topup-tooltip-desktop", true);
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); 'esc'`);
  await sleep(300);
  const tipGone = await evaluate(`!document.querySelector('[role="tooltip"]')`);
  ok(tipGone, "D': Esc đóng tooltip");
  // Điền login + chọn mệnh giá 10 USD + Continue
  await evaluate(`(() => {
    const inp = document.querySelector('#steam-login');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, 'demo_steam'); inp.dispatchEvent(new Event('input', { bubbles: true }));
    const b10 = [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith('10 USD'));
    b10.click(); return 'filled';
  })()`);
  await sleep(400);
  const payText = await evaluate(`(() => { const rows = [...document.querySelectorAll('section')]; const sum = rows[rows.length - 1]; return sum ? sum.textContent.replace(/\\s+/g, ' ') : ''; })()`);
  console.log("SUMMARY:", payText.slice(0, 220));
  ok(payText.includes("10.000"), "top-up: Cần thanh toán = 10.000đ cho mệnh giá 10 USD");
  await evaluate(`(() => { const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Tiếp tục'); btn.click(); return 'submit'; })()`);
  await sleep(3500);
  let url = await evaluate(`location.href`);
  let bodyText = await evaluate(`document.body.innerText.slice(0, 400)`);
  ok(url.includes("/dashboard/steam/lich-su"), `top-up: đặt đơn xong -> chuyển lịch sử Steam (${url})`);
  ok(bodyText.includes("Đặt đơn thành công"), "top-up: flash thành công hiện");
  ok(bodyText.includes("PRE"), "top-up: đơn mới hiện trong lịch sử");

  // --- GIFT: tìm game, chọn phiên bản, đặt đơn ---
  await navigate(`${BASE}/dashboard/steam/gift-games`);
  hl = await evaluate(ACTIVE_LEAVES);
  ok(hl.count === 1 && hl.labels[0].includes("Gift"), `highlight gift: đúng 1 lá (${JSON.stringify(hl.labels)})`);
  const gf = await evaluate(`(() => ({
    h1: document.querySelector('h1')?.textContent.trim(),
    games: [...document.querySelectorAll('button')].filter((b) => b.textContent.includes('AppID')).map((b) => b.textContent.replace(/\\s+/g, ' ').trim()),
  }))()`);
  console.log("GIFT:", JSON.stringify(gf));
  ok(gf.games.length === 2, `gift: liệt kê 2 game fixture (${gf.games.join(' | ')})`);
  await capture("2026-11-08-steam-gift-desktop", true);
  // tìm kiếm client-side
  await evaluate(`(() => { const inp = document.querySelector('#sg-search'); const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(inp, 'elden'); inp.dispatchEvent(new Event('input', { bubbles: true })); return 'q'; })()`);
  await sleep(400);
  const filteredCount = await evaluate(`[...document.querySelectorAll('button')].filter((b) => b.textContent.includes('AppID')).length`);
  ok(filteredCount === 1, `gift: gõ "elden" lọc còn 1 game (${filteredCount})`);
  // chọn game + phiên bản thường + dán invite + Proceed
  await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('AppID')); b.click(); return 'pick'; })()`);
  await sleep(400);
  await evaluate(`(() => {
    const inp = document.querySelector('#sg-invite');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, 'https://s.team/p/p/fixture123'); inp.dispatchEvent(new Event('input', { bubbles: true }));
    return 'invite';
  })()`);
  await sleep(400);
  const giftSummary = await evaluate(`document.body.innerText.includes('App ID') && document.body.innerText.includes('1245620') && document.body.innerText.includes('45.990')`);
  ok(giftSummary, "gift: Summary hiện App ID 1245620 + giá 45.990đ");
  await evaluate(`(() => { const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Tiến hành'); btn.click(); return 'submit'; })()`);
  await sleep(4000);
  url = await evaluate(`location.href`);
  bodyText = await evaluate(`document.body.innerText.slice(0, 500)`);
  ok(url.includes("/dashboard/steam/lich-su"), `gift: đặt đơn xong -> chuyển lịch sử Steam (${url})`);
  ok(bodyText.includes("Đặt đơn thành công"), "gift: flash thành công hiện");

  // --- LỊCH SỬ STEAM ---
  hl = await evaluate(ACTIVE_LEAVES);
  ok(hl.count === 1 && hl.labels[0].includes("Đơn hàng Steam"), `highlight lịch sử: đúng 1 lá (${JSON.stringify(hl.labels)})`);
  const hist = await evaluate(`(() => ({
    statTotal: document.body.innerText.includes('Tổng số đơn'),
    cards: [...document.querySelectorAll('.card')].filter((c) => /PRE\\d+/.test(c.textContent)).length,
    badges: ['Top-Up', 'Gift'].filter((x) => document.body.innerText.includes(x)),
  }))()`);
  console.log("HISTORY:", JSON.stringify(hist));
  ok(hist.cards === 2, `lịch sử: đúng 2 đơn Steam vừa đặt (${hist.cards})`);
  ok(hist.badges.length === 2, "lịch sử: có cả badge Top-Up và Gift");
  await capture("2026-11-08-steam-orders-desktop", true);

  // --- 390 ---
  await viewport(390, 844);
  await navigate(`${BASE}/dashboard/steam/top-up`);
  await evaluate(`document.querySelector('#steam-login')?.scrollIntoView({ block: 'center' }); 's'`);
  await sleep(400);
  await capture("2026-11-08-steam-topup-390", true);
  await navigate(`${BASE}/dashboard/steam/gift-games`);
  await capture("2026-11-08-steam-gift-390", true);
  await navigate(`${BASE}/dashboard/steam/lich-su`);
  await capture("2026-11-08-steam-orders-390", true);
  // menu mobile: mở ngăn kéo + nhóm Steam
  await navigate(`${BASE}/`);
  await sleep(600);
  await evaluate(`(() => { const b = document.querySelector('[data-burger-btn]'); if (b) b.click(); return 'burger'; })()`);
  await sleep(700);
  await evaluate(`(() => { const btns = [...document.querySelectorAll('button')]; const sb = btns.filter((b) => b.textContent.trim().startsWith('Steam')).pop(); if (sb) sb.click(); return 'steam-group'; })()`);
  await sleep(600);
  await capture("2026-11-08-steam-menu-mobile");

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAIL`);
  chrome.kill();
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
