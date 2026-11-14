"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { I } from "@/components/ui";
import { useLang } from "@/components/lang";

export type AdminNavItem = { href: string; label: string; icon: string; badge?: number };
export type AdminNavEntry = AdminNavItem | { group: string; icon: string; children: AdminNavItem[] };

/** LUẬT HIGHLIGHT DUY NHẤT (lệnh Tín 2026-11-07 23:12): toàn menu admin
 *  chỉ MỘT lá được tô. Khớp đúng path thắng; nếu không, tiền tố dài nhất
 *  thắng (trang con tô lá tổ tiên gần nhất); "/admin" chỉ khớp đúng.
 *  Giữ nguyên khi rebuild giao diện theo mockup (2026-11-14). */
function leafScore(pathname: string, href: string): number {
  if (href === "/admin") return pathname === href ? 5000 + href.length : 0;
  if (pathname === href) return 5000 + href.length;
  if (pathname.startsWith(href + "/")) return 1000 + href.length;
  return 0;
}
function navWinner(entries: AdminNavEntry[], pathname: string): AdminNavItem | null {
  let best: AdminNavItem | null = null;
  let bestScore = 0;
  const consider = (it: AdminNavItem) => {
    const s = leafScore(pathname, it.href);
    if (s > bestScore) { bestScore = s; best = it; }
  };
  for (const e of entries) {
    if ("group" in e) e.children.forEach(consider);
    else consider(e);
  }
  return best;
}

/** Lá menu theo mockup đã duyệt: phẳng, icon xám, mục thắng = nền brand
 *  đặc + chữ trắng; badge = pill mềm (trên nền active thì trắng mờ). */
function Leaf({ it, active, onNavigate }: { it: AdminNavItem; active: boolean; onNavigate?: () => void }) {
  const Icon = (I as any)[it.icon] || I.home;
  return (
    <Link
      href={it.href}
      onClick={onNavigate}
      className={`flex h-[38px] items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] transition ${
        active ? "bg-brand-600 font-semibold text-white shadow-sm" : "font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      <span className={`flex shrink-0 items-center [&>svg]:h-[18px] [&>svg]:w-[18px] ${active ? "text-white" : "text-slate-400"}`}>{Icon}</span>
      <span className="min-w-0 flex-1 truncate">{it.label}</span>
      {!!it.badge && it.badge > 0 && (
        <span className={`rounded-full px-1.5 py-px text-[11px] font-bold ${active ? "bg-white/25 text-white" : "bg-brand-50 text-brand-700"}`}>{it.badge}</span>
      )}
    </Link>
  );
}

function NavBody({ siteName, logoUrl, entries, pathname, onNavigate, siteUrl, userName, userRole }: {
  siteName: string; logoUrl: string; entries: AdminNavEntry[]; pathname: string;
  onNavigate?: () => void; siteUrl?: string; userName?: string; userRole?: string;
}) {
  const { t } = useLang();
  const winner = navWinner(entries, pathname);
  const initial = (userName || "A").slice(0, 1).toUpperCase();
  return (
    <>
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-slate-100 px-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt={siteName} className="h-8 w-8 shrink-0 rounded-lg object-contain" />
        <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold tracking-tight text-slate-900">{siteName}</span>
        <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-700">Admin</span>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-6">
        {entries.map((e, i) =>
          "group" in e ? (
            <div key={e.group}>
              <p className="px-2 pb-1.5 pt-5 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">{t(e.group)}</p>
              <div className="space-y-0.5">
                {e.children.map((c) => (
                  <Leaf key={c.href} it={c} active={c === winner} onNavigate={onNavigate} />
                ))}
              </div>
            </div>
          ) : (
            <div key={e.href} className={i === 0 ? "pt-3" : "pt-1"}>
              <Leaf it={e} active={e === winner} onNavigate={onNavigate} />
            </div>
          )
        )}
      </nav>
      <div className="shrink-0 border-t border-slate-100 p-3">
        {/* Về website phải là URL TUYỆT ĐỐI của miền gốc (đợt 127): trên
            host admin.<gốc>, href "/" bị middleware viết lại vào /admin. */}
        <Link href={siteUrl || "/"} onClick={onNavigate} className="mb-2 flex h-[38px] items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900">
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>
          <span>{t("Về website")}</span>
        </Link>
        <div className="flex items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-bold text-white">{initial}</span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13px] font-semibold text-slate-800">{userName}</p>
            <p className="text-[11px] text-slate-400">{userRole === "ADMIN" ? t("Quản trị viên") : t("Nhân viên")}</p>
          </div>
          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
        </div>
      </div>
    </>
  );
}

export default function AdminNav({ siteName, logoUrl, entries, siteUrl, userName, userRole }: {
  siteName: string; logoUrl: string; entries: AdminNavEntry[]; siteUrl?: string; userName?: string; userRole?: string;
}) {
  const { t } = useLang();
  const pathname = usePathname() || "/admin";
  const [open, setOpen] = useState(false);
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-[248px] flex-col border-r border-slate-200 bg-white lg:flex">
        <NavBody siteName={siteName} logoUrl={logoUrl} entries={entries} pathname={pathname} siteUrl={siteUrl} userName={userName} userRole={userRole} />
      </aside>
      {/* Điện thoại: nút burger cố định góc trái thanh trên + ngăn kéo trượt
          (chỉ bấm LINK mới đóng ngăn kéo). */}
      <button type="button" onClick={() => setOpen(true)} aria-label={t("Mở menu")}
        className="fixed left-3 top-[13px] z-[60] flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 lg:hidden">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[70] bg-slate-950/50 lg:hidden" onClick={() => setOpen(false)} />
          <div className="fixed inset-y-0 left-0 z-[80] flex w-[280px] max-w-[85vw] flex-col bg-white shadow-2xl lg:hidden">
            <NavBody siteName={siteName} logoUrl={logoUrl} entries={entries} pathname={pathname} onNavigate={() => setOpen(false)} siteUrl={siteUrl} userName={userName} userRole={userRole} />
          </div>
        </>
      )}
    </>
  );
}
