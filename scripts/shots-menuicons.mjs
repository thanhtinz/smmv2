/** Chụp menu sau đợt làm mới icon (2026-11-08): menu khách (desktop, mở
 *  nhóm Manual Services) + sidebar admin (mở vài nhóm) + kiểm luật
 *  highlight duy nhất còn nguyên. Chạy: node scripts/shots-menuicons.mjs */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHmac } from "node:crypto";

const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });
let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const envRaw = readFileSync("/home/hatch/workspace/smmv2/.env", "utf8");
const envVal = (k) => {
  let v = (envRaw.split("\n").find((l) => l.startsWith(k)) || "").split("=").slice(1).join("=").trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v;
};
const secret = envVal("AUTH_SECRET");
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const mint = (claims) => {
  const u = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sv: 0, iat: now, exp: now + 3600, ...claims })}`;
  return `${u}.${createHmac("sha256", secret).update(u).digest("base64url")}`;
};
const demoToken = mint({ uid: 2, role: "USER", username: "demo" });
const adminToken = mint({ uid: 1, role: "ADMIN", username: "admin", amr: "passkey" });

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--remote-debugging-port=9375", "--window-size=1440,1200",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9375/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch {}
    await sleep(200);
  }
  throw new Error("chrome CDP không lên");
}
let msgId = 0;
const pending = new Map();
let ws; let sessionId = null;
function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}
const ev = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error("eval lỗi: " + JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result?.value;
};
async function nav(url, token) {
  await send("Network.setCookie", { name: "smmv2_session", value: token, domain: "127.0.0.1", path: "/" });
  await send("Network.setCookie", { name: "smmv2-lang", value: "vi", domain: "127.0.0.1", path: "/" });
  await send("Page.navigate", { url: BASE + url });
  await sleep(1500);
}
async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name);
}

try {
  ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
  };
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const att = await send("Target.attachToTarget", { targetId, flatten: true });
  sessionId = att.sessionId;
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");

  /* Menu khách: trang trong khu Manual Services — nhóm tự mở, lá hiện tại sáng */
  await nav("/dashboard/manual-services", demoToken);
  await nav("/dashboard/manual-services", demoToken);
  const cust = await ev(`(() => {
    const nav = document.querySelector('aside nav') || document.querySelector('nav');
    const links = nav ? [...nav.querySelectorAll('a')] : [];
    const active = links.filter(a => /bg-gradient|bg-brand|text-brand-700/.test(a.className) && a.getAttribute('href'));
    return { links: links.length, activeHrefs: active.map(a => a.getAttribute('href')) };
  })()`);
  console.log("menu khách:", JSON.stringify(cust));
  ok(cust.links > 10, `menu khách render đủ mục (${cust.links} link)`);
  await shot("2026-11-08-menuicons-customer");

  /* Sidebar admin: mở các nhóm Telegram + Manual Services + Tài chính */
  await nav("/admin/manual-services", adminToken);
  await nav("/admin/manual-services", adminToken);
  await ev(`(() => {
    const btns = [...document.querySelectorAll('button')];
    for (const name of ['Telegram', 'Tài chính', 'Hệ thống']) {
      const b = btns.find(x => x.textContent.trim().startsWith(name));
      b?.click();
    }
    return true;
  })()`);
  await sleep(700);
  const adm = await ev(`(() => {
    const nav = document.querySelector('aside nav') || document.querySelector('nav');
    const links = nav ? [...nav.querySelectorAll('a')] : [];
    const act = links.filter(a => a.className.includes('from-brand-600'));
    return { links: links.length, active: act.map(a => a.getAttribute('href')) };
  })()`);
  console.log("menu admin:", JSON.stringify(adm));
  ok(adm.active.length === 1 && adm.active[0] === "/admin/manual-services", `highlight duy nhất ở admin = đúng lá Đơn hàng Manual Services (${JSON.stringify(adm.active)})`);
  await shot("2026-11-08-menuicons-admin");

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAIL`);
} catch (e) {
  console.error("LỖI:", e.message || e);
  process.exitCode = 1;
} finally {
  try { chrome.kill(); } catch {}
}
