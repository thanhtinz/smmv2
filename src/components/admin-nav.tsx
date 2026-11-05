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

function Leaf({ it, pathname, sub = false }: { it: AdminNavItem; pathname: string; sub?: boolean }) {
  const Icon = (I as any)[it.icon] || I.home;
  const active = isActive(pathname, it.href);
  return (
    <Link
      href={it.href}
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
        active ? "bg-brand-600 text-white font-semibold shadow-sm" : "text-slate-300 hover:bg-white/10 hover:text-white"
      } ${sub ? "py-2 text-[13px]" : ""}`}
    >
      <span className="shrink-0 opacity-90">{Icon}</span>
      <span className="truncate">{it.label}</span>
      {!!it.badge && it.badge > 0 && (
        <span className="ml-auto rounded-full bg-rose-500 px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-white min-w-[20px]">{it.badge}</span>
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
        <span className="shrink-0 opacity-90">{Icon}</span>
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

export default function AdminNav({ siteName, logoText, entries }: { siteName: string; logoText: string; entries: AdminNavEntry[] }) {
  const pathname = usePathname() || "/admin";
  return (
    <aside className="fixed inset-y-0 left-0 z-50 hidden w-[260px] flex-col bg-[#081c36] text-slate-300 lg:flex">
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-white/10 px-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 font-black text-white">{logoText}</span>
        <span className="truncate font-extrabold text-white">
          {siteName} <span className="font-medium text-slate-400">/ Admin</span>
        </span>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
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
    </aside>
  );
}
