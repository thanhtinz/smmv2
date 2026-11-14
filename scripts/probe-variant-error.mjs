/** Probe riêng: VariantsModal — xoá trắng tên gói rồi Lưu, quan sát URL +
 *  DOM sau điều hướng lỗi để hiểu vì sao modal đóng. */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=old", "--disable-gpu", "--no-sandbox", "--disable-setuid-sandbox", "--hide-scrollbars",
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-probevariant",
  "--remote-debugging-port=9428", "--window-size=1440,900",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9428/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
const modalOpen = () => evaluate(`!![...document.querySelectorAll('div')].find((d) => (d.className || '').includes('backdrop-blur') && d.className.includes('fixed'))`);
const setVal = (scopeExpr, val) => evaluate(`(() => {
  const el = ${scopeExpr};
  if (!el) throw new Error('không thấy field');
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
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
  };
  const targets = await send("Target.getTargets");
  const page = targets.targetInfos.find((t) => t.type === "page");
  const att = await send("Target.attachToTarget", { targetId: page.targetId, flatten: true });
  sessionId = att.sessionId;
  await send("Page.enable"); await send("Network.enable");
  // login
  await navigate(BASE + "/", 1200);
  await evaluate(`(() => { try { localStorage.setItem('smmv2-lang', 'vi'); } catch {} document.cookie = 'smmv2-lang=vi; path=/'; return true; })()`);
  await navigate(`${BASE}/login`, 2500);
  await setVal(`document.querySelector('[name="login"]')`, "admin");
  await setVal(`document.querySelector('[name="password"]')`, "Admin@123");
  await evaluate(`(() => { document.querySelector('form button').click(); return true; })()`);
  await sleep(3200);
  await navigate(`${BASE}/admin/premium`, 3000);
  // mở modal Gói của sản phẩm Netflix id=10 (hàng sort đầu)
  await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /gói/.test(x.innerText) && x.closest('tr') && x.closest('tr').innerText.includes('Netflix Premium 4K')); if (!b) throw new Error('no pill'); b.click(); return true; })()`);
  await sleep(1000);
  console.log("modal open:", await modalOpen());
  console.log("variant names in modal:", await evaluate(`(() => { const ov = [...document.querySelectorAll('div')].find((d) => (d.className || '').includes('backdrop-blur')); return ov ? [...ov.querySelectorAll('form [name="name"]')].map((i) => i.value) : []; })()`));
  // xoá trắng tên gói đầu tiên rồi bấm Lưu của form đó
  await setVal(`(() => { const ov = [...document.querySelectorAll('div')].find((d) => (d.className || '').includes('backdrop-blur')); return ov.querySelector('form [name="name"]'); })()`, "");
  await evaluate(`(() => {
    const ov = [...document.querySelectorAll('div')].find((d) => (d.className || '').includes('backdrop-blur'));
    const f = [...ov.querySelectorAll('form')].find((x) => x.querySelector('[name="id"]') && x.querySelector('[name="name"]').value === '');
    if (!f) throw new Error('no emptied form');
    [...f.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Lưu').click();
    return true;
  })()`);
  await sleep(3500);
  console.log("URL sau lưu lỗi:", await evaluate(`location.href`));
  console.log("modal open sau lỗi:", await modalOpen());
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}/2026-11-13-probe-variant-error.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT probe");
  process.exit(0);
}
main().catch((e) => { console.error("ERR", e); process.exit(2); }).finally(() => { try { chrome.kill(); } catch { /* noop */ } });
