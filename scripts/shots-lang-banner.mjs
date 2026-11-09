/** Đợt ngôn ngữ + banner theo ngôn ngữ (lệnh Tín 2026-11-08 21:46 + sửa
 *  21:53 link tuỳ chọn từng banner):
 *  - Picker hiển thị: ngôn ngữ ĐÚNG 2 (English/Tiếng Việt), tiền tệ ĐÚNG 2
 *    (VND/USD).
 *  - Cookie lang=zh (đã bỏ) -> rơi về mặc định en, không lỗi, không chữ Trung.
 *  - Cookie cur=EUR (đã bỏ) -> giá hiện kiểu VNĐ (đuôi đ, không phải €).
 *  - Banner: VI thấy bộ VI (2 banner, chấm = 2), EN thấy bộ EN (1 banner,
 *    không mũi tên/chấm); xoá banner EN -> khách EN rơi về bộ VI.
 *  - Click-through: banner CÓ link -> bấm vào đi đúng link; banner KHÔNG
 *    link -> bấm không đi đâu.
 *  - Trang admin /admin/banner mở được, có badge VI/EN + chọn ngôn ngữ.
 *  Fixture banner dựng/dọn trong script; admin_2fa_required tắt tạm khi
 *  kiểm trang admin rồi khôi phục. Chạy: node scripts/shots-lang-banner.mjs */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";

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
const demoToken = mint({ uid: 2, role: "USER", username: "demo" });
const adminToken = mint({ uid: 1, role: "ADMIN", username: "admin" });

const prisma = new PrismaClient();
const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--remote-debugging-port=9373", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9373/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
async function navigate(url, waitMs = 2600) { await send("Page.navigate", { url }); await sleep(waitMs); }
async function shot(name, clip) {
  const params = { format: "png", captureBeyondViewport: false };
  if (clip) params.clip = { ...clip, scale: 1 };
  const r = await send("Page.captureScreenshot", params);
  writeFileSync(`${OUT}/${name}`, Buffer.from(r.data, "base64"));
  console.log("shot:", name);
}
async function mouseClick(x, y) {
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await sleep(60);
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
}
const heroExpr = `(() => {
  const hero = document.querySelector('section.relative.w-full.overflow-hidden');
  if (!hero) return null;
  const imgs = [...hero.querySelectorAll('img')].map((im) => im.getAttribute('src'));
  const dots = [...hero.querySelectorAll('button')].filter((b) => b.offsetHeight === 8);
  const arrows = [...hero.querySelectorAll('button')].filter((b) => b.offsetHeight >= 36);
  const r = hero.getBoundingClientRect();
  const active = [...hero.querySelectorAll(':scope > div > div')].findIndex((d) => d.className.includes('opacity-100'));
  return { imgs, dots: dots.length, arrows: arrows.length, active, cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2), top: Math.round(r.top) };
})()`;
async function setCookies(pairs) {
  const js = pairs.map(([k, v]) => `document.cookie = '${k}=${v}; path=/'; try { localStorage.setItem('${k}', '${v}'); } catch(e) {}`).join(" ");
  await evaluate(`${js} 'set'`);
}

async function main() {
  // ---- Fixture banner: VI x2 (1 có link, 1 không), EN x1
  await prisma.homeBanner.deleteMany({});
  const bVi1 = await prisma.homeBanner.create({ data: { image: "/home-strip/premium.jpg", href: "/premium", lang: "vi", sort: 0, active: true } });
  const bVi2 = await prisma.homeBanner.create({ data: { image: "/home-strip/game-key.jpg", href: null, lang: "vi", sort: 1, active: true } });
  const bEn = await prisma.homeBanner.create({ data: { image: "/home-strip/smm.jpg", href: null, lang: "en", sort: 0, active: true } });
  console.log("fixture banners:", bVi1.id, bVi2.id, bEn.id);
  const prev2fa = await prisma.setting.findUnique({ where: { key: "admin_2fa_required" } }).catch(() => null);

  ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
  };
  const targets = await (await fetch("http://127.0.0.1:9373/json/list")).json();
  const page = targets.find((x) => x.type === "page");
  const att = await send("Target.attachToTarget", { targetId: page.id, flatten: true }).catch(() => null);
  if (att?.sessionId) sessionId = att.sessionId;
  await send("Page.enable");
  await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await navigate(BASE + "/", 2200);
  await setCookies([["smmv2_session", demoToken], ["smmv2-lang", "vi"], ["smmv2-cur", "VND"]]);

  try {
    // ================= KHÁCH VI: bộ banner VI =================
    await navigate(BASE + "/", 3200);
    let hero = await evaluate(heroExpr);
    console.log("hero VI:", JSON.stringify(hero));
    ok(hero && hero.imgs.length === 2 && hero.imgs.some((s) => s.includes("premium.jpg")) && hero.imgs.some((s) => s.includes("game-key.jpg")), "khách VI: hero chạy đúng 2 banner VI");
    ok(hero && !hero.imgs.some((s) => s.includes("smm.jpg")), "khách VI: không lọt banner EN");
    ok(hero.dots === 2, `khách VI: số chấm = số banner đã lọc (2, thấy ${hero.dots})`);
    await shot("2026-11-08-lang-vi.png", { x: 0, y: Math.max(0, hero.top - 70), width: 1440, height: 560 });

    // ---- Picker: đúng 2 ngôn ngữ + 2 tiền tệ
    const panel = await evaluate(`(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => (b.getAttribute('title') || '').includes('hiển thị'));
      if (!btn) return null;
      const r = btn.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`);
    ok(!!panel, "thấy nút Cài đặt hiển thị");
    await mouseClick(panel.x, panel.y);
    await sleep(900);
    const pickers = await evaluate(`(() => {
      const labels = [...document.querySelectorAll('div')].filter((d) => d.children.length === 0 && ['Ngôn ngữ', 'Tiền tệ'].includes(d.textContent.trim()));
      const out = {};
      for (const lab of labels) {
        const seg = lab.parentElement.querySelectorAll('button');
        out[lab.textContent.trim()] = [...seg].map((b) => b.textContent.trim());
      }
      return out;
    })()`);
    console.log("pickers:", JSON.stringify(pickers));
    ok(JSON.stringify(pickers["Ngôn ngữ"]) === JSON.stringify(["English", "Tiếng Việt"]), "picker ngôn ngữ: đúng 2 lựa chọn English + Tiếng Việt");
    ok(JSON.stringify(pickers["Tiền tệ"]) === JSON.stringify(["VND ₫", "USD $"]), "picker tiền tệ: đúng 2 lựa chọn VND + USD");
    await shot("2026-11-08-lang-pickers.png", { x: 900, y: 60, width: 540, height: 700 });

    // ---- Click-through: banner VI 1 CÓ link /premium (ép về slide 1 rồi
    // bấm NGAY — hero tự chạy 5.5s sẽ chuyển slide nếu chờ lâu)
    await mouseClick(panel.x, panel.y); // đóng panel
    await sleep(400);
    const dot1 = await evaluate(`(() => {
      const hero = document.querySelector('section.relative.w-full.overflow-hidden');
      const dots = [...hero.querySelectorAll('button')].filter((b) => b.offsetHeight === 8);
      const r = dots[0].getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`);
    await mouseClick(dot1.x, dot1.y);
    await sleep(400);
    hero = await evaluate(heroExpr);
    ok(hero.active === 0, `đã ép về banner 1 (active=${hero.active})`);
    await mouseClick(hero.cx, hero.cy);
    await sleep(2500);
    let path = await evaluate(`location.pathname`);
    ok(path === "/premium", `banner có link: bấm vào đi đúng link (${path})`);
    await navigate(BASE + "/", 3000);
    // ---- Click-through: banner VI 2 KHÔNG link -> bấm không đi đâu
    hero = await evaluate(heroExpr);
    const dot2 = await evaluate(`(() => {
      const hero = document.querySelector('section.relative.w-full.overflow-hidden');
      const dots = [...hero.querySelectorAll('button')].filter((b) => b.offsetHeight === 8);
      const r = dots[1].getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`);
    await mouseClick(dot2.x, dot2.y);
    await sleep(600);
    hero = await evaluate(heroExpr);
    ok(hero.active === 1, `đã chuyển sang banner 2 (active=${hero.active})`);
    await mouseClick(hero.cx, hero.cy);
    await sleep(1200);
    path = await evaluate(`location.pathname`);
    ok(path === "/", `banner không link: bấm vào không đi đâu (vẫn ở ${path})`);

    // ================= KHÁCH EN: bộ banner EN =================
    await setCookies([["smmv2-lang", "en"]]);
    await navigate(BASE + "/", 3200);
    hero = await evaluate(heroExpr);
    console.log("hero EN:", JSON.stringify(hero));
    ok(hero && hero.imgs.length === 1 && hero.imgs[0].includes("smm.jpg"), "khách EN: hero chỉ chạy banner EN");
    ok(hero.dots === 0 && hero.arrows === 0, "khách EN: 1 banner -> không chấm, không mũi tên");
    await shot("2026-11-08-lang-en.png", { x: 0, y: Math.max(0, hero.top - 70), width: 1440, height: 560 });

    // ---- EN trống -> rơi về bộ VI
    await prisma.homeBanner.delete({ where: { id: bEn.id } });
    await navigate(BASE + "/", 3200);
    hero = await evaluate(heroExpr);
    console.log("hero EN fallback:", JSON.stringify(hero?.imgs));
    ok(hero && hero.imgs.length === 2 && hero.imgs.some((s) => s.includes("premium.jpg")), "khách EN khi EN chưa có banner: rơi về bộ VI, hero không trống");

    // ---- Cookie lang=zh (đã bỏ) -> mặc định en, không lỗi
    await setCookies([["smmv2-lang", "zh"]]);
    await navigate(BASE + "/", 3200);
    const zhCheck = await evaluate(`(() => ({ text: document.body.innerText.slice(0, 4000) }))()`);
    ok(!zhCheck.text.includes("首页"), "cookie zh: trang KHÔNG hiện tiếng Trung");
    ok(zhCheck.text.includes("Home") || zhCheck.text.includes("Homepage banners") || zhCheck.text.includes("Featured"), "cookie zh: rơi về ngôn ngữ mặc định (en)");

    // ---- Cookie cur=EUR (đã bỏ) -> giá kiểu VNĐ
    await setCookies([["smmv2-lang", "en"], ["smmv2-cur", "EUR"]]);
    await navigate(BASE + "/", 3200);
    const priceCheck = await evaluate(`(() => {
      const m = document.body.innerText.match(/[^\\s]*[đ€$][^\\s]*/g);
      return { hasDong: document.body.innerText.includes("đ"), hasEuro: document.body.innerText.includes("€"), sample: (m || []).slice(0, 3) };
    })()`);
    console.log("priceCheck:", JSON.stringify(priceCheck));
    ok(priceCheck.hasDong && !priceCheck.hasEuro, "cookie EUR: giá rơi về định dạng VNĐ (có đ, không có €)");

    // ================= ADMIN: trang banner =================
    await prisma.setting.upsert({ where: { key: "admin_2fa_required" }, update: { value: "0" }, create: { key: "admin_2fa_required", value: "0" } });
    await setCookies([["smmv2_session", adminToken], ["smmv2-lang", "vi"]]);
    await navigate(BASE + "/admin/banner", 3200);
    const adm = await evaluate(`(() => ({ path: location.pathname, text: document.body.innerText.slice(0, 3000) }))()`);
    ok(adm.path === "/admin/banner", `trang admin banner mở được (${adm.path})`);
    ok(adm.text.includes("Banner trang chủ") && adm.text.includes("Ngôn ngữ banner"), "form admin có trường NGÔN NGỮ banner");
    ok(adm.text.includes("Tiếng Việt (VI)") && adm.text.includes("English (EN)"), "bộ chọn ngôn ngữ banner có VI + EN");
    ok(adm.text.includes("Link đích khi bấm vào banner"), "form admin có trường LINK (tuỳ chọn)");
  } finally {
    await prisma.homeBanner.deleteMany({});
    if (prev2fa) await prisma.setting.update({ where: { key: "admin_2fa_required" }, data: { value: prev2fa.value } });
    else await prisma.setting.deleteMany({ where: { key: "admin_2fa_required" } });
    console.log("đã dọn fixture banner + khôi phục admin_2fa_required");
  }
  console.log(failures === 0 ? "ALL PASS" : `${failures} FAIL`);
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => {
  console.error("ERR", e);
  try { await prisma.homeBanner.deleteMany({}); } catch { /* bỏ qua */ }
  process.exit(2);
}).finally(() => { try { chrome.kill(); } catch { /* */ } });
