/** NGHIỆM THU TRANG NẠP TIỀN theo spec chốt (2026-11-10, sau đợt bỏ MoMo):
 *  node scripts/shots-naptien-accept.mjs
 *  Điều kiện: server production :3000 + mock BoltUtil :3997 + fixture
 *  scripts/naptien-balance-fixture.ts.
 *  0. Panel ngân hàng KHÔNG có Ví MoMo — chỉ ngân hàng, cộng tự động qua SePay.
 *  1. Cột trái = lưới 2×2 (không phải 4 hàng dọc); card lưới và card panel là
 *     HAI card riêng, khe giữa là nền trang.
 *  2. Cột phải chỉ chứa panel của method đang chọn: QR trên, thông tin CK
 *     (ngân hàng/STK/chủ TK/nội dung CK + nút chép) ngay dưới trong cùng cột.
 *  3. Ô số tiền + nút ở card TRÁI; chưa bấm hợp lệ thì bên phải trống; bấm
 *     xong QR mang đúng số tiền đã nhập.
 *  4. KHÔNG có card Số dư, KHÔNG có form/card khai báo đối soát ở bất cứ đâu.
 *  5. Dải thưởng + lịch sử full-width phía dưới; mobile xếp: lưới trước,
 *     panel sau.
 *  6. ĐO chênh đáy 2 cột theo bố cục 2×2 hiện tại và in số thật (không đệm).
 *  7. Bấm thử đủ 4 method: panel phải đi theo lựa chọn; tạo phiên USDT qua
 *     mock chạy; nút chép có phản hồi (viền xanh + tick). */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";

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
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-naptien-accept",
  "--remote-debugging-port=9401", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9401/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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

const GEO = `(() => {
  const tx = document.body.innerText || "";
  const mCol = document.querySelector('[data-col="methods"]');
  const pCol = document.querySelector('[data-col="panel"]');
  const rect = (el) => el ? { left: Math.round(el.getBoundingClientRect().left), right: Math.round(el.getBoundingClientRect().right), top: Math.round(el.getBoundingClientRect().top + window.scrollY), bottom: Math.round(el.getBoundingClientRect().bottom + window.scrollY), width: Math.round(el.getBoundingClientRect().width), height: Math.round(el.getBoundingClientRect().height) } : null;
  // Các ô method: nút con trực tiếp của lưới .grid-cols-2 trong card methods.
  // (Selector lỏng '.grid button' bắt thừa cả nút "Nạp tiền" vì tổ tiên ngoài
  // card cũng có class grid — bài học debug 2026-11-10.)
  const tiles = mCol ? [...mCol.querySelectorAll('.grid.grid-cols-2 > button')] : [];
  const tops = [...new Set(tiles.map((b) => Math.round(b.getBoundingClientRect().top)))];
  const lefts = [...new Set(tiles.map((b) => Math.round(b.getBoundingClientRect().left)))];
  const img = document.querySelector('img[alt*="VietQR"]');
  const cards = [...document.querySelectorAll('.card')];
  const bonus = cards.find((c) => (c.textContent || "").includes("Thưởng nạp hiện tại"));
  const hist = cards.find((c) => (c.textContent || "").includes("Lịch sử nạp"));
  const mCard = mCol ? mCol.closest('.card') : null;
  const pCard = pCol ? pCol.closest('.card') : null;
  return {
    text: tx,
    hasMomo: /momo/i.test(tx),
    hasBalanceCard: tx.includes("Số dư hiện tại"),
    hasDeclare: tx.includes("Khai báo") || !!document.querySelector('input[name="amount"]'),
    tileCount: tiles.length,
    tileRows: tops.length, tileCols: lefts.length,
    mRect: rect(mCol), pRect: rect(pCol),
    gapX: mCol && pCol ? Math.round(pCol.getBoundingClientRect().left - mCol.getBoundingClientRect().right) : -1,
    separateCards: !!mCard && !!pCard && mCard !== pCard,
    qrAboveInfo: (() => { if (!img || !pCol) return false; const dl = pCol.querySelector('dl'); if (!dl) return false; return img.getBoundingClientRect().bottom <= dl.getBoundingClientRect().top; })(),
    qrInPanel: !!img && !!pCol && pCol.contains(img),
    qrSrc: img ? img.getAttribute("src") : null,
    panelText: pCol ? (pCol.textContent || "") : "",
    bonusWidth: bonus ? Math.round(bonus.getBoundingClientRect().width) : 0,
    histWidth: hist ? Math.round(hist.getBoundingClientRect().width) : 0,
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
  };
})()`;

const clickMethod = (name) => `(() => {
  const col = document.querySelector('[data-col="methods"]');
  const b = col ? [...col.querySelectorAll('button')].find((x) => (x.textContent || "").includes(${JSON.stringify(name)})) : null;
  if (!b) return false; b.click(); return true;
})()`;
const clickConfirm = `(() => {
  const col = document.querySelector('[data-col="methods"]');
  const b = col ? [...col.querySelectorAll('button')].find((x) => (x.textContent || "").trim() === "Nạp tiền") : null;
  if (!b) return false; b.click(); return true;
})()`;
async function typeAmount(digits) {
  await evaluate(`(() => { const i = document.querySelector('[data-col="methods"] input[name="bankAmount"]'); if (!i) return false; i.focus(); i.select(); return true; })()`);
  await send("Input.insertText", { text: digits });
  await sleep(300);
}

async function main() {
  const prisma = new PrismaClient();
  ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
  };
  try {
    await prisma.setting.upsert({ where: { key: "deposit_bonus_tiers" }, create: { key: "deposit_bonus_tiers", value: JSON.stringify([{ from: 500000, percent: 10 }]) }, update: { value: JSON.stringify([{ from: 500000, percent: 10 }]) } });
    const demo = await prisma.user.findUnique({ where: { username: "demo" } });
    await prisma.deposit.deleteMany({ where: { userId: demo.id, method: "USDT", status: "PENDING", externalId: { startsWith: "bolt:" } } });

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

    // --- Desktop: trạng thái đầu ---
    await navigate(`${BASE}/dashboard/nap-tien`, 4000);
    const g0 = await evaluate(GEO);
    ok(g0.tileCount === 4 && g0.tileRows === 2 && g0.tileCols === 2, `điểm 1: lưới method đúng 2×2 (${g0.tileCount} ô, ${g0.tileRows} hàng × ${g0.tileCols} cột — không phải 4 hàng dọc)`);
    ok(!g0.pRect, "điểm 3: chưa bấm -> cột phải TRỐNG (không thẻ panel)");
    ok(!g0.hasBalanceCard, "điểm 4: KHÔNG có card Số dư hiện tại");
    ok(!g0.hasDeclare, "điểm 4: KHÔNG có form/card khai báo đối soát");
    ok(!g0.hasMomo, "điểm 0: trang không còn chữ MoMo");

    // --- Bấm hợp lệ: panel hiện ---
    await typeAmount("500000");
    ok(await evaluate(clickConfirm) === true, 'bấm "Nạp tiền" 500.000');
    await sleep(900);
    const g1 = await evaluate(GEO);
    ok(!!g1.pRect, "điểm 3: bấm xong thẻ panel hiện ở cột phải");
    ok(g1.separateCards, "điểm 1: card lưới và card panel là HAI card riêng (không chung thẻ bao)");
    ok(g1.gapX >= 20 && g1.gapX <= 28, `điểm 1: khe giữa 2 card là nền trang ~24px (thực tế ${g1.gapX}px)`);
    ok(g1.qrInPanel && g1.qrAboveInfo, "điểm 2: QR nằm trong cột phải, ở TRÊN khối thông tin chuyển khoản");
    ok(["Vietcombank", "0123456789", "NGUYEN VAN A", "SMM DEMO01"].every((x) => g1.panelText.includes(x)), "điểm 2: đủ thông tin CK ngay dưới QR (ngân hàng/STK/chủ TK/nội dung CK)");
    ok(!!g1.qrSrc && g1.qrSrc.includes("amount=500000"), `điểm 3: QR mang đúng số tiền đã nhập (amount=500000)`);
    ok(!g1.hasMomo && !g1.panelText.includes("Ví MoMo"), "điểm 0: panel ngân hàng KHÔNG có khối Ví MoMo — chỉ ngân hàng, ghi chú cộng tự động qua SePay: " + g1.panelText.includes("SePay"));
    const bottomDiff = Math.abs(g1.mRect.bottom - g1.pRect.bottom);
    console.log(`MEASURE điểm 6: card methods ${g1.mRect.width}x${g1.mRect.height}px (đáy ${g1.mRect.bottom}), card panel ${g1.pRect.width}x${g1.pRect.height}px (đáy ${g1.pRect.bottom}) -> CHÊNH ĐÁY = ${bottomDiff}px (hai card cao gần bằng nhau nhờ nội dung thật của chúng: trái = lưới 2×2 + ô tiền + nút, phải = QR 200px + các dòng thông tin — không đệm nội dung giả)`);
    ok(g1.bonusWidth >= 1000 && g1.histWidth >= 1000, `điểm 5: dải Thưởng nạp (${g1.bonusWidth}px) + Lịch sử nạp (${g1.histWidth}px) full-width phía dưới`);
    await captureFullPage("2026-11-10-naptien-accept-desktop");

    // --- Nút chép có phản hồi ---
    const copyFb = await evaluate(`(async () => {
      const col = document.querySelector('[data-col="panel"]');
      const btns = col ? [...col.querySelectorAll('button')] : [];
      if (!btns.length) return { clicked: false };
      btns[0].click();
      await new Promise((r) => setTimeout(r, 400));
      return { clicked: true, feedback: btns[0].className.includes("emerald") };
    })()`);
    ok(copyFb.clicked && copyFb.feedback, "điểm 7: nút chép ở dòng STK có phản hồi (viền xanh + tick) sau khi bấm");

    // --- Bấm thử PayPal / Stripe / USDT ---
    ok(await evaluate(clickMethod("PayPal")) === true, "chọn PayPal");
    await sleep(800);
    const gP = await evaluate(GEO);
    ok(!!gP.pRect && gP.panelText.includes("Thanh toán qua PayPal"), "điểm 7: PayPal -> panel phải hiện form PayPal");

    ok(await evaluate(clickMethod("Stripe")) === true, "chọn Stripe");
    await sleep(800);
    const gS = await evaluate(GEO);
    ok(!!gS.pRect && gS.panelText.includes("Thanh toán qua Stripe"), "điểm 7: Stripe -> panel phải hiện form Stripe");

    ok(await evaluate(clickMethod("USDT")) === true, "chọn USDT");
    await sleep(800);
    const submit = await evaluate(`(() => {
      const col = document.querySelector('[data-col="panel"]');
      const b = col ? [...col.querySelectorAll('button')].find((x) => (x.textContent || "").includes("Tạo phiên nạp USDT")) : null;
      if (!b) return false; b.click(); return true;
    })()`);
    ok(submit === true, "điểm 7: USDT -> panel có form tạo phiên, đã gửi");
    await sleep(5000);
    const gU = await evaluate(GEO);
    ok(gU.panelText.includes("Đang chờ thanh toán") && gU.panelText.includes("TMockBoltAddress"), "điểm 7: phiên USDT tạo thành công qua mock (panel chờ + địa chỉ mock)");

    // --- Mobile ---
    await setViewport(390, 900, true);
    await navigate(`${BASE}/dashboard/nap-tien`, 4000);
    ok(await evaluate(clickMethod("QR ngân hàng")) === true, "mobile: chọn QR ngân hàng");
    await sleep(600);
    await typeAmount("500000");
    await evaluate(clickConfirm);
    await sleep(900);
    const gm = await evaluate(GEO);
    ok(gm.tileRows === 2 && gm.tileCols === 2, "mobile: lưới method vẫn 2×2");
    ok(!!gm.mRect && !!gm.pRect && gm.mRect.bottom <= gm.pRect.top, "điểm 5: mobile xếp dọc — lưới method ở trên, panel ở dưới");
    ok(gm.overflowX === false && !gm.hasMomo, "mobile: không tràn ngang, không MoMo");
    await captureFullPage("2026-11-10-naptien-accept-mobile");
  } finally {
    await prisma.setting.deleteMany({ where: { key: "deposit_bonus_tiers" } }).catch(() => {});
    await prisma.$disconnect();
  }

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => { try { chrome.kill(); } catch { /* noop */ } });
