/** Fix5 WS6: ma trận highlight menu (trước/sau sửa) + chụp minh hoạ sau sửa.
 *  node scripts/shots-fix5-menu.mjs before|after
 *  Đếm: khách — pill đầy đủ = a.bg-brand-50 trong aside; nhấn cha = button.text-brand-700.
 *        admin — lá gradient = a.from-brand-600 trong aside; nhấn cha = button.text-white. */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const MODE = process.argv[2] || "before";
const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--remote-debugging-port=9345", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9345/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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

const COUNT_CUSTOMER = `(() => {
  const aside = document.querySelector('aside');
  if (!aside) return { pills: [], parents: [] };
  const pills = [...aside.querySelectorAll('a')].filter((a) => a.className.includes('bg-brand-50')).map((a) => a.innerText.trim().split('\\n')[0]);
  const parents = [...aside.querySelectorAll('button')].filter((b) => b.className.includes('text-brand-700')).map((b) => b.innerText.trim().split('\\n')[0]);
  return { pills, parents };
})()`;
const COUNT_ADMIN = `(() => {
  const aside = document.querySelector('aside');
  if (!aside) return { leaves: [], parents: [] };
  const leaves = [...aside.querySelectorAll('a')].filter((a) => a.className.includes('from-brand-600')).map((a) => a.innerText.trim().split('\\n')[0]);
  const parents = [...aside.querySelectorAll('button')].filter((b) => b.classList.contains('text-white')).map((b) => b.innerText.trim().split('\\n')[0]);
  return { leaves, parents };
})()`;

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

  console.log(`===== MATRIX (${MODE}) — KHÁCH (demo) =====`);
  console.log("login demo:", await fillSubmit({ login: "demo", password: "Demo@123" }));
  await sleep(2500);
  const customerPages = ["/", "/dashboard/ho-so", "/dashboard/telegram", "/dashboard/telegram/lich-su", "/dashboard/dat-hang", "/dashboard/don-hang", "/dashboard/premium/youtube-premium"];
  for (const p of customerPages) {
    await navigate(BASE + p);
    const c = await evaluate(COUNT_CUSTOMER);
    console.log(`${p}  -> pills(${c.pills.length}): [${c.pills.join(" | ")}]  parentBrand(${c.parents.length}): [${c.parents.join(" | ")}]`);
    if (MODE === "after" && p === "/dashboard/telegram/lich-su") await capture("2026-11-07-fix5-menu-customer-desktop");
  }
  if (MODE === "after") {
    // Ngăn kéo mobile: mở drawer ở trang con lồng sâu
    await viewport(390, 844);
    await navigate(`${BASE}/dashboard/telegram/lich-su`);
    await evaluate(`(() => { const b = [...document.querySelectorAll('header button')].find((x) => x.getAttribute('aria-label')); if (b) b.click(); return !!b; })()`);
    await sleep(1200);
    await capture("2026-11-07-fix5-menu-mobile-drawer");
    await viewport(1440, 1100);
  }

  console.log(`===== MATRIX (${MODE}) — ADMIN =====`);
  await evaluate("document.cookie.split(';').forEach(c => { const n = c.split('=')[0].trim(); document.cookie = n + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/'; }); 'cleared'");
  await navigate(`${BASE}/login`);
  console.log("login admin:", await fillSubmit({ login: "admin", password: "Admin@123" }));
  await sleep(2500);
  const adminPages = ["/admin", "/admin/premium/danh-muc", "/admin/telegram/cai-dat", "/admin/bai-viet/danh-muc", "/admin/don-smm"];
  for (const p of adminPages) {
    await navigate(BASE + p);
    const c = await evaluate(COUNT_ADMIN);
    console.log(`${p}  -> leaves(${c.leaves.length}): [${c.leaves.join(" | ")}]  parentWhite(${c.parents.length}): [${c.parents.join(" | ")}]`);
    if (MODE === "after" && p === "/admin/premium/danh-muc") await capture("2026-11-07-fix5-menu-admin");
  }

  ws.close();
  chrome.kill();
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
