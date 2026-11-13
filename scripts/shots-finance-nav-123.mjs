/** KIỂM CHỨNG ĐỢT 123 — GỘP ƯU ĐÃI + PASS VÀO DROPDOWN "TÀI CHÍNH".
 *  node scripts/shots-finance-nav-123.mjs (cần server production :3000 + DB local đã seed).
 *  Luồng: bật pass_enabled qua DB (khôi phục cuối script) -> đăng nhập demo ->
 *  sidebar desktop: đúng MỘT nhóm Tài chính ở vị trí Ưu đãi cũ, mở ra đủ 4 con;
 *  /dashboard/giao-dich: nhóm tự mở + lá sáng; mobile 390 ở /uu-dai và /pass:
 *  ngăn kéo tự mở nhóm + lá đang xem sáng; tắt Pass -> nhóm mất con Pass,
 *  /pass tự về "/"; ngăn kéo mobile khách đã đăng nhập; ngăn kéo khách chưa
 *  đăng nhập (chỉ Ưu đãi + Pass); EN: nhóm "Finance" + con "Deals". */
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
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-fin123",
  "--remote-debugging-port=9423", "--window-size=1440,1000",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9423/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
async function navigate(url, wait = 2800) { await send("Page.navigate", { url }); await sleep(wait); }
async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name);
}
const setField = (name, val) => evaluate(`(() => { const el = document.querySelector('[name="${name}"]'); if (!el) throw new Error('thiếu field ${name}'); el.focus(); el.value = ${JSON.stringify(val)}; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
async function setLang(code) {
  await navigate(BASE + "/", 1500);
  await evaluate(`(() => { try { localStorage.setItem('smmv2-lang', '${code}'); } catch {} document.cookie = 'smmv2-lang=${code}; path=/'; return true; })()`);
}
async function login(username, password) {
  await send("Network.clearBrowserCookies");
  await setLang("vi");
  await navigate(`${BASE}/login`, 2500);
  await setField("login", username);
  await setField("password", password);
  await evaluate(`(() => { const b = document.querySelector('form button[type="submit"], form button'); if (!b) throw new Error('thiếu nút submit'); b.click(); return true; })()`);
  await sleep(3200);
}
const setViewport = (w, h, mobile) => send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: !!mobile });

/** Cấu trúc một bề mặt nav (sidebar desktop hoặc ngăn kéo): danh sách mục cấp 1
 *  theo thứ tự + thông tin nhóm theo nhãn. rootExpr trả về phần tử gốc. */
const navProbe = (rootExpr) => evaluate(`(() => {
  const root = ${rootExpr};
  if (!root) return null;
  const scroll = root.querySelector(':scope .overflow-y-auto') || root;
  const entries = [];
  for (const el of scroll.children) {
    if (el.tagName === 'A') entries.push({ type: 'link', label: el.innerText.trim(), href: el.getAttribute('href') });
    else {
      const btn = el.querySelector('button');
      if (btn) entries.push({ type: 'group', label: btn.innerText.trim(), btnCls: btn.className, children: [...el.querySelectorAll('a')].map((a) => ({ href: a.getAttribute('href'), label: a.innerText.trim(), cls: a.className })) });
    }
  }
  return entries;
})()`);
const sidebarProbe = () => navProbe(`[...document.querySelectorAll('nav')].find((n) => n.className.includes('lg:flex'))`);
const drawerProbe = () => navProbe(`[...document.querySelectorAll('div')].find((d) => d.className.includes('z-[80]'))`);
async function clickGroup(probeRoot, label) {
  return evaluate(`(() => {
    const root = ${probeRoot};
    if (!root) return false;
    const btn = [...root.querySelectorAll('button')].find((b) => b.innerText.trim() === ${JSON.stringify(label)});
    if (!btn) return false;
    btn.scrollIntoView({ block: 'center' }); btn.click(); return true;
  })()`);
}
const SIDEBAR_ROOT = `[...document.querySelectorAll('nav')].find((n) => n.className.includes('lg:flex'))`;
const DRAWER_ROOT = `[...document.querySelectorAll('div')].find((d) => d.className.includes('z-[80]'))`;
async function openDrawer() {
  // Nút burger có aria-label theo ngôn ngữ UI ("Mở menu" / "Open menu").
  const clicked = await evaluate(`(() => { const b = document.querySelector('button[aria-label="Mở menu"], button[aria-label="Open menu"]'); if (!b) return false; b.click(); return true; })()`);
  await sleep(900);
  return clicked;
}
const setSetting = (key, value) => prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
let prevPassEnabled; let prevPassName;
async function restoreSettings() {
  if (prevPassEnabled === undefined) await prisma.setting.deleteMany({ where: { key: "pass_enabled" } }); else await setSetting("pass_enabled", prevPassEnabled);
  if (prevPassName === undefined) await prisma.setting.deleteMany({ where: { key: "pass_name" } }); else await setSetting("pass_name", prevPassName);
}

async function main() {
  prevPassEnabled = (await prisma.setting.findUnique({ where: { key: "pass_enabled" } }))?.value;
  prevPassName = (await prisma.setting.findUnique({ where: { key: "pass_name" } }))?.value;
  await setSetting("pass_enabled", "1");

  ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } };
  const targets = await (await fetch("http://127.0.0.1:9423/json/list")).json();
  const page = targets.find((t) => t.type === "page");
  sessionId = (await send("Target.attachToTarget", { targetId: page.id, flatten: true })).sessionId;
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");

  /* ---- 1. Desktop: sidebar khu khách ---- */
  await setViewport(1440, 1000, false);
  await login("demo", "Demo@123");
  await navigate(`${BASE}/dashboard/ho-so`, 3000);
  let entries = await sidebarProbe();
  ok(!!entries, "đọc được sidebar desktop");
  const labels = (entries || []).map((e) => e.label);
  ok(labels.filter((x) => x === "Tài chính").length === 1, `sidebar có đúng 1 nhóm "Tài chính" (${JSON.stringify(labels)})`);
  const iFin = labels.indexOf("Tài chính");
  ok(labels[iFin - 1] === "Đơn Premium của tôi" && labels[iFin + 1] === "Steam", "nhóm Tài chính đứng sau 'Đơn Premium của tôi', trước 'Steam' (đúng vị trí Ưu đãi cũ)");
  ok(!labels.includes("Ưu đãi"), "không còn mục phẳng Ưu đãi ở cấp 1");
  ok(await clickGroup(SIDEBAR_ROOT, "Tài chính"), "bấm mở được nhóm Tài chính trên desktop");
  await sleep(500);
  entries = await sidebarProbe();
  const fin = (entries || []).find((e) => e.label === "Tài chính");
  const hrefs = (fin?.children || []).map((c) => c.href);
  ok(JSON.stringify(hrefs) === JSON.stringify(["/uu-dai", "/pass", "/dashboard/giao-dich", "/dashboard/kiem-tien"]), `con của Tài chính (Pass bật) = ${JSON.stringify(hrefs)}`);
  const childLabels = (fin?.children || []).map((c) => c.label);
  ok(childLabels[0] === "Ưu đãi" && childLabels[1] === "Pass" && childLabels[2] === "Lịch sử số dư" && childLabels[3] === "Giới thiệu bạn bè", `nhãn con = ${JSON.stringify(childLabels)}`);
  await shot("2026-11-13-finance-nav-desktop");

  /* ---- 2. Desktop: ở trang con Tài chính -> nhóm tự mở + lá sáng ---- */
  await navigate(`${BASE}/dashboard/giao-dich`, 3000);
  entries = await sidebarProbe();
  const fin2 = (entries || []).find((e) => e.label === "Tài chính");
  ok((fin2?.children || []).length === 4, "ở /dashboard/giao-dich nhóm Tài chính tự mở (không cần bấm)");
  const activeChild = (fin2?.children || []).find((c) => c.href === "/dashboard/giao-dich");
  ok(!!activeChild && activeChild.cls.includes("bg-brand-50"), "lá 'Lịch sử số dư' được tô sáng");
  ok(!!fin2 && fin2.btnCls.includes("font-semibold"), "nút cha Tài chính đậm lên khi chứa trang hiện tại");

  /* ---- 3. Mobile 390: /uu-dai và /pass — ngăn kéo tự mở nhóm, lá sáng ---- */
  await setViewport(390, 844, true);
  await navigate(`${BASE}/uu-dai`, 3000);
  ok(await openDrawer(), "mở được ngăn kéo mobile ở /uu-dai");
  let dEntries = await drawerProbe();
  let dFin = (dEntries || []).find((e) => e.label === "Tài chính");
  ok((dFin?.children || []).length >= 2, "ở /uu-dai ngăn kéo tự mở nhóm Tài chính");
  const uuChild = (dFin?.children || []).find((c) => c.href === "/uu-dai");
  ok(!!uuChild && uuChild.cls.includes("bg-brand-50"), "lá Ưu đãi sáng trong ngăn kéo ở /uu-dai");
  await navigate(`${BASE}/pass`, 3000);
  ok(await openDrawer(), "mở được ngăn kéo mobile ở /pass");
  dEntries = await drawerProbe();
  dFin = (dEntries || []).find((e) => e.label === "Tài chính");
  const passChild = (dFin?.children || []).find((c) => c.href === "/pass");
  ok(!!passChild && passChild.cls.includes("bg-brand-50"), "lá Pass sáng trong ngăn kéo ở /pass (nhóm tự mở)");

  /* ---- 4. Tắt Pass: nhóm mất con Pass, /pass về trang chủ ---- */
  await setSetting("pass_enabled", "0");
  await setViewport(1440, 1000, false);
  await navigate(`${BASE}/dashboard/ho-so`, 3000);
  ok(await clickGroup(SIDEBAR_ROOT, "Tài chính"), "mở nhóm Tài chính khi Pass tắt");
  await sleep(500);
  entries = await sidebarProbe();
  const finOff = (entries || []).find((e) => e.label === "Tài chính");
  const hrefsOff = (finOff?.children || []).map((c) => c.href);
  ok(!hrefsOff.includes("/pass") && hrefsOff.includes("/uu-dai"), `Pass tắt -> nhóm còn Ưu đãi, mất Pass (${JSON.stringify(hrefsOff)})`);
  const rPass = await fetch(`${BASE}/pass`, { redirect: "manual" });
  ok(rPass.status >= 300 && rPass.status < 400 && (rPass.headers.get("location") || "").endsWith("/"), `/pass khi module tắt tự về trang chủ (HTTP ${rPass.status})`);
  await setSetting("pass_enabled", "1");

  /* ---- 5. Mobile 390: ngăn kéo khách đã đăng nhập + ảnh ---- */
  await setViewport(390, 844, true);
  await navigate(`${BASE}/dashboard/ho-so`, 3000);
  ok(await openDrawer(), "mở được ngăn kéo mobile (đã đăng nhập)");
  ok(await clickGroup(DRAWER_ROOT, "Tài chính"), "bấm mở nhóm Tài chính trong ngăn kéo");
  await sleep(500);
  dEntries = await drawerProbe();
  const dLabels = (dEntries || []).map((e) => e.label);
  ok(dLabels.filter((x) => x === "Tài chính").length === 1, "ngăn kéo có đúng 1 nhóm Tài chính");
  const dFin2 = (dEntries || []).find((e) => e.label === "Tài chính");
  ok((dFin2?.children || []).some((c) => c.href === "/uu-dai") && (dFin2?.children || []).some((c) => c.href === "/pass"), "ngăn kéo: Tài chính chứa Ưu đãi + Pass");
  await shot("2026-11-13-finance-nav-mobile");

  /* ---- 6. Khách chưa đăng nhập: ngăn kéo có nhóm Tài chính (Ưu đãi + Pass) ---- */
  await send("Network.clearBrowserCookies");
  await setLang("vi");
  await navigate(`${BASE}/`, 3000);
  ok(await openDrawer(), "mở được ngăn kéo khách chưa đăng nhập");
  ok(await clickGroup(DRAWER_ROOT, "Tài chính"), "khách: bấm mở nhóm Tài chính");
  await sleep(500);
  dEntries = await drawerProbe();
  const gLabels = (dEntries || []).map((e) => e.label);
  ok(gLabels.filter((x) => x === "Tài chính").length === 1, "ngăn kéo khách có đúng 1 nhóm Tài chính");
  const gFin = (dEntries || []).find((e) => e.label === "Tài chính");
  const gHrefs = (gFin?.children || []).map((c) => c.href);
  ok(JSON.stringify(gHrefs) === JSON.stringify(["/uu-dai", "/pass"]), `khách: con Tài chính = ${JSON.stringify(gHrefs)} (không lẫn mục nội bộ)`);
  const gText = (dEntries || []).map((e) => e.label).join(" ");
  ok(!gText.includes("Lịch sử số dư"), "khách: không thấy 'Lịch sử số dư'");

  /* ---- 7. EN: nhãn nhóm/ lá qua từ điển, không lẫn VI ---- */
  await evaluate(`(() => { try { localStorage.setItem('smmv2-lang', 'en'); } catch {} document.cookie = 'smmv2-lang=en; path=/'; return true; })()`);
  await navigate(`${BASE}/`, 3000);
  ok(await openDrawer(), "EN: mở ngăn kéo khách");
  ok(await clickGroup(DRAWER_ROOT, "Finance"), "EN: nhóm hiển thị 'Finance'");
  await sleep(500);
  dEntries = await drawerProbe();
  const eFin = (dEntries || []).find((e) => e.label === "Finance");
  ok((eFin?.children || []).some((c) => c.href === "/uu-dai" && c.label === "Deals"), "EN: lá Ưu đãi hiển thị 'Deals'");
  const eAll = (dEntries || []).map((e) => e.label).join(" ");
  ok((dEntries || []).length > 0 && !eAll.includes("Tài chính") && !eAll.includes("Ưu đãi"), "EN: không lẫn nhãn VI trong menu");

  /* ---- Dọn dẹp: khôi phục settings nguyên trạng ---- */
  await restoreSettings();

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAIL`);
  process.exitCode = failures ? 1 : 0;
}

main()
  .catch((e) => { console.error("ERR", e); process.exitCode = 1; })
  .finally(async () => { try { await restoreSettings(); } catch {} try { chrome.kill(); } catch {} await prisma.$disconnect(); });
