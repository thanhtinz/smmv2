/** Kiểm chứng PHÂN TRANG ADMIN qua CDP (bản production local :3000):
 *  - /admin/game-key/san-pham: 45 game fixture -> trang 1 có 20 game +
 *    "Trang 1/3 · 45 game"; trang 3 còn 5; tìm kiếm thu hẹp tổng + lật
 *    trang giữ lọc; sửa tên 1 game ở trang 2 lưu đúng.
 *  - /admin/gift-card/san-pham: 45 danh mục -> trang 1: 20 + "Trang 1/3 ·
 *    45 danh mục"; trang 3: 5.
 *  - /admin/premium: tổng 99 sản phẩm -> có thanh phân trang 5 trang.
 *  Chạy sau fixture-adminpage.ts seed. */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

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
const adminToken = mint({ uid: 1, role: "ADMIN", username: "admin", amr: "passkey" });

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=old", "--disable-gpu", "--no-sandbox", "--disable-setuid-sandbox", "--hide-scrollbars",
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-adminpage",
  "--remote-debugging-port=9369", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9369/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
async function navigate(url, waitMs = 3000) { await send("Page.navigate", { url }); await sleep(waitMs); }
async function capture(name) {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name);
}
const bodyText = () => evaluate(`document.body.innerText`);
/** Chờ điều kiện đúng trên text trang (SSR + hydrate có thể chậm) — thử
 *  lại tối đa `tries` lần, mỗi lần cách nhau 1.2s, trả text cuối. */
async function waitText(needle, tries = 8) {
  let txt = "";
  for (let i = 0; i < tries; i++) {
    txt = await bodyText();
    if (txt.includes(needle)) return txt;
    await sleep(1200);
  }
  return txt;
}
const countBtn = (label) => evaluate(`[...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === '${label}').length`);

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
  await navigate(`${BASE}/`);
  await evaluate(`document.cookie = 'smmv2_session=${adminToken}; path=/'; document.cookie = 'smmv2-lang=vi; path=/'; try { localStorage.setItem('smmv2-lang', 'vi'); } catch(e) {} 'set'`);

  /* ---------- Game Key admin ---------- */
  await navigate(`${BASE}/admin/game-key/san-pham`, 4000);
  let n = await countBtn("Lưu game");
  ok(n === 20, `GK admin trang 1: 20 game (thấy ${n})`);
  let txt = await bodyText();
  ok(txt.includes("Trang 1/3") && txt.includes("45 game"), "GK admin: hiện Trang 1/3 · 45 game");
  await capture("2026-11-08-adminpage-gamekey");

  await navigate(`${BASE}/admin/game-key/san-pham?page=3`);
  n = await countBtn("Lưu game");
  ok(n === 5, `GK admin trang 3: 5 game (thấy ${n})`);
  txt = await bodyText();
  ok(txt.includes("Trang 3/3") && txt.includes("45 game"), "GK admin: hiện Trang 3/3 · 45 game");

  // Tìm kiếm + phân trang: lọc "Game" (45 khớp) ở trang 2 giữ tổng 45;
  // lọc hẹp "Game 4" -> 7 game (04, 40-45), hết phân trang.
  await navigate(`${BASE}/admin/game-key/san-pham?q=${encodeURIComponent("ZZ Check Game")}&page=2`);
  n = await countBtn("Lưu game");
  txt = await bodyText();
  ok(n === 20 && txt.includes("Trang 2/3") && txt.includes("45 game"), `GK admin tìm+lật trang: trang 2 có ${n} game, tổng vẫn 45`);
  await navigate(`${BASE}/admin/game-key/san-pham?q=${encodeURIComponent("Game 4")}&page=3`);
  n = await countBtn("Lưu game");
  // "Game 4" khớp đúng 6 game: 40..45 ("Game 04" không chứa chuỗi "Game 4")
  ok(n === 6, `GK admin lọc hẹp "Game 4" (page=3 tự kẹp về 1): 6 game (thấy ${n})`);

  // Sửa 1 game ở trang 2 -> lưu đúng
  await navigate(`${BASE}/admin/game-key/san-pham?page=2`);
  const edited = await evaluate(`(() => {
    const inputs = [...document.querySelectorAll('input[name="name"]')];
    const inp = inputs.find((i) => i.value === "ZZ Check Game 21");
    if (!inp) return "not-found";
    const form = inp.closest("form");
    inp.value = "ZZ Check Game 21 Edited";
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    const btn = [...form.querySelectorAll("button")].find((b) => b.textContent.trim() === "Lưu game");
    if (!btn) return "no-btn";
    btn.click();
    return "clicked";
  })()`);
  ok(edited === "clicked", `GK admin: bấm Lưu cho game trang 2 (${edited})`);
  await sleep(4000);
  await navigate(`${BASE}/admin/game-key/san-pham?page=2`);
  // Tên game nằm trong <input name="name"> — innerText không chứa giá trị
  // input nên phải đọc trực tiếp value của các ô tên.
  let savedName = "";
  for (let i = 0; i < 8 && savedName !== "ZZ Check Game 21 Edited"; i++) {
    savedName = await evaluate(`(() => { const inp = [...document.querySelectorAll('input[name="name"]')].find((x) => x.value.includes("21")); return inp ? inp.value : ""; })()`);
    if (savedName !== "ZZ Check Game 21 Edited") await sleep(1200);
  }
  ok(savedName === "ZZ Check Game 21 Edited", `GK admin: tên mới của game trang 2 đã lưu (${savedName})`);

  /* ---------- Gift Card admin ---------- */
  await navigate(`${BASE}/admin/gift-card/san-pham`, 4000);
  n = await countBtn("Lưu danh mục");
  ok(n === 20, `GC admin trang 1: 20 danh mục (thấy ${n})`);
  txt = await bodyText();
  ok(txt.includes("Trang 1/3") && txt.includes("45 danh mục"), "GC admin: hiện Trang 1/3 · 45 danh mục");
  await capture("2026-11-08-adminpage-giftcard");
  await navigate(`${BASE}/admin/gift-card/san-pham?page=3`);
  n = await countBtn("Lưu danh mục");
  txt = await bodyText();
  ok(n === 5 && txt.includes("Trang 3/3"), `GC admin trang 3: 5 danh mục (thấy ${n})`);

  /* ---------- Premium admin ---------- */
  await navigate(`${BASE}/admin/premium`, 4000);
  txt = await waitText("99 sản phẩm", 14);
  ok(txt.includes("Trang 1/5") && txt.includes("99 sản phẩm"), "Premium admin: hiện Trang 1/5 · 99 sản phẩm");
  await navigate(`${BASE}/admin/premium?page=5`);
  txt = await waitText("Trang 5/5");
  ok(txt.includes("Trang 5/5"), "Premium admin: lật tới trang 5/5");

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
  chrome.kill();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
