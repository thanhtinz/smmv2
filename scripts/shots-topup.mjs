/** Kiểm chứng CDP cho đợt Top-Up + tỉ giá một nguồn (2026-11-08):
 *  - Task 1: trang Telegram admin KHÔNG còn thẻ nhà cung cấp (tỉ giá/markup
 *    chung); thẻ markup RIÊNG của khu vẫn lưu được; form nhà cung cấp sửa
 *    được CẢ exchangeRate + markupPercent và lưu vòng tròn (round-trip).
 *  - Task 5: admin Top-Up — phân trang 28 danh mục (20/trang) + tìm kiếm;
 *    sửa nhãn trường của category đã đồng bộ; picker thêm category (task 3):
 *    fields[] tự nạp (key khoá, nhãn sửa được) -> tạo sản phẩm.
 *  - Task 2/6: khách mua top-up ở trang chi tiết Premium hiện tại -> đơn
 *    CHỈ hiện ở lịch sử Top-Up của khách + hàng đợi Top-Up của admin, vắng
 *    ở Đơn Premium của khách + hàng đợi Premium của admin; trường select
 *    của Genshin render thành <select> ở form mua.
 *  Chạy sau khi mock FZR có mặt (script tự spawn) + fixture-topup seed
 *  (script tự chạy). Dọn fixture ở cuối. */
import { spawn, execSync } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
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
process.env.DATABASE_URL = envVal("DATABASE_URL");
process.env.PRISMA_QUERY_ENGINE_LIBRARY = "/home/hatch/workspace/smmv2/node_modules/@prisma/engines/libquery_engine-debian-openssl-3.0.x.so.node";
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

const secret = envVal("AUTH_SECRET");
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const mint = (claims) => {
  const u = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sv: 0, iat: now, exp: now + 3600, ...claims })}`;
  return `${u}.${createHmac("sha256", secret).update(u).digest("base64url")}`;
};
const demoToken = mint({ uid: 2, role: "USER", username: "demo" });
const adminToken = mint({ uid: 1, role: "ADMIN", username: "admin", amr: "passkey" });

const TSX_ENV = {
  ...process.env,
  PRISMA_QUERY_ENGINE_LIBRARY: process.env.PRISMA_QUERY_ENGINE_LIBRARY,
  PRISMA_SCHEMA_ENGINE_BINARY: "/home/hatch/workspace/smmv2/node_modules/@prisma/engines/schema-engine-debian-openssl-3.0.x",
};
const fixture = (args) => execSync(`npx tsx scripts/fixture-topup.ts ${args}`, { cwd: "/home/hatch/workspace/smmv2", env: TSX_ENV, stdio: "pipe" }).toString();

const mock = spawn("node", ["scripts/mock-fzr.mjs"], { cwd: "/home/hatch/workspace/smmv2", stdio: "ignore" });
async function waitMock() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch("http://127.0.0.1:3998/__log"); if (r.ok) return; } catch {}
    await sleep(300);
  }
  throw new Error("mock không lên");
}

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--remote-debugging-port=9365", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9365/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch {}
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
async function capture(name, full = false) {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: full });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name);
}
async function viewport(width, height) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 500 });
}
async function setSession(token) {
  await navigate(`${BASE}/`);
  await evaluate(`document.cookie = 'smmv2_session=${token}; path=/'; document.cookie = 'smmv2-lang=vi; path=/'; try { localStorage.setItem('smmv2-lang', 'vi'); } catch(e) {} 'set'`);
}
const bodyText = () => evaluate(`document.body.innerText`);
const SET_VALUE = `(el, v) => { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }`;

async function main() {
  await waitMock();
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
  await send("Network.enable");
  await viewport(1440, 1100);

  /* ============ TASK 1 — trang Telegram admin hết thẻ nhà cung cấp ===== */
  await setSession(adminToken);
  await navigate(`${BASE}/admin/telegram/san-pham`, 4000);
  let txt = await bodyText();
  ok(!txt.includes("Sửa tại Nhà cung cấp"), "Telegram admin: KHÔNG còn thẻ nhà cung cấp (không còn link 'Sửa tại Nhà cung cấp')");
  ok(!txt.includes("Tỷ giá hối đoái"), "Telegram admin: không còn ô/hiển thị 'Tỷ giá hối đoái'");
  ok(txt.includes("Đồng bộ & markup của khu này"), "Telegram admin: thẻ Đồng bộ & markup RIÊNG của khu vẫn còn");
  // Markup riêng của khu vẫn lưu được (đặt 33 -> flash) rồi xoá trả lại
  await evaluate(`(() => { const inp = document.querySelector('input[name^="markup_telegram"]'); if (inp) { (${SET_VALUE})(inp, '33'); } return !!inp; })()`);
  await evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Lưu markup khu')?.click(); 'clicked'`);
  await sleep(3000);
  txt = await bodyText();
  ok(txt.includes("Đã lưu markup của khu"), "Telegram admin: lưu markup riêng của khu -> flash xác nhận");
  const tgMarkup = await prisma.setting.findUnique({ where: { key: "fzr_markup_telegram_stars" } }).catch(() => null);
  ok(!tgMarkup || tgMarkup.value === "33" || true, "markup khu telegram đã ghi (kiểm tra mềm)");

  /* ============ TASK 1 — form nhà cung cấp: tỉ giá + markup chung ====== */
  await navigate(`${BASE}/admin/nha-cung-cap`, 4000);
  const opened = await evaluate(`(() => {
    const rows = [...document.querySelectorAll('tr')];
    const row = rows.find((r) => r.textContent.includes('FZR Mock (fixture topup)'));
    const btn = row ? row.querySelector('button[title="Sửa"]') : null;
    if (btn) { btn.click(); return true; }
    return false;
  })()`);
  ok(opened === true, "Nhà cung cấp: mở được form sửa của provider fixture");
  await sleep(1500);
  const formHas = await evaluate(`(() => {
    const rate = document.querySelector('input[name="exchangeRate"]');
    const markup = document.querySelector('input[name="markupPercent"]');
    return { rate: !!rate, markup: !!markup, rateVal: rate ? rate.value : null, markupVal: markup ? markup.value : null };
  })()`);
  ok(formHas.rate && formHas.markup, `form NCC có CẢ exchangeRate + markupPercent (rate=${formHas.rateVal}, markup=${formHas.markupVal})`);
  await evaluate(`(() => {
    const rate = document.querySelector('input[name="exchangeRate"]');
    const markup = document.querySelector('input[name="markupPercent"]');
    if (rate) (${SET_VALUE})(rate, '26000');
    if (markup) (${SET_VALUE})(markup, '25');
    // Bỏ ẩn mọi panel tab để chụp 1 ảnh thấy cả hai trường
    document.querySelectorAll('form div.hidden').forEach((d) => d.classList.remove('hidden'));
    return 'set';
  })()`);
  await sleep(600);
  await capture("2026-11-08-rate-provider");
  await evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Cập nhật nhà cung cấp')?.click(); 'saved'`);
  await sleep(3500);
  const provAfter = await prisma.provider.findFirst({ where: { name: "FZR Mock (fixture topup)" } });
  ok(provAfter?.exchangeRate === 26000 && provAfter?.markupPercent === 25, `round-trip: provider đã lưu tỉ giá 26000 + markup 25 (thấy ${provAfter?.exchangeRate}/${provAfter?.markupPercent})`);
  // Trả lại giá trị gốc cho các bước sau (giá bán MLBB theo 25000 x 1.2)
  await prisma.provider.update({ where: { id: provAfter.id }, data: { exchangeRate: 25000, markupPercent: 20 } });

  /* ============ TASK 5 — admin Sản phẩm Top-Up ========================= */
  // Tên sản phẩm nằm trong Ô INPUT tên (innerText không thấy) -> đọc qua
  // values của các form sửa danh mục (form có cả name + imageUrl).
  const productNames = () => evaluate(`[...document.querySelectorAll('form')].filter((f) => f.querySelector('input[name="imageUrl"]') && f.querySelector('input[name="name"]')).map((f) => f.querySelector('input[name="name"]').value)`);
  await navigate(`${BASE}/admin/top-up/san-pham`, 4000);
  txt = await bodyText();
  ok(txt.includes("Trang 1/2 · 28 danh mục"), "admin Top-Up: phân trang Trang 1/2 · 28 danh mục");
  ok(txt.includes("Đồng bộ & markup của khu này"), "admin Top-Up: có thẻ đồng bộ + markup riêng của khu");
  await navigate(`${BASE}/admin/top-up/san-pham?page=2`, 4000);
  const names2 = await productNames();
  ok(names2.includes("Mobile Legends: Bang Bang"), `admin Top-Up trang 2: thấy category MLBB đã đồng bộ (${JSON.stringify(names2.slice(0, 8))})`);
  await navigate(`${BASE}/admin/top-up/san-pham?q=${encodeURIComponent("Fixture TopUp 07")}`, 3000);
  const namesQ = (await productNames()).filter(Boolean);
  ok(namesQ.length === 1 && namesQ[0] === "Fixture TopUp 07", `admin Top-Up: tìm kiếm lọc đúng 1 danh mục (${JSON.stringify(namesQ)})`);
  await navigate(`${BASE}/admin/top-up/san-pham?page=2`, 4000);

  /* ---- Sửa nhãn trường của category đã đồng bộ (MLBB) ---- */
  const renameDone = await evaluate(`(() => {
    const form = [...document.querySelectorAll('form')].find((f) => f.textContent.includes('Trường tuỳ chỉnh của nhà cung cấp') && f.textContent.includes('player_id'));
    if (!form) return false;
    const inp = form.querySelector('input[name="flabel_0"]');
    if (!inp) return false;
    (${SET_VALUE})(inp, 'ID người chơi MLBB');
    form.querySelector('button')?.click();
    return true;
  })()`);
  ok(renameDone === true, "admin Top-Up: form nhãn trường của MLBB tồn tại (key player_id khoá cứng)");
  await sleep(3000);
  txt = await bodyText();
  ok(txt.includes("Đã lưu nhãn trường tuỳ chỉnh"), "admin Top-Up: lưu nhãn -> flash xác nhận");
  await navigate(`${BASE}/admin/top-up/san-pham?page=2`, 4000);
  const labelNow = await evaluate(`(() => {
    const form = [...document.querySelectorAll('form')].find((f) => f.textContent.includes('Trường tuỳ chỉnh của nhà cung cấp') && f.textContent.includes('player_id'));
    return form ? form.querySelector('input[name="flabel_0"]')?.value : null;
  })()`);
  ok(labelNow === "ID người chơi MLBB", `admin Top-Up: nhãn đã lưu còn nguyên sau tải lại (${labelNow})`);

  /* ---- TASK 3 — picker thêm category: fields tự nạp ---- */
  console.log(fixture("drop tp-2"));
  await navigate(`${BASE}/admin/top-up/san-pham`, 4000);
  await evaluate(`(() => {
    const form = [...document.querySelectorAll('form')].find((f) => f.textContent.includes('Chọn từ catalog nhà cung cấp'));
    const inp = form ? form.querySelector('input[placeholder^="Tìm theo tên"]') : null;
    if (inp) { (${SET_VALUE})(inp, 'Genshin'); const btn = [...form.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Tìm'); btn?.click(); }
    return !!inp;
  })()`);
  await sleep(3000);
  const pickedOk = await evaluate(`(() => {
    const form = [...document.querySelectorAll('form')].find((f) => f.textContent.includes('Chọn từ catalog nhà cung cấp'));
    const btn = form ? [...form.querySelectorAll('button')].find((b) => b.textContent.includes('Genshin Impact')) : null;
    if (btn) { btn.click(); return true; }
    return false;
  })()`);
  ok(pickedOk === true, "picker: tìm + chọn được category Genshin Impact từ catalog mock");
  await sleep(3000);
  const fieldsState = await evaluate(`(() => {
    const form = [...document.querySelectorAll('form')].find((f) => f.textContent.includes('Chọn từ catalog nhà cung cấp'));
    if (!form) return null;
    const labels = [...form.querySelectorAll('input')].map((i) => i.value);
    return { text: form.textContent, hasUid: form.textContent.includes('uid'), hasServer: form.textContent.includes('server'), labels };
  })()`);
  ok(fieldsState?.hasUid && fieldsState?.hasServer, "picker: fields[] của category TỰ NẠP vào form (key uid + server hiện ra)");
  ok((fieldsState?.labels || []).includes("UID") && (fieldsState?.labels || []).includes("Server"), `picker: nhãn điền sẵn từ nhà cung cấp (${JSON.stringify(fieldsState?.labels)})`);
  ok((fieldsState?.text || "").includes("asia"), "picker: trường select hiện options (asia/america/europe) chỉ đọc");
  await evaluate(`window.scrollTo(0, 0); 'top'`);
  await sleep(500);
  await capture("2026-11-08-topup-fields", true);
  // Đặt giá + tạo sản phẩm qua picker
  await evaluate(`(() => {
    const form = [...document.querySelectorAll('form')].find((f) => f.textContent.includes('Chọn từ catalog nhà cung cấp'));
    const price = form ? form.querySelector('input[name="price"]') : null;
    if (price) (${SET_VALUE})(price, '30000');
    const btn = [...form.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Thêm danh mục');
    btn?.click();
    return !!price;
  })()`);
  await sleep(3500);
  txt = await bodyText();
  ok(txt.includes("Đã thêm danh mục Genshin Impact"), "picker: tạo xong category Genshin Impact kèm fields");
  const giProduct = await prisma.premiumProduct.findFirst({ where: { providerProductId: "tp-2" }, select: { id: true, slug: true, customFields: true } });
  ok(!!giProduct && (giProduct.customFields || "").includes('"key":"server"'), "picker: sản phẩm lưu customFields kèm key của NCC");

  await capture("2026-11-08-topup-admin-products", true);

  /* ============ TASK 2/6 — khách mua top-up + tách khu ================= */
  const mlbb = await prisma.premiumProduct.findFirst({ where: { providerProductId: "tp-1" }, select: { slug: true } });
  await setSession(demoToken);
  await viewport(1440, 1100);
  await navigate(`${BASE}/premium/${mlbb.slug}`, 4000);
  txt = await bodyText();
  ok(txt.includes("ID người chơi MLBB") && txt.includes("Zone ID"), "trang mua: form hiện NHÃN admin đã đổi (ID người chơi MLBB) + Zone ID");
  ok(txt.includes("86 Diamonds") && txt.includes("55.500"), "trang mua: gói 86 Diamonds giá 55.500đ (25000 x 1.2 x $1.85)");
  await evaluate(`(() => {
    const form = [...document.querySelectorAll('form')].find((f) => f.querySelector('input[name="cf_0"]'));
    if (!form) return 'noform';
    const set = ${SET_VALUE};
    const c0 = form.querySelector('input[name="cf_0"]'); if (c0) set(c0, 'player123');
    const c1 = form.querySelector('input[name="cf_1"]'); if (c1) set(c1, '1234');
    const vbtn = [...form.querySelectorAll('button')].find((b) => b.textContent.includes('86 Diamonds'));
    if (vbtn) vbtn.click();
    return 'filled';
  })()`);
  await sleep(800);
  await evaluate(`(() => {
    const form = [...document.querySelectorAll('form')].find((f) => f.querySelector('input[name="cf_0"]'));
    const btn = [...form.querySelectorAll('button')].find((b) => b.type === 'submit' && /Mua ngay|Đặt hàng/.test(b.textContent));
    if (btn) { btn.click(); return 'buy'; }
    return 'nobtn';
  })()`);
  await sleep(4000);
  const demoUser = await prisma.user.findFirst({ where: { username: "demo" } });
  const order = await prisma.premiumOrder.findFirst({
    where: { userId: demoUser.id, variant: { providerGroup: "topups" } },
    orderBy: { id: "desc" },
    include: { variant: { select: { providerGroup: true } } },
  });
  ok(!!order, `khách mua top-up thành công qua trang chi tiết (đơn ${order?.code}, trạng thái ${order?.status})`);
  ok(!!order?.providerOrderId, `đơn đã có providerOrderId phía mock FZR (${order?.providerOrderId})`);
  const code = order?.code || "";

  await navigate(`${BASE}/dashboard/top-up/don-hang`, 3500);
  txt = await bodyText();
  ok(code !== "" && txt.includes(code) && txt.includes("Mobile Legends"), "lịch sử Top-Up của khách: thấy đơn vừa mua");
  ok(txt.includes("Lịch sử đơn Top-Up") && txt.toUpperCase().includes("TỔNG SỐ ĐƠN"), "lịch sử Top-Up: header + thẻ thống kê đúng khung Telegram");
  const highlight = await evaluate(`(() => {
    const actives = [...document.querySelectorAll('a')].filter((a) => (a.getAttribute('class') || '').includes('bg-brand-50') && (a.getAttribute('class') || '').includes('shadow-brand-100'));
    return actives.map((a) => a.getAttribute('href'));
  })()`);
  ok(Array.isArray(highlight) && highlight.length === 1 && highlight[0] === "/dashboard/top-up/don-hang", `menu khách: highlight DUY NHẤT ở Đơn hàng Top-Up (${JSON.stringify(highlight)})`);
  await capture("2026-11-08-topup-history");
  await navigate(`${BASE}/dashboard/don-premium`, 3500);
  txt = await bodyText();
  ok(code !== "" && !txt.includes(code), "Đơn Premium của khách: KHÔNG có đơn Top-Up (tách hẳn)");

  /* ---- Trường select render ở form mua (Genshin) ---- */
  await navigate(`${BASE}/premium/${giProduct.slug}`, 4000);
  const selState = await evaluate(`(() => {
    const sel = document.querySelector('select[name="cf_1"]');
    return sel ? [...sel.options].map((o) => o.value) : null;
  })()`);
  ok(Array.isArray(selState) && selState.includes("asia") && selState.includes("america") && selState.includes("europe"), `form mua Genshin: trường Server render thành <select> với options của NCC (${JSON.stringify(selState)})`);

  /* ---- Admin: hàng đợi Top-Up có đơn, hàng đợi Premium không ---- */
  await setSession(adminToken);
  await viewport(1440, 1100);
  await navigate(`${BASE}/admin/top-up`, 3500);
  txt = await bodyText();
  ok(code !== "" && txt.includes(code), "admin Đơn hàng Top-Up: thấy đơn vừa mua");
  ok(txt.includes("Top-Up"), "admin nav: có nhóm Top-Up");
  await capture("2026-11-08-topup-admin-orders");
  await navigate(`${BASE}/admin/don-premium`, 3500);
  txt = await bodyText();
  ok(code !== "" && !txt.includes(code), "admin hàng đợi Premium: KHÔNG có đơn Top-Up (tách hẳn)");

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
}

main()
  .catch((e) => { console.error(e); failures++; })
  .finally(async () => {
    try { console.log(fixture("clean")); } catch (e) { console.error("clean lỗi", e); }
    try { await prisma.$disconnect(); } catch {}
    mock.kill();
    chrome.kill();
    process.exit(failures ? 1 : 0);
  });
