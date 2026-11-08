"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { I } from "@/components/ui";
import { useLang } from "@/components/lang";

export type AdminNavItem = { href: string; label: string; icon: string; badge?: number };
export type AdminNavEntry = AdminNavItem | { group: string; icon: string; children: AdminNavItem[] };

/** LUẬT HIGHLIGHT DUY NHẤT (lệnh Tín 2026-11-07 23:12): toàn menu admin
 *  chỉ MỘT lá được tô gradient. Khớp đúng path thắng; nếu không, tiền tố dài
 *  nhất thắng (trang con tô lá tổ tiên gần nhất); "/admin" chỉ khớp đúng.
 *  Trước đây các cặp anh em kiểu /admin/premium + /admin/premium/danh-muc
 *  cùng khớp tiền tố nên sáng 2 lá một lúc. */
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

/** Màu riêng cho từng icon trên nền sidebar navy — nhìn phát biết mục nào. */
const ICON_COLORS: Record<string, string> = {
  home: "text-sky-400", cart: "text-sky-400", list: "text-cyan-400", layers: "text-teal-400",
  server: "text-indigo-400", percent: "text-lime-400", money: "text-amber-400", gem: "text-fuchsia-400",
  box: "text-violet-400", wallet: "text-emerald-400", landmark: "text-teal-300", gift: "text-pink-400",
  file: "text-orange-300", mail: "text-blue-300", megaphone: "text-yellow-400", users: "text-violet-300",
  chart: "text-cyan-300", shield: "text-red-400", panels: "text-indigo-300", ticket: "text-rose-400",
  clock: "text-slate-300", cpu: "text-emerald-300", key: "text-amber-300", gear: "text-slate-300",
  bell: "text-amber-400", globe: "text-cyan-300",
};
const GROUP_TILES: Record<string, string> = {
  wallet: "bg-gradient-to-br from-emerald-500 to-teal-600",
  megaphone: "bg-gradient-to-br from-amber-500 to-orange-600",
  gear: "bg-gradient-to-br from-indigo-500 to-slate-600",
  cart: "bg-gradient-to-br from-sky-500 to-blue-600",
  gem: "bg-gradient-to-br from-fuchsia-500 to-violet-600",
  file: "bg-gradient-to-br from-orange-500 to-amber-600",
  users: "bg-gradient-to-br from-violet-500 to-purple-600",
};

function Leaf({ it, active, sub = false }: { it: AdminNavItem; active: boolean; sub?: boolean }) {
  const Icon = (I as any)[it.icon] || I.home;
  return (
    <Link
      href={it.href}
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
        active ? "bg-gradient-to-r from-brand-600 to-brand-500 text-white font-semibold shadow-md shadow-brand-900/40" : "text-slate-300 hover:bg-white/10 hover:text-white"
      } ${sub ? "py-2 text-[13px]" : ""}`}
    >
      <span className={`shrink-0 ${active ? "text-white" : ICON_COLORS[it.icon] || "text-slate-300"}`}>{Icon}</span>
      <span className="truncate">{it.label}</span>
      {!!it.badge && it.badge > 0 && (
        <span className="ml-auto min-w-[20px] rounded-full bg-gradient-to-r from-rose-500 to-red-500 px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-white shadow">{it.badge}</span>
      )}
    </Link>
  );
}

function Group({ entry, winner }: { entry: { group: string; icon: string; children: AdminNavItem[] }; winner: AdminNavItem | null }) {
  const { t } = useLang();
  const Icon = (I as any)[entry.icon] || I.list;
  const containsWinner = entry.children.some((c) => c === winner);
  const [open, setOpen] = useState(containsWinner);
  // Nhóm chứa lá đang xem thì tự mở (kể cả khi điều hướng phía client).
  // Nút cha KHÔNG nhuộm màu active — chỉ lá thắng mới được tô (luật duy nhất).
  useEffect(() => { if (containsWinner) setOpen(true); }, [containsWinner]);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition text-slate-300 hover:bg-white/10 hover:text-white"
      >
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white shadow ${GROUP_TILES[entry.icon] || "bg-gradient-to-br from-slate-500 to-slate-600"}`}>{Icon}</span>
        <span className="truncate font-medium">{t(entry.group)}</span>
        <svg viewBox="0 0 24 24" className={`ml-auto h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="ml-[21px] mt-0.5 space-y-0.5 border-l border-white/10 pl-3">
          {entry.children.map((c) => (
            <Leaf key={c.href} it={c} active={c === winner} sub />
          ))}
        </div>
      )}
    </div>
  );
}

function NavBody({ siteName, logoText, entries, pathname, onNavigate }: { siteName: string; logoText: string; entries: AdminNavEntry[]; pathname: string; onNavigate?: () => void }) {
  const { t } = useLang();
  const winner = navWinner(entries, pathname);
  return (
    <>
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-white/10 px-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 font-black text-white shadow-lg shadow-brand-900/50">{logoText}</span>
        <span className="truncate font-extrabold text-white">
          {siteName} <span className="font-medium text-slate-400">/ Admin</span>
        </span>
      </div>
      {/* Chỉ bấm vào LINK mới đóng ngăn kéo mobile: trước đây onClick gắn cả
          nav nên bấm nút mở NHÓM cũng nổi bọt lên đây -> ngăn kéo đóng ngay,
          không mở được trang trong nhóm (lỗi Tín báo 2026-11-08). */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3" onClick={onNavigate ? (e) => { if ((e.target as HTMLElement).closest("a")) onNavigate(); } : undefined}>
        {entries.map((e) =>
          "group" in e ? <Group key={e.group} entry={e} winner={winner} /> : <Leaf key={e.href} it={e} active={e === winner} />
        )}
      </nav>
      <div className="shrink-0 border-t border-white/10 p-3">
        <Link href="/" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white">
          <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 opacity-90" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>
          <span>{t("Về website")}</span>
        </Link>
      </div>
    </>
  );
}

export default function AdminNav({ siteName, logoText, entries }: { siteName: string; logoText: string; entries: AdminNavEntry[] }) {
  const { t } = useLang();
  const pathname = usePathname() || "/admin";
  const [open, setOpen] = useState(false);
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-[260px] flex-col bg-[#081c36] text-slate-300 lg:flex">
        <NavBody siteName={siteName} logoText={logoText} entries={entries} pathname={pathname} />
      </aside>
      {/* Điện thoại: nút burger cố định ở góc trái thanh trên + ngăn kéo trượt chứa toàn bộ menu
          (thay thanh menu footer dưới đáy đã bỏ). Layout chừa ml cho logo để không đè nút. */}
      <button type="button" onClick={() => setOpen(true)} aria-label={t("Mở menu")}
        className="fixed left-3 top-[13px] z-[60] flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 lg:hidden">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[70] bg-slate-950/50 lg:hidden" onClick={() => setOpen(false)} />
          <div className="fixed inset-y-0 left-0 z-[80] flex w-[280px] max-w-[85vw] flex-col bg-[#081c36] text-slate-300 shadow-2xl lg:hidden">
            <NavBody siteName={siteName} logoText={logoText} entries={entries} pathname={pathname} onNavigate={() => setOpen(false)} />
          </div>
        </>
      )}
    </>
  );
}
