/** NGHIỆM THU điều hướng danh mục trang chủ kiểu shopkey (lệnh Tín
 *  2026-11-12 21:27): node scripts/shots-catnav.mjs
 *  Điều kiện: server production :3000 + DB seed chuẩn (9 SP Premium thường:
 *  Xem phim & Video=2 · Âm nhạc=1 · AI & Công cụ=3 · Học tập & Khác=3).
 *  1. Khối Danh mục trang chủ: pill là LINK — "Tất cả" -> /premium, từng
 *     danh mục -> /premium?cat=<id> (không còn button lọc tại chỗ).
 *  2. Bấm pill 1 danh mục -> tới /premium?cat=<id>, lưới đúng số SP của
 *     danh mục đó, radio danh mục tương ứng được chọn + pill sáng brand.
 *  3. Deep-link thẳng /premium?cat=<id> cũng lọc + sáng pill như vậy.
 *  4. Xoá lọc: chọn "Tất cả" + bấm Lọc -> lưới đủ 9 SP.
 *  5. Tìm kiếm GHÉP với danh mục: đang ở ?cat=3, tìm "canva" ở ô tìm hero
 *     -> URL giữ cat=3 + q=canva, lưới còn đúng 1 thẻ (Canva Pro).
 *  6. Không tràn ngang 1440 + 390.
 *  Ảnh: 2026-11-12-catnav-home.png (khối danh mục) +
 *       2026-11-12-catnav-filtered.png (/premium đã lọc). */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });
let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; };

// Số SP thường thật theo tên danh mục (đối chiếu DB seed bằng probe Prisma).
const EXPECT = { "Xem phim & Video": 2, "Âm nhạc": 1, "AI & Công cụ": 3, "Học tập & Khác": 3 };
const TOTAL = 9;

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=old", "--disable-gpu", "--no-sandbox", "--disable-setuid-sandbox", "--hide-scrollbars",
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-catnav",
  "--remote-debugging-port=9413", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9413/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
async function setViewport(width, height, mobile) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: !!mobile });
}
async function captureViewport(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name);
}

// Đọc pill danh mục ở khối "Danh mục sản phẩm" trang chủ: text + href + tag.
const READ_HOME_PILLS = `(() => {
  const heads = [...document.querySelectorAll('h2')];
  const h = heads.find((x) => (x.textContent || "").includes("Danh mục sản phẩm"));
  if (!h) return null;
  const section = h.closest('section');
  section.scrollIntoView({ block: "center" });
  // Chỉ phần tử CÓ CHỮ mới là pill (vỏ PillStrip còn 2 nút chevron cuộn
  // chỉ-icon không chữ — không phải pill danh mục).
  return [...section.querySelectorAll('a, button')]
    .map((el) => ({ tag: el.tagName, text: (el.textContent || "").trim(), href: el.getAttribute("href") }))
    .filter((p) => p.text);
})()`;

const GRID_STATE = `(() => {
  const cards = [...document.querySelectorAll('a.card')];
  const checked = document.querySelector('input[name="cat"]:checked');
  let pillBg = null;
  if (checked) {
    const span = checked.closest('label')?.querySelector('span');
    if (span) pillBg = getComputedStyle(span).backgroundColor;
  }
  return {
    url: location.pathname + location.search,
    cardCount: cards.length,
    cardNames: cards.map((c) => (c.querySelector('.line-clamp-2')?.textContent || "").trim()),
    checkedCat: checked ? checked.value : null,
    pillBg,
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
  };
})()`;

async function checkFiltered(tag, catId, catName) {
  const g = await evaluate(GRID_STATE);
  ok(g.url.startsWith("/premium") && new URLSearchParams(g.url.split("?")[1] || "").get("cat") === String(catId),
    `${tag}: URL là /premium?cat=${catId} (thực tế: ${g.url})`);
  ok(g.cardCount === EXPECT[catName], `${tag}: lưới đúng ${EXPECT[catName]} SP của "${catName}" (thực tế: ${g.cardCount} — ${g.cardNames.join(", ")})`);
  ok(g.checkedCat === String(catId), `${tag}: radio danh mục ${catId} được chọn (thực tế: ${g.checkedCat})`);
  ok(g.pillBg && g.pillBg !== "rgb(255, 255, 255)" && g.pillBg !== "rgba(0, 0, 0, 0)",
    `${tag}: pill danh mục sáng màu brand (bg: ${g.pillBg})`);
  ok(!g.overflowX, `${tag}: không tràn ngang`);
  return g;
}

async function main() {
  ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
  };
  try {
    const t = await send("Target.createTarget", { url: "about:blank" });
    sessionId = (await send("Target.attachToTarget", { targetId: t.targetId, flatten: true })).sessionId;
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Network.enable");
    await send("Network.setCookie", { name: "smmv2-lang", value: "vi", url: BASE + "/", path: "/" });

    // --- 1. Trang chủ 1440: pill là LINK đúng đích ---
    await setViewport(1440, 1100, false);
    await navigate(`${BASE}/`, 3500);
    await evaluate(`(() => { try { localStorage.setItem("smmv2-lang", "vi"); document.cookie = "smmv2-lang=vi; path=/; max-age=31536000; samesite=lax"; } catch (e) {} return true; })()`);
    await navigate(`${BASE}/`, 3500);
    const pills = await evaluate(READ_HOME_PILLS);
    ok(!!pills, "trang chủ: thấy khối Danh mục sản phẩm");
    const catPills = (pills || []).filter((p) => p.text !== "Tất cả");
    const allPill = (pills || []).find((p) => p.text === "Tất cả");
    ok(!!allPill && allPill.tag === "A" && allPill.href === "/premium",
      `trang chủ: pill "Tất cả" là LINK -> /premium (thực tế: ${allPill ? `${allPill.tag} ${allPill.href}` : "không thấy"})`);
    ok(catPills.length === 4 && catPills.every((p) => p.tag === "A" && /^\/premium\?cat=\d+$/.test(p.href || "")),
      `trang chủ: 4 pill danh mục đều là LINK -> /premium?cat=<id> (thực tế: ${JSON.stringify(catPills)})`);
    const byName = new Map(catPills.map((p) => [p.text, p.href]));
    for (const name of Object.keys(EXPECT)) ok(byName.has(name), `trang chủ: có pill "${name}"`);
    await sleep(600);
    await captureViewport("2026-11-12-catnav-home");

    // --- 2. Bấm pill "AI & Công cụ" (3 SP) -> /premium đã lọc ---
    const aiHref = byName.get("AI & Công cụ");
    const aiId = new URLSearchParams(aiHref.split("?")[1]).get("cat");
    await evaluate(`(() => {
      const heads = [...document.querySelectorAll('h2')];
      const section = heads.find((x) => (x.textContent || "").includes("Danh mục sản phẩm"))?.closest('section');
      const a = [...section.querySelectorAll('a')].find((x) => (x.textContent || "").trim() === "AI & Công cụ");
      a.click(); return true;
    })()`);
    await sleep(3200);
    await checkFiltered("bấm pill trang chủ", aiId, "AI & Công cụ");
    await evaluate(`window.scrollTo(0, 0)`);
    await sleep(500);
    await captureViewport("2026-11-12-catnav-filtered");

    // --- 5. Tìm kiếm ghép danh mục: đang ở ?cat=3 tìm "canva" ---
    await evaluate(`(() => {
      const input = document.querySelector('form[action="/premium"] input[name="q"]');
      const form = input.closest('form');
      input.value = "canva";
      form.requestSubmit ? form.requestSubmit() : form.submit();
      return true;
    })()`);
    await sleep(3200);
    const gs = await evaluate(GRID_STATE);
    const sp = new URLSearchParams(gs.url.split("?")[1] || "");
    ok(sp.get("cat") === String(aiId) && sp.get("q") === "canva",
      `tìm kiếm: URL giữ cat=${aiId} + q=canva (thực tế: ${gs.url})`);
    ok(gs.cardCount === 1 && gs.cardNames[0]?.includes("Canva"),
      `tìm kiếm: lưới còn đúng 1 thẻ Canva Pro trong danh mục AI (thực tế: ${gs.cardCount} — ${gs.cardNames.join(", ")})`);

    // --- 3. Deep-link thẳng /premium?cat=<Âm nhạc> ---
    const musicHref = byName.get("Âm nhạc");
    const musicId = new URLSearchParams(musicHref.split("?")[1]).get("cat");
    await navigate(`${BASE}${musicHref}`, 3200);
    await checkFiltered("deep-link", musicId, "Âm nhạc");

    // --- 4. Xoá lọc: chọn "Tất cả" + Lọc -> đủ 9 SP ---
    await evaluate(`(() => {
      const radio = document.querySelector('input[name="cat"][value=""]');
      radio.closest('label').click();
      const btn = [...document.querySelectorAll('button')].find((b) => (b.textContent || "").trim() === "Lọc");
      btn.click(); return true;
    })()`);
    await sleep(3200);
    const gAll = await evaluate(GRID_STATE);
    ok(gAll.cardCount === TOTAL, `xoá lọc: lưới đủ ${TOTAL} SP (thực tế: ${gAll.cardCount})`);
    ok(gAll.checkedCat === "", `xoá lọc: radio "Tất cả" được chọn (thực tế: ${JSON.stringify(gAll.checkedCat)})`);

    // --- 6. Mobile 390: trang chủ + trang đã lọc không tràn ---
    await setViewport(390, 844, true);
    await navigate(`${BASE}/`, 3200);
    const mHome = await evaluate(GRID_STATE);
    ok(!mHome.overflowX, "mobile 390 trang chủ: không tràn ngang");
    await navigate(`${BASE}${aiHref}`, 3200);
    const mFil = await evaluate(GRID_STATE);
    ok(mFil.cardCount === EXPECT["AI & Công cụ"] && !mFil.overflowX,
      `mobile 390 /premium?cat=${aiId}: đúng ${EXPECT["AI & Công cụ"]} SP, không tràn ngang (thực tế: ${mFil.cardCount})`);
  } finally {
    try { chrome.kill(); } catch { /* đã tắt */ }
  }
  console.log(failures === 0 ? "ALL PASS" : `${failures} FAIL`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
