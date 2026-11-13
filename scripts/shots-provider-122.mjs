/** NGHIỆM THU ĐỢT 122 — DỌN FORM NHÀ CUNG CẤP HẾT DẤU SMM:
 *  Cần server production :3000 + DB local đã seed (admin Admin@123).
 *  Luồng: tạo fixture provider kind=BOTH thẳng trong DB (kèm giá trị riêng ở
 *  các field đã gỡ khỏi form) -> đăng nhập admin -> /admin/nha-cung-cap:
 *  (1) form Thêm Premium: quét DOM cả 3 tab — không chuỗi "SMM", không còn
 *      select LEGACY / field coupon / dailyLimit / cronSyncLimit /
 *      filterHtml / syncAdvanced; nhãn syncContent mới. Chụp ảnh.
 *  (2) form Thêm FZR: URL cố định + khối webhook + đủ 8 ô markup nhóm.
 *  (3) Sửa fixture BOTH: mở ra form PREMIUM (hidden kind/driver, không
 *      select) -> Lưu -> DB: kind=PREMIUM, driver=STANDARD, các field đã
 *      gỡ khỏi form GIỮ NGUYÊN giá trị cũ. Chụp ảnh trước khi lưu.
 *  Ảnh: ~/workspace/smm-anh/2026-11-13-provider-form-{premium-sau-don,sua-both}.png */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });
let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; };

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=old", "--disable-gpu", "--no-sandbox", "--disable-setuid-sandbox", "--hide-scrollbars",
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-provider122",
  "--remote-debugging-port=9422", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9422/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name);
}
const setField = (name, val) => evaluate(`(() => { const el = document.querySelector('input[name="${name}"]'); if (!el) throw new Error('thiếu input ${name}'); el.focus(); el.value = ${JSON.stringify(val)}; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return el.value; })()`);
const clickTab = (text) => evaluate(`(() => { const b = [...document.querySelectorAll('div.fixed button')].find((x) => x.innerText.trim() === ${JSON.stringify(text)}); if (!b) throw new Error('thiếu tab ${text}'); b.click(); return true; })()`);
const modalScan = () => evaluate(`(() => {
  const modal = document.querySelector('div.fixed.inset-0');
  if (!modal) return null;
  const names = [...modal.querySelectorAll('input, select, textarea')].map((el) => el.getAttribute('name')).filter(Boolean);
  return { text: modal.innerText, names,
    hiddenKind: modal.querySelector('input[type="hidden"][name="kind"]')?.value ?? null,
    hiddenDriver: modal.querySelector('input[type="hidden"][name="driver"]')?.value ?? null,
    selectKind: !!modal.querySelector('select[name="kind"]'), selectDriver: !!modal.querySelector('select[name="driver"]'),
    selects: [...modal.querySelectorAll('select')].map((s) => s.getAttribute('name')) };
})()`);
const closeModal = async () => { await evaluate(`(() => { const b = [...document.querySelectorAll('div.fixed button')].find((x) => x.innerText.trim() === 'Hủy'); if (b) b.click(); return true; })()`); await sleep(700); };

async function main() {
  // Tắt cổng 2FA admin trong lúc kiểm chứng (DB local, seed lại sau đợt).
  await prisma.setting.upsert({ where: { key: "admin_2fa_required" }, create: { key: "admin_2fa_required", value: "0" }, update: { value: "0" } });
  // Fixture: provider kind=BOTH (di sản cũ) + giá trị riêng ở các field đã gỡ.
  await prisma.provider.deleteMany({ where: { name: "FIXTURE BOTH 122" } });
  const fx = await prisma.provider.create({ data: {
    kind: "BOTH", driver: "STANDARD", name: "FIXTURE BOTH 122",
    apiUrl: "https://fixture122.example.com", apiKey: "fixture-key-122",
    currency: "USD", exchangeRate: 2, markupPercent: 42,
    coupon: "FIXCOUPON", dailyLimit: 77, cronSyncLimit: 33,
    syncAdvanced: true, filterHtml: false, syncContent: true,
    minBalanceAlert: 12345, note: "ghi chú fixture 122", active: true,
  } });
  console.log("fixture id:", fx.id);

  ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
  };
  const targets = await (await fetch("http://127.0.0.1:9422/json/list")).json();
  const page = targets.find((t) => t.type === "page");
  const att = await send("Target.attachToTarget", { targetId: page.id, flatten: true });
  sessionId = att.sessionId;
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");

  // --- Đăng nhập admin ---
  await navigate(BASE + "/", 1500);
  await evaluate(`(() => { try { localStorage.setItem('smmv2-lang', 'vi'); } catch {} document.cookie = 'smmv2-lang=vi; path=/'; return true; })()`);
  await navigate(BASE + "/login", 2500);
  await setField("login", "admin");
  await setField("password", "Admin@123");
  await evaluate(`(() => { const b = document.querySelector('form button[type="submit"], form button'); if (!b) throw new Error('thiếu nút submit'); b.click(); return true; })()`);
  await sleep(3500);

  await navigate(BASE + "/admin/nha-cung-cap", 3500);
  ok(await evaluate(`document.body.innerText.includes('FIXTURE BOTH 122')`), "danh sách hiện fixture BOTH");

  // --- (1) Form Thêm Premium: quét cả 3 tab ---
  await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('Thêm nhà cung cấp Premium')); if (!b) throw new Error('thiếu nút thêm Premium'); b.click(); return true; })()`);
  await sleep(1200);
  let allText = "", allNames = [];
  for (const tab of ["Thông tin cơ bản", "Cài đặt đồng bộ", "Tiền tệ & Giới hạn"]) {
    await clickTab(tab); await sleep(500);
    const s = await modalScan();
    ok(!!s, `modal Premium mở, tab "${tab}" quét được`);
    if (s) { allText += "\n" + s.text; allNames.push(...s.names); }
    if (tab === "Thông tin cơ bản") {
      ok(s.hiddenKind === "PREMIUM" && s.hiddenDriver === "STANDARD", `form Premium: hidden kind=PREMIUM, driver=STANDARD (kind=${s.hiddenKind}, driver=${s.hiddenDriver})`);
      ok(!s.selectKind && !s.selectDriver, "form Premium: KHÔNG còn select kind/driver (LEGACY đã gỡ)");
    }
  }
  ok(!/SMM/i.test(allText), "form Premium: toàn văn 3 tab KHÔNG chứa chuỗi 'SMM'");
  ok(!allText.includes("Loại API") && !allText.includes("Kiểu kiểm tra API") && !allText.includes("Giao thức API"), "form Premium: không còn nhãn 3 select LEGACY");
  ok(!allNames.includes("coupon"), "form Premium: không còn field coupon");
  ok(!allNames.includes("dailyLimit") && !allNames.includes("cronSyncLimit"), "form Premium: không còn dailyLimit / cronSyncLimit");
  ok(!allNames.includes("filterHtml") && !allNames.includes("syncAdvanced"), "form Premium: không còn switch filterHtml / syncAdvanced");
  ok(allText.includes("Cập nhật tên sản phẩm khi đồng bộ"), "form Premium: nhãn syncContent mới 'Cập nhật tên sản phẩm khi đồng bộ'");
  ok(!allText.includes("Tên dịch vụ"), "form Premium: không còn chữ 'Tên dịch vụ'");
  await evaluate(`window.scrollTo(0, 0)`); await sleep(300);
  await shot("2026-11-13-provider-form-premium-sau-don");
  await closeModal();

  // --- (2) Form Thêm FZR: nguyên vẹn ---
  await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('Thêm nhà cung cấp FZR')); if (!b) throw new Error('thiếu nút thêm FZR'); b.click(); return true; })()`);
  await sleep(1200);
  const fzr = await evaluate(`(() => {
    const modal = document.querySelector('div.fixed.inset-0');
    if (!modal) return null;
    const url = modal.querySelector('input[name="apiUrl"]');
    const markups = [...modal.querySelectorAll('input')].map((el) => el.getAttribute('name')).filter((n) => n && n.startsWith('fzr_markup_'));
    return { urlVal: url?.value ?? null, urlReadOnly: !!url?.readOnly, markups,
      whSecret: !!modal.querySelector('input[name="fzr_webhook_secret"]'),
      whUrl: [...modal.querySelectorAll('input')].some((el) => (el.value || '').includes('/api/webhooks/fzr')) };
  })()`);
  ok(fzr && fzr.urlVal === "https://api.fzr.cards" && fzr.urlReadOnly, `form FZR: URL cố định api.fzr.cards + readOnly (${fzr?.urlVal})`);
  ok(fzr && fzr.markups.length === 8, `form FZR: đủ 8 ô markup nhóm (${fzr?.markups.length})`);
  ok(fzr && fzr.whSecret && fzr.whUrl, "form FZR: khối webhook nguyên vẹn (URL + secret)");
  await closeModal();

  // --- (3) Sửa fixture BOTH -> form PREMIUM -> Lưu -> DB ---
  await evaluate(`(() => {
    const row = [...document.querySelectorAll('tr')].find((tr) => tr.innerText.includes('FIXTURE BOTH 122'));
    if (!row) throw new Error('không thấy dòng fixture');
    const b = row.querySelector('button[title="Sửa"]');
    if (!b) throw new Error('thiếu nút Sửa'); b.click(); return true;
  })()`);
  await sleep(1200);
  const edit = await modalScan();
  ok(!!edit, "modal Sửa fixture mở được");
  ok(edit && !edit.selectKind && !edit.selectDriver, "Sửa fixture BOTH: KHÔNG render select LEGACY nào");
  ok(edit && edit.hiddenKind === "PREMIUM" && edit.hiddenDriver === "STANDARD", `Sửa fixture BOTH: mở dạng form PREMIUM (hidden kind=${edit?.hiddenKind}, driver=${edit?.hiddenDriver})`);
  ok(edit && !/SMM/i.test(edit.text), "Sửa fixture BOTH: không chuỗi 'SMM' trong form");
  const nameVal = await evaluate(`document.querySelector('div.fixed input[name="name"]')?.value ?? null`);
  ok(nameVal === "FIXTURE BOTH 122", `Sửa fixture: ô tên prefill đúng giá trị DB (${nameVal})`);
  await evaluate(`window.scrollTo(0, 0)`); await sleep(300);
  await shot("2026-11-13-provider-form-sua-both");
  await evaluate(`(() => { const b = [...document.querySelectorAll('div.fixed button')].find((x) => x.innerText.trim() === 'Cập nhật nhà cung cấp'); if (!b) throw new Error('thiếu nút Cập nhật'); b.click(); return true; })()`);
  await sleep(4000);
  const after = await prisma.provider.findUnique({ where: { id: fx.id } });
  ok(after?.kind === "PREMIUM", `DB sau lưu: kind = ${after?.kind} (ép về PREMIUM)`);
  ok(after?.driver === "STANDARD", `DB sau lưu: driver = ${after?.driver}`);
  ok(after?.name === "FIXTURE BOTH 122" && after?.markupPercent === 42 && after?.currency === "USD" && after?.exchangeRate === 2, "DB sau lưu: tên/markup/tiền tệ/tỷ giá giữ nguyên");
  ok(after?.coupon === "FIXCOUPON" && after?.dailyLimit === 77 && after?.cronSyncLimit === 33, `DB sau lưu: field đã gỡ KHÔNG bị xoá (coupon=${after?.coupon}, dailyLimit=${after?.dailyLimit}, cronSyncLimit=${after?.cronSyncLimit})`);
  ok(after?.syncAdvanced === true && after?.filterHtml === false, `DB sau lưu: syncAdvanced/filterHtml giữ nguyên (${after?.syncAdvanced}/${after?.filterHtml})`);
  ok(after?.syncContent === true, "DB sau lưu: syncContent giữ true (switch còn sống)");

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAIL`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => { console.error("ERR", e); process.exitCode = 1; }).finally(async () => {
  try { chrome.kill(); } catch { /* đã tắt */ }
  await prisma.$disconnect();
});
