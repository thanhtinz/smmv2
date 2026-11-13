/** KIỂM CHỨNG ĐỢT 121 — KHU CẤU HÌNH SEO CHUYÊN NGHIỆP + BỎ NÚT X NGĂN KÉO MOBILE.
 *  node scripts/shots-seo-121.mjs (cần server production :3000 + DB local đã seed).
 *  Luồng: đăng nhập admin qua UI -> tab SEO ở Cấu hình -> điền giá trị kiểm
 *  chứng -> Lưu -> lấy HTML THÔ trang chủ / /premium?cat / chi tiết sản phẩm
 *  khẳng định thẻ meta theo cấu hình; tắt/bật seo_indexing kiểm robots.txt +
 *  meta robots; danh mục + sản phẩm có meta riêng; mobile: mở ngăn kéo (không
 *  còn X) -> chạm backdrop -> đóng. Cuối script TỰ DỌN mọi giá trị đã đặt. */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });
let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=old", "--disable-gpu", "--no-sandbox", "--disable-setuid-sandbox", "--hide-scrollbars",
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-seo121",
  "--remote-debugging-port=9419", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9419/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
async function shot(name, full = false) {
  const r = await send("Page.captureScreenshot", { format: "png", ...(full ? { captureBeyondViewport: true } : {}) });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name);
}
const bodyText = () => evaluate(`document.body.innerText`);
const setField = (name, val) => evaluate(`(() => { const el = document.querySelector('[name="${name}"]'); if (!el) throw new Error('thiếu field ${name}'); el.focus(); el.value = ${JSON.stringify(val)}; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
async function setLangVi() {
  await navigate(BASE + "/", 1500);
  await evaluate(`(() => { try { localStorage.setItem('smmv2-lang', 'vi'); } catch {} document.cookie = 'smmv2-lang=vi; path=/'; return true; })()`);
}
async function login(username, password) {
  await send("Network.clearBrowserCookies");
  await setLangVi();
  await navigate(`${BASE}/login`, 2500);
  await setField("login", username);
  await setField("password", password);
  await evaluate(`(() => { const b = document.querySelector('form button[type="submit"], form button'); if (!b) throw new Error('thiếu nút submit'); b.click(); return true; })()`);
  await sleep(3200);
}
const clickByText = (t) => evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === ${JSON.stringify(t)}); if (!b) return false; b.scrollIntoView({ block: 'center' }); b.click(); return true; })()`);
async function fetchHtml(path) { const r = await fetch(BASE + path); return r.text(); }
const headOf = (html) => (html.match(/<head[\s\S]*?<\/head>/) || [""])[0];
const titleOf = (html) => (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "";
const metaOf = (html, attr, val) => {
  const m = html.match(new RegExp(`<meta[^>]+${attr}="${val}"[^>]*content="([^"]*)"`) || new RegExp(`<meta[^>]+content="([^"]*)"[^>]+${attr}="${val}"`));
  return m ? m[1] : null;
};

const V = {
  defTitle: "Tiêu Đề Mặc Định 121",
  template: "%s | Hậu Tố 121",
  defDesc: "Mô tả mặc định toàn web đợt 121 kiểm chứng",
  keywords: "khoa mot 121, khoa hai 121",
  ogTitle: "Tiêu Đề Chia Sẻ 121",
  ogDesc: "Mô tả chia sẻ đợt 121",
  homeTitle: "Tiêu Đề Trang Chủ Riêng 121",
  homeDesc: "Mô tả trang chủ riêng đợt 121",
  catTitle: "Tiêu Đề Danh Mục Riêng 121",
  catDesc: "Mô tả danh mục riêng đợt 121",
  prodTitle: "Tiêu Đề Sản Phẩm Riêng 121",
};

async function main() {
  // Tạm tắt cổng 2FA bắt buộc của admin trong lúc chụp (trả lại cuối script).
  const prev2fa = (await prisma.setting.findUnique({ where: { key: "admin_2fa_required" } }))?.value;
  await prisma.setting.upsert({ where: { key: "admin_2fa_required" }, create: { key: "admin_2fa_required", value: "0" }, update: { value: "0" } });

  const cat = await prisma.premiumCategory.findFirst({ where: { active: true }, orderBy: { id: "asc" } });
  const prod = await prisma.premiumProduct.findFirst({ where: { active: true, panelId: null }, orderBy: { id: "asc" } });
  ok(!!cat && !!prod, `có sẵn danh mục (${cat?.name}) + sản phẩm (${prod?.name}) để kiểm chứng`);
  const prevCatMeta = { metaTitle: cat.metaTitle, metaDescription: cat.metaDescription };
  const prevProdMeta = { metaTitle: prod.metaTitle, metaDescription: prod.metaDescription };

  ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } };
  const targets = await (await fetch("http://127.0.0.1:9419/json/list")).json();
  const page = targets.find((t) => t.type === "page");
  sessionId = (await send("Target.attachToTarget", { targetId: page.id, flatten: true })).sessionId;
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

  /* ---- 1. Tab SEO trong admin ---- */
  await login("admin", "Admin@123");
  await navigate(`${BASE}/admin/cau-hinh`, 3500);
  let text = await bodyText();
  ok(text.includes("Cài đặt Website"), "vào được trang Cấu hình");
  const tabClicked = await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'SEO'); if (!b) return false; b.click(); return true; })()`);
  ok(tabClicked, "có tab SEO cạnh tab Chung");
  await sleep(600);
  const fieldNames = await evaluate(`[...document.querySelectorAll('[name]')].map((e) => e.name)`);
  for (const f of ["seo_default_title", "seo_title_template", "meta_description", "meta_keywords", "og_title", "og_description", "og_image_url", "twitter_card", "favicon_url", "ga_id", "gsc_verification", "seo_indexing", "seo_home_title", "seo_home_description"]) {
    ok(fieldNames.filter((x) => x === f).length === 1, `tab SEO có đúng 1 trường ${f}`);
  }
  const canonText = await bodyText();
  ok(canonText.includes("Địa chỉ gốc Canonical") || canonText.includes("Chưa cấu hình Liên kết web"), "tab SEO hiển thị trạng thái Canonical");
  await shot("2026-11-13-seo-admin-tab", true);

  /* ---- 2. Điền giá trị kiểm chứng + Lưu qua UI ---- */
  await setField("seo_default_title", V.defTitle);
  await setField("seo_title_template", V.template);
  await setField("meta_description", V.defDesc);
  await setField("meta_keywords", V.keywords);
  await setField("og_title", V.ogTitle);
  await setField("og_description", V.ogDesc);
  await setField("seo_home_title", V.homeTitle);
  await setField("seo_home_description", V.homeDesc);
  const saved = await evaluate(`(() => { const b = document.querySelector('button[form="settings-form"]'); if (!b) return false; b.click(); return true; })()`);
  ok(saved, "bấm được nút Lưu cài đặt");
  await sleep(4000);
  const dbSeo = Object.fromEntries((await prisma.setting.findMany({ where: { key: { in: ["seo_default_title", "seo_title_template", "meta_description", "meta_keywords", "og_title", "og_description", "seo_home_title", "seo_home_description"] } } })).map((r) => [r.key, r.value]));
  ok(dbSeo.seo_default_title === V.defTitle && dbSeo.seo_title_template === V.template && dbSeo.meta_description === V.defDesc && dbSeo.og_title === V.ogTitle && dbSeo.seo_home_title === V.homeTitle, "giá trị SEO đã lưu vào DB qua UI admin");

  /* ---- 3. HTML thô trang chủ: ghi đè trang chủ thắng ---- */
  let home = await fetchHtml("/");
  let head = headOf(home);
  ok(titleOf(home) === V.homeTitle, `trang chủ dùng tiêu đề riêng (title="${titleOf(home)}")`);
  ok(metaOf(head, "name", "description") === V.homeDesc, "trang chủ dùng mô tả riêng");
  ok(metaOf(head, "property", "og:title") === V.homeTitle, "og:title trang chủ = tiêu đề riêng");
  ok((metaOf(head, "name", "keywords") || "").includes("khoa mot 121"), "keywords mặc định xuất hiện ở trang chủ");
  ok(!head.includes('content="noindex'), "đang bật lập chỉ mục: không có noindex");

  /* ---- 4. Trang con không ghi đè: /premium dùng mặc định + template không áp cho default ---- */
  const prem = await fetchHtml("/premium");
  ok(titleOf(prem) === V.defTitle, `/premium (không cat) dùng tiêu đề mặc định ("${titleOf(prem)}")`);
  ok(metaOf(headOf(prem), "name", "description") === V.defDesc, "/premium dùng mô tả mặc định");
  ok(metaOf(headOf(prem), "property", "og:title") === V.ogTitle, "og:title mặc định = cấu hình OG");
  ok(metaOf(headOf(prem), "property", "og:description") === V.ogDesc, "og:description mặc định = cấu hình OG");

  /* ---- 5. Danh mục có meta riêng (đặt qua DB — form admin đã có trường, action đã nối) ---- */
  await prisma.premiumCategory.update({ where: { id: cat.id }, data: { metaTitle: V.catTitle, metaDescription: V.catDesc } });
  const catPage = await fetchHtml(`/premium?cat=${cat.id}`);
  ok(titleOf(catPage) === `${V.catTitle} | Hậu Tố 121`, `/premium?cat title = meta danh mục + mẫu hậu tố ("${titleOf(catPage)}")`);
  ok(metaOf(headOf(catPage), "name", "description") === V.catDesc, "/premium?cat dùng mô tả danh mục riêng");

  /* ---- 6. Sản phẩm có meta riêng (cơ chế cũ) + template áp cho trang con + og:image ---- */
  await prisma.premiumProduct.update({ where: { id: prod.id }, data: { metaTitle: V.prodTitle } });
  const prodPage = await fetchHtml(`/premium/${prod.slug}`);
  ok(titleOf(prodPage) === `${V.prodTitle} | Hậu Tố 121`, `chi tiết sản phẩm dùng metaTitle riêng + hậu tố ("${titleOf(prodPage)}")`);
  ok((metaOf(headOf(prodPage), "property", "og:title") || "").includes(V.prodTitle), "og:title sản phẩm = metaTitle riêng");
  ok(metaOf(headOf(prodPage), "property", "og:image") !== null, "og:image sản phẩm có mặt (ảnh sản phẩm đầu tiên)");

  /* ---- 7. Tắt lập chỉ mục qua UI -> robots.txt + meta robots ---- */
  await navigate(`${BASE}/admin/cau-hinh`, 3000);
  await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'SEO'); b && b.click(); return true; })()`);
  await sleep(500);
  await setField("seo_indexing", "0");
  await evaluate(`(() => { document.querySelector('button[form="settings-form"]').click(); return true; })()`);
  await sleep(4000);
  const robotsOff = await (await fetch(BASE + "/robots.txt")).text();
  ok(/Disallow:\s*\/\s*$/m.test(robotsOff) && !robotsOff.includes("Sitemap:"), `robots.txt khi tắt lập chỉ mục: Disallow / toàn bộ, không kèm sitemap`);
  home = await fetchHtml("/");
  ok((metaOf(headOf(home), "name", "robots") || "").includes("noindex"), "meta robots noindex xuất hiện khi tắt lập chỉ mục");
  // Bật lại qua UI
  await navigate(`${BASE}/admin/cau-hinh`, 3000);
  await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'SEO'); b && b.click(); return true; })()`);
  await sleep(500);
  await setField("seo_indexing", "1");
  await evaluate(`(() => { document.querySelector('button[form="settings-form"]').click(); return true; })()`);
  await sleep(4000);
  const robotsOn = await (await fetch(BASE + "/robots.txt")).text();
  ok(robotsOn.includes("Sitemap:") && robotsOn.includes("/sitemap.xml"), "robots.txt khi bật lại: có Sitemap theo cấu hình");
  ok(robotsOn.includes("Disallow: /admin"), "robots.txt chuẩn vẫn chặn /admin");
  const sm = await (await fetch(BASE + "/sitemap.xml")).text();
  ok(sm.includes("<urlset") && sm.includes("/premium"), "sitemap.xml sinh bình thường theo cấu hình");

  /* ---- 8. Ảnh view-source trang chủ ---- */
  await navigate(`view-source:${BASE}/`, 3500);
  await shot("2026-11-13-seo-trang-chu-view-source");

  /* ---- 9. Mobile: ngăn kéo không còn X, chạm backdrop là đóng ---- */
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await navigate(BASE + "/", 3000);
  const opened = await evaluate(`(() => { const b = document.querySelector('button[aria-label="Mở menu"]'); if (!b) return false; b.click(); return true; })()`);
  ok(opened, "mobile: bấm được nút mở menu");
  await sleep(1200);
  const drawerState = await evaluate(`(() => {
    const closeBtn = document.querySelector('button[aria-label="Đóng menu"]');
    const drawer = [...document.querySelectorAll('div')].find((d) => d.className.includes('z-[80]'));
    return { hasCloseX: !!closeBtn, drawerOpen: !!drawer };
  })()`);
  ok(drawerState.drawerOpen, "mobile: ngăn kéo đã mở");
  ok(!drawerState.hasCloseX, "mobile: ngăn kéo KHÔNG còn nút X đóng");
  await shot("2026-11-13-drawer-mobile-khong-x");
  // Chạm backdrop (điểm x=350 nằm ngoài ngăn kéo 280px... ở khổ 390 ngăn kéo max 85vw=331px; chạm x=370)
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 372, y: 420, id: 1 }] });
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(1000);
  const afterTap = await evaluate(`!!([...document.querySelectorAll('div')].find((d) => d.className.includes('z-[80]')))`);
  ok(!afterTap, "mobile: chạm ra ngoài (backdrop) -> ngăn kéo đóng");

  /* ---- DỌN DẸP: trả mọi giá trị đã đặt về mặc định ---- */
  await prisma.setting.deleteMany({ where: { key: { in: ["seo_default_title", "seo_title_template", "og_title", "og_description", "seo_home_title", "seo_home_description", "meta_description", "meta_keywords", "twitter_card", "seo_indexing"] } } });
  await prisma.premiumCategory.update({ where: { id: cat.id }, data: prevCatMeta });
  await prisma.premiumProduct.update({ where: { id: prod.id }, data: prevProdMeta });
  if (prev2fa === undefined) await prisma.setting.deleteMany({ where: { key: "admin_2fa_required" } });
  else await prisma.setting.update({ where: { key: "admin_2fa_required" }, data: { value: prev2fa } });
  console.log("CLEANUP xong — settings SEO thử nghiệm đã xoá, meta danh mục/sản phẩm đã trả lại");

  chrome.kill();
  await prisma.$disconnect();
  console.log(failures === 0 ? "ALL PASS" : `${failures} FAIL`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error("ERR", e); try { chrome.kill(); } catch {} await prisma.$disconnect().catch(() => {}); process.exit(2); });
