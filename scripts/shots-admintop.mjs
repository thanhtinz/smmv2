/** Kiểm chứng "form thêm lên đầu trang + tab Telegram" qua CDP (production :3000):
 *  - /admin/telegram/san-pham: mặc định tab Sao; form thêm gói sao ở ĐẦU section
 *    (trên gói đơn vị + danh sách); phân trang trong tab; chuyển sang tab Premium
 *    thấy form thêm + danh sách + phân trang; lật trang Premium rồi quay lại tab
 *    Sao -> trang sao đã lật vẫn giữ nguyên; thêm 1 gói từ form trên cùng -> hiện
 *    trong danh sách.
 *  - /admin/steam/san-pham: form thêm mệnh giá đứng trước danh sách Top-Up; form
 *    thêm game gift đứng trước ô tìm kiếm của section Game gift.
 *  - /admin/game-key/san-pham + /admin/gift-card/san-pham: khối picker thêm
 *    game/danh mục đứng trước ô tìm kiếm và trước danh sách.
 *  - /admin/premium: nút "+ Thêm sản phẩm mới" nằm TRÊN thẻ lọc.
 *  Chạy sau fixture-admintop.ts seed + fixture-adminpage.ts seed. */
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
const adminToken = mint({ uid: 1, role: "ADMIN", username: "admin", amr: "passkey" });

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=old", "--disable-gpu", "--no-sandbox", "--disable-setuid-sandbox", "--hide-scrollbars",
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-admintop",
  "--remote-debugging-port=9371", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9371/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
async function navigate(url, waitMs = 3000) { await send("Page.navigate", { url }); await sleep(waitMs); }
async function capture(name) {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name);
}
const bodyText = () => evaluate(`document.body.innerText`);
async function waitText(needle, tries = 10) {
  let txt = "";
  for (let i = 0; i < tries; i++) {
    txt = await bodyText();
    if (txt.includes(needle)) return txt;
    await sleep(1200);
  }
  return txt;
}
/** Trong section chứa heading `head`, phần tử khớp `selA` có đứng trước phần tử khớp `selB` không (theo thứ tự DOM)? */
const orderInSection = (head, selA, selB) => evaluate(`(() => {
  const sec = [...document.querySelectorAll('section')].find((s) => s.textContent.includes(${JSON.stringify(head)}));
  if (!sec) return "no-section";
  const a = sec.querySelector(${JSON.stringify(selA)});
  const b = sec.querySelector(${JSON.stringify(selB)});
  if (!a || !b) return "missing:" + (!a ? "A" : "") + (!b ? "B" : "");
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? "A-before-B" : "B-before-A";
})()`);
const clickBtn = (label) => evaluate(`(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(label)} && x.offsetParent !== null);
  if (!b) return "not-found";
  b.click();
  return "clicked";
})()`);
const clickLinkInSection = (head, label) => evaluate(`(() => {
  const sec = [...document.querySelectorAll('section')].find((s) => s.textContent.includes(${JSON.stringify(head)}));
  if (!sec) return "no-section";
  const a = [...sec.querySelectorAll('a')].find((x) => x.textContent.trim() === ${JSON.stringify(label)});
  if (!a) return "not-found";
  a.click();
  return "clicked:" + a.getAttribute("href");
})()`);

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
  await navigate(`${BASE}/`);
  await evaluate(`document.cookie = 'smmv2_session=${adminToken}; path=/'; document.cookie = 'smmv2-lang=vi; path=/'; try { localStorage.setItem('smmv2-lang', 'vi'); } catch(e) {} 'set'`);

  /* ---------- Telegram: tab + form trên cùng ---------- */
  await navigate(`${BASE}/admin/telegram/san-pham`, 3500);
  let txt = await waitText("Thêm gói sao");
  ok(txt.includes("Gói Sao") && txt.includes("Gói Premium"), "TG: thanh tab có đủ 'Gói Sao' + 'Gói Premium'");
  // Tab Sao là tab mặc định: section Sao hiện, section Premium ẩn.
  const vis = await evaluate(`(() => {
    const secs = [...document.querySelectorAll('section')];
    const stars = secs.find((s) => s.textContent.includes('Danh sách gói sao'));
    const prem = secs.find((s) => s.textContent.includes('Các gói theo tháng'));
    const visOf = (el) => !!el && el.closest('div').className !== 'hidden' && el.offsetParent !== null;
    return { stars: visOf(stars), prem: visOf(prem) };
  })()`);
  ok(vis.stars === true && vis.prem === false, `TG: mặc định hiện tab Sao, ẩn tab Premium (stars=${vis.stars}, prem=${vis.prem})`);
  // Form thêm gói sao đứng trước tiêu đề "Danh sách gói sao" và trước hàng gói đơn vị.
  let ord = await orderInSection("Danh sách gói sao", "form:has(button)", "h3");
  ok(ord === "A-before-B", `TG Sao: form thêm đứng trước tiêu đề danh sách (${ord})`);
  ord = await evaluate(`(() => {
    const sec = [...document.querySelectorAll('section')].find((s) => s.textContent.includes('Danh sách gói sao'));
    const form = [...sec.querySelectorAll('form')].find((f) => f.textContent.includes('Thêm gói sao'));
    const unit = [...sec.querySelectorAll('div')].find((d) => d.textContent.includes('Gói đơn vị (neo thực thi'));
    if (!form || !unit) return "missing";
    return (form.compareDocumentPosition(unit) & Node.DOCUMENT_POSITION_FOLLOWING) ? "form-before-unit" : "unit-before-form";
  })()`);
  ok(ord === "form-before-unit", `TG Sao: form thêm đứng trước hàng gói đơn vị (${ord})`);
  ok(txt.includes("Trang 1/2") && txt.includes("25 gói sao"), "TG Sao: phân trang 'Trang 1/2 · 25 gói sao'");
  await capture("2026-11-08-admintop-telegram");

  // Lật trang Sao sang trang 2 (Link máy chủ) — URL phải giữ tab=stars.
  let r = await clickLinkInSection("Danh sách gói sao", "Trang sau");
  ok(String(r).startsWith("clicked"), `TG Sao: bấm được 'Trang sau' (${r})`);
  await sleep(2800);
  txt = await waitText("Trang 2/2");
  ok(txt.includes("Trang 2/2") && txt.includes("25 gói sao"), "TG Sao: sang được trang 2/2");
  let url = await evaluate(`location.search`);
  ok(url.includes("spage=2") && url.includes("tab=stars"), `TG Sao: URL giữ spage=2 + tab=stars (${url})`);

  // Chuyển tab Premium tại chỗ.
  r = await clickBtn("Gói Premium");
  ok(r === "clicked", "TG: bấm được tab 'Gói Premium'");
  await sleep(900);
  url = await evaluate(`location.search`);
  ok(url.includes("tab=premium"), `TG: URL mang tab=premium sau khi chuyển tại chỗ (${url})`);
  const vis2 = await evaluate(`(() => {
    const secs = [...document.querySelectorAll('section')];
    const stars = secs.find((s) => s.textContent.includes('Danh sách gói sao'));
    const prem = secs.find((s) => s.textContent.includes('Các gói theo tháng'));
    const visOf = (el) => !!el && el.closest('div').className !== 'hidden' && el.offsetParent !== null;
    return { stars: visOf(stars), prem: visOf(prem) };
  })()`);
  ok(vis2.prem === true && vis2.stars === false, "TG: chuyển tại chỗ — Premium hiện, Sao ẩn");
  txt = await bodyText();
  ok(txt.includes("Trang 1/2") && txt.includes("25 gói"), "TG Premium: phân trang 'Trang 1/2 · 25 gói'");
  ord = await orderInSection("Các gói theo tháng", "form:has(select)", "input[name='name']");
  // Form thêm gói Premium là form đầu tiên của section (trước hàng gói đầu tiên — hàng gói chứa input name="name" của VariantRow)
  ord = await evaluate(`(() => {
    const sec = [...document.querySelectorAll('section')].find((s) => s.textContent.includes('Các gói theo tháng'));
    if (!sec) return "no-section";
    const addForm = [...sec.querySelectorAll('form')].find((f) => f.textContent.includes('Thêm gói'));
    const rows = [...sec.querySelectorAll('form')].filter((f) => f.textContent.includes('Lưu'));
    if (!addForm || !rows.length) return "missing";
    return (addForm.compareDocumentPosition(rows[0]) & Node.DOCUMENT_POSITION_FOLLOWING) ? "add-before-rows" : "rows-before-add";
  })()`);
  ok(ord === "add-before-rows", `TG Premium: form thêm đứng trước danh sách gói (${ord})`);

  // Lật trang Premium sang trang 2.
  r = await clickLinkInSection("Các gói theo tháng", "Trang sau");
  ok(String(r).startsWith("clicked"), `TG Premium: bấm được 'Trang sau' (${r})`);
  await sleep(2800);
  txt = await waitText("Trang 2/2");
  ok(txt.includes("Trang 2/2") && txt.includes("25 gói"), "TG Premium: sang được trang 2/2");
  url = await evaluate(`location.search`);
  ok(url.includes("ppage=2") && url.includes("tab=premium"), `TG Premium: URL giữ ppage=2 + tab=premium (${url})`);

  // Quay lại tab Sao tại chỗ — trang Sao đã lật (trang 2) phải còn nguyên.
  r = await clickBtn("Gói Sao");
  ok(r === "clicked", "TG: bấm quay lại tab 'Gói Sao'");
  await sleep(900);
  const starsPager = await evaluate(`(() => {
    const sec = [...document.querySelectorAll('section')].find((s) => s.textContent.includes('Danh sách gói sao'));
    return sec ? sec.textContent.includes('Trang 2/2') : false;
  })()`);
  ok(starsPager === true, "TG: quay lại tab Sao — vị trí trang 2/2 được giữ nguyên");

  // Thêm 1 gói sao từ form trên cùng (số sao = 5 -> sắp xếp đứng đầu danh sách).
  await navigate(`${BASE}/admin/telegram/san-pham`, 3500);
  await waitText("Thêm gói sao");
  const filled = await evaluate(`(() => {
    const sec = [...document.querySelectorAll('section')].find((s) => s.textContent.includes('Danh sách gói sao'));
    const form = [...sec.querySelectorAll('form')].find((f) => f.textContent.includes('Thêm gói sao'));
    if (!form) return "no-form";
    const set = (el, v) => { const proto = Object.getPrototypeOf(el); const setter = Object.getOwnPropertyDescriptor(proto, 'value').set; setter.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    set(form.querySelector('input[name="amount"]'), '5');
    set(form.querySelector('input[name="name"]'), 'ZZ Fixture Added');
    return "filled";
  })()`);
  ok(filled === "filled", "TG Sao: điền được form thêm gói ở đầu tab");
  r = await clickBtn("Thêm gói sao");
  ok(r === "clicked", "TG Sao: bấm 'Thêm gói sao'");
  await sleep(3200);
  txt = await waitText("ZZ Fixture Added");
  ok(txt.includes("ZZ Fixture Added"), "TG Sao: gói vừa thêm hiện ngay trong danh sách");
  url = await evaluate(`location.search`);
  ok(url.includes("tab=stars"), `TG Sao: sau khi thêm vẫn ở tab Sao (${url})`);

  /* ---------- Steam ---------- */
  await navigate(`${BASE}/admin/steam/san-pham`, 3500);
  await waitText("Thêm mệnh giá");
  ord = await orderInSection("Gói Top-Up", "form:has(button)", "p");
  ok(ord === "A-before-B", `Steam Top-Up: form thêm mệnh giá đứng trước nội dung danh sách (${ord})`);
  ord = await evaluate(`(() => {
    const sec = [...document.querySelectorAll('section')].find((s) => s.textContent.includes('Game gift'));
    if (!sec) return "no-section";
    const picker = [...sec.querySelectorAll('div')].find((d) => d.textContent.includes('Chọn từ catalog nhà cung cấp'));
    const search = sec.querySelector('input[name="gq"]');
    if (!picker || !search) return "missing";
    return (picker.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING) ? "picker-before-search" : "search-before-picker";
  })()`);
  ok(ord === "picker-before-search", `Steam Gift: form thêm game đứng trước ô tìm kiếm (${ord})`);

  /* ---------- Game Key ---------- */
  await navigate(`${BASE}/admin/game-key/san-pham`, 3500);
  await waitText("Tìm game theo tên");
  ord = await evaluate(`(() => {
    const search = document.querySelector('section input[name="q"]');
    const sec = search ? search.closest('section') : null;
    if (!sec) return "no-section";
    const picker = [...sec.querySelectorAll('div')].find((d) => d.textContent.includes('Chọn từ catalog nhà cung cấp'));
    const firstSave = [...sec.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Lưu game');
    if (!picker || !firstSave) return "missing";
    const beforeSearch = (picker.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING) ? 1 : 0;
    const beforeList = (picker.compareDocumentPosition(firstSave) & Node.DOCUMENT_POSITION_FOLLOWING) ? 1 : 0;
    return beforeSearch + "," + beforeList;
  })()`);
  ok(ord === "1,1", `Game Key: form thêm game đứng trước ô tìm kiếm + danh sách (${ord})`);

  /* ---------- Gift Card ---------- */
  await navigate(`${BASE}/admin/gift-card/san-pham`, 3500);
  await waitText("Tìm danh mục theo tên");
  ord = await evaluate(`(() => {
    const search = document.querySelector('section input[name="q"]');
    const sec = search ? search.closest('section') : null;
    if (!sec) return "no-section";
    const picker = [...sec.querySelectorAll('div')].find((d) => d.textContent.includes('Chọn từ catalog nhà cung cấp'));
    const firstSave = [...sec.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Lưu danh mục');
    if (!picker || !firstSave) return "missing";
    const beforeSearch = (picker.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING) ? 1 : 0;
    const beforeList = (picker.compareDocumentPosition(firstSave) & Node.DOCUMENT_POSITION_FOLLOWING) ? 1 : 0;
    return beforeSearch + "," + beforeList;
  })()`);
  ok(ord === "1,1", `Gift Card: form thêm danh mục đứng trước ô tìm kiếm + danh sách (${ord})`);

  /* ---------- Premium chung ---------- */
  await navigate(`${BASE}/admin/premium`, 3500);
  await waitText("Thêm sản phẩm mới");
  const tops = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Thêm sản phẩm mới'));
    const form = [...document.querySelectorAll('form')].find((f) => f.textContent.includes('Tất cả danh mục'));
    if (!btn || !form) return "missing";
    return { btn: Math.round(btn.getBoundingClientRect().top), form: Math.round(form.getBoundingClientRect().top) };
  })()`);
  ok(tops !== "missing" && tops.btn < tops.form, `Premium: nút thêm sản phẩm (top=${tops.btn}) nằm trên thẻ lọc (top=${tops.form})`);

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
  process.exitCode = failures ? 1 : 0;
  chrome.kill();
}

main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
