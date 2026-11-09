/* Kiểm chứng đợt WATERMARK + UPLOAD (2026-11-08):
   - Admin tải ảnh qua FORM BANNER (pipeline, có dấu) -> banner hiện ở hero
     trang chủ với dấu mờ nhìn thấy được.
   - Admin tải ảnh qua editor SẢN PHẨM (ImagesField) -> trang sản phẩm công
     khai hiện bản đã đóng dấu; chuột phải trên ảnh bị chặn (contextmenu
     defaultPrevented), draggable=false.
   - Admin tải LOGO ở Cấu hình (stamp=0) -> MediaAsset.stamped = NULL.
   - API: /media/<id> trả bản stamped (jpeg); ?o=1 không đăng nhập -> 403.
   Dọn fixture + khôi phục admin_2fa_required/logo_url sau khi chạy. */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const BASE = "http://127.0.0.1:3000";
const SHOT = "/home/hatch/workspace/smm-anh";
const SAMPLE = "/home/hatch/workspace/smmv2/public/home-strip/game-key.jpg";
const SAMPLE2 = "/home/hatch/workspace/smmv2/public/home-strip/steam-gift.jpg";
const envRaw = readFileSync("/home/hatch/workspace/smmv2/.env", "utf8");
let secret = envRaw.split("\n").find((l) => l.startsWith("AUTH_SECRET")).split("=").slice(1).join("=").trim();
if ((secret.startsWith('"') && secret.endsWith('"')) || (secret.startsWith("'") && secret.endsWith("'"))) secret = secret.slice(1, -1);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const mint = (claims) => { const u = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sv: 0, iat: now, exp: now + 3600, ...claims })}`; return `${u}.${createHmac("sha256", secret).update(u).digest("base64url")}`; };
const adminToken = mint({ uid: 1, role: "ADMIN", username: "admin" });
const demoToken = mint({ uid: 2, role: "USER", username: "demo" });

const prisma = new PrismaClient();
let fails = 0;
const ok = (cond, label) => { console.log((cond ? "PASS  " : "FAIL  ") + label); if (!cond) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let prev2fa = null;
let prevLogo = null;
let productId = null;
let bannerId = null;
const mediaIds = [];

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome",
  ["--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars", "--remote-debugging-port=9375", "--window-size=1440,1100",
   "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests", "about:blank"], { stdio: "ignore" });

async function wsUrl() { for (let i = 0; i < 50; i++) { try { const r = await fetch("http://127.0.0.1:9375/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch {} await sleep(200); } throw new Error("no cdp"); }
let msgId = 0; const pending = new Map(); let ws; let sessionId = null;
function send(method, params = {}) { const id = ++msgId; return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }); }
async function evaluate(expr) { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; }
async function evaluateRef(expr) { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: false }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result?.objectId; }
async function navigate(url, wait = 2600) { await send("Page.navigate", { url }); await sleep(wait); }
async function shot(name, clip) { const p = { format: "png", ...(clip ? { clip: { ...clip, scale: 1 }, captureBeyondViewport: false } : {}) }; const r = await send("Page.captureScreenshot", p); const { writeFileSync } = await import("node:fs"); writeFileSync(`${SHOT}/${name}`, Buffer.from(r.data, "base64")); console.log("shot:", name); }
async function setFiles(expr, path) {
  const tagged = await evaluate(`(() => { const el = (${expr}); if (el) el.setAttribute('data-wm-target', '1'); return !!el; })()`);
  if (!tagged) throw new Error("setFiles: không tìm thấy ô file cho: " + expr.slice(0, 60));
  const { root } = await send("DOM.getDocument", { depth: 1 });
  const { nodeId } = await send("DOM.querySelector", { nodeId: root.nodeId, selector: 'input[data-wm-target="1"]' });
  if (!nodeId) throw new Error("setFiles: DOM.querySelector không thấy node đã đánh dấu");
  await send("DOM.setFileInputFiles", { nodeId, files: [path] });
  await evaluate(`document.querySelector('[data-wm-target]')?.removeAttribute('data-wm-target'); 'ok'`);
}
async function waitFor(expr, timeout = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if (await evaluate(expr)) return true; await sleep(400); }
  return false;
}

try {
  prev2fa = (await prisma.setting.findUnique({ where: { key: "admin_2fa_required" } }))?.value ?? null;
  prevLogo = (await prisma.setting.findUnique({ where: { key: "logo_url" } }))?.value ?? null;
  await prisma.setting.upsert({ where: { key: "admin_2fa_required" }, update: { value: "0" }, create: { key: "admin_2fa_required", value: "0" } });

  // Fixture product (ảnh sẽ nạp qua UI)
  const cat = await prisma.premiumCategory.findFirst({ orderBy: { id: "asc" } });
  const prod = await prisma.premiumProduct.create({
    data: { name: "WM Test Product", slug: "wm-test", categoryId: cat.id, fulfillment: "MANUAL", active: true, tagline: "Sản phẩm kiểm chứng watermark", variants: { create: [{ name: "Gói test", price: 99000, active: true }] } },
  });
  productId = prod.id;

  ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } };
  const targets = await (await fetch("http://127.0.0.1:9375/json/list")).json();
  const page = targets.find((x) => x.type === "page");
  const att = await send("Target.attachToTarget", { targetId: page.id, flatten: true }).catch(() => null);
  if (att?.sessionId) sessionId = att.sessionId;
  await send("Page.enable"); await send("DOM.enable"); await send("Runtime.enable");
  await navigate(BASE + "/");
  await evaluate(`document.cookie = 'smmv2_session=${adminToken}; path=/'; document.cookie = 'smmv2-lang=vi; path=/'; try { localStorage.setItem('smmv2-lang', 'vi'); } catch(e) {} 'set'`);

  /* ---- 1) BANNER: tải ảnh qua form admin banner ---- */
  await navigate(BASE + "/admin/banner", 3000);
  ok(await evaluate(`location.pathname`) === "/admin/banner", "mở được trang admin banner");
  await setFiles(`document.querySelector('input[data-upload-input]')`, SAMPLE);
  const bannerImgOk = await waitFor(`(document.querySelector('input[name="image"]')?.value || '').includes('/media/')`);
  ok(bannerImgOk, "form banner: tải ảnh xong -> giá trị /media/<id>");
  const bannerMediaUrl = await evaluate(`document.querySelector('input[name="image"]').value`);
  if (bannerMediaUrl) mediaIds.push(Number(bannerMediaUrl.split("/").pop()));
  await shot("2026-11-08-wm-admin.png");
  await evaluate(`(() => { const form = document.querySelector('input[name="image"]')?.closest('form'); const btn = form?.querySelector('button[type="submit"]') || [...(form?.querySelectorAll('button') || [])].pop(); btn?.click(); return !!btn; })()`);
  for (let i = 0; i < 12; i++) { const b = await prisma.homeBanner.findFirst({ orderBy: { id: "desc" } }); if (b?.image.includes("/media/")) break; await sleep(800); }
  const banner = await prisma.homeBanner.findFirst({ orderBy: { id: "desc" } });
  bannerId = banner?.id ?? null;
  ok(!!banner && banner.image.includes("/media/"), "banner đã lưu với ảnh /media/<id>");
  const bAsset = banner ? await prisma.mediaAsset.findUnique({ where: { id: Number(banner.image.split("/").pop()) } }) : null;
  ok(!!bAsset?.stamped, "MediaAsset của banner CÓ bản stamped");

  /* ---- 2) SẢN PHẨM: tải ảnh qua ImagesField trong editor ---- */
  await navigate(BASE + "/admin/premium", 3200);
  const opened = await evaluate(`(() => {
    const hosts = [...document.querySelectorAll('body *')]
      .filter((el) => el.children.length && (el.textContent || '').includes('WM Test Product') && el.querySelector('button'))
      .sort((a, b) => a.innerHTML.length - b.innerHTML.length);
    const host = hosts[0];
    if (!host) return 'no-host';
    const btns = [...host.querySelectorAll('button')];
    const edit = btns.find((b) => (b.innerHTML || '').includes('M17 3a2.8')) || btns.find((b) => b.querySelector('svg'));
    edit?.click();
    return edit ? 'clicked:' + hosts.length : 'no-btn';
  })()`);
  console.log("product editor open:", opened);
  await sleep(1800);
  const hasUpload = await waitFor(`!!document.querySelector('[data-upload-input]')`, 8000);
  ok(hasUpload, "editor sản phẩm có ô tải ảnh (ImagesField)");
  if (hasUpload) {
    await setFiles(`document.querySelector('[data-upload-input]')`, SAMPLE2);
    const prodImgOk = await waitFor(`[...document.querySelectorAll('input[name="images"]')].some((i) => i.value.includes('/media/'))`);
    ok(prodImgOk, "ImagesField: tải ảnh xong -> /media/<id> trong danh sách ảnh");
    if (prodImgOk) {
      const u = await evaluate(`[...document.querySelectorAll('input[name="images"]')].find((i) => i.value.includes('/media/')).value`);
      mediaIds.push(Number(u.split("/").pop()));
      await evaluate(`[...document.querySelectorAll('button')].filter((b) => /lưu/i.test(b.textContent || '')).pop()?.click()`);
      await sleep(3000);
      const saved = await prisma.premiumProduct.findUnique({ where: { id: productId } });
      ok((saved?.imageUrl || "").includes("/media/") || (saved?.images || "").includes("/media/"), "sản phẩm đã lưu ảnh /media/<id>");
    }
  }

  /* ---- 3) LOGO ở Cấu hình: tải với stamp=0 ---- */
  await navigate(BASE + "/admin/cau-hinh", 3200);
  await evaluate(`[...document.querySelectorAll('button, a')].find((b) => (b.textContent || '').trim() === 'Chung')?.click(); 'tab'`);
  await sleep(1200);
  const logoInput = await waitFor(`!!document.querySelector('input[name="logo_url"]')`, 8000);
  ok(logoInput, "Cấu hình: ô Logo đã thành ô tải ảnh");
  if (logoInput) {
    await setFiles(`(() => { const h = document.querySelector('input[name="logo_url"]'); return h ? h.parentElement.querySelector('input[data-upload-input]') : null; })()`, SAMPLE);
    const logoOk = await waitFor(`(document.querySelector('input[name="logo_url"]')?.value || '').includes('/media/') || [...document.querySelectorAll('input')].some((i) => (i.value || '').includes('/media/'))`);
    console.log("logo upload reflected:", logoOk);
    const logoVal = await evaluate(`(() => { const all = [...document.querySelectorAll('input')]; const v = all.map((i) => i.value).find((x) => x && x.includes('/media/')); return v || ''; })()`);
    if (logoVal) {
      const lid = Number(logoVal.split("/").pop());
      mediaIds.push(lid);
      const lAsset = await prisma.mediaAsset.findUnique({ where: { id: lid } });
      ok(lAsset && !lAsset.stamped, "MediaAsset của LOGO: stamped = NULL (không đóng dấu)");
    }
  }

  /* ---- 4) CÔNG KHAI: hero chạy banner đã dấu + trang sản phẩm ---- */
  await evaluate(`document.cookie = 'smmv2_session=${demoToken}; path=/'; 'set'`);
  await navigate(BASE + "/", 3400);
  const heroMedia = await evaluate(`(() => { const hero = document.querySelector('section.relative.w-full.overflow-hidden'); const img = hero?.querySelector('img'); return img ? img.getAttribute('src') : ''; })()`);
  ok((heroMedia || "").includes("/media/"), `hero trang chủ dùng ảnh banner /media (thấy: ${heroMedia})`);
  const heroBox = await evaluate(`(() => { const hero = document.querySelector('section.relative.w-full.overflow-hidden'); const r = hero.getBoundingClientRect(); return { x: 0, y: Math.max(0, Math.round(r.top + window.scrollY)), width: 1440, height: Math.round(r.height) + 8 }; })()`);
  await shot("2026-11-08-wm-public.png", heroBox);

  await navigate(BASE + "/premium/wm-test", 3400);
  const pub = await evaluate(`(() => {
    const img = document.querySelector('img[src*="/media/"]');
    if (!img) return { found: false };
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    const notPrevented = img.dispatchEvent(ev);
    return { found: true, src: img.getAttribute('src'), draggable: img.draggable, contextMenuAllowed: notPrevented };
  })()`);
  ok(pub.found, "trang sản phẩm công khai hiện ảnh /media");
  ok(pub.found && pub.contextMenuAllowed === false, "chuột phải trên ảnh sản phẩm: contextmenu BỊ CHẶN");
  ok(pub.found && pub.draggable === false, "ảnh sản phẩm: draggable=false");
  await shot("2026-11-08-wm-product.png");

  /* ---- 5) API media: bản gốc khoá sau đăng nhập admin ---- */
  if (bAsset) {
    const pubRes = await fetch(`${BASE}/media/${bAsset.id}`);
    const pubType = pubRes.headers.get("content-type") || "";
    ok(pubRes.status === 200 && pubType.includes("jpeg"), `/media/${bAsset.id} công khai -> bản stamped JPEG`);
    const oRes = await fetch(`${BASE}/media/${bAsset.id}?o=1`);
    ok(oRes.status === 403, `?o=1 không đăng nhập admin -> 403 (bản gốc được bảo vệ)`);
  }
} catch (e) {
  console.error("ERR", e);
  fails++;
} finally {
  try {
    if (bannerId) await prisma.homeBanner.delete({ where: { id: bannerId } }).catch(() => {});
    if (productId) {
      await prisma.premiumVariant.deleteMany({ where: { productId } }).catch(() => {});
      await prisma.premiumProduct.delete({ where: { id: productId } }).catch(() => {});
    }
    if (mediaIds.length) await prisma.mediaAsset.deleteMany({ where: { id: { in: mediaIds } } }).catch(() => {});
    if (prevLogo !== null) await prisma.setting.upsert({ where: { key: "logo_url" }, update: { value: prevLogo }, create: { key: "logo_url", value: prevLogo } });
    if (prev2fa !== null) await prisma.setting.update({ where: { key: "admin_2fa_required" }, data: { value: prev2fa } }).catch(() => {});
    console.log("đã dọn fixture watermark + khôi phục cài đặt");
  } catch {}
  chrome.kill();
  await prisma.$disconnect();
  console.log(fails === 0 ? "ALL PASS" : `${fails} FAIL`);
  process.exit(fails === 0 ? 0 : 1);
}
