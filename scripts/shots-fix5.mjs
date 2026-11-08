/** Fix5: kiểm chứng end-to-end quên/đặt lại mật khẩu + chụp ảnh.
 *  Luồng: forgot (email thật + email lạ -> thông báo PHẢI giống hệt) -> lấy token
 *  qua kênh lib trả link (như issueEmailVerification) -> đăng nhập phiên cũ ->
 *  đặt mật khẩu mới -> phiên cũ CHẾT -> mật khẩu cũ sai, mới đúng -> token dùng
 *  lại bị từ chối -> token hết hạn bị từ chối. Chạy: node scripts/shots-fix5.mjs */
import { spawn, execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });
const stamp = "2026-11-07-fix5";
let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; };

function tsx(args) {
  return execSync(
    "bash -c 'set -a; source .env; set +a; export PRISMA_QUERY_ENGINE_LIBRARY=$PWD/node_modules/@prisma/engines/libquery_engine-debian-openssl-3.0.x.so.node PRISMA_SCHEMA_ENGINE_BINARY=$PWD/node_modules/@prisma/engines/schema-engine-debian-openssl-3.0.x; npx tsx scripts/test-fix5-reset.ts " + args + "'",
    { cwd: "/home/hatch/workspace/smmv2", encoding: "utf8" }
  ).trim();
}

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
async function navigate(url, waitMs = 1800) { await send("Page.navigate", { url }); await sleep(waitMs); }
async function capture(name) {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name);
}
async function viewport(width, height) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 500 });
}
async function waitUrl(pred, timeoutMs = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const u = await evaluate("location.href");
    if (pred(u)) return u;
    await sleep(400);
  }
  return await evaluate("location.href");
}
const bodyText = () => evaluate("document.body.innerText");
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
  // Ngôn ngữ đọc từ localStorage (DisplayEngine đồng bộ sang cookie + refresh 1 lần)
  await navigate(`${BASE}/login`);
  await evaluate("localStorage.setItem('smmv2-lang', 'vi'); 'set'");
  await sleep(1500);

  // 1) Forgot — email THẬT
  await viewport(1440, 1100);
  await navigate(`${BASE}/forgot-password`);
  await capture(`${stamp}-forgot-desktop`);
  console.log("fill1:", await fillSubmit({ email: "demo@smmv2.local" }));
  await waitUrl((u) => u.includes("msg="));
  const knownText = await bodyText();
  ok(knownText.includes("Nếu email này có trong hệ thống"), "forgot email thật -> thông báo chung chung");

  // 2) Forgot — email LẠ (không tồn tại)
  await navigate(`${BASE}/forgot-password`);
  console.log("fill2:", await fillSubmit({ email: "khong-ton-tai@nowhere.test" }));
  await waitUrl((u) => u.includes("msg="));
  const unknownText = await bodyText();
  ok(unknownText.includes("Nếu email này có trong hệ thống"), "forgot email lạ -> thông báo chung chung");
  const flashOf = (s) => (s.match(/Nếu email này[^\n]*/) || [""])[0];
  ok(flashOf(knownText) === flashOf(unknownText) && flashOf(knownText).length > 10, "hai thông báo GIỐNG HỆT nhau");

  // 3) Forgot — mobile
  await viewport(390, 844);
  await navigate(`${BASE}/forgot-password`);
  await capture(`${stamp}-forgot-390`);
  await viewport(1440, 1100);

  // 4) DB: token đã phát hành cho demo (hash + hạn ~60 phút)
  const st1 = JSON.parse(tsx("state demo"));
  ok(st1.hasResetToken === true, "DB có hash token đặt lại cho demo");
  const minsLeft = st1.resetExpiry ? Math.round((new Date(st1.resetExpiry).getTime() - Date.now()) / 60000) : -1;
  ok(minsLeft > 50 && minsLeft <= 60, `hạn token ~60 phút (còn ${minsLeft})`);

  // 5) Lấy token plaintext qua kênh lib (như issueEmailVerification trả link)
  const link = tsx("issue demo@smmv2.local");
  const token = (link.match(/token=([a-f0-9]+)/) || [])[1];
  ok(!!token, "lấy được token qua kênh quan sát local");
  const svBefore = JSON.parse(tsx("state demo")).sessionVersion;

  // 6) Đăng nhập bằng mật khẩu CŨ (phiên A — sẽ phải chết sau reset)
  await navigate(`${BASE}/login`);
  console.log("login-old:", await fillSubmit({ login: "demo", password: "Demo@123" }));
  const afterLogin = await waitUrl((u) => !u.includes("/login"));
  ok(new URL(afterLogin).pathname === "/", "đăng nhập mật khẩu cũ -> về trang chủ");

  // 7) Mở link đặt lại -> form -> đặt mật khẩu MỚI
  await navigate(`${BASE}/reset-password?token=${token}`);
  const resetPageText = await bodyText();
  ok(resetPageText.includes("Đặt lại mật khẩu"), "trang đặt lại hiển thị form với token hợp lệ");
  await capture(`${stamp}-reset-desktop`);
  console.log("reset-submit:", await fillSubmit({ password: "NewPass@456", confirmPassword: "NewPass@456" }));
  const afterReset = await waitUrl((u) => u.includes("/login"));
  ok(afterReset.includes("/login") && decodeURIComponent(afterReset).includes("Đã đặt lại mật khẩu thành công"), "đặt lại xong -> /login + thông báo thành công");
  const st2 = JSON.parse(tsx("state demo"));
  ok(st2.sessionVersion === svBefore + 1, `sessionVersion tăng ${svBefore} -> ${st2.sessionVersion}`);
  ok(st2.hasResetToken === false, "token đã bị xoá sau khi dùng");

  // 8) Phiên A (cookie trước reset) phải CHẾT
  await navigate(`${BASE}/dashboard/ho-so`, 2500);
  const profUrl = await evaluate("location.href");
  ok(profUrl.includes("/login"), "phiên cũ bị đăng xuất (vào hồ sơ -> văng ra /login)");
  await capture(`${stamp}-login-desktop`);

  // 9) Mật khẩu CŨ phải sai
  console.log("login-oldpw:", await fillSubmit({ login: "demo", password: "Demo@123" }));
  await sleep(2500);
  const oldPwUrl = await evaluate("location.href");
  ok(oldPwUrl.includes("/login") && oldPwUrl.includes("err="), "mật khẩu cũ bị từ chối (ở lại /login + err)");

  // 10) Mật khẩu MỚI phải đúng
  await navigate(`${BASE}/login`);
  console.log("login-newpw:", await fillSubmit({ login: "demo", password: "NewPass@456" }));
  const newLogin = await waitUrl((u) => !u.includes("/login"));
  ok(new URL(newLogin).pathname === "/", "đăng nhập mật khẩu mới -> về trang chủ");

  // 11) Dùng LẠI token cũ -> trạng thái lỗi trong thẻ
  await navigate(`${BASE}/reset-password?token=${token}`);
  const reuseText = await bodyText();
  ok(reuseText.includes("không hợp lệ hoặc đã được sử dụng"), "token dùng lại -> báo không hợp lệ/đã dùng");

  // 12) Token HẾT HẠN -> trạng thái hết hạn
  const link2 = tsx("issue demo@smmv2.local");
  const token2 = (link2.match(/token=([a-f0-9]+)/) || [])[1];
  tsx("backdate demo");
  await navigate(`${BASE}/reset-password?token=${token2}`);
  const expiredText = await bodyText();
  ok(expiredText.includes("đã hết hạn"), "token hết hạn -> báo hết hạn");

  ws.close();
  chrome.kill();
  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
