/** Probe: mở trang Sản phẩm Game Key, bấm Tìm trong picker, in console +
 *  exception + HTML của picker sau khi bấm để tìm nguyên nhân không phản ứng. */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

const BASE = "http://127.0.0.1:3000";
const envRaw = readFileSync("/home/hatch/workspace/smmv2/.env", "utf8");
let secret = envRaw.split("\n").find((l) => l.startsWith("AUTH_SECRET")).split("=").slice(1).join("=").trim();
if ((secret.startsWith('"') && secret.endsWith('"')) || (secret.startsWith("'") && secret.endsWith("'"))) secret = secret.slice(1, -1);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const u = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sv: 0, iat: now, exp: now + 3600, uid: 1, role: "ADMIN", username: "admin", amr: "passkey" })}`;
const adminToken = `${u}.${createHmac("sha256", secret).update(u).digest("base64url")}`;

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=old", "--disable-gpu", "--no-sandbox", "--disable-setuid-sandbox", "--hide-scrollbars",
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-probe",
  "--remote-debugging-port=9368", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9368/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
    await sleep(200);
  }
  throw new Error("chrome CDP không lên");
}
let msgId = 0;
const pending = new Map();
let ws, sessionId = null;
function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}
async function evaluate(expr) {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return `EVAL-ERR: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`;
  return r.result?.value;
}

async function main() {
  ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); return; }
    if (m.method === "Runtime.consoleAPICalled") {
      const args = (m.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300);
      console.log(`[console.${m.params.type}]`, args);
    }
    if (m.method === "Runtime.exceptionThrown") {
      console.log("[exception]", (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || "").slice(0, 400));
    }
  };
  const t = await send("Target.createTarget", { url: "about:blank" });
  sessionId = (await send("Target.attachToTarget", { targetId: t.targetId, flatten: true })).sessionId;
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.navigate", { url: `${BASE}/` });
  await sleep(2500);
  await evaluate(`document.cookie = 'smmv2_session=${adminToken}; path=/'; document.cookie = 'smmv2-lang=vi; path=/'; 'set'`);
  await send("Page.navigate", { url: `${BASE}/admin/game-key/san-pham` });
  await sleep(9000);
  const hydrated = await evaluate(`(() => { const i = [...document.querySelectorAll('input')].find((x) => (x.placeholder || '').includes('Tìm theo tên trong catalog')); if (!i) return 'no-input'; i.focus(); document.execCommand('insertText', false, 'ELDEN'); return 'typed:' + i.value; })()`);
  console.log("type:", hydrated);
  const clicked = await evaluate(`(() => { const box = [...document.querySelectorAll('div')].find((d) => d.textContent.includes('CHỌN TỪ CATALOG') && d.querySelector('input')); const b = box ? [...box.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Tìm') : null; if (b) { b.click(); return 'clicked'; } return 'no-btn'; })()`);
  console.log("click:", clicked);
  await sleep(4000);
  const boxHtml = await evaluate(`(() => { const box = [...document.querySelectorAll('div')].find((d) => d.textContent.includes('CHỌN TỪ CATALOG') && d.querySelector('input')); return box ? box.innerText.slice(0, 500) : 'no-box'; })()`);
  console.log("picker box text:", JSON.stringify(boxHtml));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
