/* Kiểm chứng đợt chốt cuối (2026-11-08) bằng CDP:
   1) /dashboard/premium/<slug> (đăng nhập demo): ĐÚNG 1 lá menu khách sáng
      và lá đó là href "/premium" (mục Tất cả sản phẩm) — luật 1-điểm-sáng.
   2) /admin/cau-hinh-nap-tien (admin, tắt 2FA tạm): thẻ BoltUtil có nhãn
      "Cách khách trả USDT" + 2 lựa chọn đã giải thích tiếng Việt, KHÔNG
      còn nhãn "Hình thức thanh toán" trên trang này.
   Khôi phục admin_2fa_required sau khi chạy. */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const BASE = "http://127.0.0.1:3000";
const envRaw = readFileSync("/home/hatch/workspace/smmv2/.env", "utf8");
let secret = envRaw.split("\n").find((l) => l.startsWith("AUTH_SECRET")).split("=").slice(1).join("=").trim();
if ((secret.startsWith('"') && secret.endsWith('"')) || (secret.startsWith("'") && secret.endsWith("'"))) secret = secret.slice(1, -1);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const mint = (claims) => { const u = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sv: 0, iat: now, exp: now + 3600, ...claims })}`; return `${u}.${createHmac("sha256", secret).update(u).digest("base64url")}`; };

const prisma = new PrismaClient();
let fails = 0;
const ok = (cond, label) => { console.log((cond ? "PASS  " : "FAIL  ") + label); if (!cond) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let prev2fa = null;

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome",
  ["--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars", "--remote-debugging-port=9377", "--window-size=1440,1100",
   "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests", "about:blank"], { stdio: "ignore" });
async function wsUrl() { for (let i = 0; i < 50; i++) { try { const r = await fetch("http://127.0.0.1:9377/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch {} await sleep(200); } throw new Error("no cdp"); }
let msgId = 0; const pending = new Map(); let ws; let sessionId = null;
function send(method, params = {}) { const id = ++msgId; return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }); }
async function evaluate(expr) { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; }
async function navigate(url, wait = 2800) { await send("Page.navigate", { url }); await sleep(wait); }

try {
  prev2fa = (await prisma.setting.findUnique({ where: { key: "admin_2fa_required" } }))?.value ?? null;
  ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } };
  const targets = await (await fetch("http://127.0.0.1:9377/json/list")).json();
  const page = targets.find((t) => t.type === "page");
  const att = await send("Target.attachToTarget", { targetId: page.id, flatten: true }).catch(() => null);
  if (att?.sessionId) sessionId = att.sessionId;
  await send("Page.enable"); await send("Network.enable"); await send("Runtime.enable");

  /* 1) Highlight menu ở /dashboard/premium/<slug> */
  await send("Network.setCookie", { name: "smmv2_session", value: mint({ uid: 2, role: "USER", username: "demo" }), url: BASE, httpOnly: true });
  await navigate(`${BASE}/dashboard/premium/youtube-premium`);
  const winners = await evaluate(`(() => {
    const as = [...document.querySelectorAll('aside a, nav a')].filter(a => (a.className || '').includes('bg-brand-50'));
    return as.map(a => ({ href: a.getAttribute('href'), text: (a.textContent || '').trim().slice(0, 40) }));
  })()`);
  ok(Array.isArray(winners) && winners.length === 1, `đúng 1 lá menu sáng ở /dashboard/premium/...: ${JSON.stringify(winners)}`);
  ok(winners?.[0]?.href === "/premium", `lá sáng là Tất cả sản phẩm (href /premium): ${winners?.[0]?.text}`);

  /* Trang thường đối chứng: /dashboard/don-premium sáng đúng lá của nó */
  await navigate(`${BASE}/dashboard/don-premium`);
  const winners2 = await evaluate(`(() => {
    const as = [...document.querySelectorAll('aside a, nav a')].filter(a => (a.className || '').includes('bg-brand-50'));
    return as.map(a => a.getAttribute('href'));
  })()`);
  ok(Array.isArray(winners2) && winners2.length === 1 && winners2[0] === "/dashboard/don-premium", `đối chứng /dashboard/don-premium: 1 lá sáng đúng trang: ${JSON.stringify(winners2)}`);

  /* 2) Nhãn BoltUtil trong admin */
  await prisma.setting.upsert({ where: { key: "admin_2fa_required" }, create: { key: "admin_2fa_required", value: "0" }, update: { value: "0" } });
  await send("Network.setCookie", { name: "smmv2_session", value: mint({ uid: 1, role: "ADMIN", username: "admin" }), url: BASE, httpOnly: true });
  await send("Network.setCookie", { name: "smmv2-lang", value: "vi", url: BASE });
  await evaluate(`localStorage.setItem('smmv2-lang', 'vi'); localStorage.setItem('smmv2-cur', 'VND'); true`);
  await navigate(`${BASE}/admin/cau-hinh-nap-tien`);
  const bolt = await evaluate(`(() => {
    const text = document.body.innerText || '';
    return {
      hasNewLabel: text.includes('Cách khách trả USDT'),
      hasManualOpt: text.includes('Chuyển khoản thủ công tới địa chỉ ví hiển thị'),
      hasWalletOpt: text.includes('Trang thanh toán BoltUtil'),
      hasOldLabel: text.includes('Hình thức thanh toán'),
      hasExplain: text.includes('không giữ tiền'),
    };
  })()`);
  ok(bolt.hasNewLabel, "thẻ BoltUtil có nhãn 'Cách khách trả USDT'");
  ok(bolt.hasManualOpt && bolt.hasWalletOpt, "2 lựa chọn đã giải thích tiếng Việt");
  ok(bolt.hasExplain, "có đoạn giải thích dưới select");
  ok(!bolt.hasOldLabel, "trang nạp tiền admin không còn nhãn 'Hình thức thanh toán'");
} catch (e) {
  console.error("CDP ERROR:", e?.message || e);
  fails++;
} finally {
  if (prev2fa !== null) await prisma.setting.upsert({ where: { key: "admin_2fa_required" }, create: { key: "admin_2fa_required", value: prev2fa }, update: { value: prev2fa } });
  try { chrome.kill(); } catch {}
  await prisma.$disconnect();
}
console.log(fails === 0 ? "ALL PASS" : `${fails} FAIL`);
process.exit(fails ? 1 : 0);
