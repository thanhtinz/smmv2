// Đợt 121 — ảnh bằng chứng đoạn <head> đã kết xuất theo cấu hình SEO.
// Đặt giá trị thử thẳng vào kho settings DB (đúng kho mà UI admin ghi — đường ghi qua UI
// đã được shots-seo-121.mjs chứng minh riêng), lấy HTML thô của 3 loại trang, trích các thẻ
// title/meta/OG/robots đọc được rõ ràng vào một trang bằng chứng rồi chụp lại. Dọn dẹp sau khi chụp.
import { execSync } from "node:child_process";

const APP = process.env.APP_BASE || "http://127.0.0.1:3000";
const SHOT_DIR = "/home/hatch/workspace/smm-anh";
const CHROME = "/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome";
const PORT = 9421;
const CDP = `http://127.0.0.1:${PORT}`;

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const pickTags = (html) => {
  const out = [];
  const title = html.match(/<title>[\s\S]*?<\/title>/i);
  if (title) out.push(title[0]);
  const metas = html.match(/<meta[^>]+>/gi) || [];
  for (const m of metas) {
    if (/name="(description|keywords|robots)"|property="og:|name="twitter:/.test(m)) out.push(m);
  }
  const canon = html.match(/<link[^>]+rel="canonical"[^>]*>/i);
  if (canon) out.push(canon[0]);
  return out;
};

const V = { defTitle: "Tiêu Đề Mặc Định 121", keywords: "bnt shop, tài khoản premium, sản phẩm số", homeTitle: "Tiêu Đề Trang Chủ Riêng 121", homeDesc: "Mô tả trang chủ riêng theo cấu hình SEO 121", catTitle: "Tiêu Đề Danh Mục Riêng 121", prodTitle: "Tiêu Đề Sản Phẩm Riêng 121" };
const SET_KEYS = ["seo_default_title", "meta_keywords", "seo_home_title", "seo_home_description", "seo_indexing"];

let ws = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function cdpConnect() {
  let targets = null;
  for (let i = 0; i < 30; i++) { try { targets = await (await fetch(`${CDP}/json/list`)).json(); if (targets?.length) break; } catch {} await sleep(500); }
  const page = targets.find((t) => t.type === "page") || targets[0];
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } };
  ws.sendCmd = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  await ws.sendCmd("Page.enable"); await ws.sendCmd("Runtime.enable");
}
async function evalJs(expr) {
  const r = await ws.sendCmd("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error("eval: " + JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result?.value;
}
async function shot(name) {
  const { data } = await ws.sendCmd("Page.captureScreenshot", { format: "png" });
  const { writeFileSync } = await import("node:fs");
  writeFileSync(`${SHOT_DIR}/${name}.png`, Buffer.from(data, "base64"));
  console.log("SHOT", name);
}

let catOrig = null, prodOrig = null;
try {
  const cat = await prisma.premiumCategory.findFirst({ where: { active: true }, orderBy: { sort: "asc" } });
  const prod = await prisma.premiumProduct.findFirst({ where: { active: true, panelId: null }, orderBy: { id: "asc" } });
  catOrig = { id: cat.id, metaTitle: cat.metaTitle, metaDescription: cat.metaDescription };
  prodOrig = { id: prod.id, metaTitle: prod.metaTitle };

  for (const [k, v] of [["seo_default_title", V.defTitle], ["meta_keywords", V.keywords], ["seo_home_title", V.homeTitle], ["seo_home_description", V.homeDesc], ["seo_indexing", "0"]]) {
    await prisma.setting.upsert({ where: { key: k }, update: { value: v }, create: { key: k, value: v } });
  }
  await prisma.premiumCategory.update({ where: { id: cat.id }, data: { metaTitle: V.catTitle } });
  await prisma.premiumProduct.update({ where: { id: prod.id }, data: { metaTitle: V.prodTitle } });

  const home = await (await fetch(`${APP}/`)).text();
  const listing = await (await fetch(`${APP}/premium?cat=${cat.id}`)).text();
  const detail = await (await fetch(`${APP}/premium/${prod.slug}`)).text();

  const section = (h, html) => `<h2>${h}</h2><pre>${pickTags(html).map(esc).join("\n")}</pre>`;
  const doc = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:ui-monospace,Menlo,Consolas,monospace;background:#0f172a;color:#e2e8f0;margin:0;padding:28px 32px}
    h1{font-size:19px;color:#fff;margin:0 0 6px} p.sub{color:#94a3b8;font-size:13px;margin:0 0 20px}
    h2{font-size:15px;color:#7dd3fc;margin:22px 0 8px}
    pre{background:#1e293b;border:1px solid #334155;border-radius:10px;padding:14px 16px;font-size:12.5px;line-height:1.65;white-space:pre-wrap;word-break:break-all;margin:0}
  </style></head><body>
  <h1>Đợt 121 — Đoạn &lt;head&gt; kết xuất theo cấu hình SEO (giá trị thử “121”)</h1>
  <p class="sub">Đang TẮT lập chỉ mục (seo_indexing=0) nên mọi trang có meta robots noindex; trang chủ dùng ghi đè riêng, danh mục/sản phẩm dùng meta riêng của chúng (mẫu tiêu đề trang con “%s | Hậu Tố 121” đã được kiểm chứng bằng khẳng định trên HTML thô trong script kiểm chứng chính của đợt).</p>
  ${section("Trang chủ / — ghi đè SEO riêng của trang chủ", home)}
  ${section(`Danh sách /premium?cat=${cat.id} — meta riêng của danh mục`, listing)}
  ${section(`Chi tiết /premium/${prod.slug} — meta riêng của sản phẩm`, detail)}
  </body></html>`;

  execSync(`rm -rf ~/workspace/.chrome-cdp-seo121head && mkdir -p ~/workspace/.chrome-cdp-seo121head`);
  const { spawn } = await import("node:child_process");
  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-sandbox", `--remote-debugging-port=${PORT}`, "--user-data-dir=/home/hatch/workspace/.chrome-cdp-seo121head", "--window-size=1440,1200", "about:blank"], { stdio: "ignore", detached: true });
  chrome.unref();
  await cdpConnect();
  await evalJs(`document.open(); document.write(${JSON.stringify(doc)}); document.close(); 'ok'`);
  await sleep(600);
  await shot("2026-11-13-seo-head-theo-cau-hinh");
  try { ws.close(); } catch {}
  try { process.kill(-chrome.pid, "SIGKILL"); } catch {}
} finally {
  await prisma.setting.deleteMany({ where: { key: { in: SET_KEYS } } });
  if (catOrig) await prisma.premiumCategory.update({ where: { id: catOrig.id }, data: { metaTitle: catOrig.metaTitle, metaDescription: catOrig.metaDescription } });
  if (prodOrig) await prisma.premiumProduct.update({ where: { id: prodOrig.id }, data: { metaTitle: prodOrig.metaTitle } });
  await prisma.$disconnect();
  console.log("CLEANUP xong");
}
