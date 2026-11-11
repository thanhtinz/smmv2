/** NGHIỆM THU panel QR ngân hàng theo ẢNH MẪU của Tín (2026-11-10 21:32) +
 *  đếm ngược theo TÀI LIỆU SEPAY (21:34):
 *  node scripts/shots-naptien-ref.mjs            -> bộ đầy đủ (hằng 15 phút)
 *  EXPIRED_TEST=1 node scripts/shots-naptien-ref.mjs -> chỉ test hết hạn
 *    (chạy với bản build đã tạm rút QR_DEADLINE_MS xuống vài giây; bản ship
 *    phải là 15 * 60_000 — kiểm bằng grep sau khi khôi phục).
 *  Điều kiện: server production :3000 + mock BoltUtil :3997 + fixture
 *  scripts/naptien-balance-fixture.ts.
 *  Khối dưới QR CHỈ gồm: tiêu đề "Thành phần thanh toán" + Ngân hàng / Số tài
 *  khoản / Chủ sở hữu / Nội dung — Số tiền yêu cầu / Thưởng nạp / Thực nhận —
 *  hộp ghi chú 1-3 phút. KHÔNG "Nạp tối thiểu", KHÔNG câu ghi chú cũ, KHÔNG
 *  nút của ảnh mẫu (Tải hoá đơn / Mở ngân hàng / Tôi đã chuyển khoản).
 *  Đếm ngược 15:00 theo mẫu doc SePay: "Đang chờ thanh toán · mm:ss" ->
 *  hết hạn "Đơn hàng đã hết hạn" + overlay "Mã QR đã hết hạn" + "Tạo mã mới";
 *  polling bank-status 3 giây -> deposit khớp về thì "Thanh toán thành công". */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
const EXPIRED_ONLY = process.env.EXPIRED_TEST === "1";
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
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-naptien-ref",
  "--remote-debugging-port=9402", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9402/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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

const PANEL = `(() => {
  const pCol = document.querySelector('[data-col="panel"]');
  const block = pCol ? pCol.querySelector('[data-payinfo]') : null;
  const rows = block ? [...block.querySelectorAll('[data-payrow]')].map((r) => {
    const spans = r.querySelectorAll(':scope > span');
    return { label: spans[0] ? spans[0].textContent.trim() : "", value: spans[1] ? spans[1].textContent.trim() : "" };
  }) : [];
  const img = pCol ? pCol.querySelector('img[alt*="VietQR"]') : null;
  const statusM = (pCol ? pCol.textContent : "").match(/Đang chờ thanh toán · (\\d{2}):(\\d{2})/);
  return {
    hasPanel: !!pCol,
    panelText: pCol ? (pCol.textContent || "") : "",
    heading: block ? (block.querySelector(':scope > div')?.textContent || "").trim() : "",
    rows,
    qrSrc: img ? img.getAttribute("src") : null,
    statusSeconds: statusM ? parseInt(statusM[1], 10) * 60 + parseInt(statusM[2], 10) : null,
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
async function waitFor(expr, timeoutMs, stepMs = 500) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await evaluate(expr)) return true;
    await sleep(stepMs);
  }
  return false;
}
const panelHas = (txt) => `(() => { const p = document.querySelector('[data-col="panel"]'); return !!p && (p.textContent || "").includes(${JSON.stringify(txt)}); })()`;

async function main() {
  const prisma = new PrismaClient();
  ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
  };
  try {
    const demo = await prisma.user.findUnique({ where: { username: "demo" } });
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

    if (EXPIRED_ONLY) {
      // Bản build test đã rút QR_DEADLINE_MS xuống vài giây: panel phải tự
      // chuyển hết hạn, hiện overlay + nút Tạo mã mới, bấm tạo mới chạy lại.
      await navigate(`${BASE}/dashboard/nap-tien`, 4000);
      await typeAmount("500000");
      ok(await evaluate(clickConfirm) === true, "hết hạn: bấm Nạp tiền 500.000");
      await sleep(700);
      ok(await evaluate(panelHas("Đang chờ thanh toán · 00:0")), "hết hạn: trạng thái chờ kèm đếm ngược giây");
      ok(await waitFor(panelHas("Mã QR đã hết hạn"), 20000), "hết hạn: overlay 'Mã QR đã hết hạn' tự hiện khi đồng hồ về 0");
      ok(await evaluate(panelHas("Đơn hàng đã hết hạn")), "hết hạn: dòng trạng thái 'Đơn hàng đã hết hạn' (đúng mẫu doc SePay)");
      await captureFullPage("2026-11-10-naptien-ref-expired");
      const regen = await evaluate(`(() => {
        const p = document.querySelector('[data-col="panel"]');
        const b = p ? [...p.querySelectorAll('button')].find((x) => (x.textContent || "").trim() === "Tạo mã mới") : null;
        if (!b) return false; b.click(); return true;
      })()`);
      ok(regen === true, "hết hạn: bấm 'Tạo mã mới'");
      await sleep(700);
      ok(await evaluate(panelHas("Đang chờ thanh toán")), "hết hạn: tạo mã mới -> đếm ngược chạy lại từ đầu");
      ok(!(await evaluate(panelHas("Mã QR đã hết hạn"))), "hết hạn: overlay biến mất sau khi tạo mã mới");
    } else {
      await prisma.setting.upsert({ where: { key: "deposit_bonus_tiers" }, create: { key: "deposit_bonus_tiers", value: JSON.stringify([{ from: 500000, percent: 10 }]) }, update: { value: JSON.stringify([{ from: 500000, percent: 10 }]) } });
      await prisma.deposit.deleteMany({ where: { userId: demo.id, method: "USDT", status: "PENDING", externalId: { startsWith: "bolt:" } } });
      await prisma.deposit.deleteMany({ where: { code: "NAPPAID01" } });

      await navigate(`${BASE}/dashboard/nap-tien`, 4000);
      const g0 = await evaluate(PANEL);
      ok(!g0.hasPanel, "trạng thái đầu: chưa bấm -> cột phải trống");

      await typeAmount("500000");
      ok(await evaluate(clickConfirm) === true, "bấm Nạp tiền 500.000");
      await sleep(900);
      const g1 = await evaluate(PANEL);
      ok(g1.hasPanel, "bấm xong panel hiện");
      ok(g1.heading.includes("Thành phần thanh toán"), "tiêu đề khối: 'Thành phần thanh toán'");
      const wantLabels = ["Ngân hàng", "Số tài khoản", "Chủ sở hữu", "Nội dung", "Số tiền yêu cầu", "Thưởng nạp", "Thực nhận"];
      ok(JSON.stringify(g1.rows.map((r) => r.label)) === JSON.stringify(wantLabels), `nhãn các hàng ĐÚNG thứ tự ảnh mẫu: ${JSON.stringify(g1.rows.map((r) => r.label))}`);
      ok(g1.rows[0].value.includes("Vietcombank"), "hàng Ngân hàng = Vietcombank");
      ok(g1.rows[1].value.includes("0123456789"), "hàng Số tài khoản = 0123456789");
      ok(g1.rows[2].value.includes("NGUYEN VAN A"), "hàng Chủ sở hữu = NGUYEN VAN A");
      ok(g1.rows[3].value.includes("SMM DEMO01"), "hàng Nội dung = nội dung CK của khách");
      ok(g1.rows[4].value.includes("500.000"), `hàng Số tiền yêu cầu = 500.000 (thực tế: ${g1.rows[4].value})`);
      ok(g1.rows[5].value.includes("+50.000"), `hàng Thưởng nạp = +50.000 với mốc 10% (thực tế: ${g1.rows[5].value})`);
      ok(g1.rows[6].value.includes("+550.000"), `hàng Thực nhận = +550.000 (thực tế: ${g1.rows[6].value})`);
      ok(g1.panelText.includes("Tự động cộng tiền sau 1-3 phút"), "hộp ghi chú cộng tự động 1-3 phút có mặt");
      for (const banned of ["Nạp tối thiểu", "Chủ tài khoản", "Nội dung CK", "Tổng cộng vào ví", "Chuyển đúng nội dung là tiền cộng tự động qua SePay", "Tôi đã chuyển khoản", "Tải hoá đơn", "Mở ngân hàng"]) {
        ok(!g1.panelText.includes(banned), `panel KHÔNG còn: "${banned}"`);
      }
      ok(!!g1.qrSrc && g1.qrSrc.includes("amount=500000"), "QR mang đúng số tiền 500000");
      ok(g1.statusSeconds !== null && g1.statusSeconds >= 880 && g1.statusSeconds <= 900, `đếm ngược bắt đầu ở cửa sổ 15 phút theo doc SePay (thực tế còn ${g1.statusSeconds}s)`);
      await captureFullPage("2026-11-10-naptien-ref-desktop");

      await sleep(2200);
      const g1b = await evaluate(PANEL);
      ok(g1b.statusSeconds !== null && g1.statusSeconds - g1b.statusSeconds >= 1 && g1.statusSeconds - g1b.statusSeconds <= 5, `đếm ngược chạy từng giây (${g1.statusSeconds}s -> ${g1b.statusSeconds}s sau 2,2s)`);

      const copyFb = await evaluate(`(async () => {
        const block = document.querySelector('[data-payinfo]');
        const btns = block ? [...block.querySelectorAll('button')] : [];
        if (!btns.length) return { clicked: false };
        btns[0].click();
        await new Promise((r) => setTimeout(r, 400));
        return { clicked: true, feedback: btns[0].className.includes("emerald") };
      })()`);
      ok(copyFb.clicked && copyFb.feedback, "nút chép ở hàng Số tài khoản có phản hồi (viền xanh + tick)");

      // Không đạt mốc thưởng: dòng giữa vẫn hiện +0, Thực nhận = đúng số tiền.
      await typeAmount("200000");
      await evaluate(clickConfirm);
      await sleep(900);
      const g2 = await evaluate(PANEL);
      ok(g2.rows[4].value.includes("200.000"), "không thưởng: Số tiền yêu cầu = 200.000");
      ok(g2.rows[5].value.includes("+0") && !g2.rows[5].value.includes("50.000"), `không thưởng: hàng Thưởng nạp hiện +0 (thực tế: ${g2.rows[5].value})`);
      ok(g2.rows[6].value.includes("+200.000"), "không thưởng: Thực nhận = +200.000");
      ok(g2.statusSeconds !== null && g2.statusSeconds >= 880, `đổi số tiền + bấm lại -> đếm ngược chạy lại từ 15 phút (còn ${g2.statusSeconds}s)`);

      // Polling 3 giây: deposit BANK đúng số tiền về -> "Thanh toán thành công".
      await typeAmount("300000");
      await evaluate(clickConfirm);
      await sleep(1200);
      await prisma.deposit.create({ data: { code: "NAPPAID01", userId: demo.id, method: "BANK", amount: 300000, bonus: 0, status: "APPROVED", auto: true } });
      ok(await waitFor(panelHas("Thanh toán thành công"), 12000), "polling: deposit 300.000 về -> trạng thái 'Thanh toán thành công'");

      // Hồi quy các method còn lại.
      ok(await evaluate(clickMethod("PayPal")) === true, "chọn PayPal");
      await sleep(800);
      ok(await evaluate(panelHas("Thanh toán qua PayPal")), "PayPal -> panel form PayPal");
      ok(await evaluate(clickMethod("Stripe")) === true, "chọn Stripe");
      await sleep(800);
      ok(await evaluate(panelHas("Thanh toán qua Stripe")), "Stripe -> panel form Stripe");
      ok(await evaluate(clickMethod("USDT")) === true, "chọn USDT");
      await sleep(800);
      const submit = await evaluate(`(() => {
        const col = document.querySelector('[data-col="panel"]');
        const b = col ? [...col.querySelectorAll('button')].find((x) => (x.textContent || "").includes("Tạo phiên nạp USDT")) : null;
        if (!b) return false; b.click(); return true;
      })()`);
      ok(submit === true, "USDT -> gửi tạo phiên");
      await sleep(5000);
      ok(await evaluate(panelHas("Đang chờ thanh toán")) && await evaluate(panelHas("TMockBoltAddress")), "phiên USDT tạo thành công qua mock");

      // Mobile.
      await setViewport(390, 900, true);
      await navigate(`${BASE}/dashboard/nap-tien`, 4000);
      ok(await evaluate(clickMethod("QR ngân hàng")) === true, "mobile: chọn QR ngân hàng");
      await sleep(600);
      await typeAmount("500000");
      await evaluate(clickConfirm);
      await sleep(900);
      const gm = await evaluate(PANEL);
      ok(gm.hasPanel && gm.rows.length === 7, "mobile: panel hiện đủ 7 hàng thông tin");
      ok(gm.statusSeconds !== null && gm.statusSeconds >= 870, `mobile: đếm ngược hiện (còn ${gm.statusSeconds}s)`);
      ok(gm.overflowX === false, "mobile: không tràn ngang");
      await captureFullPage("2026-11-10-naptien-ref-mobile");
    }
  } finally {
    if (!EXPIRED_ONLY) {
      await prisma.setting.deleteMany({ where: { key: "deposit_bonus_tiers" } }).catch(() => {});
      await prisma.deposit.deleteMany({ where: { code: "NAPPAID01" } }).catch(() => {});
    }
    await prisma.$disconnect();
  }

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => { try { chrome.kill(); } catch { /* noop */ } });
