/** Đợt cân đối bộ lọc + sao yêu thích (2026-11-08):
 *  mode "before": spawn mock FZR + seed fixture (gamekey/giftcard/topup),
 *    đo kích thước mọi thanh tìm kiếm/lọc trên các trang mới (khách + admin)
 *    ở viewport 1440, in JSON.
 *  mode "after": đo lại + chụp ảnh 2026-11-08-filterbalance-*.png + kiểm
 *    chức năng sao yêu thích (lọc sao ở catalog Top-Up, sao ở chi tiết Game
 *    Key bền qua localStorage) -> dọn fixture, khôi phục demo.
 *  Chạy: node scripts/measure-filterbalance.mjs before|after */
import { spawn, execSync } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

const MODE = process.argv[2] || "before";
const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });
let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const envRaw = readFileSync("/home/hatch/workspace/smmv2/.env", "utf8");
const envVal = (k) => {
  let v = (envRaw.split("\n").find((l) => l.startsWith(k)) || "").split("=").slice(1).join("=").trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v;
};
process.env.DATABASE_URL = envVal("DATABASE_URL");
process.env.PRISMA_QUERY_ENGINE_LIBRARY = "/home/hatch/workspace/smmv2/node_modules/@prisma/engines/libquery_engine-debian-openssl-3.0.x.so.node";
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

const secret = envVal("AUTH_SECRET");
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const mint = (claims) => {
  const u = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sv: 0, iat: now, exp: now + 3600, ...claims })}`;
  return `${u}.${createHmac("sha256", secret).update(u).digest("base64url")}`;
};
const demoToken = mint({ uid: 2, role: "USER", username: "demo" });
const adminToken = mint({ uid: 1, role: "ADMIN", username: "admin", amr: "passkey" });

const TSX_ENV = {
  ...process.env,
  PRISMA_QUERY_ENGINE_LIBRARY: process.env.PRISMA_QUERY_ENGINE_LIBRARY,
  PRISMA_SCHEMA_ENGINE_BINARY: "/home/hatch/workspace/smmv2/node_modules/@prisma/engines/schema-engine-debian-openssl-3.0.x",
};
const fixture = (file, args) => execSync(`npx tsx scripts/${file} ${args}`, { cwd: "/home/hatch/workspace/smmv2", env: TSX_ENV, stdio: "pipe" }).toString();

let mock = null;
async function startMock() {
  mock = spawn("node", ["scripts/mock-fzr.mjs"], { cwd: "/home/hatch/workspace/smmv2", stdio: "ignore" });
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch("http://127.0.0.1:3998/__log"); if (r.ok) return; } catch {}
    await sleep(300);
  }
  throw new Error("mock không lên");
}

const chrome = spawn("/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--remote-debugging-port=9373", "--window-size=1440,1100",
  "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
  "about:blank",
], { stdio: "ignore" });
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:9373/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch {}
    await sleep(200);
  }
  throw new Error("chrome CDP không lên");
}
let msgId = 0;
const pending = new Map();
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
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || "eval error");
  return r.result?.value;
}
async function navigate(url, waitMs = 3000) { await send("Page.navigate", { url }); await sleep(waitMs); }
async function capture(name) {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name);
}
async function setSession(token) {
  await navigate(`${BASE}/`);
  await evaluate(`document.cookie = 'smmv2_session=${token}; path=/'; document.cookie = 'smmv2-lang=vi; path=/'; try { localStorage.setItem('smmv2-lang', 'vi'); } catch(e) {} 'set'`);
}

/* JS đo: trả về rect {x,y,w,h} cho từng phần tử được mô tả bằng hàm tìm. */
const RECT = `const R = (el) => el ? (() => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })() : null;`;
const byText = (tag, txt) => `[...document.querySelectorAll('${tag}')].find((e) => e.textContent.trim() === '${txt}')`;

const MEASURES = [
  {
    name: "customer /dashboard/game-key (THAM CHIẾU đã duyệt)",
    url: "/dashboard/game-key", sess: "demo",
    js: `(() => { ${RECT}
      const form = document.querySelector('form.card');
      return {
        form: R(form),
        block: R(form?.querySelector(':scope > div:last-of-type')),
        search: R(form?.querySelector('input[name="q"]')),
        starBtn: R(form?.querySelector('button[title]')),
        selPlatform: R(form?.querySelector('select[name="platform"]')),
        selRegion: R(form?.querySelector('select[name="region"]')),
        filterBtn: R(${byText("button", "Lọc")}),
      }; })()`,
  },
  {
    name: "customer /dashboard/gift-card?q=Fixture (có Xoá lọc)",
    url: "/dashboard/gift-card?q=Fixture", sess: "demo",
    js: `(() => { ${RECT}
      const form = document.querySelector('form.card');
      const labelRow = form?.querySelector(':scope > div:first-of-type');
      return {
        form: R(form),
        block: R(form?.querySelector(':scope > div:last-of-type')),
        labelLeft: R(labelRow?.children[0]),
        labelFav: R(labelRow?.children[1]),
        search: R(form?.querySelector('input[name="q"]')),
        starBtn: R(form?.querySelector('button[title]')),
        clearLink: R(${byText("a", "Xoá lọc")}),
      }; })()`,
  },
  {
    name: "customer /dashboard/top-up?q=Fixture (có Xoá lọc)",
    url: "/dashboard/top-up?q=Fixture", sess: "demo",
    js: `(() => { ${RECT}
      const form = document.querySelector('form.card');
      const labelRow = form?.querySelector(':scope > div:first-of-type');
      return {
        form: R(form),
        block: R(form?.querySelector(':scope > div:last-of-type')),
        labelLeft: R(labelRow?.children[0]),
        labelFav: R(labelRow?.children[1]),
        search: R(form?.querySelector('input[name="q"]')),
        starBtn: R(form?.querySelector('button[title]')),
        clearLink: R(${byText("a", "Xoá lọc")}),
      }; })()`,
  },
  {
    name: "customer /dashboard/game-key/don-hang (lịch sử — khung dùng chung)",
    url: "/dashboard/game-key/don-hang", sess: "demo",
    js: `(() => { ${RECT}
      const form = document.querySelector('form.card');
      return {
        form: R(form),
        search: R(form?.querySelector('input[name="q"]')),
        selStatus: R(form?.querySelector('select[name="status"]')),
        dateFrom: R(form?.querySelector('input[name="from"]')),
        dateTo: R(form?.querySelector('input[name="to"]')),
        filterBtn: R(${byText("button", "Lọc")}),
      }; })()`,
  },
  {
    name: "admin /admin/game-key/san-pham",
    url: "/admin/game-key/san-pham", sess: "admin",
    js: `(() => { ${RECT}
      const f = ${byText("button", "Tìm kiếm")}?.closest('form');
      return {
        form: R(f),
        search: R(f?.querySelector('input[name="q"]')),
        searchBtn: R(${byText("button", "Tìm kiếm")}),
      }; })()`,
  },
  {
    name: "admin /admin/gift-card/san-pham?q=Fixture (có Xoá lọc)",
    url: "/admin/gift-card/san-pham?q=Fixture", sess: "admin",
    js: `(() => { ${RECT}
      const f = ${byText("button", "Tìm kiếm")}?.closest('form');
      return {
        form: R(f),
        search: R(f?.querySelector('input[name="q"]')),
        searchBtn: R(${byText("button", "Tìm kiếm")}),
        clearLink: R(${byText("a", "Xoá lọc")}),
      }; })()`,
  },
  {
    name: "admin /admin/top-up/san-pham",
    url: "/admin/top-up/san-pham", sess: "admin",
    js: `(() => { ${RECT}
      const f = ${byText("button", "Tìm kiếm")}?.closest('form');
      return {
        form: R(f),
        search: R(f?.querySelector('input[name="q"]')),
        searchBtn: R(${byText("button", "Tìm kiếm")}),
      }; })()`,
  },
  {
    name: "admin /admin/steam/san-pham (ô tìm Game gift)",
    url: "/admin/steam/san-pham", sess: "admin",
    js: `(() => { ${RECT}
      const f = [...document.querySelectorAll('form')].find((x) => x.querySelector('input[name="gq"]'));
      return {
        form: R(f),
        search: R(f?.querySelector('input[name="gq"]')),
        searchBtn: R(f?.querySelector('button')),
      }; })()`,
  },
  {
    name: "admin /admin/premium",
    url: "/admin/premium", sess: "admin",
    js: `(() => { ${RECT}
      const f = document.querySelector('select[name="cat"]')?.closest('form');
      return {
        form: R(f),
        search: R(f?.querySelector('input[name="q"]')),
        selCat: R(f?.querySelector('select[name="cat"]')),
        selStatus: R(f?.querySelector('select[name="status"]')),
        searchBtn: R(f?.querySelector('button')),
      }; })()`,
  },
];

async function runMeasures() {
  const out = {};
  let curSess = null;
  for (const mItem of MEASURES) {
    if (curSess !== mItem.sess) { await setSession(mItem.sess === "admin" ? adminToken : demoToken); curSess = mItem.sess; }
    await navigate(`${BASE}${mItem.url}`, 3200);
    out[mItem.name] = await evaluate(mItem.js);
    console.log(`\n### ${mItem.name}`);
    console.log(JSON.stringify(out[mItem.name]));
  }
  return out;
}

async function main() {
  if (MODE === "before") {
    await startMock();
    console.log(fixture("fixture-gamekey.ts", "seed").trim().split("\n").pop());
    console.log(fixture("fixture-giftcard.ts", "seed").trim().split("\n").pop());
    console.log(fixture("fixture-topup.ts", "seed").trim().split("\n").pop());
  }
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
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });

  await runMeasures();

  if (MODE === "after") {
    /* ---- Ảnh kiểm chứng ---- */
    await setSession(demoToken);
    await navigate(`${BASE}/dashboard/game-key`, 3500);
    await capture("2026-11-08-filterbalance-gamekey");
    await navigate(`${BASE}/dashboard/gift-card`, 3500);
    await capture("2026-11-08-filterbalance-giftcard");
    await navigate(`${BASE}/dashboard/top-up`, 3500);
    await capture("2026-11-08-filterbalance-topup");
    await setSession(adminToken);
    await navigate(`${BASE}/admin/game-key/san-pham`, 4000);
    await capture("2026-11-08-filterbalance-admin1");
    await navigate(`${BASE}/admin/premium`, 4000);
    await capture("2026-11-08-filterbalance-admin2");

    /* ---- Chức năng sao: glyph là path sao I.star + fill đổi trạng thái ---- */
    await setSession(demoToken);
    const mlbb = await prisma.premiumProduct.findFirst({ where: { providerProductId: "tp-1" }, select: { id: true } });
    ok(!!mlbb, `fixture: có MLBB (#${mlbb?.id})`);
    // Chi tiết Top-Up: nút fav chứa đúng path sao của I.star; bấm -> fill currentColor; localStorage bền.
    await navigate(`${BASE}/dashboard/top-up/${mlbb.id}`, 3500);
    const starInfo1 = await evaluate(`(() => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('yêu thích'));
      const svg = b?.querySelector('svg'); const path = svg?.querySelector('path');
      return { found: !!b, d: path?.getAttribute('d') || '', fill: svg?.getAttribute('fill') || '' };
    })()`);
    ok(starInfo1.found && starInfo1.d.startsWith("M12 3.5l2.55"), `Top-Up chi tiết: nút yêu thích dùng path sao I.star (${starInfo1.d.slice(0, 20)}…)`);
    await evaluate(`[...document.querySelectorAll('button')].find((x) => x.textContent.includes('yêu thích'))?.click(); 'fav'`);
    await sleep(600);
    const starInfo2 = await evaluate(`(() => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('yêu thích'));
      const svg = b?.querySelector('svg');
      let stored = []; try { stored = JSON.parse(localStorage.getItem('smmv2-tu-fav-v1') || '[]'); } catch(e) {}
      return { fill: svg?.getAttribute('fill') || '', stored };
    })()`);
    ok(starInfo2.fill === "currentColor", `Top-Up chi tiết: sau khi lưu, sao TÔ ĐẦY (fill=${starInfo2.fill})`);
    ok(starInfo2.stored.includes(mlbb.id), `Top-Up chi tiết: localStorage smmv2-tu-fav-v1 chứa #${mlbb.id} (${JSON.stringify(starInfo2.stored)})`);
    // Catalog: bấm sao lọc -> chỉ còn MLBB
    await navigate(`${BASE}/dashboard/top-up`, 3500);
    await evaluate(`document.querySelector('form button[title]')?.click(); 'star'`);
    await sleep(3000);
    const tuCards = await evaluate(`[...document.querySelectorAll('a[href^="/dashboard/top-up/"]')].filter((a) => /^\\/dashboard\\/top-up\\/\\d+$/.test(a.getAttribute('href'))).length`);
    const tuTxt = await evaluate(`document.body.innerText`);
    ok(tuCards === 1 && tuTxt.includes("Mobile Legends"), `Top-Up catalog: lọc sao chỉ còn 1 thẻ MLBB (thấy ${tuCards})`);

    // Game Key chi tiết: sao phủ trên bìa — fill đổi + bền qua tải lại trang.
    const gk = await prisma.premiumProduct.findFirst({ where: { variants: { some: { providerGroup: "gamekeys" } } }, select: { id: true }, orderBy: { id: "asc" } });
    ok(!!gk, `fixture: có game Game Key (#${gk?.id})`);
    await navigate(`${BASE}/dashboard/game-key/${gk.id}`, 3500);
    const gkStar = () => evaluate(`(() => {
      const b = document.querySelector('button[aria-label="Yêu thích"]');
      const svg = b?.querySelector('svg'); const path = svg?.querySelector('path');
      let stored = []; try { stored = JSON.parse(localStorage.getItem('smmv2-gk-fav-v1') || '[]'); } catch(e) {}
      return { found: !!b, d: path?.getAttribute('d') || '', fill: svg?.getAttribute('fill') || '', stored };
    })()`);
    let g1 = await gkStar();
    if (g1.stored.includes(gk.id)) { await evaluate(`document.querySelector('button[aria-label="Yêu thích"]')?.click(); 'unfav'`); await sleep(500); g1 = await gkStar(); }
    ok(g1.found && g1.d.startsWith("M12 3.5l2.55"), "Game Key chi tiết: sao phủ bìa dùng path I.star");
    await evaluate(`document.querySelector('button[aria-label="Yêu thích"]')?.click(); 'fav'`);
    await sleep(500);
    const g2 = await gkStar();
    ok(g2.fill === "currentColor" && g2.stored.includes(gk.id), `Game Key chi tiết: sao tô đầy + lưu localStorage (${JSON.stringify(g2.stored)})`);
    await navigate(`${BASE}/dashboard/game-key/${gk.id}`, 3500);
    const g3 = await gkStar();
    ok(g3.fill === "currentColor", "Game Key chi tiết: tải lại trang sao VẪN tô đầy (bền qua localStorage)");

    console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAIL`);
  }
}

main()
  .catch((e) => { console.error("ERR", e); failures++; })
  .finally(async () => {
    if (MODE === "after") {
      try {
        if (!mock) await startMock();
        console.log(fixture("fixture-gamekey.ts", "clean").trim().split("\n").pop());
        console.log(fixture("fixture-giftcard.ts", "clean").trim().split("\n").pop());
        console.log(fixture("fixture-topup.ts", "clean").trim().split("\n").pop());
      } catch (e) { console.error("clean err", e); }
      const demo = await prisma.user.findFirst({ where: { username: "demo" } });
      const prods = await prisma.premiumProduct.count({ where: { panelId: null } });
      console.log(`sau clean: demo balance=${demo?.balance}, products=${prods}`);
    }
    await prisma.$disconnect();
    if (mock) mock.kill();
    chrome.kill();
    process.exit(failures ? 1 : 0);
  });
