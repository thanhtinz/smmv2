// Ảnh + đo hero trang chủ TRƯỚC/SAU full-bleed (TASK 2 fix10).
// node scripts/shots-herofull.mjs before|after
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const MODE = process.argv[2] || "after";
const BASE = "http://127.0.0.1:3000";
const CHROME = "/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome";
const PORT = 9371;
mkdirSync("/home/hatch/workspace/smm-anh", { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-sandbox", `--remote-debugging-port=${PORT}`, "--window-size=1440,1000", "about:blank"], { stdio: "ignore" });
process.on("exit", () => { try { chrome.kill("SIGKILL"); } catch {} });
await sleep(1500);
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
async function navigate(url, wait = 2600) { await cmd("Page.navigate", { url }); await sleep(wait); }
async function shot(name) {
  const r = await cmd("Page.captureScreenshot", { format: "png" });
  const dir = MODE === "before" ? "/tmp" : "/home/hatch/workspace/smm-anh";
  writeFileSync(`${dir}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("SHOT", name);
}
const heroInfo = () => evaluate(`(() => {
  const sec = document.querySelector('main section, section');
  const hero = [...document.querySelectorAll('section')].find((s) => s.querySelector('h1'));
  if (!hero) return null;
  const r = hero.getBoundingClientRect();
  return { x: Math.round(r.x), width: Math.round(r.width), height: Math.round(r.height), vw: innerWidth,
    docScrollW: document.documentElement.scrollWidth, hScroll: document.documentElement.scrollWidth > innerWidth };
})()`);

// Desktop
await viewport(1440, 1000);
await navigate(`${BASE}/`, 3200);
console.log("DESKTOP hero:", JSON.stringify(await heroInfo()));
await shot(MODE === "before" ? "herofull-before-desktop" : "2026-11-08-herofull-desktop");
if (MODE === "after") {
  // Tương tác: bấm mũi tên next -> slide/dot đổi
  const activeDot = () => evaluate(`(() => { const dots = [...document.querySelectorAll('button[aria-label^="Slide"]')]; return dots.findIndex((d) => d.className.includes('w-6')); })()`);
  const d0 = await activeDot();
  await evaluate(`(() => { const hero = [...document.querySelectorAll('section')].find((s) => s.querySelector('h1')); return [...hero.querySelectorAll('button')].find((b) => ['Trang sau', 'Next page'].includes(b.getAttribute('aria-label')))?.click(); })()`);
  await sleep(900);
  const d1 = await activeDot();
  console.log(d0 >= 0 && d1 >= 0 && d1 !== d0 ? `PASS  desktop: mũi tên next chuyển slide (dot ${d0} -> ${d1})` : `FAIL  desktop: dot không đổi (${d0} -> ${d1})`);
  // Tự chuyển (autoplay 5.5s)
  await sleep(6000);
  const d2 = await activeDot();
  console.log(d2 !== d1 ? `PASS  desktop: autoplay tự chuyển (dot ${d1} -> ${d2})` : `FAIL  desktop: autoplay không chạy (${d1} -> ${d2})`);
}
// Mobile
await viewport(390, 844);
await navigate(`${BASE}/`, 3200);
console.log("MOBILE hero:", JSON.stringify(await heroInfo()));
await shot(MODE === "before" ? "herofull-before-390" : "2026-11-08-herofull-390");
ws.close(); chrome.kill("SIGKILL");
process.exit(0);
