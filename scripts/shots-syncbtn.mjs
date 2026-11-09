/* Kiểm chứng đợt NÚT ĐỒNG BỘ THEO SẢN PHẨM + THÊM HÀNG LOẠT TỪ NGUỒN
   (2026-11-09), qua UI admin thật trên bản production + mock FZR mutable:
   A) Đồng bộ lần đầu (seed, markup 30%) -> gk-1/gk-2/gk-3 có mặt.
   B) Admin đặt tay platform cho gk-1 (override "GOG Galaxy"); NCC đổi gk-1:
      std 59.99->39.99 USD, tồn kho 101->55, region GLOBAL->EU, BỎ edition
      Deluxe. Bấm nút "Đồng bộ từ nguồn" của RIÊNG gk-1 -> gk-1 làm mới
      (giá/tồn kho/region mới, Deluxe bị tắt), platform override GIỮ NGUYÊN,
      gk-2 KHÔNG đổi một byte.
   C) Xoá 3 sản phẩm -> panel "Thêm hàng loạt từ nguồn": chọn cả 3 game với
      % lô = 50 (markup khu đang 30) -> sản phẩm tạo lại với giá ĐÚNG 50%,
      không dấu CUSTOM; mở lại panel -> cả 3 "Đã có", số sản phẩm vẫn 3
      (không trùng).
   Ảnh: 2026-11-09-syncbtn-admin.png, 2026-11-09-syncbtn-result.png,
        2026-11-09-bulkadd-panel.png, 2026-11-09-bulkadd-result.png.
   Dọn fixture + khôi phục admin_2fa_required sau khi chạy. */
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const BASE = "http://127.0.0.1:3000";
const MOCK = "http://127.0.0.1:3999";
const SHOT = "/home/hatch/workspace/smm-anh";
const PID = 999021;
const RATE = 25000;
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
const ceilSell = (usd, pct) => Math.ceil(usd * RATE * (100 + pct) / 100 - 1e-9);

let prev2fa = null;
const mock = spawn("node", ["scripts/mock-fzr-mutable.mjs"], { stdio: "ignore" });

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome",
  ["--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars", "--remote-debugging-port=9377", "--window-size=1440,1100",
   "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests", "about:blank"], { stdio: "ignore" });

async function wsUrl() { for (let i = 0; i < 50; i++) { try { const r = await fetch("http://127.0.0.1:9377/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch {} await sleep(200); } throw new Error("no cdp"); }
let msgId = 0; const pending = new Map(); let ws; let sessionId = null;
function send(method, params = {}) { const id = ++msgId; return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }); }
async function evaluate(expr) { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; }
async function navigate(url, wait = 2800) { await send("Page.navigate", { url }); await sleep(wait); }
async function shot(name) { const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }); const { writeFileSync } = await import("node:fs"); writeFileSync(`${SHOT}/${name}`, Buffer.from(r.data, "base64")); console.log("shot:", name); }
async function waitFor(expr, timeout = 20000) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { if (await evaluate(expr)) return true; await sleep(400); } return false; }

async function cleanup() {
  try {
    const vIds = (await prisma.premiumVariant.findMany({ where: { providerId: PID }, select: { id: true } })).map((v) => v.id);
    if (vIds.length) {
      await prisma.premiumOrder.deleteMany({ where: { variantId: { in: vIds } } });
      await prisma.premiumVariant.deleteMany({ where: { id: { in: vIds } } });
    }
    await prisma.premiumProduct.deleteMany({ where: { providerId: PID } });
    await prisma.premiumCategory.deleteMany({ where: { slug: { endsWith: `-${PID}` }, products: { none: {} } } });
    await prisma.provider.deleteMany({ where: { id: PID } });
    if (prev2fa === null) await prisma.setting.deleteMany({ where: { key: "admin_2fa_required" } });
    else await prisma.setting.upsert({ where: { key: "admin_2fa_required" }, update: { value: prev2fa }, create: { key: "admin_2fa_required", value: prev2fa } });
  } catch (e) { console.error("cleanup lỗi:", e); }
}

try {
  for (let i = 0; i < 40; i++) { try { const r = await fetch(`${MOCK}/__log`); if (r.ok) break; } catch {} await sleep(250); }
  prev2fa = (await prisma.setting.findUnique({ where: { key: "admin_2fa_required" } }))?.value ?? null;
  await prisma.setting.upsert({ where: { key: "admin_2fa_required" }, update: { value: "0" }, create: { key: "admin_2fa_required", value: "0" } });

  /* ---- A) Seed: provider + đồng bộ lần đầu qua lib (tsx helper) ---- */
  const seed = spawnSync("npx", ["tsx", "scripts/syncbtn-seed.ts"], { cwd: "/home/hatch/workspace/smmv2", encoding: "utf8", env: { ...process.env } });
  console.log(seed.stdout.trim().split("\n").slice(-2).join("\n"));
  if (seed.status !== 0) { console.error(seed.stderr); throw new Error("seed failed"); }
  const prodLine = seed.stdout.split("\n").find((l) => l.startsWith("PRODUCTS:"));
  const products = JSON.parse(prodLine.replace("PRODUCTS:", ""));
  const gk1 = products.find((p) => p.providerProductId === "gk-1");
  const gk2 = products.find((p) => p.providerProductId === "gk-2");
  ok(!!gk1 && !!gk2 && products.length === 3, `seed: 3 game có mặt (gk-1 id=${gk1?.id}, gk-2 id=${gk2?.id})`);
  const std1 = await prisma.premiumVariant.findFirst({ where: { providerId: PID, providerItemId: "gk-1-std" } });
  ok(std1?.price === ceilSell(59.99, 30), `giá gk-1-std ban đầu theo markup 30%: ${std1?.price} (kỳ vọng ${ceilSell(59.99, 30)})`);

  /* ---- B) Override + NCC đổi dữ liệu + bấm nút đồng bộ riêng gk-1 ---- */
  await prisma.premiumProduct.update({ where: { id: gk1.id }, data: { providerPlatform: "GOG Galaxy", providerOverride: JSON.stringify(["platform"]) } });
  const snap2 = JSON.stringify(await prisma.premiumVariant.findMany({ where: { productId: gk2.id }, orderBy: { id: "asc" }, select: { id: true, name: true, price: true, cost: true, active: true, providerStock: true, providerItemId: true } }));
  await fetch(`${MOCK}/__control`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
    gameId: "gk-1", region: "EU",
    keys: [{ key_id: "gk-1-std", name: "Elden Ring", price_usd: "39.99", stock: 55, min_order_quantity: 1, max_order_quantity: 10 }],
  }) });

  ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } };
  const targets = await (await fetch("http://127.0.0.1:9377/json/list")).json();
  const page = targets.find((x) => x.type === "page");
  const att = await send("Target.attachToTarget", { targetId: page.id, flatten: true }).catch(() => null);
  if (att?.sessionId) sessionId = att.sessionId;
  await send("Page.enable"); await send("DOM.enable"); await send("Runtime.enable");
  await navigate(BASE + "/");
  await evaluate(`document.cookie = 'smmv2_session=${adminToken}; path=/'; document.cookie = 'smmv2-lang=vi; path=/'; try { localStorage.setItem('smmv2-lang', 'vi'); } catch(e) {} 'set'`);
  await navigate(BASE + "/admin/game-key/san-pham", 3500);
  ok(await evaluate(`location.pathname`) === "/admin/game-key/san-pham", "mở được trang admin Game Key");
  const btnCount = await evaluate(`[...document.querySelectorAll('button')].filter(b => b.textContent.includes('Đồng bộ từ nguồn')).length`);
  ok(btnCount >= 3, `mỗi thẻ sản phẩm có nút "Đồng bộ từ nguồn" (${btnCount} nút)`);
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Đồng bộ từ nguồn'))?.scrollIntoView({ block: 'center' }); 'ok'`);
  await sleep(500);
  await shot("2026-11-09-syncbtn-admin.png");

  const clicked = await evaluate(`(() => {
    const forms = [...document.querySelectorAll('form')];
    const f = forms.find(f => f.querySelector('input[name="productId"]')?.value === '${gk1.id}' && [...f.querySelectorAll('button')].some(b => b.textContent.includes('Đồng bộ từ nguồn')));
    const btn = f && [...f.querySelectorAll('button')].find(b => b.textContent.includes('Đồng bộ từ nguồn'));
    if (btn) { btn.click(); return true; } return false;
  })()`);
  ok(clicked, "bấm được nút Đồng bộ từ nguồn của gk-1");
  const flashOk = await waitFor(`document.body.innerText.includes('Đã đồng bộ') && document.body.innerText.includes('Elden Ring')`);
  ok(flashOk, "thông báo flash: Đã đồng bộ \"Elden Ring\" từ nguồn");
  await evaluate(`window.scrollTo(0, 0); 'ok'`);
  await sleep(600);
  await shot("2026-11-09-syncbtn-result.png");

  const stdAfter = await prisma.premiumVariant.findFirst({ where: { providerId: PID, providerItemId: "gk-1-std" } });
  ok(stdAfter?.price === ceilSell(39.99, 30), `gk-1-std giá mới theo NCC 39.99 USD: ${stdAfter?.price} (kỳ vọng ${ceilSell(39.99, 30)})`);
  ok(stdAfter?.providerStock === 55, `gk-1-std tồn kho NCC mới: ${stdAfter?.providerStock} (kỳ vọng 55)`);
  const dlxAfter = await prisma.premiumVariant.findFirst({ where: { providerId: PID, providerItemId: "gk-1-dlx" } });
  ok(dlxAfter?.active === false, "gk-1-dlx (NCC đã bỏ edition) bị tắt");
  const gk1After = await prisma.premiumProduct.findUnique({ where: { id: gk1.id } });
  ok(gk1After?.providerRegion === "EU", `region gk-1 cập nhật theo NCC: ${gk1After?.providerRegion} (kỳ vọng EU)`);
  ok(gk1After?.providerPlatform === "GOG Galaxy", `platform admin đặt tay GIỮ NGUYÊN qua đồng bộ: ${gk1After?.providerPlatform}`);
  const snap2After = JSON.stringify(await prisma.premiumVariant.findMany({ where: { productId: gk2.id }, orderBy: { id: "asc" }, select: { id: true, name: true, price: true, cost: true, active: true, providerStock: true, providerItemId: true } }));
  ok(snap2 === snap2After, "gk-2 KHÔNG đổi một byte sau khi đồng bộ riêng gk-1");

  /* ---- C) Bulk-add: xoá 3 sản phẩm, thêm lại cả lô ở % 50 ---- */
  await fetch(`${MOCK}/__control`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
    gameId: "gk-1", region: "GLOBAL",
    keys: [
      { key_id: "gk-1-std", name: "Elden Ring", price_usd: "59.99", stock: 101, min_order_quantity: 1, max_order_quantity: 10 },
      { key_id: "gk-1-dlx", name: "Elden Ring Deluxe Edition", price_usd: "79.99", stock: 12, min_order_quantity: 1, max_order_quantity: 5 },
    ],
  }) });
  const vIds = (await prisma.premiumVariant.findMany({ where: { providerId: PID }, select: { id: true } })).map((v) => v.id);
  await prisma.premiumVariant.deleteMany({ where: { id: { in: vIds } } });
  await prisma.premiumProduct.deleteMany({ where: { providerId: PID } });
  ok((await prisma.premiumProduct.count({ where: { providerId: PID } })) === 0, "đã xoá 3 sản phẩm để bulk-add lại từ đầu");

  await navigate(BASE + "/admin/game-key/san-pham", 3500);
  const opened = await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Mở panel'); if (b) { b.click(); return true; } return false; })()`);
  ok(opened, "mở được panel Thêm hàng loạt từ nguồn");
  const itemsOk = await waitFor(`[...document.querySelectorAll('label')].filter(l => l.textContent.includes('Mã NCC: gk-')).length >= 3`);
  ok(itemsOk, "panel tải được catalog NCC (3 game, kèm giá nguồn)");
  const setPct = await evaluate(`(() => {
    const panelBtn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Đóng');
    const root = panelBtn?.closest('div[class*="rounded-xl"]');
    const inp = root?.querySelector('input[type="number"]');
    if (!inp) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, '50'); inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true }));
    return inp.value === '50';
  })()`);
  ok(setPct, "đặt % giá bán của lô = 50 (markup khu đang 30)");
  await sleep(400);
  const sellShown = await evaluate(`document.body.innerText.includes('2.249.625đ')`);
  ok(sellShown, "giá bán dự kiến ở hàng gk-1 tính lại NGAY theo 50%: 2.249.625đ");
  const selAll = await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Chọn tất cả trang này')); if (b) { b.click(); return true; } return false; })()`);
  ok(selAll, "chọn tất cả trang này");
  await sleep(400);
  const confirmLabel = await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('mục đã chọn'))?.textContent.trim() || ''`);
  ok(confirmLabel.includes("Thêm 3 mục"), `nút xác nhận đếm đúng 3 mục đã chọn: "${confirmLabel}"`);
  await evaluate(`(() => { const root = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Đóng')?.closest('div[class*="rounded-xl"]'); root?.scrollIntoView({ block: 'start' }); return true; })()`);
  await sleep(500);
  await shot("2026-11-09-bulkadd-panel.png");

  await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('mục đã chọn'))?.click(); 'ok'`);
  const bulkFlash = await waitFor(`document.body.innerText.includes('Thêm hàng loạt xong')`);
  ok(bulkFlash, "flash tổng kết thêm hàng loạt xuất hiện");
  const bulkText = await evaluate(`document.body.innerText.match(/Thêm hàng loạt xong[^\\n]*/)?.[0] || ''`);
  ok(/thêm mới 3/.test(bulkText) && /bỏ qua 0/.test(bulkText) && /lỗi 0/.test(bulkText), `tổng kết đúng: "${bulkText}"`);
  await evaluate(`window.scrollTo(0, 0); 'ok'`);
  await sleep(600);
  await shot("2026-11-09-bulkadd-result.png");

  const bulkProducts = await prisma.premiumProduct.findMany({ where: { providerId: PID }, orderBy: { providerProductId: "asc" } });
  ok(bulkProducts.length === 3, `bulk-add tạo đúng 3 sản phẩm (đếm được ${bulkProducts.length})`);
  const checks = [["gk-1-std", 59.99], ["gk-1-dlx", 79.99], ["gk-2-std", 49.50], ["gk-3-std", 29.99]];
  for (const [itemId, usd] of checks) {
    const v = await prisma.premiumVariant.findFirst({ where: { providerId: PID, providerItemId: itemId } });
    ok(v?.price === ceilSell(usd, 50), `giá ${itemId} ĐÚNG % lô 50: ${v?.price} (kỳ vọng ${ceilSell(usd, 50)})`);
    ok(v?.deliveryType !== "CUSTOM", `${itemId} không mang dấu CUSTOM (deliveryType=${v?.deliveryType})`);
  }

  /* ---- D) Chạy lại bulk: tất cả "Đã có", không tạo trùng ---- */
  await navigate(BASE + "/admin/game-key/san-pham", 3500);
  await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Mở panel'); b?.click(); return true; })()`);
  const againOk = await waitFor(`[...document.querySelectorAll('label')].filter(l => l.textContent.includes('Đã có')).length >= 3`);
  ok(againOk, "mở lại panel: cả 3 game đều 'Đã có', không chọn lại được");
  ok((await prisma.premiumProduct.count({ where: { providerId: PID } })) === 3, "số sản phẩm vẫn 3 — không tạo trùng");

  console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILURES`);
} finally {
  await cleanup();
  mock.kill();
  chrome.kill();
  await prisma.$disconnect();
  if (fails > 0) process.exitCode = 1;
}
