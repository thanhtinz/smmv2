"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { logoutAction } from "@/app/actions/auth";
import { I } from "@/components/ui";

type NavChild = { href: string; label: string; badge?: number };
type NavItem = { href?: string; label: string; icon: ReactNode; badge?: number; children?: NavChild[]; scrollChildren?: boolean };
/** Một mục trong menu: hoặc NavItem thường, hoặc đề mục phân đoạn (vd "DỊCH VỤ SMM"). */
export type NavEntry = NavItem | { section: string };

const isItem = (e: NavEntry): e is NavItem => !("section" in e);

const isActivePath = (path: string, href: string) =>
  href === "/dashboard" ? path === href : path === href || path.startsWith(href + "/");

function NavLinks({ items, onNavigate }: { items: NavEntry[]; onNavigate?: () => void }) {
  const path = usePathname();
  // Query của URL hiện tại (đọc phía client sau khi mount) — để nhận diện mục con dạng
  // /dashboard/dat-hang?platform=..&cat=.. là đang xem, tự mở nhóm nền tảng chứa nó.
  const [search, setSearch] = useState("");
  useEffect(() => { setSearch(window.location.search); }, [path]);
  const isChildActive = (href: string) => {
    const qi = href.indexOf("?");
    if (qi === -1) return isActivePath(path, href);
    if (path !== href.slice(0, qi)) return false;
    const want = new URLSearchParams(href.slice(qi + 1));
    const have = new URLSearchParams(search);
    let ok = true;
    want.forEach((v, k) => { if (have.get(k) !== v) ok = false; });
    return ok;
  };
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const it of items) {
      if (isItem(it) && it.children?.some((c) => isActivePath(path, c.href))) init[it.label] = true;
    }
    return init;
  });
  // Đang ở trang con nào thì tự mở nhóm chứa nó (sidebar desktop không đóng lại được bằng tay)
  useEffect(() => {
    for (const it of items) {
      if (isItem(it) && it.children?.some((c) => isChildActive(c.href))) {
        setOpen((o) => (o[it.label] ? o : { ...o, [it.label]: true }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, search]);

  const linkCls = (active: boolean) =>
    `flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm whitespace-nowrap transition ${active ? "bg-brand-50 text-brand-700 font-semibold shadow-[inset_0_0_0_1px] shadow-brand-100" : "font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`;
  const badge = (n?: number) =>
    n ? <span className="ml-auto bg-rose-500 text-white text-[11px] font-bold rounded-full px-2 py-0.5">{n}</span> : null;

  return (
    <>
      {items.map((it) => {
        if (!isItem(it)) {
          return (
            <div key={`sec:${it.section}`} className="px-3.5 pb-1 pt-5 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
              {it.section}
            </div>
          );
        }
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
        const childActive = it.children.some((c) => isChildActive(c.href));
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
              <div className={it.scrollChildren ? "mt-0.5 max-h-[300px] space-y-0.5 overflow-y-auto pr-1" : "mt-0.5 space-y-0.5"}>
                {it.children.map((c) => (
                  <Link key={c.href} href={c.href} onClick={onNavigate}
                    className={`flex items-center gap-2.5 rounded-xl py-2 pl-11 pr-3.5 text-sm whitespace-nowrap transition ${isChildActive(c.href) ? "bg-brand-50 text-brand-700 font-semibold shadow-[inset_0_0_0_1px] shadow-brand-100" : "font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}>
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

/** Cụm đáy menu GHIM CỐ ĐỊNH (lệnh Tín 2026-11-07 15:18 — thay bố cục "cuối danh sách"
 *  của đợt trước): luôn hiện ở đáy khung menu không cần cuộn, các thẻ to/rõ hơn hàng menu
 *  thường. Thứ tự: thẻ tài khoản → Nạp tiền → Điều khoản → Admin Panel (nếu có quyền) →
 *  nút Đăng xuất (nút bấm rõ ràng, có icon). Cụm này đứng NGOÀI vùng cuộn của danh sách
 *  (drawer mobile: thanh riêng shrink-0; sidebar desktop: chân thẻ, danh sách cuộn nội bộ). */
export function MenuBottomCluster({ accountName, accountEmail, accountInitials, depositLabel, termsLabel, adminLabel, logoutLabel }: {
  accountName: string; accountEmail: string; accountInitials: string;
  depositLabel: string; termsLabel: string; adminLabel: string | null; logoutLabel: string;
}) {
  const card = "flex w-full items-center justify-center gap-2.5 rounded-2xl border px-4 py-3.5 text-base font-bold transition";
  return (
    <div className="space-y-2.5">
      <Link href="/dashboard/ho-so"
        className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3 transition hover:bg-slate-100">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-cyan-200 text-lg font-extrabold text-slate-800">{accountInitials}</span>
        <span className="min-w-0">
          <span className="block truncate text-base font-bold text-slate-900">{accountName}</span>
          <span className="block truncate text-sm text-slate-500">{accountEmail}</span>
        </span>
      </Link>
      <Link href="/dashboard/nap-tien" className={`${card} border-slate-200/80 bg-slate-50 text-slate-800 hover:bg-slate-100`}>
        <span className="relative shrink-0 text-slate-700 [&>svg]:h-6 [&>svg]:w-6">
          {I.wallet}
          <span className="absolute -bottom-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-slate-700 [&>svg]:h-3 [&>svg]:w-3">{I.plus}</span>
        </span>
        {depositLabel}
      </Link>
      <Link href="/dashboard/dieu-khoan" className={`${card} border-slate-200/80 bg-slate-50 text-brand-700 hover:bg-brand-50`}>
        <span className="shrink-0 text-brand-600 [&>svg]:h-6 [&>svg]:w-6">{I.book}</span>
        {termsLabel}
      </Link>
      {adminLabel && (
        <Link href="/admin" className={`${card} border-slate-200/80 bg-slate-50 text-slate-800 hover:bg-slate-100`}>
          <span className="shrink-0 [&>svg]:h-6 [&>svg]:w-6">{I.shield}</span>
          {adminLabel}
        </Link>
      )}
      <form action={logoutAction}>
        <button className={`${card} border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100`}>
          <span className="shrink-0 [&>svg]:h-6 [&>svg]:w-6">{I.logout}</span>
          {logoutLabel}
        </button>
      </form>
    </div>
  );
}

/** Menu dọc cho màn hình lớn (sidebar khu khách hàng). Danh sách cuộn nội bộ khi dài hơn
 *  khung hình; cụm đáy (footer) ghim ở chân thẻ, luôn thấy. */
export function SideNav({ items, footer }: { items: NavEntry[]; footer?: ReactNode }) {
  return (
    <nav className="hidden lg:flex lg:flex-col lg:max-h-[calc(100vh-8.5rem)]">
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        <NavLinks items={items} />
      </div>
      {footer && <div className="mt-3 shrink-0 border-t border-slate-100 pt-3">{footer}</div>}
    </nav>
  );
}

/** Nút burger + ngăn kéo menu cho điện thoại — gom toàn bộ mục của sidebar vào đây
 *  (thay thanh menu footer dưới đáy đã bỏ). Đặt trong header khu khách hàng.
 *  Đầu ngăn kéo: CHỈ logo website (ảnh, căn giữa, to rõ) — không hiện tên website;
 *  site chưa cấu hình ảnh logo thì dùng dấu chữ viết tắt mặc định của hệ. */
export function MobileSideNav({ items, siteName, footer, logoUrl, logoText }: {
  items: NavEntry[]; siteName: string; footer?: ReactNode; logoUrl?: string | null; logoText?: string;
}) {
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
            <div className="relative flex h-20 shrink-0 items-center justify-center border-b border-slate-100 px-12">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt={siteName} className="h-14 w-auto max-w-[180px] object-contain" />
              ) : (
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-2xl font-black text-white">{logoText || "S"}</span>
              )}
              <button type="button" onClick={() => setOpen(false)} aria-label="Đóng menu" className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-3">
              <NavLinks items={items} onNavigate={() => setOpen(false)} />
            </nav>
            {footer && (
              <div className="shrink-0 border-t border-slate-100 bg-white p-3">
                {footer}
              </div>
            )}
          </div>
        </>,
        document.body
      )}
    </>
  );
}
