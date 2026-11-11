/** CÂN BẰNG TRANG NẠP TIỀN (2026-11-10): node scripts/shots-naptien-balanced.mjs
 *  Kiểm chứng trên bản production (server :3000 + fixture 4 phương thức + lịch sử mẫu):
 *  - desktop 1440: hai cột (thẻ nạp / cột phụ số dư + khai báo + thưởng) lệch đáy ≤ 80px
 *  - lịch sử nạp là mục full-width dưới lưới
 *  - bấm chọn USDT → gửi form tạo phiên → hiện panel chờ với địa chỉ mock BoltUtil
 *  - quay lại QR ngân hàng: panel ngân hàng còn nguyên (ảnh QR + số tài khoản)
 *  - mobile 390: không tràn ngang; chụp 2 ảnh toàn trang */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });
let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; };

const envRaw = readFileSync("/home/hatch/workspace/smmv2/.env", "utf8");
let secret = envRaw.split("\n").find((l) => l.startsWith("AUTH_SECRET")).split("=").slice(1).join("=").trim();
if ((secret.startsWith('"') && secret.endsWith('"')) || (secret.startsWith("'") && secret.endsWith("'"))) secret = secret.slice(1, -1);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const mint = (claims) => {
  const u = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sv: 0, iat: now, exp: now + 3600, ...claims })}`;
  return `${u}.${createHmac("sha256", secret).update(u).digest("base64url")}`;
};
const demoToken = mint({ uid: 2, role: "USER", username: "demo" });

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=old", "--disable-gpu", "--no-sandbox", "--disable-setuid-sandbox", "--hide-scrollbars",
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-naptien-balanced",
  "--remote-debugging-port=9393", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9393/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
async function navigate(url, waitMs = 3200) { await send("Page.navigate", { url }); await sleep(waitMs); }
async function setViewport(width, height, mobile) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: !!mobile });
}
async function captureFullPage(name) {
  const m = await send("Page.getLayoutMetrics");
  const size = m.cssContentSize || m.contentSize;
  const r = await send("Page.captureScreenshot", {
    format: "png", captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: Math.ceil(size.width), height: Math.ceil(size.height), scale: 1 },
  });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name, `${Math.ceil(size.width)}x${Math.ceil(size.height)}`);
}

const STATE = `(() => {
  const docY = (el) => Math.round(el.getBoundingClientRect().bottom + window.scrollY);
  const cards = [...document.querySelectorAll('.card')];
  const depCard = cards.find((c) => (c.textContent || "").includes("Phương thức thanh toán"));
  const grid = depCard ? depCard.parentElement : null;
  const kids = grid ? [...grid.children] : [];
  const left = kids[0], right = kids[1];
  const hist = cards.find((c) => (c.textContent || "").includes("Lịch sử nạp"));
  const tx = document.body.textContent || "";
  return {
    methods: ["QR ngân hàng", "PayPal", "Stripe", "USDT"].filter((x) => tx.includes(x)),
    leftBottom: left ? docY(left) : 0,
    rightBottom: right ? docY(right) : 0,
    leftWidth: left ? Math.round(left.getBoundingClientRect().width) : 0,
    rightWidth: right ? Math.round(right.getBoundingClientRect().width) : 0,
    histWidth: hist ? Math.round(hist.getBoundingClientRect().width) : 0,
    histTop: hist ? Math.round(hist.getBoundingClientRect().top + window.scrollY) : 0,
    gridBottom: grid ? docY(grid) : 0,
    hasBalanceCard: !!cards.find((c) => (c.textContent || "").includes("Số dư hiện tại")),
    hasDeclare: tx.includes("Đã chuyển khoản? Khai báo để đối soát nhanh hơn"),
    hasTiers: tx.includes("Thưởng nạp hiện tại"),
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
  };
})()`;

async function main() {
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
  await send("Network.enable");
  await setViewport(1440, 1100, false);
  await send("Network.setCookie", { name: "smmv2_session", value: demoToken, url: BASE + "/", path: "/" });
  await send("Network.setCookie", { name: "smmv2-lang", value: "vi", url: BASE + "/", path: "/" });
  await navigate(`${BASE}/`, 2500);
  await evaluate(`(() => { try { localStorage.setItem("smmv2-lang", "vi"); document.cookie = "smmv2-lang=vi; path=/; max-age=31536000; samesite=lax"; } catch (e) {} return true; })()`);

  // --- Desktop: cân bằng + đủ khối ---
  await navigate(`${BASE}/dashboard/nap-tien`, 4000);
  const s0 = await evaluate(STATE);
  console.log("DESKTOP", JSON.stringify(s0));
  ok(s0.methods.length === 4, `đủ 4 phương thức (${s0.methods.join(", ")})`);
  const diff = Math.abs(s0.leftBottom - s0.rightBottom);
  ok(diff <= 80, `hai cột lệch đáy ${diff}px (trái ${s0.leftBottom} / phải ${s0.rightBottom})`);
  ok(s0.hasBalanceCard && s0.hasDeclare && s0.hasTiers, "cột phụ đủ: số dư + form khai báo + thưởng nạp");
  ok(s0.histWidth >= 1000 && s0.histTop >= s0.gridBottom - 4, `lịch sử full-width dưới lưới (rộng ${s0.histWidth}px, top ${s0.histTop} >= đáy lưới ${s0.gridBottom})`);
  await captureFullPage("2026-11-10-naptien-balanced-desktop");

  // --- Luồng USDT: chọn method → tạo phiên → panel chờ hiện địa chỉ mock ---
  const clicked = await evaluate(`(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find((x) => (x.textContent || "").includes("USDT"));
    if (!b) return false;
    b.click();
    return true;
  })()`);
  ok(clicked === true, "bấm chọn phương thức USDT");
  await sleep(1200);
  const submit = await evaluate(`(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find((x) => (x.textContent || "").includes("Tạo phiên nạp USDT"));
    if (!b) return false;
    b.click();
    return true;
  })()`);
  ok(submit === true, "gửi form tạo phiên USDT");
  await sleep(5000);
  const afterUsdt = await evaluate(`(() => {
    const tx = document.body.textContent || "";
    return {
      url: location.href,
      hasPending: tx.includes("Đang chờ thanh toán"),
      hasMockAddr: tx.includes("TMockBoltAddress"),
      hasCountdown: tx.includes("Hết hạn sau"),
    };
  })()`);
  console.log("USDT_FLOW", JSON.stringify(afterUsdt));
  ok(afterUsdt.hasPending && afterUsdt.hasMockAddr, "phiên USDT tạo thành công: panel chờ hiện địa chỉ mock BoltUtil");
  ok(afterUsdt.hasCountdown, "panel chờ có đếm ngược hết hạn");

  // --- Quay lại QR ngân hàng: panel ngân hàng còn nguyên ---
  await navigate(`${BASE}/dashboard/nap-tien`, 4000);
  const bank = await evaluate(`(() => {
    const tx = document.body.textContent || "";
    const img = document.querySelector('img[alt*="VietQR"]');
    return { hasBank: tx.includes("Vietcombank"), hasAccount: tx.includes("0123456789"), hasQr: !!img, hasMomo: tx.includes("Ví MoMo") };
  })()`);
  console.log("BANK_PANEL", JSON.stringify(bank));
  ok(bank.hasBank && bank.hasAccount && bank.hasMomo, "panel QR ngân hàng + MoMo còn nguyên sau khi dời khối");

  // --- Mobile 390 ---
  await setViewport(390, 900, true);
  await navigate(`${BASE}/dashboard/nap-tien`, 4000);
  const sm = await evaluate(STATE);
  console.log("MOBILE", JSON.stringify(sm));
  ok(sm.overflowX === false, "mobile không tràn ngang");
  await captureFullPage("2026-11-10-naptien-balanced-mobile");

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => { try { chrome.kill(); } catch { /* noop */ } });
