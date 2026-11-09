/** PICKER + FOOTER + FAQ (2026-11-09) — kiểm chứng qua CDP trên bản
 *  production :3000 (fixture: scripts/picker-fixture.ts):
 *    node scripts/shots-picker-footer-faq.mjs before|after
 *  before: chụp picker + footer + FAQ ở trạng thái hiện tại.
 *  after : chụp lại sau khi sửa + bấm đổi gói kiểm tra tổng tiền đi theo +
 *          mở/đóng accordion FAQ + thu danh sách link footer để đối chiếu. */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

const MODE = process.argv[2] === "after" ? "after" : "before";
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
const mint = (claims) => {
  const u = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sv: 0, iat: now, exp: now + 3600, ...claims })}`;
  return `${u}.${createHmac("sha256", secret).update(u).digest("base64url")}`;
};
const demoToken = mint({ uid: 2, role: "USER", username: "demo" });

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=old", "--disable-gpu", "--no-sandbox", "--disable-setuid-sandbox", "--hide-scrollbars",
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-picker",
  "--remote-debugging-port=9381", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9381/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
async function captureClip(name, rect, padTop = 8, padBottom = 8) {
  const r = await send("Page.captureScreenshot", {
    format: "png", captureBeyondViewport: true,
    clip: { x: Math.max(0, rect.x - 4), y: Math.max(0, rect.y - padTop), width: Math.min(rect.width + 8, 1600), height: rect.height + padTop + padBottom, scale: 1 },
  });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name);
}
async function setViewport(width, height, mobile) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: !!mobile });
}

const PICKER_RECT = `(() => {
  const h = [...document.querySelectorAll('h2')].find((e) => e.textContent.includes('Chọn gói'));
  if (!h) return null;
  const box = h.closest('section') || h.parentElement;
  box.scrollIntoView({ block: 'start' });
  const r = box.getBoundingClientRect();
  return { x: r.x, y: r.y + window.scrollY, width: r.width, height: r.height };
})()`;
const FOOTER_RECT = `(() => {
  const f = document.querySelector('footer');
  if (!f) return null;
  const r = f.getBoundingClientRect();
  return { x: r.x, y: r.y + window.scrollY, width: r.width, height: r.height };
})()`;
const TOTAL_OF = `(() => {
  const el = [...document.querySelectorAll('div')].find((e) => e.children.length && e.textContent.trim().startsWith('Tổng cộng'));
  const m = document.body.innerText.match(/Tổng cộng\\s*\\n?\\s*([\\d.]+đ)/);
  return m ? m[1] : null;
})()`;

async function pickerFlow(tag) {
  await send("Network.setCookie", { name: "smmv2-lang", value: "vi", url: BASE + "/", path: "/" });
  await navigate(`${BASE}/premium/picker-kiem-chung`, 4200);
  const rect = await evaluate(PICKER_RECT);
  ok(!!rect, `${tag}: tìm thấy khối chọn gói`);
  if (rect) await captureClip(tag === "picker-before" || tag === "picker-after-desktop" || tag === "picker-after-mobile" ? tag : tag, rect, 10, 10);
  const total1 = await evaluate(TOTAL_OF);
  await evaluate(`(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Gói 3 tháng'));
    if (btn) { btn.scrollIntoView({ block: 'center' }); btn.click(); }
    return !!btn;
  })()`);
  await sleep(700);
  const total2 = await evaluate(TOTAL_OF);
  ok(total1 && total2 && total1 !== total2, `${tag}: đổi gói -> tổng tiền đi theo (${total1} -> ${total2})`);
  const soldBtn = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Gói 6 tháng'));
    return btn ? { disabled: btn.disabled, text: btn.textContent.includes('Hết hàng') } : null;
  })()`);
  ok(soldBtn && soldBtn.disabled && soldBtn.text, `${tag}: gói hết hàng bị khoá + hiện 'Hết hàng'`);
}

async function footerFlow(name) {
  await send("Network.setCookie", { name: "smmv2-lang", value: "vi", url: BASE + "/", path: "/" });
  await navigate(`${BASE}/`, 4000);
  const rect = await evaluate(FOOTER_RECT);
  ok(!!rect, `${name}: tìm thấy footer`);
  if (rect) await captureClip(name, rect, 0, 0);
  const links = await evaluate(`[...document.querySelectorAll('footer a')].map((a) => a.getAttribute('href'))`);
  console.log(`FOOTER_LINKS ${JSON.stringify(links)}`);
}

async function faqFlow(name, exercise) {
  await send("Network.setCookie", { name: "smmv2-lang", value: "vi", url: BASE + "/", path: "/" });
  await navigate(`${BASE}/dashboard/faq`, 3800);
  const rect = await evaluate(`(() => {
    const h = [...document.querySelectorAll('h1')].find((e) => e.textContent.includes('Hỏi đáp'));
    const items = document.querySelectorAll('details');
    return { h1: !!h, count: items.length };
  })()`);
  ok(rect.h1 && rect.count >= 6, `${name}: trang FAQ có tiêu đề + ${rect.count} câu hỏi`);
  if (exercise) {
    const opened = await evaluate(`(() => {
      const d = document.querySelectorAll('details')[1];
      if (!d) return null;
      d.querySelector('summary').click();
      return d.open;
    })()`);
    await sleep(400);
    ok(opened === true, `${name}: bấm câu 2 -> mở được`);
    const closed = await evaluate(`(() => {
      const d = document.querySelectorAll('details')[1];
      d.querySelector('summary').click();
      return d.open;
    })()`);
    ok(closed === false, `${name}: bấm lại -> đóng được`);
  }
  await evaluate(`window.scrollTo(0, 0); 'top'`);
  await sleep(300);
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name);
}

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
  await setViewport(1440, 1100, false);

  // Cookie đặt ở tầng browser (Network.setCookie) — trang chủ có thể ghi đè
  // cookie ngôn ngữ bằng document.cookie nên phải ghim lại trước mỗi trang.
  const setLang = (lang) => send("Network.setCookie", { name: "smmv2-lang", value: lang, url: BASE + "/", path: "/" });
  await send("Network.setCookie", { name: "smmv2_session", value: demoToken, url: BASE + "/", path: "/" });
  await setLang("vi");
  await navigate(`${BASE}/`);

  if (MODE === "before") {
    await pickerFlow("2026-11-09-picker-before");
    await footerFlow("2026-11-09-footer-before");
    await faqFlow("2026-11-09-faq-before", false);
  } else {
    await pickerFlow("2026-11-09-picker-after-desktop");
    await footerFlow("2026-11-09-footer-after-desktop");
    await faqFlow("2026-11-09-faq-after-desktop", true);
    // EN chrome check cho FAQ
    await send("Network.setCookie", { name: "smmv2-lang", value: "en", url: BASE + "/", path: "/" });
    await navigate(`${BASE}/dashboard/faq`, 3500);
    const enText = await evaluate(`document.body.innerText.slice(0, 900)`);
    ok(/Frequently asked questions/i.test(enText), `faq-after: chrome tiếng Anh hiển thị (Frequently asked questions)`);
    await send("Network.setCookie", { name: "smmv2-lang", value: "vi", url: BASE + "/", path: "/" });
    // Mobile 390
    await setViewport(390, 844, true);
    await pickerFlow("2026-11-09-picker-after-mobile");
    await footerFlow("2026-11-09-footer-after-mobile");
    await faqFlow("2026-11-09-faq-after-mobile", false);
  }

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAIL`);
  chrome.kill();
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
