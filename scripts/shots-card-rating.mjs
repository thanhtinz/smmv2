/** NGHIỆM THU dòng "★ 4.0 (2) · Đã bán 43" trên thẻ sản phẩm (lệnh Tín
 *  2026-11-12): node scripts/shots-card-rating.mjs
 *  Điều kiện: server production :3000 + fixture scripts/card-rating-fixture.ts.
 *  1. Thẻ Fixture A (2 đánh giá 4★, 43 đơn): dòng meta đúng "4.0 (2) · Đã bán 43".
 *  2. Thẻ Fixture B (0 đánh giá, 7 đơn): chỉ "Đã bán 7" — không sao, không "0.0".
 *  3. Thẻ Fixture C (0 đánh giá, 0 đơn): chỉ "Đã bán 0".
 *  4. Dòng meta ghim NGAY TRÊN hàng nút Xem (khoảng cách = pt-2.5 = 10px),
 *     cao đúng 16px, không quấn dòng, không tràn ngang trang.
 *  5. Thẻ cùng hàng cao BẰNG NHAU tuyệt đối (trang chủ + /premium, 1440 + 390).
 *  Ảnh: 2026-11-12-card-rating-desktop.png + -mobile.png (lưới nổi bật). */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });
let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; };

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=old", "--disable-gpu", "--no-sandbox", "--disable-setuid-sandbox", "--hide-scrollbars",
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-card-rating",
  "--remote-debugging-port=9412", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9412/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
async function navigate(url, waitMs = 3200) { await send("Page.navigate", { url }); await sleep(waitMs); }
async function setViewport(width, height, mobile) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: !!mobile });
}
async function captureViewport(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name);
}

const MEASURE = `(() => {
  const cards = [...document.querySelectorAll('a.card')];
  const norm = (s) => (s || "").replace(/\\s+/g, " ").trim();
  const items = cards.map((c) => {
    const r = c.getBoundingClientRect();
    const meta = c.querySelector('.mt-auto > div');
    const cta = meta ? meta.nextElementSibling : null;
    // Khe THẤY ĐƯỢC = tới nội dung CTA: hàng CTA mang pt-2.5 (padding trong
    // hộp) nên phải đo tới phần tử con đầu tiên, không phải mép hộp chứa.
    const ctaInner = cta ? cta.firstElementChild : null;
    const nameEl = c.querySelector('.line-clamp-2');
    return {
      name: norm(nameEl ? nameEl.textContent : "").slice(0, 40),
      top: Math.round(r.top + window.scrollY), height: Math.round(r.height * 10) / 10,
      metaText: meta ? norm(meta.innerText) : null,
      metaH: meta ? Math.round(meta.getBoundingClientRect().height) : -1,
      metaScrollW: meta ? meta.scrollWidth : -1, metaClientW: meta ? meta.clientWidth : -1,
      gapAboveCta: meta && ctaInner ? Math.round((ctaInner.getBoundingClientRect().top - meta.getBoundingClientRect().bottom) * 10) / 10 : -1,
    };
  });
  const rows = new Map();
  for (const it of items) { if (!rows.has(it.top)) rows.set(it.top, []); rows.get(it.top).push(it.height); }
  let worstRowDiff = 0;
  for (const hs of rows.values()) { if (hs.length > 1) worstRowDiff = Math.max(worstRowDiff, Math.max(...hs) - Math.min(...hs)); }
  return {
    count: items.length, items, worstRowDiff,
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
  };
})()`;

const findCard = (prefix) => `(() => {
  const c = [...document.querySelectorAll('a.card')].find((x) => (x.textContent || "").includes(${JSON.stringify(prefix)}));
  if (!c) return false; c.scrollIntoView({ block: "center" }); return true;
})()`;

async function checkFixtures(tag) {
  const m = await evaluate(MEASURE);
  const A = m.items.find((i) => i.name.startsWith("Fixture A"));
  const B = m.items.find((i) => i.name.startsWith("Fixture B"));
  const C = m.items.find((i) => i.name.startsWith("Fixture C"));
  ok(!!A && A.metaText === "4.0 (2) · Đã bán 43", `${tag}: thẻ A dòng meta đúng "4.0 (2) · Đã bán 43" (thực tế: ${A ? JSON.stringify(A.metaText) : "không thấy thẻ"})`);
  ok(!!B && B.metaText === "Đã bán 7", `${tag}: thẻ B chỉ "Đã bán 7", không sao bịa (thực tế: ${B ? JSON.stringify(B.metaText) : "không thấy thẻ"})`);
  ok(!!C && C.metaText === "Đã bán 0", `${tag}: thẻ C chỉ "Đã bán 0" (thực tế: ${C ? JSON.stringify(C.metaText) : "không thấy thẻ"})`);
  const allMetaOk = m.items.every((i) => i.metaH === 16 && i.metaScrollW <= i.metaClientW + 1);
  ok(allMetaOk, `${tag}: mọi dòng meta cao đúng 16px, không quấn/tràn (n=${m.count})`);
  const gaps = m.items.map((i) => i.gapAboveCta).filter((g) => g >= 0);
  ok(gaps.length === m.count && gaps.every((g) => Math.abs(g - 10) <= 1.5), `${tag}: dòng meta ghim ngay trên nút Xem, khe 10px (min ${Math.min(...gaps)}, max ${Math.max(...gaps)})`);
  ok(m.worstRowDiff <= 1, `${tag}: thẻ cùng hàng cao bằng nhau (lệch tối đa ${m.worstRowDiff}px)`);
  ok(!m.overflowX, `${tag}: không tràn ngang trang`);
  return m;
}

async function main() {
  ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
  };
  try {
    const t = await send("Target.createTarget", { url: "about:blank" });
    sessionId = (await send("Target.attachToTarget", { targetId: t.targetId, flatten: true })).sessionId;
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Network.enable");
    await send("Network.setCookie", { name: "smmv2-lang", value: "vi", url: BASE + "/", path: "/" });

    // --- Desktop 1440: trang chủ ---
    await setViewport(1440, 1100, false);
    await navigate(`${BASE}/`, 3500);
    await evaluate(`(() => { try { localStorage.setItem("smmv2-lang", "vi"); document.cookie = "smmv2-lang=vi; path=/; max-age=31536000; samesite=lax"; } catch (e) {} return true; })()`);
    await navigate(`${BASE}/`, 3500);
    await checkFixtures("desktop/trang chủ");
    await evaluate(findCard("Fixture A"));
    await sleep(700);
    await captureViewport("2026-11-12-card-rating-desktop");

    // --- Desktop: /premium đồng nhất ---
    await navigate(`${BASE}/premium`, 3500);
    await checkFixtures("desktop//premium");

    // --- Mobile 390: trang chủ ---
    await setViewport(390, 844, true);
    await navigate(`${BASE}/`, 3500);
    await checkFixtures("mobile/trang chủ");
    await evaluate(findCard("Fixture A"));
    await sleep(700);
    await captureViewport("2026-11-12-card-rating-mobile");
  } finally {
    try { chrome.kill(); } catch { /* đã tắt */ }
  }
  console.log(failures === 0 ? "ALL PASS" : `${failures} FAIL`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
