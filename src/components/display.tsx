"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ACCENTS } from "@/components/theme";
import { DICT, LANGS, CURRENCIES, FONTS, FSIZES, FRAGMENTS } from "@/lib/i18n";

/* ================= Tuỳ chọn hiển thị (lưu trên máy khách) ================= */
export type Prefs = { accent: string; mode: string; dir: string; font: string; fsize: string; lang: string; cur: string };
const DEF: Prefs = { accent: "blue", mode: "light", dir: "ltr", font: "default", fsize: "md", lang: "en", cur: "VND" };
const KEYS: Record<keyof Prefs, string> = { accent: "smmv2-accent", mode: "smmv2-mode", dir: "smmv2-dir", font: "smmv2-font", fsize: "smmv2-fsize", lang: "smmv2-lang", cur: "smmv2-cur" };

export function readPrefs(): Prefs {
  try {
    const p = { ...DEF };
    (Object.keys(KEYS) as (keyof Prefs)[]).forEach((k) => { const v = localStorage.getItem(KEYS[k]); if (v) p[k] = v; });
    return p;
  } catch { return DEF; }
}

/* ===== Cấu hình ngôn ngữ do server cấu hình (Admin → Ngôn ngữ), tiêm sẵn vào trang
 * qua window.__LANGCFG__ và làm mới qua /api/display-config: ngôn ngữ đang bật,
 * ngôn ngữ mặc định cho khách mới, bản dịch tuỳ chỉnh (đã hợp nhất mẹ -> panel). ===== */
export type LangCfg = { enabled: string[]; defaultLang: string; overrides: Record<string, Record<string, string>> };
let langCfgCache: LangCfg | null = null;
export function readLangCfg(): LangCfg | null {
  if (langCfgCache) return langCfgCache;
  try {
    const g = (window as unknown as { __LANGCFG__?: LangCfg }).__LANGCFG__;
    if (g && Array.isArray(g.enabled) && g.enabled.length) langCfgCache = { enabled: g.enabled, defaultLang: g.defaultLang || "en", overrides: g.overrides || {} };
  } catch { /* chưa tiêm */ }
  return langCfgCache;
}
export function setLangCfg(c: LangCfg | null) { if (c && Array.isArray(c.enabled) && c.enabled.length) langCfgCache = c; }

/** Tuỳ chọn hiệu lực: khách CHƯA từng chọn ngôn ngữ -> dùng ngôn ngữ mặc định của site;
 *  ngôn ngữ đã chọn bị tắt -> rơi về mặc định. */
export function effectivePrefs(): Prefs {
  const p = readPrefs();
  const cfg = readLangCfg();
  if (cfg) {
    let stored: string | null = null;
    try { stored = localStorage.getItem(KEYS.lang); } catch { /* bỏ qua */ }
    if (!stored) p.lang = cfg.defaultLang;
    else if (!cfg.enabled.includes(p.lang)) p.lang = cfg.defaultLang;
  }
  return p;
}
export function applyPrefs(p: Prefs) {
  const h = document.documentElement;
  h.setAttribute("data-accent", p.accent);
  h.classList.toggle("dark", p.mode === "dark");
  h.setAttribute("dir", p.dir);
  h.setAttribute("data-font", p.font);
  h.setAttribute("data-fsize", p.fsize);
  h.setAttribute("lang", p.lang);
  try { (Object.keys(KEYS) as (keyof Prefs)[]).forEach((k) => localStorage.setItem(KEYS[k], p[k])); } catch {}
  try { document.cookie = `smmv2-lang=${p.lang}; path=/; max-age=31536000; samesite=lax`; } catch {}
  window.dispatchEvent(new Event("smmv2-display"));
}

const GearIcon = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3.2" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.51 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.23.6.85 1 1.51 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z" /></svg>
);

function Seg({ options, value, onPick }: { options: { key: string; name: string }[]; value: string; onPick: (k: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o.key} type="button" onClick={() => onPick(o.key)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${value === o.key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{o.name}</button>
      ))}
    </div>
  );
}
const Label = ({ children }: { children: React.ReactNode }) => <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">{children}</div>;

/** Nút Cài đặt hiển thị — gộp: sáng/tối, màu chủ đạo, LTR/RTL, font, cỡ chữ, ngôn ngữ, tiền tệ */
export function DisplaySettings({ tone = "light" }: { tone?: "light" | "dark" }) {
  const router = useRouter();
  const [prefs, setPrefs] = useState<Prefs>(DEF);
  const [open, setOpen] = useState(false);
  const [cfg, setCfgState] = useState<LangCfg | null>(null);
  useEffect(() => {
    setPrefs(effectivePrefs());
    const c = readLangCfg();
    if (c) setCfgState(c);
    else fetch("/api/display-config", { cache: "no-store" }).then((r) => r.json()).then((j) => {
      if (Array.isArray(j?.langsEnabled)) { const nc = { enabled: j.langsEnabled, defaultLang: j.defaultLang || "en", overrides: j.overrides || {} }; setLangCfg(nc); setCfgState(nc); setPrefs(effectivePrefs()); }
    }).catch(() => {});
  }, []);
  const set = (patch: Partial<Prefs>) => { const p = { ...prefs, ...patch }; setPrefs(p); applyPrefs(p); if (patch.lang) router.refresh(); };
  const cur = ACCENTS.find((a) => a.key === prefs.accent) || ACCENTS[0];
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} title="Cài đặt hiển thị"
        className={`flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs font-semibold transition ${tone === "dark" ? "bg-white/10 border-white/15 text-white hover:bg-white/20" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
        <span className="w-4 h-4 rounded-full border border-white/60 shadow-inner" style={{ background: cur.hex }} />
        <span className="hidden xl:inline">Cài đặt</span>
        {GearIcon}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="fixed inset-x-3 top-[76px] z-50 card p-4 text-left max-h-[80vh] overflow-y-auto sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-[300px]">
            <div className="font-bold text-slate-900 mb-3">Cài đặt hiển thị</div>
            <div className="space-y-4">
              <div><Label>Chế độ</Label><Seg options={[{ key: "light", name: "Sáng" }, { key: "dark", name: "Tối" }]} value={prefs.mode} onPick={(k) => set({ mode: k })} /></div>
              <div>
                <Label>Màu chủ đạo</Label>
                <div className="flex flex-wrap gap-2">
                  {ACCENTS.map((a) => (
                    <button key={a.key} type="button" title={a.name} onClick={() => set({ accent: a.key })} className={`w-8 h-8 rounded-full transition ${prefs.accent === a.key ? "ring-2 ring-offset-2 ring-slate-800 scale-110" : "hover:scale-110"}`} style={{ background: a.hex }} />
                  ))}
                </div>
              </div>
              <div><Label>Hướng hiển thị</Label><Seg options={[{ key: "ltr", name: "LTR" }, { key: "rtl", name: "RTL" }]} value={prefs.dir} onPick={(k) => set({ dir: k })} /></div>
              <div><Label>Font chữ</Label><Seg options={FONTS.map((f) => ({ key: f.key, name: f.name }))} value={prefs.font} onPick={(k) => set({ font: k })} /></div>
              <div><Label>Cỡ chữ</Label><Seg options={FSIZES.map((f) => ({ key: f.key, name: f.name }))} value={prefs.fsize} onPick={(k) => set({ fsize: k })} /></div>
              <div><Label>Ngôn ngữ</Label><Seg options={LANGS.filter((l) => !cfg || cfg.enabled.includes(l.key)).map((l) => ({ key: l.key, name: l.name }))} value={cfg && !cfg.enabled.includes(prefs.lang) ? cfg.defaultLang : prefs.lang} onPick={(k) => set({ lang: k })} /></div>
              <div><Label>Tiền tệ</Label><Seg options={CURRENCIES.map((c) => ({ key: c.key, name: c.name }))} value={prefs.cur} onPick={(k) => set({ cur: k })} /></div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ================= Lớp hiển thị: dịch giao diện + quy đổi tiền tệ tại chỗ ================= */
const SKIP = new Set(["SCRIPT", "STYLE", "CODE", "PRE", "TEXTAREA", "NOSCRIPT"]);
const MONEY = /(\d{1,3}(?:\.\d{3})+|\d+)đ/g;
const LOCALES: Record<string, string> = { vi: "vi-VN", en: "en-US", zh: "zh-CN", th: "th-TH", ja: "ja-JP", ko: "ko-KR" };
const originals = new Map<Text, string>();
const written = new Map<Text, string>();
const phOriginals = new Map<Element, string>();
const phWritten = new Map<Element, string>();
const ttOriginals = new Map<Element, string>();
const ttWritten = new Map<Element, string>();
let applying = false;

function fmtMoney(vndInt: number, cur: string, lang: string) {
  const c = CURRENCIES.find((x) => x.key === cur);
  if (!c) return null;
  const val = vndInt / c.rate;
  const zero = cur === "JPY" || cur === "KRW";
  return new Intl.NumberFormat(LOCALES[lang] || "en-US", { style: "currency", currency: cur, minimumFractionDigits: zero ? 0 : undefined, maximumFractionDigits: zero ? 0 : 2 }).format(val);
}

/* Chỉ mục ngược theo ngôn ngữ: bản dịch -> chuỗi tiếng Việt gốc, để nhận diện các
 * chuỗi server đã dịch sẵn bằng tr() rồi áp bản dịch tuỳ chỉnh lên trên. */
const revIndexes = new Map<string, Map<string, string>>();
function revIndex(lang: string): Map<string, string> {
  let m = revIndexes.get(lang);
  if (!m) {
    m = new Map<string, string>();
    for (const [k, v] of Object.entries(DICT)) {
      const t = (v as unknown as Record<string, string>)[lang];
      if (t && !m.has(t)) m.set(t, k);
    }
    revIndexes.set(lang, m);
  }
  return m;
}

function runDisplay() {
  if (applying || typeof document === "undefined" || !document.body) return;
  const p = effectivePrefs();
  const ovAll = readLangCfg()?.overrides;
  const ov = ovAll?.[p.lang];
  applying = true;
  try {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        let el = node.parentElement;
        while (el) { if (SKIP.has(el.tagName) || el.hasAttribute("data-nodisplay")) return NodeFilter.FILTER_REJECT; el = el.parentElement; }
        return node.nodeValue && node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    for (const n of nodes) {
      // Nếu nội dung hiện tại khác lần cuối chính lớp hiển thị ghi -> React vừa cập nhật giá trị mới:
      // lấy nó làm nguồn mới (tránh "đóng băng" các con số động như xem trước số tiền, số dư...)
      if (!originals.has(n) || (written.has(n) && n.nodeValue !== written.get(n))) originals.set(n, n.nodeValue || "");
      const src = originals.get(n)!;
      let out = src;
      if (p.lang !== "vi") {
        const t = src.trim();
        const dictTr = (DICT[t] as any)?.[p.lang];
        const ovTr = ov?.[t];
        if (ovTr) out = src.replace(t, ovTr);
        else if (dictTr) out = src.replace(t, dictTr);
        else {
          // Chuỗi server đã dịch sẵn bằng tr(): tra ngược về chuỗi gốc để áp tuỳ chỉnh.
          const k2 = ov ? revIndex(p.lang).get(t) : undefined;
          if (k2 && ov?.[k2]) out = src.replace(t, ov[k2]);
          // Mảnh ghép chỉ áp cho dòng CÓ SỐ (đơn giá/số lượng/còn lại...) — áp vào câu văn xuôi
          // sẽ sinh lẫn ngôn ngữ kiểu "Updated dữ liệu", "Bắt đầu" -> "Start ngay hôm nay", "mục tiêu" -> "items tiêu".
          else if (/\d/.test(out)) for (const [frag, map] of FRAGMENTS) { const r = map[p.lang]; if (r && out.includes(frag)) out = out.split(frag).join(r); }
        }
      }
      if (p.cur !== "VND") {
        out = out.replace(MONEY, (m, num: string) => fmtMoney(parseInt(num.replace(/\./g, ""), 10), p.cur, p.lang) ?? m);
      }
      if (out !== n.nodeValue) n.nodeValue = out;
      written.set(n, out);
    }
    // placeholder của ô nhập
    document.querySelectorAll("input[placeholder], textarea[placeholder]").forEach((el) => {
      if (!phOriginals.has(el) || (phWritten.has(el) && el.getAttribute("placeholder") !== phWritten.get(el))) phOriginals.set(el, el.getAttribute("placeholder") || "");
      const src = phOriginals.get(el)!;
      let out = src;
      if (p.lang !== "vi") {
        const key = src.trim();
        const o = ov?.[key];
        const tr = (DICT[key] as any)?.[p.lang];
        if (o) out = o;
        else if (tr) out = tr;
        else if (ov) { const k2 = revIndex(p.lang).get(key); if (k2 && ov[k2]) out = ov[k2]; }
      }
      if (out === src && p.lang !== "vi" && /\d/.test(src)) {
        // placeholder ghép có số (vd "Đang dùng của web mẹ: 165") — áp mảnh câu như node chữ
        let f = src;
        for (const [frag, map] of FRAGMENTS) { const r = map[p.lang]; if (r && f.includes(frag)) f = f.split(frag).join(r); }
        out = f;
      }
      if (out !== el.getAttribute("placeholder")) el.setAttribute("placeholder", out);
      phWritten.set(el, out);
    });
    // title (chú thích khi di chuột) của nút/ô nhập — vd nút Cài đặt hiển thị, thanh công cụ soạn thảo
    document.querySelectorAll("[title]").forEach((el) => {
      if (!ttOriginals.has(el) || (ttWritten.has(el) && el.getAttribute("title") !== ttWritten.get(el))) ttOriginals.set(el, el.getAttribute("title") || "");
      const src = ttOriginals.get(el)!;
      let out = src;
      if (p.lang !== "vi") {
        const key = src.trim();
        const o = ov?.[key];
        const tr = (DICT[key] as any)?.[p.lang];
        if (o) out = o;
        else if (tr) out = tr;
        else if (ov) { const k2 = revIndex(p.lang).get(key); if (k2 && ov[k2]) out = ov[k2]; }
      }
      if (out !== el.getAttribute("title")) el.setAttribute("title", out);
      ttWritten.set(el, out);
    });
    // dọn node đã rời khỏi trang
    for (const k of Array.from(originals.keys())) if (!k.isConnected) { originals.delete(k); written.delete(k); }
    try { document.documentElement.removeAttribute("data-i18n-pending"); } catch {}
  } finally { applying = false; }
}

/** Ngày hiện tại định dạng theo ngôn ngữ người dùng đã chọn (server không biết lựa chọn này). */
export function TodayText() {
  const [txt, setTxt] = useState("");
  useEffect(() => {
    const lang = readPrefs().lang || "en";
    const loc = LOCALES[lang] || "en-US";
    setTxt(new Intl.DateTimeFormat(loc, { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date()));
  }, []);
  return <>{txt}</>;
}

export function DisplayEngine() {
  const router = useRouter();
  useEffect(() => {
    // Đồng bộ cookie ngôn ngữ cho phần render phía server (menu 3 khu vực dịch
    // bằng cookie smmv2-lang): lựa chọn của khách nằm ở localStorage, cookie
    // thiếu/khác -> ghi lại rồi refresh ĐÚNG 1 lần để menu hiện đúng ngôn ngữ
    // đã chọn (cờ sessionStorage chống vòng lặp khi trình duyệt chặn cookie).
    try {
      const p = effectivePrefs();
      const m = document.cookie.match(/(?:^|; )smmv2-lang=([^;]*)/);
      const cookieLang = m ? decodeURIComponent(m[1]) : null;
      applyPrefs(p);
      if (cookieLang !== p.lang && !sessionStorage.getItem("smmv2-lang-sync")) {
        sessionStorage.setItem("smmv2-lang-sync", "1");
        router.refresh();
      }
    } catch {}
    // Nạp tỉ giá + cấu hình ngôn ngữ admin đã cấu hình (mặc định dùng bộ sẵn trong code)
    fetch("/api/display-config", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        let changed = false;
        if (j?.rates) {
          for (const c of CURRENCIES) {
            const v = parseFloat(j.rates[c.key]);
            if (v > 0) c.rate = v;
          }
          changed = true;
        }
        if (Array.isArray(j?.langsEnabled) && j.langsEnabled.length) {
          setLangCfg({ enabled: j.langsEnabled, defaultLang: j.defaultLang || "en", overrides: j.overrides || {} });
          changed = true;
        }
        if (changed) runDisplay();
      })
      .catch(() => {});
    let raf = 0;
    // Dịch NGAY trong khung hình kế tiếp (trước khi vẽ) thay vì chờ 100ms -> mắt không kịp thấy bản gốc
    const schedule = () => { if (!applying && !raf) raf = requestAnimationFrame(() => { raf = 0; runDisplay(); }); };
    runDisplay();
    const ob = new MutationObserver(schedule);
    ob.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener("smmv2-display", runDisplay);
    return () => { ob.disconnect(); window.removeEventListener("smmv2-display", runDisplay); if (raf) cancelAnimationFrame(raf); };
  }, []);
  return null;
}
