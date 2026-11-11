/** TÁCH 2 THẺ TRANG NẠP TIỀN + KHÔI PHỤC Ô SỐ TIỀN KHAI BÁO (lệnh Tín 2026-11-10 20:49 + 20:50):
 *  node scripts/shots-naptien-split.mjs
 *  Kiểm chứng trên bản production (server :3000 + mock BoltUtil :3997 + fixture 4 phương thức):
 *  - lưới phương thức và panel là 2 THẺ .card RIÊNG (không thẻ bao chung), khe
 *    giữa hai thẻ desktop = 24px (gap-6), tiêu đề "Nạp tiền" nằm NGOÀI hai thẻ
 *  - lưới phương thức vẫn 2×2; panel ngân hàng giữ khối hợp nhất QR trên /
 *    nội dung CK dưới; chuyển đủ 4 phương thức, phiên USDT qua mock chạy
 *  - Ô SỐ TIỀN KHAI BÁO đã khôi phục: input[name="amount"] ("Số tiền đã
 *    chuyển") hiện trong thẻ panel khi chọn QR ngân hàng, kèm select kênh +
 *    nút "Gửi khai báo nạp"; điền 500000 + gửi -> flash "Đã ghi nhận" và 1
 *    dòng PENDING 500.000đ xuất hiện trong Lịch sử nạp (đúng hành vi cũ ở
 *    258a4fa: form gửi createDepositAction, ô này không lái số tiền vào QR)
 *  - ô số tiền của PayPal (usd) và USDT (vnd) vẫn hiện trong panel khi chọn
 *  - mobile 390: 2 thẻ xếp dọc (phương thức trên, panel dưới), khe 24px */
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
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-naptien-split",
  "--remote-debugging-port=9396", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9396/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
  const tx = document.body.textContent || "";
  const cards = [...document.querySelectorAll('.card')];
  const mCol = document.querySelector('[data-col="methods"]');
  const pCol = document.querySelector('[data-col="panel"]');
  const rect = (el) => el ? { left: Math.round(el.getBoundingClientRect().left), right: Math.round(el.getBoundingClientRect().right), top: Math.round(el.getBoundingClientRect().top + window.scrollY), bottom: Math.round(el.getBoundingClientRect().bottom + window.scrollY), width: Math.round(el.getBoundingClientRect().width) } : null;
  const img = document.querySelector('img[alt*="VietQR"]');
  const wrap = img ? img.closest('.max-w-3xl') : null;
  const acctEl = [...document.querySelectorAll('dl div')].find((d) => (d.textContent || "").includes("Số tài khoản"));
  const imgR = img ? img.getBoundingClientRect() : null;
  const acctR = acctEl ? acctEl.getBoundingClientRect() : null;
  const bonus = cards.find((c) => (c.textContent || "").includes("Thưởng nạp hiện tại"));
  const hist = cards.find((c) => (c.textContent || "").includes("Lịch sử nạp"));
  const mBtns = mCol ? [...mCol.querySelectorAll('button')] : [];
  const btnTops = [...new Set(mBtns.map((b) => Math.round(b.getBoundingClientRect().top)))];
  const btnLefts = [...new Set(mBtns.map((b) => Math.round(b.getBoundingClientRect().left)))];
  const h2 = [...document.querySelectorAll('h2')].find((h) => (h.textContent || "").trim() === "Nạp tiền");
  const amt = pCol ? pCol.querySelector('input[name="amount"]') : null;
  const amtR = amt ? amt.getBoundingClientRect() : null;
  const chanSel = pCol ? pCol.querySelector('select[name="method"]') : null;
  const vis = (el) => !!el && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
  return {
    methods: ["QR ngân hàng", "PayPal", "Stripe", "USDT"].filter((x) => tx.includes(x)),
    mRect: rect(mCol), pRect: rect(pCol),
    mIsCard: !!mCol && mCol.classList.contains("card"),
    pIsCard: !!pCol && pCol.classList.contains("card"),
    sharedCard: !!mCol && !!pCol && mCol !== pCol && [...cards].some((c) => c !== mCol && c !== pCol && c.contains(mCol) && c.contains(pCol)),
    gapX: mCol && pCol ? Math.round(pCol.getBoundingClientRect().left - mCol.getBoundingClientRect().right) : -1,
    gapY: mCol && pCol ? Math.round((pCol.getBoundingClientRect().top + window.scrollY) - (mCol.getBoundingClientRect().bottom + window.scrollY)) : -1,
    h2OutsideCard: !!h2 && !h2.closest(".card"),
    methodBtnCount: mBtns.length,
    gridRows: btnTops.length, gridCols: btnLefts.length,
    contentCount: ((document.body.innerText || "").match(/SMM DEMO01/g) || []).length,
    hasBalanceCard: tx.includes("Số dư hiện tại"),
    wrapHasAll: !!wrap && ["0123456789", "Vietcombank", "NGUYEN VAN A", "Ví MoMo", "0901234567", "Nạp tối thiểu"].every((x) => (wrap.textContent || "").includes(x)),
    qrAboveRows: !!imgR && !!acctR && imgR.bottom <= acctR.top + 2,
    imgInPanel: !!imgR && !!pCol && imgR.left >= pCol.getBoundingClientRect().left - 1 && imgR.right <= pCol.getBoundingClientRect().right + 1,
    panelText: pCol ? (pCol.textContent || "") : "",
    amtVisible: vis(amt),
    amtMin: amt ? amt.getAttribute("min") : null,
    amtBelowQr: !!amtR && !!imgR && amtR.top >= imgR.bottom - 2,
    chanVisible: vis(chanSel),
    hasDeclareBtn: !!pCol && [...pCol.querySelectorAll('button')].some((b) => (b.textContent || "").includes("Gửi khai báo nạp")),
    usdVisible: vis(pCol ? pCol.querySelector('input[name="usd"]') : null),
    vndVisible: vis(pCol ? pCol.querySelector('input[name="vnd"]') : null),
    bonusWidth: bonus ? Math.round(bonus.getBoundingClientRect().width) : 0,
    bonusTop: bonus ? Math.round(bonus.getBoundingClientRect().top + window.scrollY) : 0,
    histWidth: hist ? Math.round(hist.getBoundingClientRect().width) : 0,
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
  };
})()`;

const clickMethod = (name) => `(() => {
  const col = document.querySelector('[data-col="methods"]');
  const b = col ? [...col.querySelectorAll('button')].find((x) => (x.textContent || "").includes(${JSON.stringify(name)})) : null;
  if (!b) return false; b.click(); return true;
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
  try { await send("Browser.grantPermissions", { origin: BASE, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] }); } catch { /* bản chrome cũ có thể không hỗ trợ */ }
  await setViewport(1440, 1100, false);
  await send("Network.setCookie", { name: "smmv2_session", value: demoToken, url: BASE + "/", path: "/" });
  await send("Network.setCookie", { name: "smmv2-lang", value: "vi", url: BASE + "/", path: "/" });
  await navigate(`${BASE}/`, 2500);
  await evaluate(`(() => { try { localStorage.setItem("smmv2-lang", "vi"); document.cookie = "smmv2-lang=vi; path=/; max-age=31536000; samesite=lax"; } catch (e) {} return true; })()`);

  // --- Desktop: 2 thẻ tách hẳn ---
  await navigate(`${BASE}/dashboard/nap-tien`, 4000);
  const s0 = await evaluate(STATE);
  console.log("DESKTOP", JSON.stringify(s0));
  ok(s0.methods.length === 4, `đủ 4 phương thức (${s0.methods.join(", ")})`);
  ok(s0.mIsCard && s0.pIsCard, "cột methods và cột panel mỗi bên là MỘT thẻ .card riêng");
  ok(!s0.sharedCard, "không còn thẻ .card chung bao cả hai cột");
  ok(s0.gapX >= 20 && s0.gapX <= 28, `khe ngang giữa 2 thẻ desktop = ${s0.gapX}px (kỳ vọng ~24)`);
  ok(s0.h2OutsideCard, 'tiêu đề "Nạp tiền" nằm NGOÀI hai thẻ (tiêu đề mục)');
  ok(s0.methodBtnCount === 4 && s0.gridRows === 2 && s0.gridCols === 2, `lưới phương thức vẫn 2×2 (rows=${s0.gridRows}, cols=${s0.gridCols})`);
  ok(s0.mRect && s0.pRect && s0.mRect.right <= s0.pRect.left, "thẻ methods bên TRÁI, thẻ panel bên PHẢI");
  ok(s0.wrapHasAll, "panel ngân hàng: QR + toàn bộ nội dung CK trong cùng khối hợp nhất");
  ok(s0.qrAboveRows && s0.imgInPanel, "QR ở trên các dòng nội dung, nằm trọn trong thẻ panel");
  ok(s0.contentCount === 2, `nội dung CK chỉ hiện trong khối hợp nhất — 2 lần, thực tế ${s0.contentCount}`);
  ok(!s0.hasBalanceCard, "vẫn giữ: không thẻ số dư");
  ok(s0.bonusWidth >= 1000 && s0.histWidth >= 1000 && s0.bonusTop >= Math.max(s0.mRect?.bottom || 0, s0.pRect?.bottom || 0) - 4, `thưởng + lịch sử full-width dưới 2 thẻ (thưởng ${s0.bonusWidth}px, lịch sử ${s0.histWidth}px)`);

  // --- Ô số tiền khai báo đã khôi phục ---
  ok(s0.amtVisible, 'ô "Số tiền đã chuyển" (input[name=amount]) HIỆN trong thẻ panel khi chọn QR ngân hàng');
  ok(s0.amtMin === "10000", `ô số tiền có min = deposit_min (${s0.amtMin})`);
  ok(s0.amtBelowQr, "ô số tiền nằm trong khối dưới panel ngân hàng (sau QR + nội dung CK, đúng vị trí form cũ)");
  ok(s0.chanVisible && s0.hasDeclareBtn, 'kèm select "Kênh" + nút "Gửi khai báo nạp" như form cũ');

  // Điền số tiền rồi chụp desktop (ảnh bàn giao thấy rõ ô số tiền đã trở lại)
  await evaluate(`(() => {
    const inp = document.querySelector('[data-col="panel"] input[name="amount"]');
    if (!inp) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(inp, "500000");
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    inp.dispatchEvent(new Event("change", { bubbles: true }));
    return inp.value;
  })()`);
  await captureFullPage("2026-11-10-naptien-split-desktop");

  // --- Nút chép ở dòng Số tài khoản ---
  const copied = await evaluate(`(() => {
    const row = [...document.querySelectorAll('dl div')].find((d) => (d.textContent || "").includes("Số tài khoản"));
    const btn = row ? row.querySelector('button') : null;
    if (!btn) return "nobtn";
    btn.click();
    return "clicked";
  })()`);
  ok(copied === "clicked", "bấm nút chép ở dòng Số tài khoản");
  await sleep(600);
  const copyFb = await evaluate(`(() => {
    const row = [...document.querySelectorAll('dl div')].find((d) => (d.textContent || "").includes("Số tài khoản"));
    const btn = row ? row.querySelector('button') : null;
    return btn ? btn.className.includes("emerald") : false;
  })()`);
  ok(copyFb === true, "nút chép hiện phản hồi đã chép (viền xanh + dấu tick)");

  // --- Gửi khai báo: đúng hành vi cũ — tạo yêu cầu nạp PENDING + flash ---
  const submitted = await evaluate(`(() => {
    const col = document.querySelector('[data-col="panel"]');
    const b = col ? [...col.querySelectorAll('button')].find((x) => (x.textContent || "").includes("Gửi khai báo nạp")) : null;
    if (!b) return false; b.click(); return true;
  })()`);
  ok(submitted === true, 'gửi form khai báo bằng nút "Gửi khai báo nạp"');
  await sleep(4500);
  const afterDeclare = await evaluate(`(() => {
    const tx = document.body.innerText || "";
    const hist = [...document.querySelectorAll('.card')].find((c) => (c.textContent || "").includes("Lịch sử nạp"));
    return { flash: tx.includes("Đã ghi nhận"), histText: hist ? (hist.textContent || "") : "" };
  })()`);
  console.log("DECLARE", JSON.stringify(afterDeclare));
  ok(afterDeclare.flash, 'sau khi gửi: flash "Đã ghi nhận..." hiện (đúng thông điệp createDepositAction)');
  ok(afterDeclare.histText.includes("500.000") && afterDeclare.histText.includes("Chờ"), "Lịch sử nạp có dòng khai báo 500.000đ trạng thái chờ duyệt");

  // --- PayPal / Stripe: ô USD hiện trong thẻ panel ---
  ok(await evaluate(clickMethod("PayPal")) === true, "bấm chọn PayPal");
  await sleep(1000);
  const sPp = await evaluate(STATE);
  ok(sPp.panelText.includes("Thanh toán qua PayPal") && sPp.usdVisible, 'panel PayPal hiện trong thẻ phải, ô số tiền USD (input[name=usd]) hiện rõ');
  ok(await evaluate(clickMethod("Stripe")) === true, "bấm chọn Stripe");
  await sleep(1000);
  const sSt = await evaluate(STATE);
  ok(sSt.panelText.includes("Thanh toán qua Stripe") && sSt.usdVisible, 'panel Stripe hiện trong thẻ phải, ô số tiền USD hiện rõ');

  // --- USDT: ô VNĐ hiện trong panel + tạo phiên qua mock ---
  ok(await evaluate(clickMethod("USDT")) === true, "bấm chọn USDT");
  await sleep(1000);
  const sUs = await evaluate(STATE);
  ok(sUs.vndVisible, 'panel USDT: ô "Số tiền nạp (VNĐ)" (input[name=vnd]) hiện rõ trong thẻ panel');
  const submit = await evaluate(`(() => {
    const col = document.querySelector('[data-col="panel"]');
    const b = col ? [...col.querySelectorAll('button')].find((x) => (x.textContent || "").includes("Tạo phiên nạp USDT")) : null;
    if (!b) return false; b.click(); return true;
  })()`);
  ok(submit === true, "gửi form tạo phiên USDT trong thẻ panel");
  await sleep(5000);
  const afterUsdt = await evaluate(`(() => {
    const col = document.querySelector('[data-col="panel"]');
    const tx = col ? (col.textContent || "") : "";
    return { hasPending: tx.includes("Đang chờ thanh toán"), hasMockAddr: tx.includes("TMockBoltAddress"), hasCountdown: tx.includes("Hết hạn sau") };
  })()`);
  console.log("USDT_FLOW", JSON.stringify(afterUsdt));
  ok(afterUsdt.hasPending && afterUsdt.hasMockAddr && afterUsdt.hasCountdown, "phiên USDT tạo thành công: panel chờ + địa chỉ mock + đếm ngược trong thẻ panel");

  // --- Quay lại QR ngân hàng: khối hợp nhất + ô số tiền còn nguyên ---
  await navigate(`${BASE}/dashboard/nap-tien`, 4000);
  const s1 = await evaluate(STATE);
  ok(s1.wrapHasAll && s1.qrAboveRows && s1.imgInPanel && s1.amtVisible, "quay lại panel ngân hàng: khối hợp nhất + ô số tiền khai báo còn nguyên trong thẻ panel");

  // --- Mobile 390: 2 thẻ xếp dọc, khe 24px ---
  await setViewport(390, 900, true);
  await navigate(`${BASE}/dashboard/nap-tien`, 4000);
  const sm = await evaluate(STATE);
  console.log("MOBILE", JSON.stringify(sm));
  ok(sm.overflowX === false, "mobile không tràn ngang");
  ok(sm.mIsCard && sm.pIsCard && !sm.sharedCard, "mobile: vẫn 2 thẻ riêng, không thẻ bao chung");
  ok(!!sm.mRect && !!sm.pRect && sm.mRect.bottom <= sm.pRect.top, "mobile: thẻ phương thức nằm TRÊN thẻ panel");
  ok(sm.gapY >= 20 && sm.gapY <= 28, `khe dọc giữa 2 thẻ mobile = ${sm.gapY}px (kỳ vọng ~24)`);
  ok(sm.wrapHasAll && sm.qrAboveRows && sm.amtVisible, "mobile: khối hợp nhất nguyên vẹn + ô số tiền khai báo hiện trong thẻ panel");
  await captureFullPage("2026-11-10-naptien-split-mobile");

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => { try { chrome.kill(); } catch { /* noop */ } });
