/** Fix4 (tiếp): đăng nhập demo đáp "/", cổng confirm lệch (tài khoản riêng,
 *  kiểm tra cả thông báo lỗi lẫn việc KHÔNG tạo tài khoản), trang 2FA của
 *  tài khoản thử fix4test (đã bật cờ totpEnabled trong DB). */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });
const stamp = "2026-11-07-fix4";

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--remote-debugging-port=9341", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9341/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
    await sleep(200);
  }
  throw new Error("chrome CDP không lên");
}
let msgId = 0;
const pending = new Map();
let ws;
let sessionId = null;
function send(method, params = {}, browserLevel = false) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(!browserLevel && sessionId ? { sessionId } : {}) }));
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
async function newContext() {
  const ctx = await send("Target.createBrowserContext", {}, true);
  const t = await send("Target.createTarget", { url: "about:blank", browserContextId: ctx.browserContextId }, true);
  const att = await send("Target.attachToTarget", { targetId: t.targetId, flatten: true }, true);
  sessionId = att.sessionId;
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
}
const fillAndSubmit = (fields, checkTerms) => `(() => {
  const set = (el, v) => { const p = Object.getPrototypeOf(el); const d = Object.getOwnPropertyDescriptor(p, "value"); d.set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };
  const F = ${JSON.stringify(fields)};
  for (const [name, v] of Object.entries(F)) { const el = document.querySelector('input[name="' + name + '"]'); if (!el) return "missing:" + name; set(el, v); }
  ${checkTerms ? 'const cb = document.querySelector(\'input[name="terms"]\'); if (cb && !cb.checked) cb.click();' : ""}
  document.querySelector('form').requestSubmit();
  return "submitted";
})()`;

async function main() {
  ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
  };

  /* 1) Confirm lệch: phải bị chặn, hiện lỗi, không rời /register */
  await newContext();
  await navigate(`${BASE}/register`, 1500);
  console.log("MISMATCH:", await evaluate(fillAndSubmit({ username: "fix4mm", email: "fix4mm@example.com", password: "Test@123", confirmPassword: "Test@124" }, true)));
  await sleep(1500);
  console.log("AFTER MISMATCH:", JSON.stringify(await evaluate(`(() => ({ path: location.pathname, errText: (document.body.innerText.match(/does not match|không khớp/) || [null])[0] }))()`)));

  /* 2) Đăng nhập demo đáp "/" */
  await newContext();
  await navigate(`${BASE}/login`, 1500);
  console.log("DEMO LOGIN:", await evaluate(fillAndSubmit({ login: "demo", password: "Demo@123" }, false)));
  await sleep(3500);
  console.log("AFTER DEMO LOGIN path:", await evaluate(`location.pathname`));

  /* 3) Trang 2FA: fix4test đã bật totpEnabled trong DB */
  await newContext();
  await navigate(`${BASE}/login`, 1500);
  console.log("2FA LOGIN:", await evaluate(fillAndSubmit({ login: "fix4test", password: "Test@123" }, false)));
  await sleep(3500);
  console.log("AFTER 2FA LOGIN path:", await evaluate(`location.pathname`));
  await capture(`${stamp}-2fa-desktop`);

  ws.close();
  chrome.kill();
  console.log("DONE-B");
  process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
