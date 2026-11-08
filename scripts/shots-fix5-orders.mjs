/** Fix5 WS8: chụp chi tiết đơn SMM (trang mới) + chi tiết đơn Premium (popup
 *  làm lại) từ 2 đơn gieo sẵn cho demo. node scripts/shots-fix5-orders.mjs <smmId> */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const smmId = process.argv[2];
const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });
let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; };

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--remote-debugging-port=9347", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9347/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
async function navigate(url, waitMs = 2200) { await send("Page.navigate", { url }); await sleep(waitMs); }
async function capture(name) {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name);
}
async function viewport(width, height) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 500 });
}
const fillSubmit = (fields) => evaluate(`(() => {
  const names = Object.keys(${JSON.stringify(fields)});
  const form = [...document.querySelectorAll('form')].find((f) => names.every((n) => f.querySelector('[name="' + n + '"]')));
  if (!form) return 'no-matching-form';
  for (const [name, value] of Object.entries(${JSON.stringify(fields)})) {
    const inp = form.querySelector('[name="' + name + '"]');
    inp.focus(); inp.value = value; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true }));
  }
  form.requestSubmit();
  return 'submitted';
})()`);

async function main() {
  ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
  };
  const t = await send("Target.createTarget", { url: "about:blank" });
  const att = await send("Target.attachToTarget", { targetId: t.targetId, flatten: true });
  sessionId = att.sessionId;
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Network.setCookie", { name: "smmv2-lang", value: "vi", domain: "127.0.0.1", path: "/" });
  await navigate(`${BASE}/login`);
  await evaluate("localStorage.setItem('smmv2-lang', 'vi'); 'set'");
  await sleep(1500);
  console.log("login:", await fillSubmit({ login: "demo", password: "Demo@123" }));
  await sleep(2500);

  // --- Chi tiết đơn SMM
  await navigate(`${BASE}/dashboard/don-hang/${smmId}`);
  await navigate(`${BASE}/dashboard/don-hang/${smmId}`); // lần 2 cho ngôn ngữ kịp đồng bộ
  const smmText = await evaluate("document.body.innerText");
  for (const s of ["SMM900001", "Thông tin đơn hàng", "Lịch sử trạng thái", "Hỗ trợ đơn này", "Tiến độ đã chạy"]) {
    ok(smmText.includes(s), `SMM detail: có "${s}"`);
  }
  await capture("2026-11-07-fix5-orders-smm");
  await viewport(390, 844);
  await navigate(`${BASE}/dashboard/don-hang/${smmId}`);
  await capture("2026-11-07-fix5-orders-smm-390");
  await viewport(1440, 1100);

  // --- Chi tiết đơn Premium (popup từ danh sách đã mua)
  await navigate(`${BASE}/dashboard/don-premium`);
  const clicked = await evaluate(`(() => {
    const cards = [...document.querySelectorAll('div')];
    const btns = [...document.querySelectorAll('button')].filter((b) => b.innerText.trim() === 'Chi tiết' || b.innerText.trim() === 'Details');
    if (!btns.length) return 'no-detail-btn';
    btns[0].click();
    return 'clicked-first';
  })()`);
  console.log("premium detail open:", clicked);
  await sleep(1200);
  const preText = await evaluate("document.body.innerText");
  for (const s of ["PRE900001", "Thông tin đơn hàng", "TEST-KEY-1234", "Lịch sử xử lý", "Yêu cầu bảo hành"]) {
    ok(preText.includes(s), `Premium detail: có "${s}"`);
  }
  await capture("2026-11-07-fix5-orders-premium");

  ws.close();
  chrome.kill();
  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
