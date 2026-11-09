/** Dải icon trang chủ + hero tiến trình (lệnh Tín 2026-11-08 21:08–21:14):
 *  - 8 ô icon dưới hero, nhãn/href đúng, không tràn ngang, không nền màu.
 *  - Chấm hero = thanh tiến trình chạy cùng đồng hồ với tự chuyển slide.
 *  - Mobile 390: mũi tên bấm được (≥40px), dải icon VỪA KÉO vừa BẤM.
 *  - Cổng: tắt telegram_enabled + module_smm → ô trên dải VÀ mục menu
 *    tương ứng cùng biến mất; khôi phục sau test.
 *  - Ô Telegram mở đúng tab (?tab=stars / ?tab=premium) — cần fixture
 *    provider Telegram tối thiểu, dựng + dọn trong script này.
 *  Chạy: node scripts/shots-strip.mjs (env: .env đã source + PRISMA_*). */
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

const prisma = new PrismaClient();
const FIX_PROVIDER = "FZR Strip Fixture";
const FIX_SLUG = "fixture-strip-telegram";

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
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
async function navigate(url, waitMs = 2600) { await send("Page.navigate", { url }); await sleep(waitMs); }
async function shot(name, clip) {
  const params = { format: "png", captureBeyondViewport: false };
  if (clip) params.clip = { ...clip, scale: 1 };
  const r = await send("Page.captureScreenshot", params);
  writeFileSync(`${OUT}/${name}`, Buffer.from(r.data, "base64"));
  console.log("shot:", name);
}
async function touchTap(x, y) {
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
  await sleep(60);
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}
async function touchDrag(x1, x2, y, steps = 7) {
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x1, y, id: 1 }] });
  for (let i = 1; i <= steps; i++) {
    await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: Math.round(x1 + (x2 - x1) * (i / steps)), y, id: 1 }] });
    await sleep(35);
  }
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}
async function mouseClick(x, y) {
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await sleep(60);
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
}

const heroStateExpr = `(() => {
  const hero = document.querySelector('section.relative.w-full.overflow-hidden');
  if (!hero) return null;
  const slides = [...hero.querySelectorAll(':scope > div > div')];
  const idx = slides.findIndex((d) => d.className.includes('opacity-100'));
  const dots = [...hero.querySelectorAll('button')].filter((b) => b.offsetHeight === 8);
  const track = dots.find((b) => b.offsetWidth > 20);
  const fill = track ? track.querySelector('span') : null;
  return { idx, n: slides.length, fillPct: fill && track ? Math.round((fill.offsetWidth / track.clientWidth) * 100) : -1, hasTrack: !!track };
})()`;
const stripTilesExpr = `[...document.querySelectorAll('[data-testid="home-strip"] a')].map((a) => ({ label: a.textContent.trim().replace(/\\s+/g, ' '), href: a.getAttribute('href') }))`;

async function main() {
  // ---- Fixture Telegram tối thiểu (provider + gói sao đơn vị + gói 3 tháng)
  const cat = await prisma.premiumCategory.findFirst({ orderBy: { id: "asc" } });
  const provider = await prisma.provider.create({
    data: { name: FIX_PROVIDER, kind: "PREMIUM", apiUrl: "https://api.fzr.cards", apiKey: "fc_strip_fixture", currency: "USD", exchangeRate: 26000, markupPercent: 30, driver: "FZR", active: true },
  });
  const product = await prisma.premiumProduct.create({
    data: { slug: FIX_SLUG, name: "Telegram (strip fixture)", fulfillment: "API", active: true, categoryId: cat.id },
  });
  await prisma.premiumVariant.createMany({
    data: [
      { productId: product.id, name: "Stars (đơn vị)", price: 1000, active: true, providerId: provider.id, providerGroup: "telegram_stars", providerItemId: "stars" },
      { productId: product.id, name: "Premium 3 tháng", price: 12990, active: true, providerId: provider.id, providerGroup: "telegram_premium", providerItemId: "3" },
    ],
  });
  console.log("fixture telegram sẵn sàng (provider", provider.id + ")");

  ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
  };
  const targets = await (await fetch("http://127.0.0.1:9371/json/list")).json();
  const page = targets.find((x) => x.type === "page");
  const att = await send("Target.attachToTarget", { targetId: page.id, flatten: true }).catch(() => null);
  if (att?.sessionId) sessionId = att.sessionId;
  await send("Page.enable");
  await send("Network.enable");
  // Cookie + localStorage theo mẫu scripts/shots-fix10: phải vào origin
  // trước rồi mới ghi document.cookie (DisplayEngine đồng bộ cookie từ
  // localStorage — thiếu localStorage là nó ghi đè về en).
  await navigate(BASE + "/", 2200);
  await evaluate(`document.cookie = 'smmv2_session=${demoToken}; path=/'; document.cookie = 'smmv2-lang=vi; path=/'; try { localStorage.setItem('smmv2-lang', 'vi'); } catch(e) {} 'set'`);

  try {
    // ================= DESKTOP =================
    await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
    await navigate(BASE + "/");
    const tiles = await evaluate(stripTilesExpr);
    console.log("tiles:", JSON.stringify(tiles));
    ok(tiles.length === 8, `dải có đủ 8 ô (thấy ${tiles.length})`);
    const wantLabels = ["Mạng xã hội", "Steam Top-Up", "Steam Gift", "Telegram Stars", "Telegram Premium", "Game Key", "Gift Card", "Top-Up Game"];
    ok(wantLabels.every((l, i) => tiles[i]?.label === l), "nhãn 8 ô đúng thứ tự + tiếng Việt qua từ điển");
    const wantHrefs = ["/dashboard/dat-hang", "/dashboard/steam/top-up", "/dashboard/steam/gift-games", "/dashboard/telegram?tab=stars", "/dashboard/telegram?tab=premium", "/dashboard/game-key", "/dashboard/gift-card", "/dashboard/top-up"];
    ok(wantHrefs.every((h, i) => tiles[i]?.href === h), "href 8 ô đúng đích");
    const layout = await evaluate(`(() => {
      const hero = document.querySelector('section.relative.w-full.overflow-hidden');
      const strip = document.querySelector('[data-testid="home-strip"]');
      const hr = hero.getBoundingClientRect(); const sr = strip.getBoundingClientRect();
      return { heroBottom: Math.round(hr.bottom), stripTop: Math.round(sr.top), docW: document.scrollingElement.scrollWidth, winW: window.innerWidth };
    })()`);
    console.log("layout:", JSON.stringify(layout));
    ok(layout.stripTop >= layout.heroBottom && layout.stripTop - layout.heroBottom <= 40, "dải nằm ngay dưới hero");
    ok(layout.docW <= layout.winW + 1, "không tràn ngang desktop");

    // ---- Tiến trình hero: chờ 1 lần chuyển, đo độ đầy theo thời gian
    let st = await evaluate(heroStateExpr);
    ok(st && st.n >= 2 && st.hasTrack, `hero có ${st?.n} slide + chấm đang chạy là thanh tiến trình`);
    const t0 = Date.now();
    let prevIdx = st.idx;
    while (Date.now() - t0 < 12000 && (await evaluate(heroStateExpr)).idx === prevIdx) await sleep(250);
    st = await evaluate(heroStateExpr);
    ok(st.idx !== prevIdx, `tự chuyển slide sau khi thanh đầy (${prevIdx} -> ${st.idx})`);
    // chờ thanh của slide mới đầy ~40% rồi chụp progress1
    const w1 = Date.now();
    while (Date.now() - w1 < 6000) { st = await evaluate(heroStateExpr); if (st.fillPct >= 35) break; await sleep(200); }
    console.log("progress1 fill%:", st.fillPct);
    ok(st.fillPct >= 30 && st.fillPct <= 85, "thanh tiến trình đang đầy dần (progress1)");
    await shot("2026-11-08-strip-progress1.png", { x: 0, y: 0, width: 1440, height: 860 });
    // đo tiếp: độ đầy tăng dần, rồi chuyển slide kế và thanh chạy lại từ thấp
    const samples = [];
    const idxNow = st.idx;
    const t1 = Date.now();
    let advanced = null;
    while (Date.now() - t1 < 9000) {
      const s2 = await evaluate(heroStateExpr);
      samples.push({ idx: s2.idx, fill: s2.fillPct });
      if (s2.idx !== idxNow) { advanced = s2; break; }
      await sleep(400);
    }
    console.log("samples:", JSON.stringify(samples));
    ok(!!advanced, "thanh đầy -> chuyển slide kế tiếp");
    const w2 = Date.now();
    while (Date.now() - w2 < 5000) { st = await evaluate(heroStateExpr); if (st.fillPct >= 15) break; await sleep(200); }
    console.log("progress2 fill%:", st.fillPct, "idx:", st.idx);
    ok(advanced && st.idx === advanced.idx && st.fillPct >= 10 && st.fillPct < 90, "slide mới: thanh của chấm mới đang chạy lại (progress2)");
    await shot("2026-11-08-strip-progress2.png", { x: 0, y: 0, width: 1440, height: 860 });
    await shot("2026-11-08-strip-desktop.png");

    // ---- Ô Telegram mở đúng tab
    const tgRect = await evaluate(`(() => {
      const a = [...document.querySelectorAll('[data-testid="home-strip"] a')].find((x) => x.getAttribute('href') === '/dashboard/telegram?tab=premium');
      const r = a.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`);
    await mouseClick(tgRect.x, tgRect.y);
    await sleep(3000);
    const tgState = await evaluate(`(() => {
      const btns = [...document.querySelectorAll('button')].filter((b) => ['Stars', 'Premium'].includes(b.textContent.trim()));
      const active = btns.find((b) => b.className.includes('from-brand-600'));
      return { url: location.pathname + location.search, active: active ? active.textContent.trim() : null };
    })()`);
    console.log("telegram premium tile ->", JSON.stringify(tgState));
    ok(tgState.url === "/dashboard/telegram?tab=premium" && tgState.active === "Premium", "ô Telegram Premium mở đúng tab Premium");
    await navigate(BASE + "/dashboard/telegram?tab=stars", 3200);
    const tgStars = await evaluate(`(() => {
      const btns = [...document.querySelectorAll('button')].filter((b) => ['Stars', 'Premium'].includes(b.textContent.trim()));
      const active = btns.find((b) => b.className.includes('from-brand-600'));
      return active ? active.textContent.trim() : null;
    })()`);
    ok(tgStars === "Stars", "mở ?tab=stars thì tab Stars đang chọn");

    // ================= MOBILE 390 =================
    await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await navigate(BASE + "/", 3200);
    await shot("2026-11-08-strip-mobile.png");
    const mLayout = await evaluate(`(() => ({ docW: document.scrollingElement.scrollWidth, winW: window.innerWidth }))()`);
    ok(mLayout.docW <= mLayout.winW + 1, "không tràn ngang mobile");
    // Mũi tên: kích thước + bấm qua/lại
    const arrows = await evaluate(`(() => {
      const hero = document.querySelector('section.relative.w-full.overflow-hidden');
      const btns = [...hero.querySelectorAll('button')].filter((b) => b.offsetHeight >= 36);
      const rp = btns[0].getBoundingClientRect(); const rn = btns[1].getBoundingClientRect();
      return { prev: { w: rp.width, h: rp.height, x: Math.round(rp.left + rp.width / 2), y: Math.round(rp.top + rp.height / 2) }, next: { w: rn.width, h: rn.height, x: Math.round(rn.left + rn.width / 2), y: Math.round(rn.top + rn.height / 2) } };
    })()`);
    console.log("arrows:", JSON.stringify(arrows));
    ok(arrows.prev.w >= 40 && arrows.prev.h >= 40 && arrows.next.w >= 40, "nút mũi tên mobile >= 40px");
    let hs = await evaluate(heroStateExpr);
    await touchTap(arrows.next.x, arrows.next.y);
    await sleep(500);
    let hs2 = await evaluate(heroStateExpr);
    ok(hs2.idx === (hs.idx + 1) % hs2.n && hs2.fillPct <= 30, `chạm "sau": chuyển slide (${hs.idx} -> ${hs2.idx}) + thanh chạy lại từ đầu (${hs2.fillPct}%)`);
    await touchTap(arrows.prev.x, arrows.prev.y);
    await sleep(500);
    hs2 = await evaluate(heroStateExpr);
    ok(hs2.idx === hs.idx, `chạm "trước": quay lại slide (${hs2.idx})`);
    // Kéo dải icon: cuộn được + KHÔNG điều hướng
    const stripY = await evaluate(`(() => { const r = document.querySelector('[data-testid="home-strip"]').getBoundingClientRect(); return Math.round(r.top + 34); })()`);
    await touchDrag(320, 150, stripY);
    await sleep(400);
    let dragState = await evaluate(`(() => ({ path: location.pathname, sl: Math.round(document.querySelector('[data-testid="home-strip"] [data-strip-scroll]').scrollLeft) }))()`);
    console.log("after drag1:", JSON.stringify(dragState));
    ok(dragState.path === "/" && dragState.sl > 30, `kéo dải: cuộn được (${dragState.sl}px) + không điều hướng`);
    // chờ cuộn dừng hẳn (hết quán tính) như người dùng thật rồi mới chạm
    for (let i = 0; i < 10; i++) {
      const a = await evaluate(`Math.round(document.querySelector('[data-testid="home-strip"] [data-strip-scroll]').scrollLeft)`);
      await sleep(300);
      const b = await evaluate(`Math.round(document.querySelector('[data-testid="home-strip"] [data-strip-scroll]').scrollLeft)`);
      if (a === b) break;
    }
    // kéo tiếp tới khi ô Game Key vào khung rồi CHẠM
    let gkRect = null;
    for (let i = 0; i < 4 && !gkRect; i++) {
      gkRect = await evaluate(`(() => {
        const a = [...document.querySelectorAll('[data-testid="home-strip"] a')].find((x) => x.getAttribute('href') === '/dashboard/game-key');
        const r = a.getBoundingClientRect();
        return (r.left >= 0 && r.right <= window.innerWidth) ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null;
      })()`);
      if (!gkRect) { await touchDrag(320, 130, stripY); await sleep(350); }
    }
    ok(!!gkRect, "kéo tiếp: ô Game Key vào khung hình");
    if (gkRect) {
      // đo lại toạ độ sau khi cuộn đã dừng hẳn, ngay trước khi chạm
      for (let i = 0; i < 10; i++) {
        const a = await evaluate(`Math.round(document.querySelector('[data-testid="home-strip"] [data-strip-scroll]').scrollLeft)`);
        await sleep(300);
        const b = await evaluate(`Math.round(document.querySelector('[data-testid="home-strip"] [data-strip-scroll]').scrollLeft)`);
        if (a === b) break;
      }
      gkRect = await evaluate(`(() => {
        const a = [...document.querySelectorAll('[data-testid="home-strip"] a')].find((x) => x.getAttribute('href') === '/dashboard/game-key');
        const r = a.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      })()`);
      await touchTap(gkRect.x, gkRect.y);
      await sleep(2800);
      const path = await evaluate(`location.pathname`);
      ok(path === "/dashboard/game-key", `chạm sạch ô Game Key -> điều hướng đúng (${path})`);
    }

    // ================= CỔNG MODULE =================
    await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
    await prisma.setting.upsert({ where: { key: "telegram_enabled" }, update: { value: "0" }, create: { key: "telegram_enabled", value: "0" } });
    await prisma.setting.upsert({ where: { key: "module_smm" }, update: { value: "0" }, create: { key: "module_smm", value: "0" } });
    try {
      await navigate(BASE + "/", 3200);
      const gated = await evaluate(stripTilesExpr);
      console.log("gated tiles:", JSON.stringify(gated.map((x) => x.label)));
      ok(gated.length === 5, `tắt telegram+smm: dải còn 5 ô (thấy ${gated.length})`);
      ok(!gated.some((x) => x.label.includes("Telegram")) && !gated.some((x) => x.label === "Mạng xã hội"), "ô Telegram + ô SMM biến mất khỏi dải");
      await navigate(BASE + "/dashboard/ho-so", 3200);
      const navText = await evaluate(`(() => { const h = document.querySelector('header'); return h ? h.textContent : ''; })()`);
      ok(!navText.includes("Telegram Premium"), "menu khách: nhóm Telegram Premium cũng biến mất");
      ok(!navText.includes("Đặt đơn"), "menu khách: mục Đặt đơn (SMM) cũng biến mất");
    } finally {
      await prisma.setting.upsert({ where: { key: "telegram_enabled" }, update: { value: "1" }, create: { key: "telegram_enabled", value: "1" } });
      await prisma.setting.upsert({ where: { key: "module_smm" }, update: { value: "1" }, create: { key: "module_smm", value: "1" } });
      console.log("đã khôi phục telegram_enabled=1, module_smm=1");
    }
    await navigate(BASE + "/", 3200);
    const restored = await evaluate(stripTilesExpr);
    ok(restored.length === 8, `khôi phục: dải lại đủ 8 ô (thấy ${restored.length})`);
  } finally {
    // dọn fixture
    await prisma.premiumVariant.deleteMany({ where: { providerId: provider.id } });
    await prisma.premiumProduct.delete({ where: { id: product.id } }).catch(() => {});
    await prisma.provider.delete({ where: { id: provider.id } }).catch(() => {});
    console.log("đã dọn fixture telegram");
  }
  console.log(failures === 0 ? "ALL PASS" : `${failures} FAIL`);
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => {
  console.error("ERR", e);
  try {
    await prisma.setting.upsert({ where: { key: "telegram_enabled" }, update: { value: "1" }, create: { key: "telegram_enabled", value: "1" } });
    await prisma.setting.upsert({ where: { key: "module_smm" }, update: { value: "1" }, create: { key: "module_smm", value: "1" } });
    const p = await prisma.provider.findFirst({ where: { name: FIX_PROVIDER } });
    if (p) {
      await prisma.premiumVariant.deleteMany({ where: { providerId: p.id } });
      await prisma.premiumProduct.deleteMany({ where: { slug: FIX_SLUG } });
      await prisma.provider.delete({ where: { id: p.id } });
    }
  } catch { /* bỏ qua */ }
  process.exit(2);
}).finally(() => { try { chrome.kill(); } catch { /* */ } });
