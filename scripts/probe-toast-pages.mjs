/** Probe nhanh F3/F1: toast phải hiện trên /admin/telegram và
 *  /admin/ticket/<id> khi URL mang ?msg= (đường về của các action lưu). */
import { spawn } from "node:child_process";
const BASE = "http://127.0.0.1:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=old", "--disable-gpu", "--no-sandbox", "--disable-setuid-sandbox", "--hide-scrollbars",
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-probetoast",
  "--remote-debugging-port=9430", "--window-size=1440,900",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9430/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
const toastText = () => evaluate(`(() => { const d = [...document.querySelectorAll('div')].find((x) => (x.className || '').includes('z-[120]')); return d ? d.innerText : ''; })()`);

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
  const setVal = (sel, val) => evaluate(`(() => { const el = document.querySelector('${sel}'); if (!el) throw new Error('no field ${sel}'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(val)}); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return el.value; })()`);
  await setVal('[name="login"]', "admin");
  await setVal('[name="password"]', "Admin@123");
  await evaluate(`(() => { document.querySelector('form button').click(); return true; })()`);
  await sleep(3200);
  console.log("login ->", await evaluate(`location.pathname`));
  await navigate(`${BASE}/admin/telegram?msg=${encodeURIComponent("Đã kiểm tra lại đơn Telegram")}`, 3000);
  const t3 = await toastText();
  console.log(t3.includes("Đã kiểm tra lại đơn Telegram") ? "PASS  F3: toast hiện trên /admin/telegram" : `FAIL  F3: toast='${t3}'`);
  const tid = process.argv[2];
  if (tid) {
    await navigate(`${BASE}/admin/ticket/${tid}?err=${encodeURIComponent("Nhập nội dung trả lời")}`, 3000);
    const t1 = await toastText();
    console.log(t1.includes("Nhập nội dung trả lời") ? "PASS  F1: toast lỗi hiện trên /admin/ticket/[id]" : `FAIL  F1: toast='${t1}'`);
  } else {
    console.log("SKIP  F1: DB local không có ticket nào");
  }
  process.exit(0);
}
main().catch((e) => { console.error("ERR", e); process.exit(2); }).finally(() => { try { chrome.kill(); } catch { /* noop */ } });
