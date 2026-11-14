/** Chụp + kiểm ADMIN THẬT sau rebuild theo mockup (2026-11-14):
 *  sidebar trắng nhóm phẳng, thẻ/nút/ô nhập theo hệ mới + rà lỗi CSP.
 *  Chạy: node scripts/shots-admin-real.mjs (cần server :3000 + PG local). */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });
let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=old", "--disable-gpu", "--no-sandbox", "--disable-setuid-sandbox", "--hide-scrollbars",
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-real",
  "--remote-debugging-port=9435", "--window-size=1440,900",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9435/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
    await sleep(200);
  }
  throw new Error("chrome CDP không lên");
}
let msgId = 0; const pending = new Map(); let ws; let sessionId = null;
const consoleIssues = [];
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
async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name);
}
const bodyText = () => evaluate(`document.body.innerText`);
const setVal = (sel, val) => evaluate(`(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) throw new Error('không thấy field ' + ${JSON.stringify(sel)});
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(val)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return el.value;
})()`);

async function main() {
  ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); return; }
    if (m.method === "Runtime.consoleAPICalled" && m.params?.type === "error") {
      const txt = (m.params.args || []).map((a) => a.value || a.description || "").join(" ");
      if (/Content Security Policy|Refused to/i.test(txt)) consoleIssues.push(txt.slice(0, 200));
    }
    if (m.method === "Log.entryAdded" && /security|Content Security/i.test(m.params?.entry?.text || "")) {
      consoleIssues.push(String(m.params.entry.text).slice(0, 200));
    }
  };
  const targets = await (await fetch("http://127.0.0.1:9435/json/list")).json();
  const page = targets.find((t) => t.type === "page");
  const att = await send("Target.attachToTarget", { targetId: page.id, flatten: true });
  sessionId = att.sessionId;
  await send("Page.enable"); await send("Runtime.enable"); await send("Log.enable");

  await navigate(`${BASE}/`, 1200);
  await evaluate(`(() => { try { localStorage.setItem('smmv2-lang', 'vi'); document.cookie = 'smmv2-lang=vi; path=/'; } catch {} return true; })()`);
  let t = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    await navigate(`${BASE}/login`, 2500);
    await evaluate(`new Promise((r) => { const iv = setInterval(() => { if (document.querySelector('[name="password"]')) { clearInterval(iv); r(true); } }, 250); setTimeout(() => { clearInterval(iv); r(false); }, 8000); })`);
    await sleep(1200);
    await setVal('[name="login"]', "admin");
    await setVal('[name="password"]', "Admin@123");
    await evaluate(`(() => { const b = document.querySelector('form button[type="submit"], form button'); b.click(); return true; })()`);
    await sleep(3200);
    await navigate(`${BASE}/admin`, 3500);
    t = (await bodyText()).toLowerCase();
    if (t.includes("tổng quan")) break;
  }
  ok(t.includes("tổng quan"), "R1: vào được admin thật");
  const sb = await evaluate(`(() => { const a = document.querySelector('aside'); if (!a) return null; const cs = getComputedStyle(a); return { bg: cs.backgroundColor, w: a.getBoundingClientRect().width }; })()`);
  ok(sb && sb.bg === "rgb(255, 255, 255)" && Math.round(sb.w) === 248, `R2: sidebar TRẮNG 248px (bg=${sb?.bg}, w=${sb?.w})`);
  ok(t.includes("tài khoản premium") && t.includes("tài chính") && t.includes("hệ thống"), "R3: menu phẳng theo nhóm có nhãn");
  await shot("2026-11-14-rebuild-admin-dashboard");

  await navigate(`${BASE}/admin/premium`, 3500);
  t = (await bodyText()).toLowerCase();
  ok(t.includes("sản phẩm"), "R4: trang Sản phẩm & Gói render");
  await shot("2026-11-14-rebuild-admin-products");

  // Mo form Them san pham: khong duoc co khoi nhap goi (goi them sau)
  await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('Thêm sản phẩm')); if (b) b.click(); return !!b; })()`);
  await sleep(1500);
  t = (await bodyText()).toLowerCase();
  ok(t.includes("tên sản phẩm") && t.includes("lưu sản phẩm") && !t.includes("bảo hành (ngày)"), "R7: form sản phẩm không nhập gói chung");
  await shot("2026-11-14-rebuild-admin-product-form");
  await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Hủy'); if (b) b.click(); return true; })()`);
  await sleep(800);
  // Mo popup Goi ban cua san pham dau tien
  await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Gói'); if (b) b.click(); return !!b; })()`);
  await sleep(1500);
  t = (await bodyText()).toLowerCase();
  ok(t.includes("thêm gói mới") && t.includes("gói bán"), "R8: popup Gói bán mở được (gói thêm sau, riêng)");
  await shot("2026-11-14-rebuild-admin-variants");
  await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Đóng'); if (b) b.click(); return true; })()`);
  await sleep(800);

  await navigate(`${BASE}/admin/cau-hinh`, 3000);
  const inpH = await evaluate(`(() => { const el = document.querySelector('.admin-scope input.inp, .admin-scope .inp'); return el ? Math.round(el.getBoundingClientRect().height) : 0; })()`);
  ok(inpH === 40, `R5: ô nhập admin cao đúng 40px (đo=${inpH})`);
  await shot("2026-11-14-rebuild-admin-settings");

  ok(consoleIssues.length === 0, `R6: 0 lỗi CSP trên các trang đã rà (thấy ${consoleIssues.length})`);
  for (const c of consoleIssues) console.log("  CSP:", c);
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAIL`);
  try { chrome.kill(); } catch { /* noop */ }
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => { console.error("SCRIPT ERROR", e); try { chrome.kill(); } catch { /* noop */ } process.exitCode = 1; });
