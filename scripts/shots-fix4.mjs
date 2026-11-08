/** Fix4: giao diện auth mới (mẫu shopkey) + khôi phục header/footer công khai cũ.
 *  Kiểm chứng: /login + /register desktop 1440 & 390, sai mật khẩu -> lỗi trong
 *  thẻ, đăng nhập demo đáp "/", đăng ký tài khoản thử đáp "/" (xoá sau), confirm
 *  lệch bị chặn phía client, trang 2FA (bật cờ totpEnabled cho tài khoản thử),
 *  /login ở dark mode, trang chủ sáng với pill tối + footer slate-950 cũ. */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });
const stamp = "2026-11-07-fix4";

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--remote-debugging-port=9340", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9340/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
async function newContext() {
  const ctx = await send("Target.createBrowserContext", {});
  const t = await send("Target.createTarget", { url: "about:blank", browserContextId: ctx.browserContextId });
  const att = await send("Target.attachToTarget", { targetId: t.targetId, flatten: true });
  sessionId = att.sessionId;
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Network.setCookie", { name: "smmv2-lang", value: "vi", domain: "127.0.0.1", path: "/" });
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

  /* ===== Ngữ cảnh A: khách vãng lai ===== */
  await newContext();
  await viewport(1440, 1000);
  await navigate(`${BASE}/`);
  console.log("PROBE home:", JSON.stringify(await evaluate(`(() => { const h = document.querySelector("header"); const f = document.querySelector("footer"); return { pillBg: h ? getComputedStyle(h).backgroundColor : null, footerBg: f ? getComputedStyle(f).backgroundColor : null, path: location.pathname }; })()`)));
  await capture(`${stamp}-home-light-desktop`);

  await navigate(`${BASE}/login`);
  await capture(`${stamp}-login-desktop`);
  await viewport(390, 844);
  await navigate(`${BASE}/login`);
  await capture(`${stamp}-login-390`);

  // Sai mật khẩu -> lỗi phải hiện TRONG thẻ
  await viewport(1440, 1000);
  await navigate(`${BASE}/login`, 1500);
  console.log("WRONGPW:", await evaluate(fillAndSubmit({ login: "demo", password: "SaiMatKhau@999" }, false)));
  await sleep(3000);
  console.log("AFTER WRONGPW:", JSON.stringify(await evaluate(`(() => ({ path: location.pathname, hasErr: document.body.innerText.includes("không đúng") || document.body.innerText.toLowerCase().includes("incorrect") }))()`)));
  await capture(`${stamp}-login-error`);

  // Dark mode cho /login (khách)
  await evaluate(`localStorage.setItem("smmv2-mode", "dark"); "ok"`);
  await navigate(`${BASE}/login`);
  console.log("PROBE login dark:", JSON.stringify(await evaluate(`(() => ({ dark: document.documentElement.classList.contains("dark"), bodyBg: getComputedStyle(document.body).backgroundColor }))()`)));
  await capture(`${stamp}-login-dark-desktop`);
  await evaluate(`localStorage.setItem("smmv2-mode", "light"); "ok"`);

  /* ===== Đăng ký: confirm lệch bị chặn, rồi đăng ký thật ===== */
  await navigate(`${BASE}/register`);
  await capture(`${stamp}-register-desktop`);
  await viewport(390, 844);
  await navigate(`${BASE}/register`);
  await capture(`${stamp}-register-390`);
  await viewport(1440, 1000);
  await navigate(`${BASE}/register`, 1500);
  console.log("MISMATCH:", await evaluate(fillAndSubmit({ username: "fix4test", email: "fix4test@example.com", password: "Test@123", confirmPassword: "Test@124" }, true)));
  await sleep(1200);
  console.log("AFTER MISMATCH:", JSON.stringify(await evaluate(`(() => ({ path: location.pathname, hasErr: document.body.innerText.includes("không khớp") }))()`)));
  console.log("REGISTER:", await evaluate(fillAndSubmit({ username: "fix4test", email: "fix4test@example.com", password: "Test@123", confirmPassword: "Test@123" }, true)));
  await sleep(3500);
  console.log("AFTER REGISTER path:", await evaluate(`location.pathname`));

  /* ===== Ngữ cảnh B: đăng nhập demo đáp "/" ===== */
  await newContext();
  await viewport(1440, 1000);
  await navigate(`${BASE}/login`, 1500);
  console.log("DEMO LOGIN:", await evaluate(fillAndSubmit({ login: "demo", password: "Demo@123" }, false)));
  await sleep(3500);
  console.log("AFTER DEMO LOGIN path:", await evaluate(`location.pathname`));

  ws.close();
  chrome.kill();
  console.log("DONE-A");
  process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
