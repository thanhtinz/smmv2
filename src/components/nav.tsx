"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

export function SideNav({ items }: { items: { href: string; label: string; icon: ReactNode; badge?: number }[] }) {
  const path = usePathname();
  return (
    <nav className="flex lg:flex-col gap-1 overflow-x-auto pb-1">
      {items.map((it) => {
        const active = path === it.href || path.startsWith(it.href + "/");
        return (
          <Link key={it.href} href={it.href}
            className={`flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm whitespace-nowrap transition ${active ? "bg-brand-50 text-brand-700 font-semibold shadow-[inset_0_0_0_1px] shadow-brand-100" : "font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}>
            <span className="shrink-0 [&>svg]:w-5 [&>svg]:h-5">{it.icon}</span>
            {it.label}
            {!!it.badge && <span className="ml-auto bg-rose-500 text-white text-[11px] font-bold rounded-full px-2 py-0.5">{it.badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
