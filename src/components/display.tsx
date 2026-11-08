"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ACCENTS } from "@/components/theme";
import { LANGS, CURRENCIES, FONTS, FSIZES, LOCALES } from "@/lib/i18n";
import { useLang } from "@/components/lang";

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
  // Cookie là nguồn để SERVER render đúng ngôn ngữ + tiền tệ ngay từ khung hình đầu tiên.
  try { document.cookie = `smmv2-lang=${p.lang}; path=/; max-age=31536000; samesite=lax`; } catch {}
  try { document.cookie = `smmv2-cur=${p.cur}; path=/; max-age=31536000; samesite=lax`; } catch {}
  window.dispatchEvent(new Event("smmv2-display"));
}

const GearIcon = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3.2" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.51 1.7 1.7 0 0 0 1.87-.34l.06.06A1.7 1.7 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.23.6.85 1 1.51 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z" /></svg>
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
  const { t } = useLang();
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
  const set = (patch: Partial<Prefs>) => { const p = { ...prefs, ...patch }; setPrefs(p); applyPrefs(p); if (patch.lang || patch.cur) router.refresh(); };
  const cur = ACCENTS.find((a) => a.key === prefs.accent) || ACCENTS[0];
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} title={t("Cài đặt hiển thị")}
        className={`flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs font-semibold transition ${tone === "dark" ? "bg-white/10 border-white/15 text-white hover:bg-white/20" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
        <span className="w-4 h-4 rounded-full border border-white/60 shadow-inner" style={{ background: cur.hex }} />
        <span className="hidden xl:inline">{t("Cài đặt")}</span>
        {GearIcon}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="fixed inset-x-3 top-[76px] z-50 card p-4 text-left max-h-[80vh] overflow-y-auto sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-[300px]">
            <div className="font-bold text-slate-900 mb-3">{t("Cài đặt hiển thị")}</div>
            <div className="space-y-4">
              <div><Label>{t("Chế độ")}</Label><Seg options={[{ key: "light", name: t("Sáng") }, { key: "dark", name: t("Tối") }]} value={prefs.mode} onPick={(k) => set({ mode: k })} /></div>
              <div>
                <Label>{t("Màu chủ đạo")}</Label>
                <div className="flex flex-wrap gap-2">
                  {ACCENTS.map((a) => (
                    <button key={a.key} type="button" title={a.name} onClick={() => set({ accent: a.key })} className={`w-8 h-8 rounded-full transition ${prefs.accent === a.key ? "ring-2 ring-offset-2 ring-slate-800 scale-110" : "hover:scale-110"}`} style={{ background: a.hex }} />
                  ))}
                </div>
              </div>
              <div><Label>{t("Hướng hiển thị")}</Label><Seg options={[{ key: "ltr", name: "LTR" }, { key: "rtl", name: "RTL" }]} value={prefs.dir} onPick={(k) => set({ dir: k })} /></div>
              <div><Label>{t("Font chữ")}</Label><Seg options={FONTS.map((f) => ({ key: f.key, name: t(f.name) }))} value={prefs.font} onPick={(k) => set({ font: k })} /></div>
              <div><Label>{t("Cỡ chữ")}</Label><Seg options={FSIZES.map((f) => ({ key: f.key, name: t(f.name) }))} value={prefs.fsize} onPick={(k) => set({ fsize: k })} /></div>
              <div><Label>{t("Ngôn ngữ")}</Label><Seg options={LANGS.filter((l) => !cfg || cfg.enabled.includes(l.key)).map((l) => ({ key: l.key, name: l.name }))} value={cfg && !cfg.enabled.includes(prefs.lang) ? cfg.defaultLang : prefs.lang} onPick={(k) => set({ lang: k })} /></div>
              <div><Label>{t("Tiền tệ")}</Label><Seg options={CURRENCIES.map((c) => ({ key: c.key, name: c.name }))} value={prefs.cur} onPick={(k) => set({ cur: k })} /></div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Ngày hiện tại định dạng theo ngôn ngữ người dùng đã chọn (lấy từ ngữ cảnh render). */
export function TodayText() {
  const { lang } = useLang();
  const [txt, setTxt] = useState("");
  useEffect(() => {
    const loc = LOCALES[lang] || "en-US";
    setTxt(new Intl.DateTimeFormat(loc, { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date()));
  }, [lang]);
  return <>{txt}</>;
}

/* ================= Đồng bộ tuỳ chọn hiển thị =================
 * KIẾN TRÚC MỚI: giao diện được dịch + định dạng tiền TẠI LÚC RENDER (server qua
 * getServerI18n, client qua LangProvider/useLang) — component này KHÔNG còn quét
 * hay ghi đè nút chữ trong DOM nữa. Việc còn lại duy nhất: áp thuộc tính hiển thị
 * (màu/nền/hướng/font) và đồng bộ cookie smmv2-lang / smmv2-cur từ lựa chọn đã lưu
 * ở localStorage để lần render sau của server khớp lựa chọn; lệch thì refresh 1 lần. */
export function DisplayEngine() {
  const router = useRouter();
  useEffect(() => {
    try {
      const p = effectivePrefs();
      const mLang = document.cookie.match(/(?:^|; )smmv2-lang=([^;]*)/);
      const mCur = document.cookie.match(/(?:^|; )smmv2-cur=([^;]*)/);
      const cookieLang = mLang ? decodeURIComponent(mLang[1]) : null;
      const cookieCur = mCur ? decodeURIComponent(mCur[1]) : null;
      applyPrefs(p);
      if ((cookieLang !== p.lang || cookieCur !== p.cur) && !sessionStorage.getItem("smmv2-lang-sync")) {
        sessionStorage.setItem("smmv2-lang-sync", "1");
        router.refresh();
      } else {
        document.documentElement.removeAttribute("data-i18n-pending");
      }
    } catch {
      try { document.documentElement.removeAttribute("data-i18n-pending"); } catch { /* bỏ qua */ }
    }
  }, []);
  return null;
}
