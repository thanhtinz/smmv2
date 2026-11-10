/** GỘP FAQ VÀO TICKET (2026-11-09): node scripts/shots-support-merged.mjs
 *  Kiểm chứng trên bản production (cần server chạy ở :3000 + fixture contacts):
 *  - /dashboard/faq redirect (không 404) về /dashboard/ticket#faq
 *  - footer (trang chủ, khách vãng lai) trỏ link Câu hỏi thường gặp → /dashboard/ticket#faq
 *  - trang gộp /dashboard/ticket: có accordion FAQ (đủ 6 câu, mở/đóng được),
 *    cột phụ có thẻ tạo ticket + thẻ kênh liên hệ, danh sách ticket + form tạo
 *  - tạo thử 1 ticket qua đúng form UI → chuyển sang trang chi tiết ticket
 *  - đo cân bằng desktop 1440 (accordion cột rộng, cột phụ 320, lệch đáy 2 cột)
 *  - menu khách không còn mục /dashboard/faq
 *  - chụp desktop 1440 + mobile 390 */
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
const cookieHdr = `smmv2_session=${demoToken}; smmv2-lang=vi`;

// --- Kiểm tra HTTP thuần (redirect + footer) ---
{
  const r = await fetch(`${BASE}/dashboard/faq`, { headers: { Cookie: cookieHdr }, redirect: "manual" });
  const loc = r.headers.get("location") || "";
  ok(r.status >= 300 && r.status < 400, `http: /dashboard/faq trả redirect (${r.status})`);
  ok(loc.includes("/dashboard/ticket") && loc.includes("#faq"), `http: đích redirect = ${loc}`);
  const home = await (await fetch(`${BASE}/`)).text();
  ok(home.includes("/dashboard/ticket#faq"), "http: footer trang chủ có link Câu hỏi thường gặp → /dashboard/ticket#faq");
  ok(!home.includes('href="/dashboard/faq"'), "http: không còn link /dashboard/faq trần trong trang chủ");
}

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=old", "--disable-gpu", "--no-sandbox", "--disable-setuid-sandbox", "--hide-scrollbars",
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-support-merged",
  "--remote-debugging-port=9384", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9384/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
async function navigate(url, waitMs = 3200) { await send("Page.navigate", { url }); await sleep(waitMs); }
async function captureClip(name, rect, padTop = 8, padBottom = 8) {
  const r = await send("Page.captureScreenshot", {
    format: "png", captureBeyondViewport: true,
    clip: { x: Math.max(0, rect.x - 4), y: Math.max(0, rect.y - padTop), width: Math.min(rect.width + 8, 1600), height: rect.height + padTop + padBottom, scale: 1 },
  });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name);
}
async function setViewport(width, height, mobile) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: !!mobile });
}

const MEASURE = `(() => {
  const sec = document.querySelector('#faq');
  if (!sec) return null;
  const details = sec.querySelectorAll('details');
  const first = details[0];
  const last = details[details.length - 1];
  const aside = sec.querySelector('aside');
  const docY = (el) => el.getBoundingClientRect().bottom + window.scrollY;
  const form = document.querySelector('#tao-ticket');
  const heads = [...document.querySelectorAll('h2')].map((e) => e.textContent.trim());
  const menuFaq = [...document.querySelectorAll('a')].filter((a) => a.getAttribute('href') === '/dashboard/faq').length;
  const wrap = sec.closest('div');
  return {
    questions: details.length,
    firstOpen: first ? first.open : false,
    detailsW: first ? Math.round(first.getBoundingClientRect().width) : 0,
    asideW: aside ? Math.round(aside.getBoundingClientRect().width) : 0,
    accordionBottom: last ? Math.round(docY(last)) : 0,
    asideBottom: aside ? Math.round(docY(aside)) : 0,
    contentW: wrap ? Math.round(wrap.getBoundingClientRect().width) : 0,
    hasForm: !!form,
    heads,
    menuFaqLinks: menuFaq,
    asideText: aside ? aside.textContent : "",
  };
})()`;

async function main() {
  ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
  };
  const t = await send("Target.createTarget", { url: "about:blank" });
  sessionId = (await send("Target.attachToTarget", { targetId: t.targetId, flatten: true })).sessionId;
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await setViewport(1440, 1100, false);
  await send("Network.setCookie", { name: "smmv2_session", value: demoToken, url: BASE + "/", path: "/" });
  await send("Network.setCookie", { name: "smmv2-lang", value: "vi", url: BASE + "/", path: "/" });
  // Hồ sơ Chrome mới chưa có localStorage smmv2-lang → component hiển thị tự ghi
  // cookie về mặc định "en"; ghim cả localStorage để các lần render sau là VI.
  await navigate(`${BASE}/`, 2500);
  await evaluate(`(() => { try { localStorage.setItem("smmv2-lang", "vi"); document.cookie = "smmv2-lang=vi; path=/; max-age=31536000; samesite=lax"; } catch (e) {} return true; })()`);
  await navigate(`${BASE}/dashboard/ticket#faq`, 4200);

  const m = await evaluate(MEASURE);
  ok(!!m, "merged: tìm thấy mục #faq trong trang ticket");
  if (m) {
    console.log("MEASURE", JSON.stringify(m));
    ok(m.questions >= 6, `merged: accordion đủ câu hỏi mẫu (${m.questions})`);
    ok(m.firstOpen === true, "merged: câu đầu mở sẵn");
    ok(m.asideW >= 280 && m.asideW <= 340, `merged: cột phụ 320px (=${m.asideW})`);
    ok(m.detailsW >= 700, `merged: accordion ở cột rộng (=${m.detailsW}px)`);
    const diff = Math.abs(m.accordionBottom - m.asideBottom);
    console.log(`merged: bottomDiff=${diff}px (accordion ${m.accordionBottom} vs aside ${m.asideBottom})`);
    ok(diff <= 120, `merged: hai cột FAQ kết thúc gần ngang (lệch ${diff}px)`);
    ok(m.asideText.includes("Chưa tìm thấy câu trả lời?") || m.asideText.includes("Still no answer?"), "merged: cột phụ có thẻ tạo ticket");
    ok(m.asideText.includes("Kênh liên hệ khác") || m.asideText.includes("Other contact channels"), "merged: cột phụ có thẻ kênh liên hệ");
    ok(m.hasForm, "merged: có form #tao-ticket trong trang");
    ok(m.heads.some((h) => h.includes("Ticket của bạn") || h.includes("Your tickets")), "merged: có mục danh sách 'Ticket của bạn'");
    ok(m.menuFaqLinks === 0, `merged: không còn link menu /dashboard/faq (=${m.menuFaqLinks})`);
  }

  // Accordion mở/đóng
  const opened = await evaluate(`(() => {
    const d = document.querySelectorAll('#faq details')[1];
    if (!d) return null;
    d.querySelector('summary').click();
    return d.open;
  })()`);
  ok(opened === true, "merged: accordion mở/đóng được");

  // Ảnh desktop: từ đầu trang qua hết mục FAQ
  const rectDesktop = await evaluate(`(() => {
    window.scrollTo(0, 0);
    const h1 = document.querySelector('h1');
    const sec = document.querySelector('#faq');
    if (!h1 || !sec) return null;
    const top = h1.getBoundingClientRect().top + window.scrollY;
    const bottom = sec.getBoundingClientRect().bottom + window.scrollY;
    const wrap = sec.closest('div');
    const wr = wrap.getBoundingClientRect();
    return { x: wr.left, y: top, width: wr.width, height: bottom - top };
  })()`);
  if (rectDesktop) await captureClip("2026-11-09-support-merged-desktop", rectDesktop, 12, 12);

  // Tạo ticket qua đúng form UI
  const created = await evaluate(`(async () => {
    const form = document.querySelector('#tao-ticket');
    if (!form) return { err: "no form" };
    form.scrollIntoView({ block: "center" });
    const setVal = (el, v) => {
      const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    setVal(form.querySelector('input[name="subject"]'), "Ticket kiểm chứng gộp FAQ");
    setVal(form.querySelector('textarea[name="body"]'), "Nội dung kiểm chứng: tạo ticket từ trang hỗ trợ đã gộp.");
    const btn = [...form.querySelectorAll('button')].find((b) => b.textContent.includes("Gửi yêu cầu") || b.textContent.includes("Send request"));
    if (!btn) return { err: "no submit btn" };
    btn.click();
    return { clicked: true };
  })()`);
  ok(created && created.clicked === true, `merged: bấm gửi ticket qua form UI (${JSON.stringify(created)})`);
  await sleep(4500);
  const afterUrl = await evaluate(`location.href`);
  const detailOk = await evaluate(`(() => {
    const t = document.body.textContent || "";
    return { url: location.href, hasSubject: t.includes("Ticket kiểm chứng gộp FAQ"), isDetail: /\\/dashboard\\/ticket\\/\\d+/.test(location.href) };
  })()`);
  console.log("AFTER_CREATE", JSON.stringify(detailOk), afterUrl);
  ok(detailOk.isDetail && detailOk.hasSubject, "merged: ticket tạo thành công, sang trang chi tiết đúng ticket");

  // Quay lại trang gộp: danh sách có ticket vừa tạo
  await navigate(`${BASE}/dashboard/ticket`, 3500);
  const inList = await evaluate(`(document.body.textContent || "").includes("Ticket kiểm chứng gộp FAQ")`);
  ok(inList === true, "merged: danh sách ticket hiện ticket vừa tạo");

  // Mobile 390
  await setViewport(390, 844, true);
  await navigate(`${BASE}/dashboard/ticket`, 3500);
  const rectMobile = await evaluate(`(() => {
    window.scrollTo(0, 0);
    const h1 = document.querySelector('h1');
    const sec = document.querySelector('#faq');
    if (!h1 || !sec) return null;
    const top = h1.getBoundingClientRect().top + window.scrollY;
    const bottom = sec.getBoundingClientRect().bottom + window.scrollY;
    const wrap = sec.closest('div');
    const wr = wrap.getBoundingClientRect();
    return { x: 0, y: top, width: 390, height: Math.min(bottom - top, 2400) };
  })()`);
  if (rectMobile) await captureClip("2026-11-09-support-merged-mobile", rectMobile, 10, 10);

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => { try { chrome.kill(); } catch { /* noop */ } });
