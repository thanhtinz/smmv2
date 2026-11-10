/** PICKER NOLOGO + FAQ BALANCE (2026-11-09):
 *    node scripts/shots-nologo-faqbalance.mjs before|after
 *  before: chụp picker (đã gỡ logo sản phẩm + icon header) + đo/chụp FAQ trước khi cân bằng.
 *  after : đo/chụp FAQ sau khi cân bằng (1440 + 390). */
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
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-nologo",
  "--remote-debugging-port=9383", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9383/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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

const PICKER_CHECK = `(() => {
  const h = [...document.querySelectorAll('h2')].find((e) => e.textContent.includes('Chọn gói'));
  if (!h) return null;
  const box = h.closest('section');
  const header = h.parentElement;
  return {
    headerChildren: header.children.length,
    headerText: header.textContent.trim(),
    imgsInPicker: box.querySelectorAll('img').length,
    letterTiles: [...box.querySelectorAll('span')].filter((s) => s.className.includes('h-10 w-10')).length,
  };
})()`;
const PICKER_RECT = `(() => {
  const h = [...document.querySelectorAll('h2')].find((e) => e.textContent.includes('Chọn gói'));
  if (!h) return null;
  const box = h.closest('section') || h.parentElement;
  box.scrollIntoView({ block: 'start' });
  const r = box.getBoundingClientRect();
  return { x: r.x, y: r.y + window.scrollY, width: r.width, height: r.height };
})()`;

const FAQ_MEASURE = `(() => {
  const h1 = [...document.querySelectorAll('h1')].find((e) => e.textContent.includes('Hỏi đáp'));
  if (!h1) return null;
  const head = h1.closest('.mb-6');
  const wrap = head.parentElement;
  const contentCol = wrap.parentElement;
  const details = document.querySelectorAll('details');
  const first = details[0];
  const last = details[details.length - 1];
  const aside = wrap.querySelector('aside');
  const docY = (el) => el.getBoundingClientRect().bottom + window.scrollY;
  return {
    questions: details.length,
    contentW: Math.round(contentCol.getBoundingClientRect().width),
    wrapW: Math.round(wrap.getBoundingClientRect().width),
    headW: Math.round(head.getBoundingClientRect().width),
    detailsW: first ? Math.round(first.getBoundingClientRect().width) : 0,
    asideW: aside ? Math.round(aside.getBoundingClientRect().width) : 0,
    accordionBottom: last ? Math.round(docY(last)) : 0,
    asideBottom: aside ? Math.round(docY(aside)) : 0,
    headLeft: Math.round(head.getBoundingClientRect().left),
    detailsLeft: first ? Math.round(first.getBoundingClientRect().left) : 0,
  };
})()`;

async function shotFaqClip(name) {
  const rect = await evaluate(`(() => {
    const h1 = [...document.querySelectorAll('h1')].find((e) => e.textContent.includes('Hỏi đáp'));
    if (!h1) return null;
    const head = h1.closest('.mb-6');
    const wrap = head.parentElement;
    window.scrollTo(0, 0);
    const r = wrap.getBoundingClientRect();
    return { x: r.x, y: r.y + window.scrollY, width: r.width, height: r.height };
  })()`);
  if (rect) await captureClip(name, rect, 10, 10);
  return rect;
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
  await send("Network.setCookie", { name: "smmv2_session", value: demoToken, url: BASE + "/", path: "/" });
  await send("Network.setCookie", { name: "smmv2-lang", value: "vi", url: BASE + "/", path: "/" });
  await navigate(`${BASE}/`);

  if (MODE === "before") {
    // Picker: logo sản phẩm + icon header đã gỡ
    await send("Network.setCookie", { name: "smmv2-lang", value: "vi", url: BASE + "/", path: "/" });
    await navigate(`${BASE}/premium/picker-kiem-chung`, 4200);
    const chk = await evaluate(PICKER_CHECK);
    ok(!!chk, "picker: tìm thấy khối chọn gói");
    if (chk) {
      ok(chk.imgsInPicker === 0, `picker: không còn ảnh/logo sản phẩm trong khối chọn gói (img=${chk.imgsInPicker})`);
      ok(chk.letterTiles === 0, `picker: không còn ô chữ cái thay logo (tiles=${chk.letterTiles})`);
      ok(chk.headerChildren === 1, `picker: header chỉ còn 1 phần tử (chữ tiêu đề) — children=${chk.headerChildren}`);
    }
    const rect = await evaluate(PICKER_RECT);
    if (rect) await captureClip("2026-11-09-picker-nologo", rect, 10, 10);

    // FAQ trước khi cân bằng
    await send("Network.setCookie", { name: "smmv2-lang", value: "vi", url: BASE + "/", path: "/" });
    await navigate(`${BASE}/dashboard/faq`, 3800);
    const m = await evaluate(FAQ_MEASURE);
    ok(!!m, "faq-before: đo được trang FAQ");
    if (m) console.log("FAQ_BEFORE", JSON.stringify(m));
    await shotFaqClip("2026-11-09-faq-balance-before");
  } else {
    await send("Network.setCookie", { name: "smmv2-lang", value: "vi", url: BASE + "/", path: "/" });
    await navigate(`${BASE}/dashboard/faq`, 3800);
    const m = await evaluate(FAQ_MEASURE);
    ok(!!m, "faq-after: đo được trang FAQ");
    if (m) {
      console.log("FAQ_AFTER", JSON.stringify(m));
      ok(m.asideW >= 280, `faq-after: có cột phụ thật (aside=${m.asideW}px)`);
      ok(m.detailsW >= 700, `faq-after: accordion ở cột rộng (=${m.detailsW}px, bản cũ 768px trôi giữa khung 1096px)`);
      ok(m.headW === m.wrapW, `faq-after: header và thân trang cùng bề rộng (${m.headW} vs ${m.wrapW})`);
      ok(m.headLeft === m.detailsLeft, `faq-after: header và accordion thẳng mép trái (${m.headLeft} vs ${m.detailsLeft})`);
      const diff = Math.abs(m.accordionBottom - m.asideBottom);
      console.log(`FAQ_AFTER bottomDiff=${diff}px (accordion bottom ${m.accordionBottom} vs aside bottom ${m.asideBottom})`);
      ok(diff <= 90, `faq-after: hai cột kết thúc gần ngang nhau (lệch ${diff}px)`);
    }
    const opened = await evaluate(`(() => {
      const d = document.querySelectorAll('details')[1];
      if (!d) return null;
      d.querySelector('summary').click();
      return d.open;
    })()`);
    ok(opened === true, "faq-after: accordion vẫn mở/đóng được");
    await shotFaqClip("2026-11-09-faq-balance-after");
    // Mobile 390
    await setViewport(390, 844, true);
    await send("Network.setCookie", { name: "smmv2-lang", value: "vi", url: BASE + "/", path: "/" });
    await navigate(`${BASE}/dashboard/faq`, 3200);
    await shotFaqClip("2026-11-09-faq-balance-after-mobile");
  }

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => { try { chrome.kill(); } catch { /* noop */ } });
