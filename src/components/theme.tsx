"use client";
import { useEffect, useState } from "react";
import { useLang } from "@/components/lang";

export const ACCENTS: { key: string; name: string; hex: string }[] = [
  { key: "blue", name: "Xanh dương", hex: "#4680ff" },
  { key: "violet", name: "Tím", hex: "#7c3aed" },
  { key: "emerald", name: "Xanh lá", hex: "#059669" },
  { key: "orange", name: "Cam", hex: "#ea580c" },
  { key: "rose", name: "Hồng", hex: "#e11d48" },
  { key: "teal", name: "Ngọc", hex: "#0d9488" },
];

const SunIcon = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
);
const MoonIcon = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>
);

/** Bộ đổi giao diện: 6 tông màu + sáng/tối. Lựa chọn lưu trên máy khách. */
export function ThemePicker({ tone = "light" }: { tone?: "light" | "dark" }) {
  const { t } = useLang();
  const [accent, setAccent] = useState<string>("blue");
  const [dark, setDark] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const h = document.documentElement;
    setAccent(h.getAttribute("data-accent") || "blue");
    setDark(h.classList.contains("dark"));
  }, []);

  function pick(key: string) {
    document.documentElement.setAttribute("data-accent", key);
    try { localStorage.setItem("smmv2-accent", key); } catch {}
    setAccent(key);
  }
  function toggleMode() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("smmv2-mode", next ? "dark" : "light"); } catch {}
    setDark(next);
  }

  const current = ACCENTS.find((a) => a.key === accent) || ACCENTS[0];
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} title={t("Đổi giao diện")}
        className={`flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs font-semibold transition ${tone === "dark" ? "bg-white/10 border-white/15 text-white hover:bg-white/20" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
        <span className="w-4 h-4 rounded-full border border-white/60 shadow-inner" style={{ background: current.hex }} />
        <span className="hidden xl:inline">{t("Giao diện")}</span>
        {dark ? MoonIcon : SunIcon}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-50 w-60 card p-4 text-left">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2.5">{t("Màu chủ đạo")}</div>
            <div className="grid grid-cols-2 gap-1.5">
              {ACCENTS.map((a) => (
                <button key={a.key} type="button" onClick={() => pick(a.key)}
                  className={`flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-medium transition ${accent === a.key ? "bg-brand-50 text-brand-700 ring-1 ring-brand-500" : "text-slate-600 hover:bg-slate-50"}`}>
                  <span className="w-5 h-5 rounded-full shrink-0" style={{ background: a.hex }} />
                  {t(a.name)}
                </button>
              ))}
            </div>
            <div className="text-xs font-bold uppercase tracking-wide text-slate-400 mt-4 mb-2.5">{t("Chế độ nền")}</div>
            <div className="grid grid-cols-2 gap-1.5">
              <button type="button" onClick={() => dark && toggleMode()} className={`flex items-center justify-center gap-2 rounded-xl px-2.5 py-2 text-sm font-medium ${!dark ? "bg-brand-50 text-brand-700 ring-1 ring-brand-500" : "text-slate-600 hover:bg-slate-50"}`}>{SunIcon} {t("Sáng")}</button>
              <button type="button" onClick={() => !dark && toggleMode()} className={`flex items-center justify-center gap-2 rounded-xl px-2.5 py-2 text-sm font-medium ${dark ? "bg-brand-50 text-brand-700 ring-1 ring-brand-500" : "text-slate-600 hover:bg-slate-50"}`}>{MoonIcon} {t("Tối")}</button>
            </div>
            <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">{t("Giao diện được lưu trên thiết bị này và áp dụng cho mọi trang.")}</p>
          </div>
        </>
      )}
    </div>
  );
}
