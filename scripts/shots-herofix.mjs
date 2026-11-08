// Kiểm chứng đợt sửa hero (chiều cao về 300/380/470, giữ full-bleed) +
// bộ lọc Game Key trên PC (ô tìm tối đa 400px, select 210px).
// node scripts/shots-herofix.mjs
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

const BASE = "http://127.0.0.1:3000";
const OUT = "/home/hatch/workspace/smm-anh";
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

const CHROME = "/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome";
const PORT = 9373;
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars", `--remote-debugging-port=${PORT}`, "--window-size=1440,1000", "about:blank"], { stdio: "ignore" });
process.on("exit", () => { try { chrome.kill("SIGKILL"); } catch {} });
await sleep(1600);
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } };
const cmd = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expr) => { const r = await cmd("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result?.value; };
await cmd("Page.enable"); await cmd("Runtime.enable");
async function viewport(w, h) { await cmd("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 }); }
async function navigate(url, wait = 2800) { await cmd("Page.navigate", { url }); await sleep(wait); }
async function shot(name) { const r = await cmd("Page.captureScreenshot", { format: "png" }); writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64")); console.log("SHOT", name); }

const heroInfo = () => evaluate(`(() => {
  const hero = [...document.querySelectorAll('section')].find((s) => s.querySelector('h1'));
  if (!hero) return null;
  const r = hero.getBoundingClientRect();
  return { x: Math.round(r.x), width: Math.round(r.width), height: Math.round(r.height), vw: innerWidth,
    docScrollW: document.documentElement.scrollWidth, hScroll: document.documentElement.scrollWidth > innerWidth };
})()`);

// --- HERO desktop ---
await viewport(1440, 1000);
await navigate(`${BASE}/`, 3200);
console.log("HERO DESKTOP:", JSON.stringify(await heroInfo()));
await shot("2026-11-08-herofix-desktop");
// --- HERO mobile ---
await viewport(390, 844);
await navigate(`${BASE}/`, 3200);
console.log("HERO MOBILE:", JSON.stringify(await heroInfo()));
await shot("2026-11-08-herofix-390");

// --- GAME KEY FILTER ---
await evaluate(`document.cookie = 'smmv2_session=${demoToken}; path=/'; document.cookie = 'smmv2-lang=vi; path=/'; 'ok'`);
const filterInfo = () => evaluate(`(() => {
  const form = document.querySelector('form');
  const q = document.querySelector('input[name="q"]');
  const p = document.querySelector('select[name="platform"]');
  const r = document.querySelector('select[name="region"]');
  const favBtn = form ? [...form.querySelectorAll('button')].find((b) => b.title && b.title.length > 0) : null;
  const W = (el) => el ? Math.round(el.getBoundingClientRect().width) : null;
  const card = form ? Math.round(form.getBoundingClientRect().width) : null;
  return { cardW: card, search: W(q), platform: W(p), region: W(r), fav: W(favBtn), vw: innerWidth };
})()`);
await viewport(1440, 1000);
await navigate(`${BASE}/dashboard/game-key`, 3200);
console.log("GK FILTER DESKTOP:", JSON.stringify(await filterInfo()));
await shot("2026-11-08-gkfilter-desktop");
await viewport(390, 844);
await navigate(`${BASE}/dashboard/game-key`, 3200);
console.log("GK FILTER MOBILE:", JSON.stringify(await filterInfo()));
await shot("2026-11-08-gkfilter-mobile");
ws.close(); chrome.kill("SIGKILL");
process.exit(0);
