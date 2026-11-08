/** FIX7 TASK E: đi bộ admin — Nhà cung cấp top-level, editor Premium (hàng
 *  ánh xạ NCC + nút Xoá gói), tạo/sửa/xoá sản phẩm rác trong editor Telegram
 *  và Steam, trang đơn Steam, highlight đúng 1 lá, ngăn kéo mobile. */
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
const u = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ uid: 1, role: "ADMIN", username: "admin", sv: 0, iat: now, exp: now + 3600 })}`;
const token = `${u}.${createHmac("sha256", secret).update(u).digest("base64url")}`;

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--remote-debugging-port=9363", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9363/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
async function navigate(url, waitMs = 2400) { await send("Page.navigate", { url }); await sleep(waitMs); }
async function capture(name, full = false) {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: full });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name);
}
async function viewport(width, height) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 500 });
}

const GRADIENT_LEAVES = `(() => {
  const aside = document.querySelector('aside');
  if (!aside) return { count: -1, labels: [] };
  const act = [...aside.querySelectorAll('a')].filter((a) => a.className.includes('from-brand-600'));
  return { count: act.length, labels: act.map((a) => a.textContent.trim()) };
})()`;

const SET_VAL = (sel, val) => `(() => {
  const el = document.querySelector('${sel}');
  if (!el) return false;
  const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  setter.call(el, '${val}');
  el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  return true;
})()`;

/** Luồng tạo -> gán gói theo nhóm -> sửa gói -> xoá gói -> xoá sản phẩm
 *  trong một trang editor theo khu. */
async function editorFlow(scopeLabel, pageUrl, productName, group, shotName) {
  await navigate(pageUrl);
  let hl = await evaluate(GRADIENT_LEAVES);
  ok(hl.count === 1, `${scopeLabel}: highlight đúng 1 lá trên trang sản phẩm (${JSON.stringify(hl.labels)})`);
  // Tạo sản phẩm
  await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Thêm sản phẩm mới')); b.click(); return 'open'; })()`);
  await sleep(700);
  await evaluate(SET_VAL('input[name="name"]', productName));
  await sleep(300);
  await evaluate(`(() => { const s = document.querySelector('select[name="categoryId"]'); const opt = [...s.options].find((o) => o.value); const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set; setter.call(s, opt.value); s.dispatchEvent(new Event('change', { bubbles: true })); return opt.value; })()`);
  await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Lưu sản phẩm'); b.click(); return 'save'; })()`);
  await sleep(3200);
  let url = await evaluate(`location.href`);
  let hasRow = await evaluate(`document.body.innerText.includes('${productName}')`);
  ok(url.includes(pageUrl.replace(BASE, "")) && hasRow, `${scopeLabel}: tạo sản phẩm xong quay về trang khu và thấy sản phẩm (${url})`);
  // Mở modal Gói, thêm gói có providerGroup
  await evaluate(`(() => { const rows = [...document.querySelectorAll('tbody tr')]; const tr = rows.find((r) => r.textContent.includes('${productName}')); const b = [...tr.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Gói'); b.click(); return 'variants'; })()`);
  await sleep(700);
  await evaluate(`(() => {
    const forms = [...document.querySelectorAll('form')];
    const add = forms.find((f) => [...f.querySelectorAll('button')].some((b) => b.textContent.includes('Thêm gói')));
    const set = (n, v) => { const el = add.querySelector('[name="' + n + '"]'); if (el) el.value = v; };
    set('name', 'Gói Test'); set('price', '1000'); set('providerGroup', '${group}'); set('providerItemId', 'test-item');
    const b = [...add.querySelectorAll('button')].find((x) => x.textContent.includes('Thêm gói'));
    b.click(); return 'add-variant';
  })()`);
  await sleep(3200);
  // Mở lại modal Gói: gói phải hiện với đúng providerGroup
  await evaluate(`(() => { const rows = [...document.querySelectorAll('tbody tr')]; const tr = rows.find((r) => r.textContent.includes('${productName}')); const b = [...tr.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Gói'); if (b) b.click(); return 'reopen'; })()`);
  await sleep(700);
  const grpVal = await evaluate(`(() => { const inp = [...document.querySelectorAll('input[name="providerGroup"]')].map((i) => i.value); return inp; })()`);
  ok(grpVal.includes(group), `${scopeLabel}: gói mới mang providerGroup=${group} (${JSON.stringify(grpVal)})`);
  await capture(shotName, true);
  // Sửa giá gói -> Lưu
  await evaluate(`(() => {
    const forms = [...document.querySelectorAll('form')];
    const edit = forms.find((f) => f.querySelector('input[name="providerGroup"]') && f.querySelector('input[name="providerGroup"]').value === '${group}');
    edit.querySelector('input[name="price"]').value = '2000';
    const b = [...edit.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Lưu');
    b.click(); return 'edit-variant';
  })()`);
  await sleep(3200);
  await evaluate(`(() => { const rows = [...document.querySelectorAll('tbody tr')]; const tr = rows.find((r) => r.textContent.includes('${productName}')); const b = [...tr.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Gói'); if (b) b.click(); return 'reopen2'; })()`);
  await sleep(700);
  const priceVal = await evaluate(`(() => { const forms = [...document.querySelectorAll('form')]; const edit = forms.find((f) => f.querySelector('input[name="providerGroup"]') && f.querySelector('input[name="providerGroup"]').value === '${group}'); return edit ? edit.querySelector('input[name="price"]').value : null; })()`);
  ok(priceVal === "2000", `${scopeLabel}: sửa giá gói lưu được (${priceVal})`);
  // Xoá gói (confirm tự accept qua CDP dialog handler). LƯU Ý: modal đang mở
  // giữ snapshot cũ (state phía client) nên phải đóng + mở lại từ hàng mới
  // thấy dữ liệu tươi — kiểm trên modal tươi.
  await evaluate(`(() => { const forms = [...document.querySelectorAll('form')]; const edit = forms.find((f) => f.querySelector('input[name="providerGroup"]') && f.querySelector('input[name="providerGroup"]').value === '${group}'); const b = [...edit.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Xoá gói'); b.click(); return 'del-variant'; })()`);
  await sleep(3200);
  await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Đóng'); if (b) b.click(); return 'close-stale'; })()`);
  await sleep(500);
  await evaluate(`(() => { const rows = [...document.querySelectorAll('tbody tr')]; const tr = rows.find((r) => r.textContent.includes('${productName}')); const b = [...tr.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Gói'); if (b) b.click(); return 'reopen-fresh'; })()`);
  await sleep(800);
  const grpAfter = await evaluate(`(() => [...document.querySelectorAll('form')].filter((f) => f.querySelector('input[name="id"]') && f.querySelector('input[name="providerGroup"]') && f.querySelector('input[name="providerGroup"]').value === '${group}').length)()`);
  ok(grpAfter === 0, `${scopeLabel}: xoá gói xong, mở lại modal không còn gói thuộc nhóm (còn ${grpAfter})`);
  await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Đóng'); if (b) b.click(); return 'close'; })()`);
  await sleep(500);
  // Xoá sản phẩm
  await evaluate(`(() => { const rows = [...document.querySelectorAll('tbody tr')]; const tr = rows.find((r) => r.textContent.includes('${productName}')); const f = tr.querySelector('form[action]'); const forms = [...tr.querySelectorAll('form')]; const del = forms[forms.length - 1]; del.querySelector('button').click(); return 'del-product'; })()`);
  await sleep(3200);
  hasRow = await evaluate(`document.body.innerText.includes('${productName}')`);
  ok(!hasRow, `${scopeLabel}: xoá sản phẩm xong, không còn trong danh sách`);
}

async function main() {
  ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === "Page.javascriptDialogOpening") { send("Page.handleJavaScriptDialog", { accept: true }).catch(() => {}); return; }
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
  };
  const t = await send("Target.createTarget", { url: "about:blank" });
  sessionId = (await send("Target.attachToTarget", { targetId: t.targetId, flatten: true })).sessionId;
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await navigate(`${BASE}/`);
  await evaluate(`document.cookie = 'smmv2_session=${token}; path=/'; document.cookie = 'smmv2-lang=vi; path=/'; try { localStorage.setItem('smmv2-lang', 'vi'); } catch(e) {} 'set'`);

  // --- E1: Nhà cung cấp top-level ---
  await viewport(1440, 1100);
  await navigate(`${BASE}/admin`);
  const prov = await evaluate(`(() => {
    const aside = document.querySelector('aside');
    const links = [...aside.querySelectorAll('a')];
    const leaf = links.find((a) => (a.getAttribute('href') || '') === '/admin/nha-cung-cap');
    return { found: !!leaf, inGroupIndent: leaf ? leaf.className.includes('py-2 text-[13px]') : null };
  })()`);
  ok(prov.found && prov.inGroupIndent === false, "E1: Nhà cung cấp là lá top-level (không còn lún trong nhóm)");
  await navigate(`${BASE}/admin/nha-cung-cap`);
  let hl = await evaluate(GRADIENT_LEAVES);
  ok(hl.count === 1 && hl.labels[0].includes("Nhà cung cấp"), `E1: highlight đúng lá Nhà cung cấp (${JSON.stringify(hl.labels)})`);
  await capture("2026-11-08-admin2-providers");

  // --- E2: editor Premium — hàng ánh xạ + nút xoá gói ---
  await navigate(`${BASE}/admin/premium`);
  const hasProducts = await evaluate(`document.querySelectorAll('tbody tr').length > 0`);
  if (hasProducts) {
    await evaluate(`(() => { const b = [...document.querySelectorAll('tbody tr')][0].querySelector('button'); const btns = [...document.querySelectorAll('tbody tr')[0].querySelectorAll('button')]; const g = btns.find((x) => x.textContent.trim() === 'Gói'); g.click(); return 'open-variants'; })()`);
    await sleep(800);
    const mapCheck = await evaluate(`(() => ({
      providerSelects: document.querySelectorAll('select[name="providerId"]').length,
      groupInputs: document.querySelectorAll('input[name="providerGroup"]').length,
      delBtns: [...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Xoá gói').length,
      ws9: document.querySelectorAll('select[name="deliveryType"]').length > 0 && document.querySelectorAll('input[name="stockQty"]').length > 0,
    }))()`);
    console.log("VARIANT MODAL:", JSON.stringify(mapCheck));
    ok(mapCheck.providerSelects >= 1 && mapCheck.groupInputs >= 2, "E2: modal Gói có hàng ánh xạ NCC (select + group) ở cả form sửa và thêm");
    ok(mapCheck.delBtns >= 1, "E2: có nút Xoá gói");
    ok(mapCheck.ws9, "E2: trường WS9 (loại giao + kho) còn nguyên");
    await capture("2026-11-08-admin2-premium-edit", true);
    await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Đóng'); if (b) b.click(); return 'close'; })()`);
    await sleep(400);
  } else {
    ok(false, "E2: catalog local trống — không mở được modal Gói");
  }

  // --- E3: editor Telegram — tạo/sửa/xoá ---
  await editorFlow("E3 Telegram", `${BASE}/admin/telegram/san-pham`, "Telegram Test Fixture", "telegram_stars", "2026-11-08-admin2-telegram-products");

  // --- E4: editor Steam + trang đơn Steam ---
  await editorFlow("E4 Steam", `${BASE}/admin/steam/san-pham`, "Steam Test Fixture", "steam_topup", "2026-11-08-admin2-steam-products");
  await navigate(`${BASE}/admin/steam`);
  hl = await evaluate(GRADIENT_LEAVES);
  ok(hl.count === 1 && hl.labels[0].includes("Đơn hàng Steam"), `E4: highlight đúng lá Đơn hàng Steam (${JSON.stringify(hl.labels)})`);
  await capture("2026-11-08-admin2-steam-orders");

  // --- Mobile: ngăn kéo + chạm mở nhóm Steam ---
  await viewport(390, 844);
  await navigate(`${BASE}/admin/steam/san-pham`);
  await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.getAttribute('aria-label') === 'Mở menu'); if (b) b.click(); return 'burger'; })()`);
  await sleep(700);
  const drawerKidsPre = await evaluate(`(() => { const d = [...document.querySelectorAll('div')].find((x) => x.className.includes('z-[80]')); return d ? [...d.querySelectorAll('a')].filter((a) => (a.getAttribute('href') || '').includes('/admin/steam')).length : 0; })()`);
  const drawer = await evaluate(`(() => {
    const drawers = [...document.querySelectorAll('div')].filter((d) => d.className.includes('z-[80]'));
    if (!drawers.length) return { open: false };
    return { open: true };
  })()`);
  if (drawerKidsPre === 0) {
    await evaluate(`(() => { const d = [...document.querySelectorAll('div')].find((x) => x.className.includes('z-[80]')); const steamBtn = [...d.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith('Steam')); if (steamBtn) steamBtn.click(); return 'toggled'; })()`);
    await sleep(600);
  }
  const drawerKids = await evaluate(`(() => { const d = [...document.querySelectorAll('div')].find((x) => x.className.includes('z-[80]')); if (!d) return { stillOpen: false, kids: [] }; return { stillOpen: true, kids: [...d.querySelectorAll('a')].filter((a) => (a.getAttribute('href') || '').includes('/admin/steam')).map((a) => a.textContent.trim()) }; })()`);
  console.log("DRAWER:", JSON.stringify({ drawer, drawerKids }));
  ok(drawer.open && drawerKids.stillOpen && drawerKids.kids.length === 2, "mobile: chạm mở nhóm Steam trong ngăn kéo, ngăn kéo không đóng, 2 mục con hiện");
  await capture("2026-11-08-admin2-steam-mobile");

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAIL`);
  chrome.kill();
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
