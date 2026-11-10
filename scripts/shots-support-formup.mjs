/** FORM TẠO TICKET ĐƯA THẲNG LÊN CỘT PHỤ (2026-11-09 20:28): node scripts/shots-support-formup.mjs
 *  Kiểm chứng trên bản production (cần server chạy ở :3000 + fixture contacts):
 *  - mở /dashboard/ticket là form tạo ticket HIỆN SẴN trong cột phụ (thẻ form
 *    #tao-ticket ở cột phải, bắt đầu ngang đỉnh mục FAQ) — không cần bấm gì
 *  - KHÔNG còn nút tạo ticket nào trên trang (nút "Tạo ticket hỗ trợ" ở thẻ
 *    cũ đã gỡ hẳn cùng cơ chế mở form TicketFormReveal)
 *  - đo cân bằng: đáy cột trái (accordion + thẻ liên hệ dưới accordion) so
 *    với đáy form ở cột phụ
 *  - tạo thử ticket qua form ở cột phụ → sang trang chi tiết, quay lại danh
 *    sách thấy ticket; link điền trước (Báo lỗi đơn) → form đã điền sẵn;
 *    mở thẳng #tao-ticket → form vẫn ở đó
 *  - mobile 390: thứ tự xếp dọc FAQ → form → liên hệ; chụp 2 ảnh */
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
  "--headless=old", "--disable-gpu", "--no-sandbox", "--disable-setuid-sandbox", "--hide-scrollbars",
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-support-formup",
  "--remote-debugging-port=9387", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9387/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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

const STATE = `(() => {
  const clickables = [...document.querySelectorAll('a, button')];
  const createBtns = clickables.filter((e) => {
    const t = (e.textContent || "").trim();
    return t === "Tạo ticket hỗ trợ" || t === "+ Tạo ticket mới" || t === "Create a support ticket" || t === "+ New ticket";
  });
  const form = document.querySelector('#tao-ticket');
  const subjectInput = document.querySelector('#tao-ticket input[name="subject"]');
  const sec = document.querySelector('#faq');
  const details = sec ? sec.querySelectorAll('details') : [];
  const docY = (el) => el.getBoundingClientRect().bottom + window.scrollY;
  const docTop = (el) => el.getBoundingClientRect().top + window.scrollY;
  let formInAside = false, formLeft = 0, formTop = 0, faqRight = 0, faqTop = 0, faqLeft = 0, contactsTop = 0, contactsBottom = 0;
  if (form) {
    const r = form.getBoundingClientRect();
    formLeft = Math.round(r.left); formTop = Math.round(docTop(form));
    formInAside = !!form.closest('aside');
  }
  if (details.length) {
    const fr = details[0].getBoundingClientRect();
    faqRight = Math.round(fr.right); faqLeft = Math.round(fr.left); faqTop = Math.round(docTop(details[0]));
  }
  const cards = sec ? [...sec.querySelectorAll('.card')] : [];
  const contactCard = cards.find((c) => (c.textContent || "").includes("Kênh liên hệ khác") || (c.textContent || "").includes("Other contact channels"));
  if (contactCard) { contactsTop = Math.round(docTop(contactCard)); contactsBottom = Math.round(docY(contactCard)); }
  const accordionBottom = details.length ? Math.round(docY(details[details.length - 1])) : 0;
  const formBottom = form ? Math.round(docY(form)) : 0;
  return {
    createBtnCount: createBtns.length,
    formTag: form ? form.tagName : null,
    formIsForm: !!document.querySelector('form#tao-ticket'),
    formInAside,
    formVisible: form ? form.getBoundingClientRect().height > 0 : false,
    formLeft, faqRight, faqLeft, formTop, faqTop, contactsTop,
    subjectValue: subjectInput ? subjectInput.value : null,
    accordionBottom, contactsBottom, formBottom,
    leftBottom: Math.max(accordionBottom, contactsBottom),
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
  await navigate(`${BASE}/`, 2500);
  await evaluate(`(() => { try { localStorage.setItem("smmv2-lang", "vi"); document.cookie = "smmv2-lang=vi; path=/; max-age=31536000; samesite=lax"; } catch (e) {} return true; })()`);

  // --- Trạng thái mặc định desktop: form hiện sẵn ở cột phụ, không nút ---
  await navigate(`${BASE}/dashboard/ticket`, 4000);
  const s0 = await evaluate(STATE);
  console.log("DEFAULT", JSON.stringify(s0));
  ok(s0.formIsForm === true, "formup: #tao-ticket chính là thẻ FORM");
  ok(s0.formVisible === true, "formup: form HIỆN SẴN ngay khi mở trang");
  ok(s0.formInAside === true, "formup: form nằm trong cột phụ (aside)");
  ok(s0.formLeft >= s0.faqRight, `formup: form ở cột phải (formLeft ${s0.formLeft} >= faqRight ${s0.faqRight})`);
  ok(Math.abs(s0.formTop - s0.faqTop) <= 4, `formup: form bắt đầu ngang đỉnh accordion (formTop ${s0.formTop} vs faqTop ${s0.faqTop})`);
  ok(s0.createBtnCount === 0, `formup: KHÔNG còn nút tạo ticket nào trên trang (=${s0.createBtnCount})`);
  const diff = Math.abs(s0.leftBottom - s0.formBottom);
  console.log(`formup: columnDiff=${diff}px (left ${s0.leftBottom} = accordion ${s0.accordionBottom} + contacts ${s0.contactsBottom}; form ${s0.formBottom})`);
  ok(diff <= 80, `formup: hai cột kết thúc gần ngang nhau (lệch ${diff}px)`);

  // Ảnh desktop: từ tiêu đề trang tới hết mục FAQ (gồm form ở cột phụ)
  const rect = await evaluate(`(() => {
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
  if (rect) await captureClip("2026-11-09-support-formup-desktop", rect, 12, 12);

  // --- Tạo ticket qua form ở cột phụ ---
  const created = await evaluate(`(async () => {
    const form = document.querySelector('form#tao-ticket');
    if (!form) return { err: "no form" };
    const setVal = (el, v) => {
      const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    setVal(form.querySelector('input[name="subject"]'), "Ticket kiểm chứng form cột phụ");
    setVal(form.querySelector('textarea[name="body"]'), "Nội dung kiểm chứng: form tạo ticket nằm luôn ở cột phụ.");
    const btn = [...form.querySelectorAll('button')].find((b) => b.textContent.includes("Gửi yêu cầu") || b.textContent.includes("Send request"));
    if (!btn) return { err: "no submit btn" };
    btn.click();
    return { clicked: true };
  })()`);
  ok(created && created.clicked === true, `formup: gửi ticket qua form cột phụ (${JSON.stringify(created)})`);
  await sleep(4500);
  const detailOk = await evaluate(`(() => {
    const tx = document.body.textContent || "";
    return { url: location.href, hasSubject: tx.includes("Ticket kiểm chứng form cột phụ"), isDetail: /\\/dashboard\\/ticket\\/\\d+/.test(location.href) };
  })()`);
  console.log("AFTER_CREATE", JSON.stringify(detailOk));
  ok(detailOk.isDetail && detailOk.hasSubject, "formup: ticket tạo thành công, sang trang chi tiết đúng ticket");
  await navigate(`${BASE}/dashboard/ticket`, 3500);
  const inList = await evaluate(`(document.body.textContent || "").includes("Ticket kiểm chứng form cột phụ")`);
  ok(inList === true, "formup: danh sách ticket hiện ticket vừa tạo");

  // --- Neo sâu #tao-ticket: form ở ngay đó ---
  await navigate(`${BASE}/dashboard/ticket#tao-ticket`, 3500);
  const s2 = await evaluate(STATE);
  console.log("DEEPLINK", JSON.stringify(s2));
  ok(s2.formIsForm === true && s2.formVisible === true, "formup: mở /dashboard/ticket#tao-ticket → form có sẵn ở cột phụ");

  // --- Link điền trước kiểu Báo lỗi đơn: form đã điền sẵn ---
  const preSubject = "Báo lỗi đơn #123";
  const preUrl = `${BASE}/dashboard/ticket?subject=${encodeURIComponent(preSubject)}&category=smm&body=${encodeURIComponent("Đơn bị lỗi, nhờ kiểm tra giúp.")}#tao-ticket`;
  await navigate(preUrl, 3500);
  const s3 = await evaluate(STATE);
  console.log("PREFILL", JSON.stringify(s3));
  ok(s3.formVisible === true, "formup: link điền trước → form hiện sẵn ở cột phụ");
  ok(s3.subjectValue === preSubject, `formup: tiêu đề điền trước đúng (=${JSON.stringify(s3.subjectValue)})`);

  // --- Mobile 390: FAQ → form → liên hệ ---
  await setViewport(390, 900, true);
  await navigate(`${BASE}/dashboard/ticket`, 4000);
  const sm = await evaluate(STATE);
  console.log("MOBILE", JSON.stringify(sm));
  ok(sm.faqTop < sm.formTop && sm.formTop < sm.contactsTop, `formup: mobile xếp dọc FAQ (${sm.faqTop}) → form (${sm.formTop}) → liên hệ (${sm.contactsTop})`);
  ok(sm.formLeft === sm.faqLeft, "formup: mobile một cột thẳng hàng");
  const mrect = await evaluate(`(() => {
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
  if (mrect) await captureClip("2026-11-09-support-formup-mobile", mrect, 12, 12);

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => { try { chrome.kill(); } catch { /* noop */ } });
