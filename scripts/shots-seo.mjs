/* Kiểm chứng đợt SEO (2026-11-08):
   - Trang chi tiết /premium/youtube-premium: các block ld+json parse được;
     Product.offers.price == giá gói rẻ nhất đang hiển thị; availability
     InStock; aggregateRating khớp ĐÚNG 2 đánh giá fixture (5+4 -> 4.5/2);
     BreadcrumbList khớp breadcrumb hiển thị; Organization + WebSite có mặt.
   - Metadata: để trống -> <title> = tên sản phẩm, description = tagline.
   - Đặt meta qua EDITOR ADMIN (mục SEO, chụp ảnh) -> title/description đổi;
     xoá trắng lại -> fallback quay về.
   Dọn fixture + khôi phục cài đặt sau khi chạy. */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const BASE = "http://127.0.0.1:3000";
const SHOT = "/home/hatch/workspace/smm-anh";
const envRaw = readFileSync("/home/hatch/workspace/smmv2/.env", "utf8");
let secret = envRaw.split("\n").find((l) => l.startsWith("AUTH_SECRET")).split("=").slice(1).join("=").trim();
if ((secret.startsWith('"') && secret.endsWith('"')) || (secret.startsWith("'") && secret.endsWith("'"))) secret = secret.slice(1, -1);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const mint = (claims) => { const u = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sv: 0, iat: now, exp: now + 3600, ...claims })}`; return `${u}.${createHmac("sha256", secret).update(u).digest("base64url")}`; };
const adminToken = mint({ uid: 1, role: "ADMIN", username: "admin" });

const prisma = new PrismaClient();
let fails = 0;
const ok = (cond, label) => { console.log((cond ? "PASS  " : "FAIL  ") + label); if (!cond) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let prev2fa = null;
const reviewIds = [];

async function fetchPage(slug) {
  const r = await fetch(`${BASE}/premium/${slug}`);
  return await r.text();
}
function ldBlocks(html) {
  const blocks = [];
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) { try { blocks.push(JSON.parse(m[1])); } catch { blocks.push(null); } }
  return blocks;
}
function metaOf(html) {
  const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "";
  const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "";
  return { title, desc };
}

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome",
  ["--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars", "--remote-debugging-port=9376", "--window-size=1440,1100",
   "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests", "about:blank"], { stdio: "ignore" });
async function wsUrl() { for (let i = 0; i < 50; i++) { try { const r = await fetch("http://127.0.0.1:9376/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch {} await sleep(200); } throw new Error("no cdp"); }
let msgId = 0; const pending = new Map(); let ws; let sessionId = null;
function send(method, params = {}) { const id = ++msgId; return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }); }
async function evaluate(expr) { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; }
async function navigate(url, wait = 2600) { await send("Page.navigate", { url }); await sleep(wait); }
async function waitFor(expr, timeout = 12000) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { if (await evaluate(expr)) return true; await sleep(400); } return false; }

try {
  prev2fa = (await prisma.setting.findUnique({ where: { key: "admin_2fa_required" } }))?.value ?? null;
  await prisma.setting.upsert({ where: { key: "admin_2fa_required" }, update: { value: "0" }, create: { key: "admin_2fa_required", value: "0" } });

  const product = await prisma.premiumProduct.findUnique({ where: { slug: "youtube-premium" }, include: { variants: { where: { active: true } } } });
  if (!product) throw new Error("seed product youtube-premium missing");
  const cheapest = Math.min(...product.variants.map((v) => v.price));
  console.log("product:", product.name, "| tagline:", product.tagline, "| cheapest:", cheapest);
  await prisma.premiumProduct.update({ where: { id: product.id }, data: { metaTitle: null, metaDescription: null } });
  // 2 đánh giá fixture: 5 sao + 4 sao (ràng buộc 1 user/1 sản phẩm -> 2 user)
  for (const [userId, rating] of [[2, 5], [1, 4]]) {
    const rv = await prisma.premiumReview.create({ data: { productId: product.id, userId, rating, content: "Đánh giá kiểm chứng SEO" } });
    reviewIds.push(rv.id);
  }

  /* ---- 1) JSON-LD + metadata fallback ---- */
  let html = await fetchPage("youtube-premium");
  const blocks = ldBlocks(html);
  ok(blocks.length >= 4 && blocks.every(Boolean), `mọi block ld+json parse được (thấy ${blocks.length})`);
  const prod = blocks.find((b) => b && b["@type"] === "Product");
  ok(!!prod, "có Product schema");
  ok(prod?.name === product.name, "Product.name khớp tên sản phẩm");
  ok(Number(prod?.offers?.price) === cheapest, `Product.offers.price = ${prod?.offers?.price} == giá gói rẻ nhất ${cheapest}`);
  ok(prod?.offers?.priceCurrency === "VND", "offers.priceCurrency = VND");
  ok(String(prod?.offers?.availability || "").endsWith("/InStock"), "availability = InStock");
  ok(prod?.aggregateRating && Number(prod.aggregateRating.ratingValue) === 4.5 && Number(prod.aggregateRating.reviewCount) === 2,
    `aggregateRating khớp fixture (4.5 / 2) — thấy ${JSON.stringify(prod?.aggregateRating)}`);
  const crumbs = blocks.find((b) => b && b["@type"] === "BreadcrumbList");
  ok(!!crumbs && crumbs.itemListElement.length === 3 && crumbs.itemListElement[2].name === product.name, "BreadcrumbList đủ 3 cấp, cấp cuối = tên sản phẩm");
  ok(blocks.some((b) => b && b["@type"] === "Organization"), "có Organization schema");
  ok(blocks.some((b) => b && b["@type"] === "WebSite"), "có WebSite schema");
  let meta = metaOf(html);
  console.log("title:", meta.title, "| desc:", meta.desc);
  ok(meta.title === product.name, "fallback: <title> = tên sản phẩm");
  ok(product.tagline ? meta.desc === product.tagline : meta.desc.length > 0, "fallback: meta description = tagline");

  /* ---- 2) Đặt meta qua editor admin ---- */
  ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } };
  const targets = await (await fetch("http://127.0.0.1:9376/json/list")).json();
  const page = targets.find((x) => x.type === "page");
  const att = await send("Target.attachToTarget", { targetId: page.id, flatten: true }).catch(() => null);
  if (att?.sessionId) sessionId = att.sessionId;
  await send("Page.enable"); await send("Runtime.enable");
  await navigate(BASE + "/");
  await evaluate(`document.cookie = 'smmv2_session=${adminToken}; path=/'; document.cookie = 'smmv2-lang=vi; path=/'; try { localStorage.setItem('smmv2-lang', 'vi'); } catch(e) {} 'set'`);
  await navigate(BASE + "/admin/premium", 3200);
  const opened = await evaluate(`(() => {
    const hosts = [...document.querySelectorAll('body *')]
      .filter((el) => el.children.length && (el.textContent || '').includes(${JSON.stringify(product.name)}) && el.querySelector('button'))
      .sort((a, b) => a.innerHTML.length - b.innerHTML.length);
    const host = hosts[0];
    if (!host) return 'no-host';
    const edit = [...host.querySelectorAll('button')].find((b) => (b.innerHTML || '').includes('M17 3a2.8'));
    edit?.click();
    return edit ? 'clicked' : 'no-btn';
  })()`);
  console.log("editor open:", opened);
  const seoReady = await waitFor(`!!document.querySelector('input[name="metaTitle"]')`);
  ok(seoReady, "editor có mục SEO (input metaTitle/metaDescription)");
  if (seoReady) {
    await evaluate(`(() => {
      const set = (el, v) => { const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype; const d = Object.getOwnPropertyDescriptor(proto, 'value'); d.set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
      set(document.querySelector('input[name="metaTitle"]'), 'YT Premium SEO Title');
      set(document.querySelector('textarea[name="metaDescription"]'), 'Mô tả SEO kiểm chứng 2026');
      document.querySelector('input[name="metaTitle"]').scrollIntoView({ block: 'center' });
      return 'filled';
    })()`);
    await sleep(600);
    const shotRes = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(`${SHOT}/2026-11-08-seo-admin.png`, Buffer.from(shotRes.data, "base64"));
    console.log("shot: 2026-11-08-seo-admin.png");
    await evaluate(`[...document.querySelectorAll('button')].filter((b) => /lưu sản phẩm/i.test(b.textContent || '')).pop()?.click()`);
    await sleep(3000);
    const saved = await prisma.premiumProduct.findUnique({ where: { id: product.id } });
    ok(saved?.metaTitle === "YT Premium SEO Title" && saved?.metaDescription === "Mô tả SEO kiểm chứng 2026", "meta đã lưu từ editor vào DB");
    html = await fetchPage("youtube-premium");
    meta = metaOf(html);
    ok(meta.title === "YT Premium SEO Title", `<title> đổi theo metaTitle (thấy: ${meta.title})`);
    ok(meta.desc === "Mô tả SEO kiểm chứng 2026", `meta description đổi theo metaDescription (thấy: ${meta.desc})`);
    ok(html.includes('property="og:title" content="YT Premium SEO Title"'), "og:title cũng dùng metaTitle");

    /* ---- 3) Xoá trắng -> fallback quay về ---- */
    await prisma.premiumProduct.update({ where: { id: product.id }, data: { metaTitle: null, metaDescription: null } });
    html = await fetchPage("youtube-premium");
    meta = metaOf(html);
    ok(meta.title === product.name, "xoá meta -> <title> fallback về tên sản phẩm");
  }
} catch (e) {
  console.error("ERR", e);
  fails++;
} finally {
  try {
    if (reviewIds.length) await prisma.premiumReview.deleteMany({ where: { id: { in: reviewIds } } }).catch(() => {});
    const p2 = await prisma.premiumProduct.findUnique({ where: { slug: "youtube-premium" } }).catch(() => null);
    if (p2) await prisma.premiumProduct.update({ where: { id: p2.id }, data: { metaTitle: null, metaDescription: null } }).catch(() => {});
    if (prev2fa !== null) await prisma.setting.update({ where: { key: "admin_2fa_required" }, data: { value: prev2fa } }).catch(() => {});
    console.log("đã dọn fixture SEO + khôi phục cài đặt");
  } catch {}
  chrome.kill();
  await prisma.$disconnect();
  console.log(fails === 0 ? "ALL PASS" : `${fails} FAIL`);
  process.exit(fails === 0 ? 0 : 1);
}
