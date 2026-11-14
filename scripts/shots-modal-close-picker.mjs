/** KIỂM CHỨNG đợt đóng-popup admin + picker sản phẩm từ nguồn (2026-11-13).
 *  Cần: server production :3000 (DB local đã seed + fixture-modal-picker:
 *  NCC "Nguồn Giả Lập" -> mock ThaTim 127.0.0.1:8791, 2FA admin tắt).
 *  Các dòng kiểm chứng:
 *   T1 ProviderModal: sửa tên NCC -> Lưu -> popup ĐÓNG + tên mới hiện.
 *   T2 PremiumCategoryModal: thêm danh mục -> Lưu -> popup ĐÓNG + hiện ở bảng.
 *   T3 ProductModal (luồng ThaTim mới, lệnh Tín 2026-11-13 tối): gắn NCC
 *      STANDARD -> ô chọn hình thức giao BIẾN MẤT (tự ép API) + hiện ghi
 *      chú chọn gói ở Gói bán + KHÔNG còn picker ở form sản phẩm -> Lưu ->
 *      popup ĐÓNG + sản phẩm hiện ở danh sách.
 *   T6 VariantsModal: khung "Tìm gói từ nguồn" -> tìm "netflix" -> chọn
 *      Netflix (gắn sản phẩm nguồn 101) -> chu kỳ hiện (mock theo shape
 *      catalog THẬT: cycle = số NGÀY 30/360 -> nhãn "1 tháng"/"1 năm" +
 *      ghi chú option) -> bấm "1 tháng" -> form thêm gói tự điền
 *      tên/chu kỳ/giá -> Thêm gói -> popup ĐÓNG + gói có trong modal.
 *   T7 Trường tuỳ chỉnh THEO GÓI (lệnh Tín 2026-11-13): form sản phẩm
 *      không còn editor trường; ở hàng gói "1 tháng" mở mục trường tuỳ
 *      chỉnh của gói, thêm trường "Gmail nâng cấp" -> Lưu -> popup ĐÓNG
 *      (đối chiếu DB ở bước checker riêng).
 *   T4 VariantsModal: thêm gói -> popup ĐÓNG; mở lại, xoá trắng tên gói ->
 *      Lưu -> popup GIỮ NGUYÊN + báo lỗi "Thiếu tên gói hoặc giá".
 *   T5 Editor Liên hệ: thêm liên hệ -> Lưu -> popup ĐÓNG + thẻ hiện.
 *  Chạy: node scripts/shots-modal-close-picker.mjs */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });
let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=old", "--disable-gpu", "--no-sandbox", "--disable-setuid-sandbox", "--hide-scrollbars",
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-modalpicker",
  "--remote-debugging-port=9427", "--window-size=1440,900",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9427/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
const bodyText = () => evaluate(`document.body.innerText`);
const toastText = () => evaluate(`(() => { const d = [...document.querySelectorAll('div')].find((x) => (x.className || '').includes('z-[120]')); return d ? d.innerText : ''; })()`);
const modalOpen = () => evaluate(`!![...document.querySelectorAll('div')].find((d) => (d.className || '').includes('backdrop-blur') && d.className.includes('fixed'))`);
/** Gán giá trị cho input/select do React kiểm soát (qua setter của prototype). */
const setVal = (scopeExpr, val) => evaluate(`(() => {
  const el = ${scopeExpr};
  if (!el) throw new Error('không thấy field: ' + ${JSON.stringify(scopeExpr)});
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(val)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return el.value;
})()`);
const byName = (n) => `document.querySelector('[name="${n}"]')`;
const clickBtnText = (txt) => evaluate(`(() => {
  const all = [...document.querySelectorAll('button')];
  const b = all.find((x) => x.innerText.trim() === ${JSON.stringify(txt)}) || all.find((x) => x.innerText.trim().startsWith(${JSON.stringify(txt)}));
  if (!b) throw new Error('không thấy nút: ' + ${JSON.stringify(txt)});
  b.click(); return true;
})()`);
async function setLangVi() {
  await navigate(BASE + "/", 1500);
  await evaluate(`(() => { try { localStorage.setItem('smmv2-lang', 'vi'); } catch {} document.cookie = 'smmv2-lang=vi; path=/'; return true; })()`);
}
async function login(username, password) {
  await send("Network.clearBrowserCookies");
  await setLangVi();
  await navigate(`${BASE}/login`, 2500);
  await setVal(byName("login"), username);
  await setVal(byName("password"), password);
  await evaluate(`(() => { const b = document.querySelector('form button[type="submit"], form button'); if (!b) throw new Error('thiếu nút submit'); b.click(); return true; })()`);
  await sleep(3200);
}

async function main() {
  ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
  };
  const targets = await send("Target.getTargets");
  const page = targets.targetInfos.find((t) => t.type === "page");
  const att = await send("Target.attachToTarget", { targetId: page.targetId, flatten: true });
  sessionId = att.sessionId;
  await send("Page.enable"); await send("Network.enable");

  await login("admin", "Admin@123");
  let text = await bodyText();
  console.log("URL sau login:", await evaluate(`location.href`));

  /* ---- T1: ProviderModal sửa -> đóng ---- */
  await navigate(`${BASE}/admin/nha-cung-cap`, 3000);
  text = await bodyText();
  ok(text.includes("Nguồn Giả Lập"), "T1: thấy NCC giả lập trong danh sách");
  await evaluate(`(() => {
    const tr = [...document.querySelectorAll('tr')].find((r) => r.innerText.includes('Nguồn Giả Lập'));
    const b = tr && tr.querySelector('button[title="Sửa"]');
    if (!b) throw new Error('không thấy nút sửa NCC');
    b.click(); return true;
  })()`);
  await sleep(900);
  ok(await modalOpen(), "T1: modal NCC mở");
  await setVal(byName("name"), "Nguồn Giả Lập 2");
  await clickBtnText("Cập nhật nhà cung cấp");
  await sleep(2600);
  const toast1 = await toastText();
  ok(toast1.length > 0, "T1: toast nổi hiện sau khi lưu NCC");
  await shot("2026-11-13-toast-success");
  ok(!(await modalOpen()), "T1: popup ĐÓNG sau khi lưu NCC");
  text = await bodyText();
  ok(text.includes("Nguồn Giả Lập 2"), "T1: tên NCC mới hiện trong danh sách");

  /* ---- T2: PremiumCategoryModal thêm -> đóng ---- */
  await navigate(`${BASE}/admin/premium/danh-muc`, 3000);
  await clickBtnText("+ Thêm danh mục mới");
  await sleep(900);
  ok(await modalOpen(), "T2: modal danh mục mở");
  await setVal(byName("name"), "Danh Mục Kiểm Tra");
  await clickBtnText("Lưu danh mục");
  await sleep(3500);
  ok(!(await modalOpen()), "T2: popup ĐÓNG sau khi lưu danh mục");
  await navigate(`${BASE}/admin/premium/danh-muc`, 2500);
  text = await bodyText();
  ok(text.includes("Danh Mục Kiểm Tra"), "T2: danh mục mới hiện trong bảng");

  /* ---- T3: ProductModal — gắn NCC ThaTim thì KHÔNG chọn hình thức giao ---- */
  const suffix = String(Date.now()).slice(-6);
  const testName = `Nguồn Test ${suffix}`;
  await navigate(`${BASE}/admin/premium`, 3000);
  await clickBtnText("+ Thêm sản phẩm mới");
  await sleep(900);
  ok(await modalOpen(), "T3: modal sản phẩm mở");
  await evaluate(`(() => { const s = [...document.querySelectorAll('summary')].find((x) => x.innerText.includes('Cài đặt nâng cao')); if (!s) throw new Error('không thấy khối nâng cao'); s.click(); return true; })()`);
  await sleep(500);
  ok(await evaluate(`!!document.querySelector('select[name="fulfillment"]')`), "T3: chưa gắn nguồn thì vẫn có ô chọn hình thức giao");
  const catVal = await evaluate(`(() => { const s = document.querySelector('[name="categoryId"]'); const o = [...s.options].find((x) => x.value !== ''); return o ? o.value : ''; })()`);
  await setVal(byName("categoryId"), catVal);
  await setVal(byName("name"), testName);
  await setVal(byName("providerId"), "1");
  await sleep(600);
  ok(!(await evaluate(`!!document.querySelector('select[name="fulfillment"]')`)), "T3: gắn NCC ThaTim thì ô chọn hình thức giao BIẾN MẤT");
  ok((await evaluate(`(document.querySelector('input[name="fulfillment"]') || {}).value || ''`)) === "API", "T3: hình thức giao tự ép = API (field ẩn)");
  ok(!(await evaluate(`document.body.innerText.includes('Trường tuỳ chỉnh khách điền khi mua')`)), "T3: form sản phẩm KHÔNG còn editor trường tuỳ chỉnh (đã chuyển xuống gói)");
  text = await bodyText();
  ok(text.includes("mở Gói bán của sản phẩm để tìm và chọn các gói từ nguồn"), "T3: hiện ghi chú chọn gói ở form Gói bán");
  ok(!(await evaluate(`!!document.querySelector('input[placeholder*="Tìm theo tên trong catalog"]')`)), "T3: form sản phẩm KHÔNG còn khung tìm từ nguồn");
  await clickBtnText("Lưu sản phẩm");
  await sleep(4000);
  ok(!(await modalOpen()), "T3: popup ĐÓNG sau khi lưu sản phẩm");
  await navigate(`${BASE}/admin/premium?q=${suffix}`, 3000);
  text = await bodyText();
  ok(text.includes(testName), "T3: sản phẩm mới hiện trong danh sách");
  writeFileSync("/tmp/source-test-suffix.txt", suffix);

  /* ---- T6: VariantsModal — tìm gói từ nguồn ---- */
  const goiBtn = (label) => evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /gói/.test(x.innerText) && x.closest('tr') && x.closest('tr').innerText.includes(${JSON.stringify(testName)})); if (!b) throw new Error('không thấy nút Gói: ' + ${JSON.stringify(label)}); b.click(); return true; })()`);
  await goiBtn("T6 mở lần 1");
  await sleep(1200);
  ok(await modalOpen(), "T6: modal Gói bán mở");
  text = await bodyText();
  ok(text.includes("TÌM GÓI TỪ NGUỒN"), "T6: khung tìm gói từ nguồn hiện");
  await setVal(`document.querySelector('input[placeholder*="Tìm theo tên trong catalog"]')`, "netflix");
  await clickBtnText("Tìm");
  await sleep(3000);
  const srcListText = await evaluate(`(() => { const ov = [...document.querySelectorAll('div')].find((d) => (d.className || '').includes('backdrop-blur') && d.className.includes('fixed')); const list = ov ? [...ov.querySelectorAll('div')].find((d) => (d.className || '').includes('max-h-52')) : null; return list ? list.innerText : ''; })()`);
  ok(srcListText.includes("Netflix Premium 4K"), "T6: kết quả tìm có Netflix Premium 4K từ nguồn");
  ok(!srcListText.includes("Spotify Premium"), "T6: kết quả đã lọc đúng từ khoá (không có Spotify)");
  await shot("2026-11-13-variant-source-picker");
  await evaluate(`(() => { const ov = [...document.querySelectorAll('div')].find((d) => (d.className || '').includes('backdrop-blur') && d.className.includes('fixed')); const b = ov ? [...ov.querySelectorAll('button')].find((x) => x.innerText.includes('Netflix Premium 4K')) : null; if (!b) throw new Error('không thấy dòng Netflix'); b.click(); return true; })()`);
  await sleep(1500);
  text = await bodyText();
  ok(text.includes("Đã gắn sản phẩm nguồn"), "T6: đã gắn sản phẩm nguồn sau khi chọn");
  ok(text.includes("1 tháng · 39.000 VND"), "T6: chu kỳ nguồn 30 NGÀY hiện đúng nhãn '1 tháng' kèm giá (không còn 30 tháng)");
  ok(text.includes("1 năm · 399.000 VND"), "T6: chu kỳ nguồn 360 NGÀY hiện đúng nhãn '1 năm' kèm giá");
  ok(text.includes("Nâng cấp chính chủ"), "T6: chip hiện ghi chú option của nguồn");
  await evaluate(`(() => { const ov = [...document.querySelectorAll('div')].find((d) => (d.className || '').includes('backdrop-blur') && d.className.includes('fixed')); const b = ov ? [...ov.querySelectorAll('button')].find((x) => x.innerText.includes('1 tháng ·')) : null; if (!b) throw new Error('không thấy chip chu kỳ 1 tháng'); b.click(); return true; })()`);
  await sleep(600);
  const addFormVal = (field) => evaluate(`(() => { const i = document.querySelector('input[placeholder*="Tên gói (VD: 1 Tháng)"]'); const f = i ? i.closest('form') : null; if (!f) return ''; if (${JSON.stringify(field)} === 'name') return i.value; const el = f.querySelector('[name="' + ${JSON.stringify(field)} + '"]'); return el ? el.value : ''; })()`);
  ok((await addFormVal("name")) === "1 tháng", "T6: tên gói tự điền = '1 tháng'");
  ok((await addFormVal("providerCycle")) === "1", "T6: chu kỳ NCC tự điền = 1");
  ok((await addFormVal("price")) === "39000", "T6: giá bán tự điền = 39000");
  ok((await addFormVal("cost")) === "39000", "T6: giá vốn tự điền = 39000");
  await shot("2026-11-13-variant-cycle-picked");
  await clickBtnText("+ Thêm gói");
  await sleep(3500);
  ok(!(await modalOpen()), "T6: popup ĐÓNG sau khi thêm gói từ nguồn");
  await navigate(`${BASE}/admin/premium?q=${suffix}`, 3000);
  await goiBtn("T6 mở lần 2");
  await sleep(1200);
  const variantNames6 = await evaluate(`(() => { const ov = [...document.querySelectorAll('div')].find((d) => (d.className || '').includes('backdrop-blur')); return ov ? [...ov.querySelectorAll('form [name="name"]')].map((i) => i.value) : []; })()`);
  ok(variantNames6.includes("1 tháng"), "T6: gói '1 tháng' đã có trong modal");
  await clickBtnText("Đóng");
  await sleep(600);

  /* ---- T7: trường tuỳ chỉnh THEO GÓI — thêm ở hàng gói, lưu -> đóng ---- */
  await navigate(`${BASE}/admin/premium?q=${suffix}`, 3000);
  await goiBtn("T7 mở modal gói");
  await sleep(1200);
  ok(await modalOpen(), "T7: modal Gói bán mở");
  await evaluate(`(() => {
    const f = [...document.querySelectorAll('form')].find((x) => { const nm = x.querySelector('[name="name"]'); return nm && nm.value === '1 tháng'; });
    if (!f) throw new Error('không thấy hàng gói 1 tháng');
    const s = [...f.querySelectorAll('summary')].find((x) => x.innerText.includes('Trường tuỳ chỉnh của gói này'));
    if (!s) throw new Error('không thấy mục trường tuỳ chỉnh của gói');
    s.click(); return true;
  })()`);
  await sleep(500);
  await evaluate(`(() => {
    const f = [...document.querySelectorAll('form')].find((x) => { const nm = x.querySelector('[name="name"]'); return nm && nm.value === '1 tháng'; });
    const b = [...f.querySelectorAll('button')].find((x) => x.innerText.includes('Thêm trường tuỳ chỉnh'));
    if (!b) throw new Error('không thấy nút thêm trường');
    b.click(); return true;
  })()`);
  await sleep(500);
  await setVal(`(() => { const f = [...document.querySelectorAll('form')].find((x) => { const nm = x.querySelector('[name="name"]'); return nm && nm.value === '1 tháng'; }); return f.querySelector('input[placeholder*="Nhãn trường"]'); })()`, "Gmail nâng cấp");
  await sleep(400);
  await evaluate(`(() => {
    const f = [...document.querySelectorAll('form')].find((x) => { const nm = x.querySelector('[name="name"]'); return nm && nm.value === '1 tháng'; });
    const b = [...f.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Lưu');
    if (!b) throw new Error('không thấy nút Lưu gói');
    b.click(); return true;
  })()`);
  await sleep(3500);
  ok(!(await modalOpen()), "T7: popup ĐÓNG sau khi lưu gói kèm trường tuỳ chỉnh riêng");
  await navigate(`${BASE}/admin/premium?q=netflix`, 3000);

  /* ---- T4: VariantsModal thêm -> đóng; sửa lỗi -> giữ ---- */
  await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /gói/.test(x.innerText) && x.closest('tr') && x.closest('tr').innerText.includes('Netflix Premium 4K')); if (!b) throw new Error('không thấy nút Gói'); b.click(); return true; })()`);
  await sleep(1000);
  ok(await modalOpen(), "T4: modal Gói bán mở");
  await setVal(`document.querySelector('input[placeholder*="Tên gói (VD: 1 Tháng)"]')`, "Gói kiểm tra");
  await setVal(`(() => { const inp = document.querySelector('input[placeholder*="Tên gói (VD: 1 Tháng)"]'); return inp.closest('form').querySelector('[name="price"]'); })()`, "123000");
  await clickBtnText("+ Thêm gói");
  await sleep(3500);
  ok(!(await modalOpen()), "T4: popup ĐÓNG sau khi thêm gói");
  await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /gói/.test(x.innerText) && x.closest('tr') && x.closest('tr').innerText.includes('Netflix Premium 4K')); if (!b) throw new Error('không thấy nút Gói (2)'); b.click(); return true; })()`);
  await sleep(1000);
  ok(await modalOpen(), "T4: mở lại modal Gói bán");
  const variantNames = await evaluate(`(() => { const ov = [...document.querySelectorAll('div')].find((d) => (d.className || '').includes('backdrop-blur')); return ov ? [...ov.querySelectorAll('form [name="name"]')].map((i) => i.value) : []; })()`);
  ok(variantNames.includes("Gói kiểm tra"), "T4: gói vừa thêm có trong modal");
  await setVal(`(() => { const f = [...document.querySelectorAll('form')].find((x) => x.querySelector('[name="id"]') && x.innerText.includes('Kho')); return f ? f.querySelector('[name="name"]') : document.querySelector('form [name="name"]'); })()`, "");
  await evaluate(`(() => {
    const forms = [...document.querySelectorAll('form')];
    const f = forms.find((x) => { const id = x.querySelector('[name="id"]'); const nm = x.querySelector('[name="name"]'); return id && nm && nm.value === ''; });
    if (!f) throw new Error('không thấy form gói đã xoá tên');
    const b = [...f.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Lưu');
    if (!b) throw new Error('không thấy nút Lưu gói');
    b.click(); return true;
  })()`);
  await sleep(3000);
  ok(await modalOpen(), "T4: popup GIỮ NGUYÊN khi lưu gói lỗi");
  const toast4 = await toastText();
  ok(toast4.includes("Thiếu tên gói hoặc giá"), "T4: toast nổi báo lỗi 'Thiếu tên gói hoặc giá'");
  await shot("2026-11-13-toast-error-modal");
  await clickBtnText("Đóng");
  await sleep(600);

  /* ---- T5: Editor Liên hệ thêm -> đóng ---- */
  await navigate(`${BASE}/admin/lien-he`, 3000);
  await clickBtnText("+ Thêm liên hệ");
  await sleep(900);
  ok(await modalOpen(), "T5: modal liên hệ mở");
  await setVal(byName("name"), "Kênh Kiểm Tra");
  await clickBtnText("Lưu");
  await sleep(3500);
  ok(!(await modalOpen()), "T5: popup ĐÓNG sau khi lưu liên hệ");
  text = await bodyText();
  ok(text.includes("Kênh Kiểm Tra"), "T5: liên hệ mới hiện trong danh sách");

  console.log(failures === 0 ? "ALL PASS" : `FAILURES: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error("SCRIPT ERROR", e); process.exit(2); }).finally(() => { try { chrome.kill(); } catch { /* noop */ } });
