/** NGHIỆM THU THIẾT LẬP LẦN ĐẦU (lệnh Tín 2026-11-11 — không tài khoản mẫu,
 *  trang /setup tạo admin đầu tiên).
 *  node scripts/shots-setup.mjs   (điều kiện: production server :3000 đang chạy
 *  với DATABASE_URL trỏ vào DB RỖNG setuptest — 0 user, chỉ seed-prod)
 *  Kiểm: (1) / trên DB rỗng đã dẫn về /setup (kiểm bằng curl ở ngoài), trang
 *  /setup render đúng form; (2) gửi form sai mật khẩu nhập lại -> bị trả về
 *  kèm lỗi, vẫn 0 user; (3) gửi đúng -> tạo đúng 1 ADMIN (hash Argon2id),
 *  ghi site_name + setup_completed=1, có cookie phiên, đi vào khu quản trị
 *  (admin mới chưa 2FA bị dẫn đi enrol đúng như đăng nhập thường; tắt bắt
 *  buộc 2FA thì vào thẳng /admin); (4) /setup sau đó tự khoá; (5) phát lại
 *  nguyên request tạo admin -> bị từ chối, vẫn 1 user; (6) đăng ký khách
 *  thường + đăng nhập lại bằng tài khoản admin vừa tạo đều chạy.
 *  Ảnh: 2026-11-11-setup-trang-{desktop,mobile}.png (tên MỚI duy nhất — không
 *  ghi đè ảnh cũ vì client chat cache theo tên file, lệnh Tín 2026-11-11).
 *  Kiểm thêm (chỉnh 2026-11-11 09:28 — không nhận diện mẫu): seed-prod KHÔNG
 *  trồng dòng site_name; ô tên website render TRỐNG; thẻ KHÔNG có ô logo/chữ
 *  cái; gửi tên website trống (bỏ qua chặn required phía trình duyệt) -> bị
 *  action từ chối, vẫn 0 user, vẫn chưa có dòng site_name. */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });
const prisma = new PrismaClient({ datasources: { db: { url: "postgresql://postgres@127.0.0.1:5433/setuptest" } } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; };

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=old", "--disable-gpu", "--no-sandbox", "--disable-setuid-sandbox", "--hide-scrollbars",
  "--user-data-dir=/home/hatch/workspace/.chrome-cdp-setup",
  "--remote-debugging-port=9412", "--window-size=1440,900",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });

async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9412/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch { /* chờ */ }
    await sleep(200);
  }
  throw new Error("chrome CDP không lên");
}
let msgId = 0;
const pending = new Map();
const netEvents = [];
let ws; let sessionId = null;
function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}
async function evaluate(expr) {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || "eval error");
  return r.result?.value;
}
async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name);
}
async function navigate(url, wait = 3000) {
  await send("Page.navigate", { url });
  await sleep(wait);
}
const fillAndSubmit = (fields) => evaluate(`(() => {
  const set = (name, val) => { const el = document.querySelector('input[name="' + name + '"]'); if (!el) throw new Error('thiếu input ' + name); el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
  ${fields}
  const b = document.querySelector('form button[type="submit"], form button');
  if (!b) throw new Error('thiếu nút submit');
  b.click();
  return location.href;
})()`);

async function main() {
  ok((await prisma.user.count()) === 0, "điều kiện đầu: DB setuptest có 0 user");

  ws = new WebSocket(await wsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
    else if (m.method) netEvents.push(m);
  };
  const targets = await (await fetch("http://127.0.0.1:9412/json/list")).json();
  const page = targets.find((t) => t.type === "page");
  sessionId = (await send("Target.attachToTarget", { targetId: page.id, flatten: true })).sessionId;
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Network.setCookie", { name: "smmv2-lang", value: "vi", url: BASE + "/", path: "/" });

  /* ---- 1. Trang chủ trên DB rỗng tự về /setup, form đủ trường ---- */
  // seed-prod KHÔNG được trồng sẵn tên website: chưa setup thì DB chưa có
  // dòng site_name nào — form setup là nơi ghi đầu tiên của tên site.
  ok((await prisma.setting.findUnique({ where: { key: "site_name" } })) === null, "điều kiện đầu: seed-prod KHÔNG trồng dòng site_name");
  await navigate(`${BASE}/`, 3500);
  const landed = await evaluate(`({ url: location.href, hasForm: !!document.querySelector('input[name="siteName"]'), fields: [...document.querySelectorAll('form input')].map(i => i.name), title: document.querySelector('h1')?.innerText || '', nameValue: document.querySelector('input[name="siteName"]')?.value ?? null, logoImg: !!document.querySelector('main img'), logoTile: !!document.querySelector('[class~="h-12"][class~="w-12"]') })`);
  ok(landed.url.includes("/setup"), `GET / (DB rỗng) -> /setup ${landed.url}`);
  ok(landed.hasForm && ["siteName", "username", "email", "password", "confirmPassword"].every((f) => landed.fields.includes(f)), `form setup đủ 5 trường ${JSON.stringify(landed.fields)}`);
  ok(landed.title.includes("Thiết lập lần đầu") || landed.title.includes("First-time setup"), `tiêu đề trang: "${landed.title}" (khách mới mặc định EN theo luật 2026-11-04)`);
  ok(landed.nameValue === "", `ô tên website mở ra TRỐNG (không điền sẵn tên mẫu) — value="${landed.nameValue}"`);
  ok(!landed.logoImg && !landed.logoTile, "thẻ setup KHÔNG có ô logo/chữ cái (không ảnh logo, không ô h-12 w-12)");
  /* Trang setup ĐỘC LẬP (lệnh Tín 2026-11-11 09:13): không header/footer của
     site, không dải thông báo, không trang trí mùa, không nút liên hệ nổi. */
  const chrome_ = await evaluate(`({ header: !!document.querySelector('header'), footer: !!document.querySelector('footer'), decor: !!document.querySelector('[data-seasonal-garland],[data-seasonal-particles],[data-seasonal-prop],[data-seasonal-wash]'), navLinks: [...document.querySelectorAll('a')].some(a => /\\/login|\\/register/.test(a.getAttribute('href') || '')) })`);
  ok(!chrome_.header, "trang setup KHÔNG có header của site");
  ok(!chrome_.footer, "trang setup KHÔNG có footer của site");
  ok(!chrome_.decor, "trang setup KHÔNG có trang trí mùa lễ hội");
  ok(!chrome_.navLinks, "trang setup KHÔNG có link điều hướng của khung site (đăng nhập/đăng ký)");
  await shot("2026-11-11-setup-trang-desktop");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await navigate(`${BASE}/setup`, 3000);
  await shot("2026-11-11-setup-trang-mobile");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await navigate(`${BASE}/setup`, 2500);

  /* ---- 2. Mật khẩu nhập lại không khớp -> trả lỗi, vẫn 0 user ---- */
  await fillAndSubmit(`set('siteName','Shop Kiểm Chứng'); set('username','boss'); set('email','boss@example.com'); set('password','Setup@123'); set('confirmPassword','SaiKhop@1');`);
  await sleep(2500);
  const errUrl = await evaluate(`location.href`);
  ok(errUrl.includes("/setup") && errUrl.includes("err=") && decodeURIComponent(errUrl).includes("không khớp"), `mật khẩu nhập lại sai -> về /setup kèm lỗi khớp mật khẩu`);
  ok((await prisma.user.count()) === 0, "sau lần gửi lỗi: vẫn 0 user");

  /* ---- 2b. Tên website TRỐNG -> action từ chối (bỏ qua lớp required của
     trình duyệt bằng noValidate để kiểm đúng chốt phía server). Phải XOÁ rõ
     ô siteName trước: sau lần gửi lỗi ở bước 2, trang render lại giữ nguyên
     giá trị đã gõ trong DOM (input không kiểm soát) nên không xoá là form
     vẫn mang tên cũ. ---- */
  await evaluate(`(() => { const f = document.querySelector('form'); if (f) f.noValidate = true; return true; })()`);
  await fillAndSubmit(`set('siteName',''); set('username','boss'); set('email','boss@example.com'); set('password','Setup@123'); set('confirmPassword','Setup@123');`);
  await sleep(2500);
  const noNameUrl = await evaluate(`location.href`);
  ok(noNameUrl.includes("/setup") && noNameUrl.includes("err=") && decodeURIComponent(noNameUrl).includes("không được để trống"), `tên website trống -> bị từ chối kèm lỗi: ${decodeURIComponent(noNameUrl).slice(0, 120)}`);
  ok((await prisma.user.count()) === 0, "sau lần gửi thiếu tên: vẫn 0 user");
  ok((await prisma.setting.findUnique({ where: { key: "site_name" } })) === null, "sau lần gửi thiếu tên: vẫn chưa có dòng site_name");

  /* ---- 3. Gửi đúng -> tạo admin, ghi cấu hình, có phiên, vào khu quản trị ---- */
  netEvents.length = 0;
  await fillAndSubmit(`set('siteName','Shop Kiểm Chứng'); set('username','boss'); set('email','boss@example.com'); set('password','Setup@123'); set('confirmPassword','Setup@123');`);
  await sleep(4500);
  const after = await evaluate(`location.href`);
  const users = await prisma.user.findMany({ select: { username: true, email: true, role: true, passwordHash: true } });
  ok(users.length === 1 && users[0].username === "boss" && users[0].role === "ADMIN", `đã tạo đúng 1 user ADMIN ${JSON.stringify(users.map((u) => ({ u: u.username, role: u.role })))}`);
  ok(/^\$argon2id\$/i.test(users[0].passwordHash), "mật khẩu lưu bằng Argon2id");
  const sn = await prisma.setting.findUnique({ where: { key: "site_name" } });
  const sc = await prisma.setting.findUnique({ where: { key: "setup_completed" } });
  ok(sn?.value === "Shop Kiểm Chứng", `setting site_name = "${sn?.value}"`);
  ok(sc?.value === "1", "setting setup_completed = 1");
  const cookies = await send("Network.getCookies", { urls: [BASE + "/"] });
  ok(cookies.cookies.some((c) => c.name === "smmv2_session"), "đã có cookie phiên smmv2_session");
  ok(after.includes("/admin") || after.includes("tab=security"), `sau setup đi vào khu quản trị/2FA-enrol như đăng nhập thường: ${after}`);
  // Tắt bắt buộc 2FA trong DB test -> admin vào thẳng /admin được
  await prisma.setting.upsert({ where: { key: "admin_2fa_required" }, create: { key: "admin_2fa_required", value: "0" }, update: { value: "0" } });
  await navigate(`${BASE}/admin`, 4000);
  const adminUrl = await evaluate(`location.href`);
  const adminBody = await evaluate(`(document.body.innerText || '').slice(0, 400)`);
  ok(adminUrl.includes("/admin") && !adminUrl.includes("tab=security"), `vào thẳng /admin khi không bắt buộc 2FA: ${adminUrl}`);
  ok(adminBody.includes("Tổng quan") || adminBody.includes("Admin"), "trang /admin render nội dung quản trị");

  /* ---- 4. /setup đã khoá ---- */
  await navigate(`${BASE}/setup`, 3000);
  const lockedUrl = await evaluate(`location.href`);
  ok(!lockedUrl.includes("/setup"), `GET /setup sau khi đã thiết lập -> chuyển khỏi /setup: ${lockedUrl}`);

  /* ---- 5. Phát lại request tạo admin đã bắt được -> bị từ chối ---- */
  const post = netEvents.find((e) => e.method === "Network.requestWillBeSent" && e.params?.request?.method === "POST" && (e.params?.request?.url || "").includes("/setup") && e.params?.request?.postData);
  ok(!!post, "đã bắt được request POST của setupAction để phát lại");
  if (post) {
    const r = await fetch(post.params.request.url, { method: "POST", headers: Object.fromEntries(Object.entries(post.params.request.headers).filter(([k]) => !/^host$|^content-length$/i.test(k))), body: post.params.request.postData, redirect: "manual" });
    await r.text().catch(() => "");
    ok((await prisma.user.count()) === 1, `phát lại POST setup -> vẫn đúng 1 user (HTTP ${r.status})`);
  }

  /* ---- 6. Đăng ký khách thường + đăng nhập lại bằng admin vừa tạo ---- */
  await send("Network.clearBrowserCookies");
  await send("Network.setCookie", { name: "smmv2-lang", value: "vi", url: BASE + "/", path: "/" });
  await navigate(`${BASE}/register`, 3000);
  const regUrl0 = await evaluate(`location.href`);
  ok(regUrl0.includes("/register"), `trang đăng ký không còn bị cổng setup chặn: ${regUrl0}`);
  await fillAndSubmit(`set('username','khach1'); set('email','khach1@example.com'); set('password','Khach@123'); set('confirmPassword','Khach@123'); (() => { const t = document.querySelector('input[name="terms"]'); if (t && !t.checked) t.click(); })();`);
  await sleep(4000);
  const regUrl = await evaluate(`location.href`);
  const khach = await prisma.user.findUnique({ where: { username: "khach1" }, select: { role: true } });
  ok(!!khach && khach.role === "USER" && !regUrl.includes("/register"), `đăng ký khách thường thành công (role USER), rời trang đăng ký: ${regUrl}`);
  await send("Network.clearBrowserCookies");
  await send("Network.setCookie", { name: "smmv2-lang", value: "vi", url: BASE + "/", path: "/" });
  await navigate(`${BASE}/login`, 3000);
  await fillAndSubmit(`set('login','boss'); set('password','Setup@123');`);
  await sleep(4000);
  const loginUrl = await evaluate(`location.href`);
  ok(loginUrl.includes("/admin"), `đăng nhập lại bằng admin vừa tạo -> ${loginUrl}`);

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAIL`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(async () => {
  try { chrome.kill(); } catch { /* */ }
  await prisma.$disconnect().catch(() => {});
});
