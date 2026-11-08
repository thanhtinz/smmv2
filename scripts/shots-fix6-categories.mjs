/** TASK 11 (fix6): khu danh mục — before/after + test lọc click-through.
 *  node scripts/shots-fix6-categories.mjs before|after */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const PHASE = process.argv[2] || "before";
const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });
let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; };

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--remote-debugging-port=9356", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9356/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
async function navigate(url, waitMs = 2600) { await send("Page.navigate", { url }); await sleep(waitMs); }
async function capture(name) {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name);
}
async function viewport(width, height) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 500 });
}

const scrollToCats = () => evaluate(`(() => { const h = [...document.querySelectorAll('h2')].find((x) => x.textContent.includes('Danh mục sản phẩm')); if (h) { h.scrollIntoView({ block: 'center' }); return true; } return false; })()`);

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
  await navigate(`${BASE}/`);
  ok(await scrollToCats(), "thấy khối Danh mục sản phẩm");
  await sleep(600);
  await capture(`2026-11-08-categories-home-desktop-${PHASE}`);
  if (PHASE === "after") {
    // đo độ đều của lưới ô danh mục + test lọc: bấm ô danh mục thứ 2 -> lưới nổi bật lọc theo
    const tiles = await evaluate(`(() => {
      const h = [...document.querySelectorAll('h2')].find((x) => x.textContent.includes('Danh mục sản phẩm'));
      const sec = h.closest('section');
      const btns = [...sec.querySelectorAll('button')];
      return btns.map((b) => { const r = b.getBoundingClientRect(); return { text: b.textContent.replace(/\\s+/g, ' ').trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) }; });
    })()`);
    console.log("tiles:", JSON.stringify(tiles));
    const hs = new Set(tiles.map((x) => x.h));
    ok(tiles.length >= 3, `có ${tiles.length} ô danh mục (kể cả Tất cả)`);
    ok(hs.size === 1, `mọi ô cao bằng nhau (${[...hs].join(',')}px)`);
    ok(tiles.every((x) => /\\d+ sản phẩm/.test(x.text)), "mọi ô hiện số sản phẩm");
    const clicked = await evaluate(`(() => {
      const h = [...document.querySelectorAll('h2')].find((x) => x.textContent.includes('Danh mục sản phẩm'));
      const btns = [...h.closest('section').querySelectorAll('button')];
      const target = btns[1]; if (!target) return null;
      const name = target.textContent.replace(/\\s+/g, ' ').trim();
      target.click(); return name;
    })()`);
    await sleep(1200);
    const state = await evaluate(`(() => {
      const grid = document.getElementById('home-featured');
      const cards = grid ? [...grid.querySelectorAll('a[href^="/premium/"]')].length : 0;
      const h = [...document.querySelectorAll('h2')].find((x) => x.textContent.includes('Danh mục sản phẩm'));
      const active = [...h.closest('section').querySelectorAll('button')].filter((b) => b.className.includes('border-brand-500')).length;
      return { cards, active };
    })()`);
    console.log("sau click ô danh mục:", clicked, JSON.stringify(state));
    ok(state.active === 1, "đúng 1 ô danh mục ở trạng thái active sau click");
    ok(state.cards > 0, `lưới nổi bật còn ${state.cards} thẻ sau lọc`);
  }
  await viewport(390, 844);
  await navigate(`${BASE}/`);
  await scrollToCats();
  await sleep(600);
  await capture(`2026-11-08-categories-home-390-${PHASE}`);
  await viewport(1440, 1100);
  await navigate(`${BASE}/premium`);
  await evaluate("window.scrollTo(0, 430); 's'");
  await sleep(500);
  await capture(`2026-11-08-categories-listing-${PHASE}`);
  if (PHASE === "after") {
    // test lọc ở listing: chọn chip danh mục (radio) thứ 2 -> bấm Lọc -> URL có cat= + lưới đổi
    const chip = await evaluate(`(() => {
      const radios = [...document.querySelectorAll('input[type="radio"][name="cat"]')];
      if (radios.length < 2) return null;
      const r = radios[1]; r.click(); return r.value;
    })()`);
    ok(!!chip, `chọn được chip danh mục ở listing (cat=${chip})`);
    await evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Lọc')?.click(); 'filter'`);
    await sleep(2600);
    const url = await evaluate("location.href");
    ok(url.includes(`cat=${chip}`), `URL sau lọc mang cat=${chip}: ${url}`);
    const checked = await evaluate(`document.querySelector('input[type="radio"][name="cat"]:checked')?.value`);
    ok(checked === chip, "chip đã chọn vẫn ở trạng thái checked sau khi lọc");
  }
  console.log(failures === 0 ? "ALL PASS" : `${failures} FAIL`);
  chrome.kill();
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
