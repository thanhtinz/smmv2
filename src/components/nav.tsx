"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { logoutAction } from "@/app/actions/auth";

type NavChild = { href: string; label: string; badge?: number };
type NavItem = { href?: string; label: string; icon: ReactNode; badge?: number; children?: NavChild[] };

const isActivePath = (path: string, href: string) =>
  href === "/dashboard" ? path === href : path === href || path.startsWith(href + "/");

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const path = usePathname();
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const it of items) {
      if (it.children?.some((c) => isActivePath(path, c.href))) init[it.label] = true;
    }
    return init;
  });
  // Đang ở trang con nào thì tự mở nhóm chứa nó (sidebar desktop không đóng lại được bằng tay)
  useEffect(() => {
    for (const it of items) {
      if (it.children?.some((c) => isActivePath(path, c.href))) {
        setOpen((o) => (o[it.label] ? o : { ...o, [it.label]: true }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  const linkCls = (active: boolean) =>
    `flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm whitespace-nowrap transition ${active ? "bg-brand-50 text-brand-700 font-semibold shadow-[inset_0_0_0_1px] shadow-brand-100" : "font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`;
  const badge = (n?: number) =>
    n ? <span className="ml-auto bg-rose-500 text-white text-[11px] font-bold rounded-full px-2 py-0.5">{n}</span> : null;

  return (
    <>
      {items.map((it) => {
        if (!it.children) {
          const active = isActivePath(path, it.href!);
          return (
            <Link key={it.label} href={it.href!} onClick={onNavigate} className={linkCls(active)}>
              <span className="shrink-0 [&>svg]:w-5 [&>svg]:h-5">{it.icon}</span>
              {it.label}
              {badge(it.badge)}
            </Link>
          );
        }
        const groupOpen = !!open[it.label];
        const childActive = it.children.some((c) => isActivePath(path, c.href));
        const totalBadge = it.children.reduce((sum, c) => sum + (c.badge || 0), 0);
        return (
          <div key={it.label}>
            <button type="button" onClick={() => setOpen((o) => ({ ...o, [it.label]: !o[it.label] }))}
              className={`flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm whitespace-nowrap transition ${childActive ? "font-semibold text-brand-700" : "font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}>
              <span className="shrink-0 [&>svg]:w-5 [&>svg]:h-5">{it.icon}</span>
              {it.label}
              {badge(totalBadge)}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 text-slate-400 transition-transform ${totalBadge ? "" : "ml-auto"} ${groupOpen ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6" /></svg>
            </button>
            {groupOpen && (
              <div className="mt-0.5 space-y-0.5">
                {it.children.map((c) => (
                  <Link key={c.href} href={c.href} onClick={onNavigate}
                    className={`flex items-center gap-2.5 rounded-xl py-2 pl-11 pr-3.5 text-sm whitespace-nowrap transition ${isActivePath(path, c.href) ? "bg-brand-50 text-brand-700 font-semibold shadow-[inset_0_0_0_1px] shadow-brand-100" : "font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}>
                    {c.label}
                    {badge(c.badge)}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

/** Menu dọc cho màn hình lớn (sidebar khu khách hàng). */
export function SideNav({ items }: { items: NavItem[] }) {
  return (
    <nav className="hidden lg:flex lg:flex-col gap-1">
      <NavLinks items={items} />
    </nav>
  );
}

/** Nút burger + ngăn kéo menu cho điện thoại — gom toàn bộ mục của sidebar vào đây
 *  (thay thanh menu footer dưới đáy đã bỏ). Đặt trong header khu khách hàng. */
export function MobileSideNav({ items, siteName }: { items: NavItem[]; siteName: string }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => { setOpen(false); }, [path]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Mở menu"
        className="lg:hidden flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
      </button>
      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[70] bg-slate-950/50 lg:hidden" onClick={() => setOpen(false)} />
          <div className="fixed inset-y-0 left-0 z-[80] flex w-[280px] max-w-[85vw] flex-col bg-white shadow-2xl lg:hidden">
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-100 px-4">
              <span className="font-extrabold text-slate-900">{siteName}</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Đóng menu" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
              <NavLinks items={items} onNavigate={() => setOpen(false)} />
            </nav>
            <div className="shrink-0 border-t border-slate-100 p-3">
              <form action={logoutAction}>
                <button className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-50">Đăng xuất</button>
              </form>
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}
