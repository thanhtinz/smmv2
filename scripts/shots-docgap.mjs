/** Ảnh kiểm chứng đợt ĐỐI CHIẾU TÀI LIỆU FZR (2026-11-09):
 *  1) Admin → Nhà cung cấp: khối FZR có "Webhook phía FZR", nút "Gửi webhook
 *     test" và danh sách "Biến động số dư FZR gần nhất" (từ mock).
 *  2) Khách → chi tiết Game Key Cyberpunk (gk-3): hiện danh sách quốc gia
 *     kích hoạt được / không kích hoạt được từ region-restriction.
 * Cần: server production :3000 + fixture docgap (script tự chạy) + mock.
 *   node scripts/shots-docgap.mjs */
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });
let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; };
const prisma = new PrismaClient();
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

const mock = spawn("node", ["scripts/mock-fzr.mjs"], { env: { ...process.env, MOCK_FZR_PORT: "3998" }, stdio: "ignore" });
const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=old", "--disable-gpu", "--no-sandbox", "--disable-setuid-sandbox", "--hide-scrollbars",
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-docgap",
  "--remote-debugging-port=9379", "--window-size=1440,1150",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });

let msgId = 0;
const pending = new Map();
let ws; let sessionId = null;
function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
}
async function evaluate(expr) {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || "eval error");
  return r.result?.value;
}
async function shot(path) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  const { writeFileSync } = await import("node:fs");
  writeFileSync(path, Buffer.from(r.data, "base64"));
}

async function main() {
  for (let i = 0; i < 40; i++) { try { const r = await fetch("http://127.0.0.1:3998/__log"); if (r.ok) break; } catch {} await sleep(250); }
  execFileSync("npx", ["tsx", "scripts/docgap-fixture.ts", "seed"], { cwd: "/home/hatch/workspace/smmv2", stdio: "inherit", env: { ...process.env, PRISMA_QUERY_ENGINE_LIBRARY: "/home/hatch/workspace/smmv2/node_modules/@prisma/engines/libquery_engine-debian-openssl-3.0.x.so.node", PRISMA_SCHEMA_ENGINE_BINARY: "/home/hatch/workspace/smmv2/node_modules/@prisma/engines/schema-engine-debian-openssl-3.0.x" } });

  const admin = await prisma.user.findUnique({ where: { username: "admin" } });
  const demo = await prisma.user.findUnique({ where: { username: "demo" } });
  const cp = await prisma.premiumProduct.findFirst({ where: { providerProductId: "gk-3" }, select: { id: true } });
  ok(!!cp, "fixture: có sản phẩm Cyberpunk gk-3");

  let wsEndpoint = null;
  for (let i = 0; i < 50; i++) { try { const r = await fetch("http://127.0.0.1:9379/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) { wsEndpoint = j.webSocketDebuggerUrl; break; } } catch {} await sleep(200); }
  if (!wsEndpoint) throw new Error("chrome CDP không lên");
  ws = new WebSocket(wsEndpoint);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
  };
  const targets = await send("Target.getTargets");
  const page = targets.targetInfos.find((t) => t.type === "page");
  const att = await send("Target.attachToTarget", { targetId: page.targetId, flatten: true });
  sessionId = att.sessionId;
  await send("Page.enable");
  await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true }).catch(() => {});

  async function goto(url, token) {
    await send("Network.setCookie", { name: "smmv2_session", value: token, url: BASE, path: "/" });
    await send("Page.navigate", { url });
    await sleep(1800);
    // Đặt cookie ngôn ngữ ngay trong trang rồi tải lại (Network.setCookie
    // qua CDP không ăn với cookie này trong headless cũ).
    await evaluate("document.cookie = 'smmv2-lang=vi; path=/'; document.cookie");
    await send("Page.reload", { ignoreCache: true });
    await sleep(2400);
  }

  /* 1) Admin nhà cung cấp */
  await goto(`${BASE}/admin/nha-cung-cap`, mint({ uid: admin.id, role: "ADMIN", username: "admin", amr: "passkey" }));
  const adminText = await evaluate("document.body.innerText");
  ok(adminText.includes("Biến động số dư FZR gần nhất"), "trang NCC hiện khối biến động số dư FZR");
  ok(adminText.includes("Webhook phía FZR") && adminText.includes("Đang bật"), "trang NCC hiện trạng thái webhook phía FZR");
  ok(adminText.includes("Gửi webhook test"), "trang NCC có nút Gửi webhook test");
  ok(adminText.includes("USDT top-up"), "danh sách giao dịch hiện từ mock FZR");
  ok(adminText.includes("Theo username (API Telegram)"), "đường giao Telegram ghi đúng theo tài liệu");
  await shot(`${OUT}/2026-11-09-docgap-provider.png`);

  /* 2) Chi tiết Game Key Cyberpunk phía khách */
  await goto(`${BASE}/dashboard/game-key/${cp.id}`, mint({ uid: demo.id, role: "USER", username: "demo" }));
  const gkText = await evaluate("document.body.innerText");
  ok(gkText.includes("Không kích hoạt được tại") && gkText.includes("Vietnam"), "chi tiết GK hiện quốc gia KHÔNG kích hoạt được (có Vietnam)");
  ok(gkText.includes("Kích hoạt được tại") && gkText.includes("Russia"), "chi tiết GK hiện quốc gia kích hoạt được (có Russia)");
  await evaluate("(() => { const els = [...document.querySelectorAll('p')]; const el = els.find((x) => x.textContent.includes('Không kích hoạt được tại')); if (el) el.scrollIntoView({ block: 'center' }); })()");
  await sleep(700);
  await shot(`${OUT}/2026-11-09-docgap-gamekey.png`);

  execFileSync("npx", ["tsx", "scripts/docgap-fixture.ts", "clean"], { cwd: "/home/hatch/workspace/smmv2", stdio: "inherit", env: { ...process.env, PRISMA_QUERY_ENGINE_LIBRARY: "/home/hatch/workspace/smmv2/node_modules/@prisma/engines/libquery_engine-debian-openssl-3.0.x.so.node", PRISMA_SCHEMA_ENGINE_BINARY: "/home/hatch/workspace/smmv2/node_modules/@prisma/engines/schema-engine-debian-openssl-3.0.x" } });
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAIL`);
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => { try { chrome.kill(); } catch {} try { mock.kill(); } catch {} setTimeout(() => process.exit(process.exitCode || 0), 400); });
