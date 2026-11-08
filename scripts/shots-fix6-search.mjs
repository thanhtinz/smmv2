/** TASK 2 AMENDMENT (fix6): lớp phủ tìm kiếm KHÔNG còn nút Tìm riêng;
 *  kính lúp + dấu × nằm TRONG khung nhập; × có chữ thì xoá chữ, khung trống
 *  thì đóng; Enter (phím Tìm của bàn phím) gửi form GET /premium?q=.
 *  node scripts/shots-fix6-search.mjs */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

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
async function navigate(url, waitMs = 2000) { await send("Page.navigate", { url }); await sleep(waitMs); }
async function capture(name) {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name);
}
async function viewport(width, height) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 500 });
}

const probe = () => evaluate(`(() => {
  const form = document.querySelector('header form[action="/premium"]');
  const inp = document.querySelector('header input[name="q"]');
  if (!form || !inp) return { open: false };
  const ir = inp.getBoundingClientRect();
  const svgs = [...form.querySelectorAll('svg')].map((s) => { const r = s.getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; });
  const inField = svgs.filter((p) => p.cx >= ir.left && p.cx <= ir.right && p.cy >= ir.top && p.cy <= ir.bottom);
  const submitBtns = [...form.querySelectorAll('button')].filter((b) => b.type === 'submit' || /tìm/i.test(b.textContent || ''));
  const cart = document.querySelector('header a[href="/gio-hang"]');
  let covered = null;
  if (cart) { const r = cart.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); covered = !!(el && form.contains(el)); }
  return { open: true, value: inp.value, svgsInField: inField.length, submitBtns: submitBtns.length, cartCovered: covered, focused: document.activeElement === inp };
})()`);
const clickX = () => evaluate(`(() => { const f = document.querySelector('header form[action="/premium"]'); const b = f ? f.querySelector('button') : null; if (b) { b.click(); return true; } return false; })()`);

async function flow(width, tag) {
  await viewport(width, width <= 500 ? 844 : 1100);
  await navigate(`${BASE}/`);
  await evaluate(`document.querySelector('header button[aria-expanded]').click(); 'open'`);
  await sleep(600);
  let p = await probe();
  console.log(tag, "open:", JSON.stringify(p));
  ok(p.open && p.focused, `${tag}: lớp phủ mở + autofocus`);
  ok(p.submitBtns === 0, `${tag}: KHÔNG còn nút Tìm/submit riêng`);
  ok(p.svgsInField >= 2, `${tag}: kính lúp + × đều nằm TRONG khung nhập`);
  ok(p.cartCovered === true, `${tag}: lớp phủ vẫn che nút giỏ hàng`);
  // gõ chữ (React controlled input: dùng native setter)
  await evaluate(`(() => { const inp = document.querySelector('header input[name="q"]'); const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; set.call(inp, 'youtube'); inp.dispatchEvent(new Event('input', { bubbles: true })); return inp.value; })()`);
  await sleep(300);
  p = await probe();
  ok(p.value === "youtube", `${tag}: gõ được chữ vào khung`);
  await capture(`2026-11-08-search-final-${tag}`);
  await clickX();
  await sleep(300);
  p = await probe();
  ok(p.open && p.value === "", `${tag}: × lần 1 xoá chữ, lớp phủ còn mở`);
  await clickX();
  await sleep(300);
  p = await probe();
  ok(!p.open, `${tag}: × lần 2 (khung trống) đóng lớp phủ, trả lại nút header`);
  // mở lại, Enter gửi form
  await evaluate(`document.querySelector('header button[aria-expanded]').click(); 'open2'`);
  await sleep(600);
  await evaluate(`(() => { const inp = document.querySelector('header input[name="q"]'); const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; set.call(inp, 'spotify'); inp.dispatchEvent(new Event('input', { bubbles: true })); inp.focus(); return 1; })()`);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", text: "\r", unmodifiedText: "\r", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await sleep(2200);
  const url = await evaluate("location.href");
  ok(url.includes("/premium") && url.includes("q=spotify"), `${tag}: Enter gửi form -> ${url}`);
}

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
  await flow(390, "390");
  await flow(1440, "desktop");
  console.log(failures === 0 ? "ALL PASS" : `${failures} FAIL`);
  chrome.kill();
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
