/** NGHIỆM THU TRẠNG THÁI THÀNH VIÊN PASS (đợt 115, lệnh Tín 2026-11-13):
 *  node scripts/shots-pass-member.mjs — cần server production :3000 và đã
 *  chạy `npx tsx scripts/pass-shots-fixture.ts member` (demo: kỳ 3 tháng,
 *  còn hạn 40 ngày, tự gia hạn BẬT). Script tự lật trạng thái đã huỷ qua
 *  fixture mode "member-cancel" ở bước cuối.
 *  1. Desktop: khối thành viên hiện "Gói hiện tại / Kỳ đang dùng / Tự gia
 *     hạn / Huỷ gói", thẻ kỳ 3 gắn nhãn "Gói đang dùng", kỳ khác có nút
 *     "Đổi sang gói này" — KHÔNG còn trình bày mua mới.
 *  2. Bấm công tắc Tự gia hạn qua UI: DB tắt rồi bật lại đúng.
 *  3. Bấm "Đổi sang gói này" (kỳ 1): trừ đúng 49.000, kỳ đang dùng về 1.
 *  4. Mobile 390: không tràn ngang.
 *  5. Huỷ gói qua UI (mở xác nhận inline -> Xác nhận huỷ gói): DB có mốc
 *     huỷ + tự gia hạn tắt; tải lại thấy "Đã huỷ — dùng tới".
 *  Ảnh: 2026-11-13-pass-member-desktop.png, -member-mobile.png,
 *  2026-11-13-pass-cancelled.png. */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });
let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; };

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=old", "--disable-gpu", "--no-sandbox", "--disable-setuid-sandbox", "--hide-scrollbars",
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-pass-member",
  "--remote-debugging-port=9415", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9415/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
    await sleep(200);
  }
  throw new Error("chrome CDP không lên");
}
let msgId = 0; const pending = new Map(); let ws; let sessionId = null;
function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
}
async function evaluate(expr) {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || "eval error");
  return r.result?.value;
}
async function navigate(url, wait = 3000) { await send("Page.navigate", { url }); await sleep(wait); }
async function shot(name, full = false) {
  const r = await send("Page.captureScreenshot", { format: "png", ...(full ? { captureBeyondViewport: true } : {}) });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name);
}
const bodyText = () => evaluate(`document.body.innerText`);
const setField = (name, val) => evaluate(`(() => { const el = document.querySelector('input[name="${name}"]'); if (!el) throw new Error('thiếu input ${name}'); el.focus(); el.value = ${JSON.stringify(val)}; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
async function setLangVi() {
  await navigate(BASE + "/", 1500);
  await evaluate(`(() => { try { localStorage.setItem('smmv2-lang', 'vi'); } catch {} document.cookie = 'smmv2-lang=vi; path=/'; return true; })()`);
}
async function login(username, password) {
  await send("Network.clearBrowserCookies");
  await setLangVi();
  await navigate(`${BASE}/login`, 2500);
  await setField("login", username);
  await setField("password", password);
  await evaluate(`(() => { const b = document.querySelector('form button[type="submit"], form button'); if (!b) throw new Error('thiếu nút submit'); b.click(); return true; })()`);
  await sleep(3200);
}
const clickByText = (t) => evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === ${JSON.stringify(t)}); if (!b) return false; b.scrollIntoView({ block: 'center' }); b.click(); return true; })()`);
async function waitForText(substr, tries = 12) {
  for (let i = 0; i < tries; i++) { const t = await bodyText(); if (t.includes(substr)) return t; await sleep(900); }
  return bodyText();
}
const demoState = () => prisma.user.findUnique({ where: { username: "demo" }, select: { balance: true, passExpiresAt: true, passTermMonths: true, passCancelledAt: true, passAutoRenew: true } });

async function main() {
  const before = await demoState();
  if (!before?.passExpiresAt || before.passTermMonths !== 3 || !before.passAutoRenew) throw new Error("fixture member chưa sẵn sàng (chạy pass-shots-fixture.ts member trước)");

  ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } };
  const targets = await (await fetch("http://127.0.0.1:9415/json/list")).json();
  const page = targets.find((t) => t.type === "page");
  sessionId = (await send("Target.attachToTarget", { targetId: page.id, flatten: true })).sessionId;
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

  /* ---- 1. Trang /pass trạng thái thành viên (desktop) ---- */
  await login("demo", "Demo@123");
  await navigate(`${BASE}/pass`, 3500);
  let text = await bodyText();
  ok(text.includes("Gia hạn và đổi gói"), "tiêu đề khu vực giá là trạng thái thành viên (không còn 'Chọn kỳ hạn')");
  ok(text.includes("Gói đang dùng"), "thẻ kỳ đang dùng có nhãn 'Gói đang dùng'");
  ok(text.includes("Gói hiện tại") && text.includes("Kỳ đang dùng"), "khối tóm tắt thành viên bên phải hiện gói + kỳ");
  ok(text.includes("Tự gia hạn"), "có công tắc Tự gia hạn");
  ok(text.includes("Huỷ gói"), "có nút Huỷ gói");
  ok(text.includes("Đổi sang gói này"), "kỳ khác có nút 'Đổi sang gói này'");
  ok(text.includes("Gia hạn gói này"), "kỳ đang dùng có nút 'Gia hạn gói này'");
  await shot("2026-11-13-pass-member-desktop", true);

  /* ---- 2. Công tắc Tự gia hạn qua UI: tắt rồi bật lại ---- */
  const clickSwitch = () => evaluate(`(() => { const b = document.querySelector('button[role="switch"]'); if (!b) return false; b.scrollIntoView({ block: 'center' }); b.click(); return true; })()`);
  ok(await clickSwitch(), "bấm được công tắc Tự gia hạn (tắt)");
  await waitForText("Đã tắt tự gia hạn");
  ok((await demoState()).passAutoRenew === false, "DB: tự gia hạn đã TẮT sau khi bấm");
  ok(await clickSwitch(), "bấm được công tắc Tự gia hạn (bật lại)");
  await waitForText("Đã bật tự gia hạn");
  ok((await demoState()).passAutoRenew === true, "DB: tự gia hạn đã BẬT lại");

  /* ---- 3. Đổi gói qua UI: kỳ đầu tiên khác kỳ đang dùng (kỳ 1 — 49.000) ---- */
  const balBeforeSwitch = (await demoState()).balance;
  ok(await clickByText("Đổi sang gói này"), "bấm được nút Đổi sang gói này");
  text = await waitForText("Đã đổi sang");
  const afterSwitch = await demoState();
  ok(afterSwitch.balance === balBeforeSwitch - 49000, `đổi gói trừ đúng 49.000 qua UI (bal=${afterSwitch.balance})`);
  ok(afterSwitch.passTermMonths === 1, "DB: kỳ đang dùng đã chuyển về 1");
  ok(afterSwitch.passExpiresAt > before.passExpiresAt, "hạn cộng dồn sau đổi gói (không mất ngày đã trả)");
  ok(text.includes("Đã đổi sang"), "trang báo đổi gói thành công");

  /* ---- 4. Mobile ---- */
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await navigate(`${BASE}/pass`, 3000);
  const overflow = await evaluate(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
  ok(overflow <= 1, `mobile không tràn ngang (overflow=${overflow})`);
  await shot("2026-11-13-pass-member-mobile", true);
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

  /* ---- 5. Huỷ gói qua UI (xác nhận inline) ---- */
  await navigate(`${BASE}/pass`, 3000);
  const opened = await evaluate(`(() => { const s = [...document.querySelectorAll('summary')].find((x) => x.innerText.trim() === 'Huỷ gói'); if (!s) return false; s.scrollIntoView({ block: 'center' }); s.click(); return true; })()`);
  ok(opened, "mở được khối xác nhận huỷ gói");
  await sleep(600);
  ok(await clickByText("Xác nhận huỷ gói"), "bấm được nút Xác nhận huỷ gói");
  text = await waitForText("Đã huỷ");
  const afterCancel = await demoState();
  ok(!!afterCancel.passCancelledAt, "DB: đã ghi mốc huỷ gói");
  ok(afterCancel.passAutoRenew === false, "DB: huỷ gói tắt luôn tự gia hạn");
  ok(afterCancel.passExpiresAt.getTime() === afterSwitch.passExpiresAt.getTime(), "huỷ gói giữ nguyên hạn (dùng tiếp tới hết hạn)");
  ok(text.includes("Đã huỷ — dùng tới"), "trang hiện trạng thái 'Đã huỷ — dùng tới'");
  await shot("2026-11-13-pass-cancelled", true);

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAIL`);
  chrome.kill();
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}
main().catch(async (e) => { console.error(e); chrome.kill(); await prisma.$disconnect().catch(() => {}); process.exit(1); });
