/** BỎ ĐIỂM VÀO TẠO TICKET DƯ THỪA (2026-11-09 19:40): node scripts/shots-support-onebutton.mjs
 *  Kiểm chứng trên bản production (cần server chạy ở :3000 + fixture contacts):
 *  - trang /dashboard/ticket MẶC ĐỊNH chỉ có ĐÚNG 1 nút tạo ticket (ở thẻ cột
 *    phụ cạnh FAQ), KHÔNG còn nút "+ Tạo ticket mới" ở đầu trang, và form tạo
 *    KHÔNG hiện sẵn (không có form trong #tao-ticket, không có ô subject)
 *  - bấm nút đó → form mở ra, tạo thử ticket qua UI → sang trang chi tiết,
 *    quay lại danh sách thấy ticket
 *  - mở thẳng /dashboard/ticket#tao-ticket → form tự mở (neo cũ còn hiệu lực)
 *  - mở link điền trước kiểu Báo lỗi đơn (?subject&category&body#tao-ticket)
 *    → form mở sẵn + tiêu đề đã điền
 *  - đo cân bằng 2 cột FAQ desktop 1440; chụp ảnh trạng thái sau khi sửa */
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
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-support-onebutton",
  "--remote-debugging-port=9385", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9385/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
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
  const form = document.querySelector('#tao-ticket form');
  const subjectInput = document.querySelector('#tao-ticket input[name="subject"]');
  const sec = document.querySelector('#faq');
  const details = sec ? sec.querySelectorAll('details') : [];
  const aside = sec ? sec.querySelector('aside') : null;
  const docY = (el) => el.getBoundingClientRect().bottom + window.scrollY;
  return {
    createBtnCount: createBtns.length,
    createBtnInAside: createBtns.length ? !!createBtns[0].closest('aside') : false,
    createBtnTag: createBtns.length ? createBtns[0].tagName : null,
    hasPlusBtn: clickables.some((e) => (e.textContent || "").trim() === "+ Tạo ticket mới" || (e.textContent || "").trim() === "+ New ticket"),
    formPresent: !!form,
    formVisible: form ? form.getBoundingClientRect().height > 0 : false,
    subjectValue: subjectInput ? subjectInput.value : null,
    accordionBottom: details.length ? Math.round(docY(details[details.length - 1])) : 0,
    asideBottom: aside ? Math.round(docY(aside)) : 0,
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

  // --- Trạng thái mặc định: 1 nút, không form ---
  await navigate(`${BASE}/dashboard/ticket`, 4000);
  const s0 = await evaluate(STATE);
  console.log("DEFAULT", JSON.stringify(s0));
  ok(s0.createBtnCount === 1, `onebutton: đúng 1 nút tạo ticket trên trang (=${s0.createBtnCount})`);
  ok(s0.createBtnInAside === true, "onebutton: nút tạo ticket nằm ở thẻ cột phụ cạnh FAQ");
  ok(s0.hasPlusBtn === false, "onebutton: không còn nút '+ Tạo ticket mới' ở đầu trang");
  ok(s0.formPresent === false, "onebutton: form tạo KHÔNG hiện sẵn khi chưa bấm nút");
  const diff = Math.abs(s0.accordionBottom - s0.asideBottom);
  console.log(`onebutton: faqBottomDiff=${diff}px (accordion ${s0.accordionBottom} vs aside ${s0.asideBottom})`);
  ok(diff <= 120, `onebutton: hai cột FAQ vẫn cân bằng (lệch ${diff}px)`);

  // Ảnh desktop trạng thái sau khi sửa (đầu trang → hết mục FAQ)
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
  if (rect) await captureClip("2026-11-09-support-onebutton", rect, 12, 12);

  // --- Bấm nút → form mở ---
  const clicked = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('a, button')].find((e) => (e.textContent || "").trim() === "Tạo ticket hỗ trợ");
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
  ok(clicked === true, "onebutton: bấm được nút tạo ticket ở cột phụ");
  await sleep(1200);
  const s1 = await evaluate(STATE);
  console.log("AFTER_CLICK", JSON.stringify(s1));
  ok(s1.formPresent === true && s1.formVisible === true, "onebutton: bấm nút xong form tạo hiện ra");

  // --- Tạo ticket qua form vừa mở ---
  const created = await evaluate(`(async () => {
    const form = document.querySelector('#tao-ticket form');
    if (!form) return { err: "no form" };
    const setVal = (el, v) => {
      const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    setVal(form.querySelector('input[name="subject"]'), "Ticket kiểm chứng một nút");
    setVal(form.querySelector('textarea[name="body"]'), "Nội dung kiểm chứng: tạo ticket sau khi gộp còn một nút.");
    const btn = [...form.querySelectorAll('button')].find((b) => b.textContent.includes("Gửi yêu cầu") || b.textContent.includes("Send request"));
    if (!btn) return { err: "no submit btn" };
    btn.click();
    return { clicked: true };
  })()`);
  ok(created && created.clicked === true, `onebutton: gửi ticket qua form (${JSON.stringify(created)})`);
  await sleep(4500);
  const detailOk = await evaluate(`(() => {
    const tx = document.body.textContent || "";
    return { url: location.href, hasSubject: tx.includes("Ticket kiểm chứng một nút"), isDetail: /\\/dashboard\\/ticket\\/\\d+/.test(location.href) };
  })()`);
  console.log("AFTER_CREATE", JSON.stringify(detailOk));
  ok(detailOk.isDetail && detailOk.hasSubject, "onebutton: ticket tạo thành công, sang trang chi tiết đúng ticket");
  await navigate(`${BASE}/dashboard/ticket`, 3500);
  const inList = await evaluate(`(document.body.textContent || "").includes("Ticket kiểm chứng một nút")`);
  ok(inList === true, "onebutton: danh sách ticket hiện ticket vừa tạo");

  // --- Neo sâu #tao-ticket: mở trang là form tự mở ---
  await navigate(`${BASE}/dashboard/ticket#tao-ticket`, 3500);
  const s2 = await evaluate(STATE);
  console.log("DEEPLINK", JSON.stringify(s2));
  ok(s2.formPresent === true && s2.formVisible === true, "onebutton: mở /dashboard/ticket#tao-ticket → form tự mở");

  // --- Link điền trước kiểu Báo lỗi đơn: form mở + đã điền ---
  const preSubject = "Báo lỗi đơn #123";
  const preUrl = `${BASE}/dashboard/ticket?subject=${encodeURIComponent(preSubject)}&category=smm&body=${encodeURIComponent("Đơn bị lỗi, nhờ kiểm tra giúp.")}#tao-ticket`;
  await navigate(preUrl, 3500);
  const s3 = await evaluate(STATE);
  console.log("PREFILL", JSON.stringify(s3));
  ok(s3.formPresent === true, "onebutton: link điền trước → form mở sẵn");
  ok(s3.subjectValue === preSubject, `onebutton: tiêu đề điền trước đúng (=${JSON.stringify(s3.subjectValue)})`);

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => { try { chrome.kill(); } catch { /* noop */ } });
