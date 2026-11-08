/** Chụp lại 2026-11-08-rate-provider.png: form sửa nhà cung cấp FZR với CẢ
 *  HAI trường tỉ giá (tab Tiền tệ) + markup chung (tab Cài đặt đồng bộ)
 *  trong cùng một khung — bỏ ẩn các panel tab, viewport cao, cuộn tới
 *  panel markup. Dùng fixture topup (mock) rồi dọn. */
import { spawn, execSync } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
const TSX_ENV = {
  ...process.env,
  PRISMA_QUERY_ENGINE_LIBRARY: "/home/hatch/workspace/smmv2/node_modules/@prisma/engines/libquery_engine-debian-openssl-3.0.x.so.node",
  PRISMA_SCHEMA_ENGINE_BINARY: "/home/hatch/workspace/smmv2/node_modules/@prisma/engines/schema-engine-debian-openssl-3.0.x",
};
const fixture = (args) => execSync(`npx tsx scripts/fixture-topup.ts ${args}`, { cwd: "/home/hatch/workspace/smmv2", env: TSX_ENV, stdio: "pipe" }).toString();

const mock = spawn("node", ["scripts/mock-fzr.mjs"], { cwd: "/home/hatch/workspace/smmv2", stdio: "ignore" });
const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--remote-debugging-port=9366", "--window-size=1440,2400",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9366/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch {}
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
async function evaluate(expr) {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || "eval error");
  return r.result?.value;
}
async function navigate(url, waitMs = 2600) { await send("Page.navigate", { url }); await sleep(waitMs); }

async function main() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch("http://127.0.0.1:3998/__log"); if (r.ok) break; } catch {}
    await sleep(300);
  }
  console.log(fixture("seed"));
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
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 2400, deviceScaleFactor: 1, mobile: false });

  await navigate(`${BASE}/`);
  await evaluate(`document.cookie = 'smmv2_session=${adminToken}; path=/'; document.cookie = 'smmv2-lang=vi; path=/'; 'set'`);
  await navigate(`${BASE}/admin/nha-cung-cap`, 4000);
  const opened = await evaluate(`(() => {
    const row = [...document.querySelectorAll('tr')].find((r) => r.textContent.includes('FZR Mock (fixture topup)'));
    const btn = row ? row.querySelector('button[title="Sửa"]') : null;
    if (btn) { btn.click(); return true; }
    return false;
  })()`);
  console.log("opened:", opened);
  await sleep(1500);
  const state = await evaluate(`(() => {
    const rate = document.querySelector('input[name="exchangeRate"]');
    const markup = document.querySelector('input[name="markupPercent"]');
    if (!rate || !markup) return { rate: !!rate, markup: !!markup };
    // Bỏ ẩn mọi panel tab + nới trần cuộn của modal để thấy cả hai trường
    document.querySelectorAll('form div.hidden').forEach((d) => d.classList.remove('hidden'));
    const scroller = rate.closest('div.overflow-y-auto');
    if (scroller) { scroller.style.maxHeight = 'none'; scroller.scrollTop = Math.max(0, markup.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 420); }
    return { rate: rate.value, markup: markup.value };
  })()`);
  console.log("fields:", JSON.stringify(state));
  await sleep(700);
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}/2026-11-08-rate-provider.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT 2026-11-08-rate-provider");
}

main()
  .catch((e) => console.error(e))
  .finally(() => {
    try { console.log(fixture("clean")); } catch (e) { console.error(e); }
    mock.kill();
    chrome.kill();
    process.exit(0);
  });
