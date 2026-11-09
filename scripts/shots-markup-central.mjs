/** GOM MARKUP FZR VỀ FORM NHÀ CUNG CẤP — kiểm chứng qua CDP trên bản
 *  production :3000 (fixture: scripts/markup-central-fixture.ts):
 *  form sửa nhà cung cấp FZR có đủ 8 ô markup theo nhóm, nạp đúng giá trị
 *  đã lưu (gamekeys=44), lưu mới 55/66 xuống đúng Setting; các trang sản
 *  phẩm khu KHÔNG còn ô markup / nút "Lưu markup khu".
 *    node scripts/shots-markup-central.mjs */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });
let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; };
const prisma = new PrismaClient();

const envRaw = readFileSync("/home/hatch/workspace/smmv2/.env", "utf8");
let secret = envRaw.split("\n").find((l) => l.startsWith("AUTH_SECRET")).split("=").slice(1).join("=").trim();
if ((secret.startsWith('"') && secret.endsWith('"')) || (secret.startsWith("'") && secret.endsWith("'"))) secret = secret.slice(1, -1);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const mint = (claims) => {
  const u = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sv: 0, iat: now, exp: now + 3600, ...claims })}`;
  return `${u}.${createHmac("sha256", secret).update(u).digest("base64url")}`;
};
const adminToken = mint({ uid: 1, role: "ADMIN", username: "admin", amr: "passkey" });

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=old", "--disable-gpu", "--no-sandbox", "--disable-setuid-sandbox", "--hide-scrollbars",
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-markup",
  "--remote-debugging-port=9377", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9377/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
async function capture(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name);
}
const openProviderModal = async () => {
  await evaluate(`(() => {
    const row = [...document.querySelectorAll('tr')].find((tr) => tr.innerText.includes('Markup Central FZR'));
    const btn = row && [...row.querySelectorAll('button')].find((b) => b.title === 'Sửa');
    if (btn) btn.click();
    return !!btn;
  })()`);
  await sleep(1500);
  await evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Cài đặt đồng bộ')?.click(); 'tab'`);
  await sleep(600);
};

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
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });

  await navigate(`${BASE}/`);
  await evaluate(`document.cookie = 'smmv2_session=${adminToken}; path=/'; document.cookie = 'smmv2-lang=vi; path=/'; 'set'`);
  await navigate(`${BASE}/admin/nha-cung-cap`, 4500);
  let txt = await evaluate(`document.body.innerText`);
  ok(txt.includes("Markup Central FZR"), "trang Nhà cung cấp: thấy nhà cung cấp FZR fixture");

  await openProviderModal();
  const count = await evaluate(`document.querySelectorAll('input[name^="fzr_markup_"]').length`);
  ok(count === 8, `form nhà cung cấp FZR: đủ 8 ô markup theo nhóm (thấy ${count})`);
  const gk = await evaluate(`document.querySelector('input[name="fzr_markup_gamekeys"]')?.value`);
  ok(gk === "44", `ô Game Key nạp đúng giá trị đã lưu 44 (thấy ${gk})`);
  txt = await evaluate(`document.body.innerText`);
  ok(txt.includes("Markup theo nhóm FZR"), "form có mục 'Markup theo nhóm FZR'");
  await capture("2026-11-09-markup-provider");

  await evaluate(`(() => {
    const set = (name, v) => { const i = document.querySelector('input[name="' + name + '"]'); if (i) { i.focus(); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); } };
    set('fzr_markup_gamekeys', '55');
    set('fzr_markup_steam_gift', '66');
    return 'set';
  })()`);
  await evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Cập nhật nhà cung cấp')?.click(); 'submit'`);
  await sleep(4500);
  txt = await evaluate(`document.body.innerText`);
  ok(txt.includes("Đã lưu nhà cung cấp"), "lưu form nhà cung cấp -> flash xác nhận");
  const s1 = await prisma.setting.findUnique({ where: { key: "fzr_markup_gamekeys" } });
  const s2 = await prisma.setting.findUnique({ where: { key: "fzr_markup_steam_gift" } });
  ok(s1?.value === "55", `Setting fzr_markup_gamekeys = 55 (thấy ${s1?.value})`);
  ok(s2?.value === "66", `Setting fzr_markup_steam_gift = 66 (thấy ${s2?.value})`);

  await openProviderModal();
  const gk2 = await evaluate(`document.querySelector('input[name="fzr_markup_gamekeys"]')?.value`);
  const sg2 = await evaluate(`document.querySelector('input[name="fzr_markup_steam_gift"]')?.value`);
  ok(gk2 === "55" && sg2 === "66", `mở lại form: giá trị mới còn nguyên (gamekeys=${gk2}, steam_gift=${sg2})`);
  await evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Hủy')?.click(); 'close'`);
  await sleep(800);

  for (const [path, label] of [["/admin/game-key/san-pham", "Game Key"], ["/admin/telegram/san-pham", "Telegram"], ["/admin/top-up/san-pham", "Top-Up"]]) {
    await navigate(`${BASE}${path}`, 4000);
    const body = await evaluate(`document.body.innerText`);
    const markupInputs = await evaluate(`document.querySelectorAll('input[name^="markup_"], input[name^="fzr_markup_"]').length`);
    ok(!body.includes("Lưu markup khu"), `trang ${label}: không còn nút 'Lưu markup khu'`);
    ok(markupInputs === 0, `trang ${label}: 0 ô markup (thấy ${markupInputs})`);
    ok(body.includes("Đồng bộ của khu này"), `trang ${label}: thẻ đồng bộ vẫn còn`);
    if (path.startsWith("/admin/game-key")) await capture("2026-11-09-markup-area");
  }

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAIL`);
  chrome.kill();
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error(e); chrome.kill(); await prisma.$disconnect(); process.exit(1); });
