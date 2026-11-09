/** Nút cuộn hai đầu của dải icon trang chủ trên MOBILE (bổ sung 2026-11-08):
 *  - Chỉ hiện khi hàng tràn (390): hai nút chevron tròn 40px; desktop 1440
 *    hàng vừa đủ 8 ô thì KHÔNG có nút.
 *  - Ban đầu: nút trái mờ + disabled, nút phải bấm được; bấm "sau" cuộn
 *    từng bước (scrollLeft tăng, ô hiện thay đổi); tới cuối thì trạng thái
 *    lật ngược (phải mờ/disabled, trái bấm được).
 *  - Nút không đè ô đầu/cuối (ô đầu/cuối hiện trọn trong khung cuộn).
 *  - Kéo dải vẫn cuộn + không điều hướng; chạm sạch ô vẫn điều hướng —
 *  logic kéo/bấm cũ không bị đụng.
 *  Chạy: node scripts/shots-strip-btns.mjs (env: .env đã source + PRISMA_*). */
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
const mint = (claims) => {
  const u = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sv: 0, iat: now, exp: now + 3600, ...claims })}`;
  return `${u}.${createHmac("sha256", secret).update(u).digest("base64url")}`;
};
const demoToken = mint({ uid: 2, role: "USER", username: "demo" });

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--remote-debugging-port=9372", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9372/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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

const stripStateExpr = `(() => {
  const sec = document.querySelector('[data-testid="home-strip"]');
  if (!sec) return null;
  const sc = sec.querySelector('[data-strip-scroll]');
  const btns = [...sec.querySelectorAll('button')].map((b) => {
    const r = b.getBoundingClientRect();
    return { label: b.getAttribute('aria-label'), disabled: b.disabled, faded: b.className.includes('opacity-30'),
      w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
      left: Math.round(r.left), right: Math.round(r.right) };
  });
  const tiles = [...sc.querySelectorAll('a')];
  const cr = sc.getBoundingClientRect();
  const first = tiles[0].getBoundingClientRect();
  const last = tiles[tiles.length - 1].getBoundingClientRect();
  const visible = tiles.filter((a) => { const r = a.getBoundingClientRect(); return r.left >= cr.left - 1 && r.right <= cr.right + 1; }).map((a) => a.textContent.trim().replace(/\\s+/g, ' '));
  return { nBtns: btns.length, btns, tiles: tiles.length, sl: Math.round(sc.scrollLeft),
    maxSl: Math.round(sc.scrollWidth - sc.clientWidth), cw: Math.round(sc.clientWidth),
    contLeft: Math.round(cr.left), contRight: Math.round(cr.right),
    firstLeft: Math.round(first.left), lastRight: Math.round(last.right), visible };
})()`;
const scrollLeftExpr = `Math.round(document.querySelector('[data-testid="home-strip"] [data-strip-scroll]').scrollLeft)`;
async function waitScrollSettled() {
  let prev = -1;
  for (let i = 0; i < 20; i++) {
    const cur = await evaluate(scrollLeftExpr);
    if (cur === prev) return cur;
    prev = cur;
    await sleep(220);
  }
  return prev;
}

async function main() {
  ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
  };
  const targets = await (await fetch("http://127.0.0.1:9372/json/list")).json();
  const page = targets.find((x) => x.type === "page");
  const att = await send("Target.attachToTarget", { targetId: page.id, flatten: true }).catch(() => null);
  if (att?.sessionId) sessionId = att.sessionId;
  await send("Page.enable");
  await send("Network.enable");
  await navigate(BASE + "/", 2200);
  await evaluate(`document.cookie = 'smmv2_session=${demoToken}; path=/'; document.cookie = 'smmv2-lang=vi; path=/'; try { localStorage.setItem('smmv2-lang', 'vi'); } catch(e) {} 'set'`);

  // ================= MOBILE 390 =================
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await navigate(BASE + "/", 3200);
  let st = await evaluate(stripStateExpr);
  console.log("initial:", JSON.stringify(st));
  ok(st && st.tiles === 8, `dải có 8 ô (thấy ${st?.tiles})`);
  ok(st.nBtns === 2, `mobile: có đúng 2 nút cuộn (thấy ${st.nBtns})`);
  const [prev, next] = st.btns;
  ok(prev.w === 40 && prev.h === 40 && next.w === 40 && next.h === 40, `nút tròn 40x40 (trái ${prev.w}x${prev.h}, phải ${next.w}x${next.h})`);
  ok(prev.disabled && prev.faded, "ban đầu: nút trái mờ + disabled");
  ok(!next.disabled && !next.faded, "ban đầu: nút phải bấm được");
  ok(st.sl === 0, "ban đầu: scrollLeft = 0");
  ok(st.firstLeft >= st.contLeft - 1 && st.firstLeft >= prev.right - 1, "ô đầu hiện trọn, nút trái không đè lên ô đầu");
  // Ảnh kiểm chứng: trạng thái ban đầu (trái mờ, phải sáng)
  const clipRect = await evaluate(`(() => { const r = document.querySelector('[data-testid="home-strip"]').getBoundingClientRect(); return { top: Math.round(r.top), height: Math.round(r.height) }; })()`);
  await shot("2026-11-08-strip-mobilebtns.png", { x: 0, y: Math.max(0, clipRect.top - 20), width: 390, height: clipRect.height + 40 });

  // ---- Bấm "sau": cuộn từng bước
  const visBefore = st.visible.join("|");
  await touchTap(next.x, next.y);
  const sl1 = await waitScrollSettled();
  st = await evaluate(stripStateExpr);
  console.log("after next1:", JSON.stringify({ sl: st.sl, visible: st.visible }));
  ok(sl1 > 60, `bấm sau: scrollLeft tăng (${sl1}px)`);
  ok(Math.abs(sl1 - Math.round(st.cw * 0.8)) <= 50, `mỗi bước ~0.8 khung (${sl1} vs ~${Math.round(st.cw * 0.8)})`);
  ok(st.visible.join("|") !== visBefore, "bấm sau: các ô đang hiện đã thay đổi");
  ok(!st.btns[0].disabled, "đã cuộn: nút trái hết disabled");

  // ---- Bấm "sau" tới cuối: trạng thái lật
  for (let i = 0; i < 6 && !st.btns[1].disabled; i++) {
    await touchTap(st.btns[1].x, st.btns[1].y);
    await waitScrollSettled();
    st = await evaluate(stripStateExpr);
  }
  console.log("at end:", JSON.stringify({ sl: st.sl, maxSl: st.maxSl, next: st.btns[1] }));
  ok(st.btns[1].disabled && st.btns[1].faded, "tới cuối: nút phải mờ + disabled");
  ok(!st.btns[0].disabled, "tới cuối: nút trái bấm được");
  ok(Math.abs(st.sl - st.maxSl) <= 3, `tới cuối: scrollLeft chạm max (${st.sl}/${st.maxSl})`);
  ok(st.lastRight <= st.contRight + 1 && st.lastRight <= st.btns[1].left + 1, "ô cuối hiện trọn, nút phải không đè lên ô cuối");

  // ---- Bấm "trước": cuộn ngược lại
  await touchTap(st.btns[0].x, st.btns[0].y);
  const slBack = await waitScrollSettled();
  ok(slBack < st.sl - 60, `bấm trước: scrollLeft giảm (${st.sl} -> ${slBack})`);

  // ---- Kéo dải: cuộn + KHÔNG điều hướng (logic cũ còn nguyên)
  const stripY = await evaluate(`(() => { const r = document.querySelector('[data-testid="home-strip"]').getBoundingClientRect(); return Math.round(r.top + 34); })()`);
  const slBeforeDrag = await evaluate(scrollLeftExpr);
  await touchDrag(300, 160, stripY);
  await waitScrollSettled();
  const dragState = await evaluate(`(() => ({ path: location.pathname, sl: ${scrollLeftExpr} }))()`);
  console.log("after drag:", JSON.stringify(dragState), "before:", slBeforeDrag);
  ok(dragState.path === "/" && Math.abs(dragState.sl - slBeforeDrag) > 30, "kéo dải: cuộn được + không điều hướng");

  // ---- Chạm sạch ô Game Key: vẫn điều hướng (cờ chặn 500ms không nuốt)
  let gkRect = null;
  for (let i = 0; i < 5 && !gkRect; i++) {
    gkRect = await evaluate(`(() => {
      const a = [...document.querySelectorAll('[data-testid="home-strip"] a')].find((x) => x.getAttribute('href') === '/dashboard/game-key');
      const r = a.getBoundingClientRect();
      const sc = document.querySelector('[data-testid="home-strip"] [data-strip-scroll]').getBoundingClientRect();
      return (r.left >= sc.left && r.right <= sc.right) ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null;
    })()`);
    if (!gkRect) { await touchDrag(320, 130, stripY); await waitScrollSettled(); }
  }
  ok(!!gkRect, "kéo tiếp: ô Game Key vào khung");
  if (gkRect) {
    await touchTap(gkRect.x, gkRect.y);
    await sleep(2800);
    const path = await evaluate(`location.pathname`);
    ok(path === "/dashboard/game-key", `chạm sạch ô Game Key -> điều hướng đúng (${path})`);
  }

  // ================= DESKTOP 1440: không nút =================
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await navigate(BASE + "/", 3200);
  const dst = await evaluate(stripStateExpr);
  console.log("desktop:", JSON.stringify({ nBtns: dst?.nBtns, tiles: dst?.tiles }));
  ok(dst && dst.nBtns === 0 && dst.tiles === 8, "desktop: 8 ô vừa hàng, KHÔNG hiện nút cuộn");

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAIL`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error("ERR", e); process.exit(2); }).finally(() => { try { chrome.kill(); } catch { /* */ } });
