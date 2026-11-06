"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { I } from "@/components/ui";

export type AdminNavItem = { href: string; label: string; icon: string; badge?: number };
export type AdminNavEntry = AdminNavItem | { group: string; icon: string; children: AdminNavItem[] };

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

/** Màu riêng cho từng icon trên nền sidebar navy — nhìn phát biết mục nào. */
const ICON_COLORS: Record<string, string> = {
  home: "text-sky-400", cart: "text-sky-400", list: "text-cyan-400", layers: "text-teal-400",
  server: "text-indigo-400", percent: "text-lime-400", money: "text-amber-400", gem: "text-fuchsia-400",
  box: "text-violet-400", wallet: "text-emerald-400", landmark: "text-teal-300", gift: "text-pink-400",
  file: "text-orange-300", mail: "text-blue-300", megaphone: "text-yellow-400", users: "text-violet-300",
  chart: "text-cyan-300", shield: "text-red-400", panels: "text-indigo-300", ticket: "text-rose-400",
  clock: "text-slate-300", cpu: "text-emerald-300", key: "text-amber-300", gear: "text-slate-300",
  bell: "text-amber-400",
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

function Leaf({ it, pathname, sub = false }: { it: AdminNavItem; pathname: string; sub?: boolean }) {
  const Icon = (I as any)[it.icon] || I.home;
  const active = isActive(pathname, it.href);
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

function Group({ entry, pathname }: { entry: { group: string; icon: string; children: AdminNavItem[] }; pathname: string }) {
  const Icon = (I as any)[entry.icon] || I.list;
  const hasActive = entry.children.some((c) => isActive(pathname, c.href));
  const [open, setOpen] = useState(hasActive);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${hasActive ? "text-white" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}
      >
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white shadow ${GROUP_TILES[entry.icon] || "bg-gradient-to-br from-slate-500 to-slate-600"}`}>{Icon}</span>
        <span className="truncate font-medium">{entry.group}</span>
        <svg viewBox="0 0 24 24" className={`ml-auto h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="ml-[21px] mt-0.5 space-y-0.5 border-l border-white/10 pl-3">
          {entry.children.map((c) => (
            <Leaf key={c.href} it={c} pathname={pathname} sub />
          ))}
        </div>
      )}
    </div>
  );
}

function NavBody({ siteName, logoText, entries, pathname, onNavigate }: { siteName: string; logoText: string; entries: AdminNavEntry[]; pathname: string; onNavigate?: () => void }) {
  return (
    <>
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-white/10 px-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 font-black text-white shadow-lg shadow-brand-900/50">{logoText}</span>
        <span className="truncate font-extrabold text-white">
          {siteName} <span className="font-medium text-slate-400">/ Admin</span>
        </span>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3" onClick={onNavigate}>
        {entries.map((e) =>
          "group" in e ? <Group key={e.group} entry={e} pathname={pathname} /> : <Leaf key={e.href} it={e} pathname={pathname} />
        )}
      </nav>
      <div className="shrink-0 border-t border-white/10 p-3">
        <Link href="/" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white">
          <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 opacity-90" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>
          <span>Về website</span>
        </Link>
      </div>
    </>
  );
}

export default function AdminNav({ siteName, logoText, entries }: { siteName: string; logoText: string; entries: AdminNavEntry[] }) {
  const pathname = usePathname() || "/admin";
  const [open, setOpen] = useState(false);
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-[260px] flex-col bg-[#081c36] text-slate-300 lg:flex">
        <NavBody siteName={siteName} logoText={logoText} entries={entries} pathname={pathname} />
      </aside>
      {/* Điện thoại: nút burger cố định ở góc trái thanh trên + ngăn kéo trượt chứa toàn bộ menu
          (thay thanh menu footer dưới đáy đã bỏ). Layout chừa ml cho logo để không đè nút. */}
      <button type="button" onClick={() => setOpen(true)} aria-label="Mở menu"
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
