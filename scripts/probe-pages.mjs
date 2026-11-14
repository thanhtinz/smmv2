/** Probe nhanh: dump nút + hàng bảng ở /admin/premium và /admin/premium/danh-muc. */
import { spawn } from "node:child_process";
const BASE = "http://127.0.0.1:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=old", "--disable-gpu", "--no-sandbox", "--disable-setuid-sandbox", "--hide-scrollbars",
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-probepages",
  "--remote-debugging-port=9429", "--window-size=1440,900",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9429/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
async function navigate(url, wait = 3500) { await send("Page.navigate", { url }); await sleep(wait); }
const setVal = (scopeExpr, val) => evaluate(`(() => {
  const el = ${scopeExpr};
  if (!el) throw new Error('không thấy field');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(val)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return el.value;
})()`);

async function main() {
  ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
  };
  const targets = await send("Target.getTargets");
  const page = targets.targetInfos.find((t) => t.type === "page");
  const att = await send("Target.attachToTarget", { targetId: page.targetId, flatten: true });
  sessionId = att.sessionId;
  await send("Page.enable"); await send("Network.enable");
  await navigate(BASE + "/", 1200);
  await evaluate(`(() => { try { localStorage.setItem('smmv2-lang', 'vi'); } catch {} document.cookie = 'smmv2-lang=vi; path=/'; return true; })()`);
  await navigate(`${BASE}/login`, 2500);
  console.log("LOGIN url:", await evaluate(`location.href`));
  console.log("LOGIN inputs:", JSON.stringify(await evaluate(`[...document.querySelectorAll('input')].map((i) => i.name || i.type)`)));
  console.log("LOGIN body head:", (await evaluate(`document.body.innerText.slice(0, 200)`)).replace(/\n/g, " | "));
  await setVal(`document.querySelector('[name="login"]')`, "admin");
  await setVal(`document.querySelector('[name="password"]')`, "Admin@123");
  await evaluate(`(() => { document.querySelector('form button').click(); return true; })()`);
  await sleep(3200);
  console.log("after login:", await evaluate(`location.href`));
  await navigate(`${BASE}/admin/premium/danh-muc`, 3500);
  console.log("CAT PAGE rows:", JSON.stringify(await evaluate(`[...document.querySelectorAll('tbody tr')].map((r) => r.innerText.split('\\n')[0])`)));
  await navigate(`${BASE}/admin/premium`, 4000);
  console.log("PREMIUM url:", await evaluate(`location.href`));
  console.log("PREMIUM buttons:", JSON.stringify(await evaluate(`[...document.querySelectorAll('button')].slice(0, 14).map((b) => b.innerText.trim().slice(0, 40))`)));
  console.log("PREMIUM body head:", (await evaluate(`document.body.innerText.slice(0, 300)`)).replace(/\n/g, " | "));
  process.exit(0);
}
main().catch((e) => { console.error("ERR", e); process.exit(2); }).finally(() => { try { chrome.kill(); } catch { /* noop */ } });
