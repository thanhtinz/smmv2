"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { logoutAction } from "@/app/actions/auth";
import { I } from "@/components/ui";
import { useLang } from "@/components/lang";

type NavChild = { href: string; label: string; badge?: number };
type NavItem = { href?: string; label: string; icon: ReactNode; badge?: number; children?: NavChild[]; scrollChildren?: boolean };
/** Một mục trong menu: hoặc NavItem thường, hoặc đề mục phân đoạn (vd "DỊCH VỤ SMM"). */
export type NavEntry = NavItem | { section: string };

const isItem = (e: NavEntry): e is NavItem => !("section" in e);

function NavLinks({ items, onNavigate }: { items: NavEntry[]; onNavigate?: () => void }) {
  const path = usePathname();
  // Query của URL hiện tại (đọc phía client sau khi mount) — để nhận diện mục con
  // có query là đang xem, tự mở nhóm chứa nó.
  const [search, setSearch] = useState("");
  useEffect(() => { setSearch(window.location.search); }, [path]);
  // LUẬT HIGHLIGHT DUY NHẤT (lệnh Tín 2026-11-07 23:12 "bấm vào menu bị tô
  // highlights 2 nút 1 lần"): toàn menu chỉ MỘT lá được tô. Cách chấm điểm:
  // khớp query (cụ thể nhất) > khớp đúng path > khớp tiền tố path (trang con
  // lồng sâu tô lá tổ tiên gần nhất = href dài nhất); "/" và "/dashboard" chỉ
  // khớp đúng tuyệt đối. Trước đây mỗi lá tự khớp tiền tố nên các cặp anh em
  // kiểu /dashboard/telegram + /dashboard/telegram/lich-su cùng sáng, cộng
  // thêm nút cha nhóm cũng nhuộm màu brand.
  const leafScore = (href: string): number => {
    const qi = href.indexOf("?");
    if (qi !== -1) {
      if (path !== href.slice(0, qi)) return 0;
      const want = new URLSearchParams(href.slice(qi + 1));
      const have = new URLSearchParams(search);
      let ok = true;
      let n = 0;
      want.forEach((v, k) => { n++; if (have.get(k) !== v) ok = false; });
      return ok ? 10000 + n * 100 + href.length : 0;
    }
    if (href === "/" || href === "/dashboard") return path === href ? 5000 + href.length : 0;
    if (path === href) return 5000 + href.length;
    if (path.startsWith(href + "/")) return 1000 + href.length;
    // Bí danh (lệnh Tín 2026-11-08 22:29, đóng tồn đọng từ fix5): trang chi
    // tiết Premium trong khu khách (/dashboard/premium...) không có lá menu
    // riêng — tô lá "Tất cả sản phẩm" (/premium). Điểm ở tầng tiền tố để
    // luật MỘT lá thắng duy nhất giữ nguyên: khớp query/khớp đúng của lá
    // khác vẫn thắng bí danh này.
    if (href === "/premium" && (path === "/dashboard/premium" || path.startsWith("/dashboard/premium/"))) return 1000 + href.length;
    return 0;
  };
  let winner: object | null = null;
  let winnerScore = 0;
  for (const it of items) {
    if (!isItem(it)) continue;
    const cands: object[] = it.children ? [...it.children] : it.href ? [it] : [];
    for (const c of cands) {
      const s = leafScore((c as NavChild).href ?? (it as NavItem).href!);
      if (s > winnerScore) { winnerScore = s; winner = c; }
    }
  }
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const it of items) {
      if (isItem(it) && it.children?.some((c) => c === winner)) init[it.label] = true;
    }
    return init;
  });
  // Đang ở trang con nào thì tự mở nhóm chứa lá thắng (sidebar desktop không đóng lại được bằng tay)
  useEffect(() => {
    for (const it of items) {
      if (isItem(it) && it.children?.some((c) => c === winner)) {
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
          const active = it === winner;
          return (
            <Link key={it.label} href={it.href!} onClick={onNavigate} className={linkCls(active)}>
              <span className="shrink-0 [&>svg]:w-5 [&>svg]:h-5">{it.icon}</span>
              {it.label}
              {badge(it.badge)}
            </Link>
          );
        }
        const groupOpen = !!open[it.label];
        const childActive = it.children.some((c) => c === winner);
        const totalBadge = it.children.reduce((sum, c) => sum + (c.badge || 0), 0);
        return (
          <div key={it.label}>
            <button type="button" onClick={() => setOpen((o) => ({ ...o, [it.label]: !o[it.label] }))}
              className={`flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm whitespace-nowrap transition ${childActive ? "font-semibold text-slate-700" : "font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}>
              <span className="shrink-0 [&>svg]:w-5 [&>svg]:h-5">{it.icon}</span>
              {it.label}
              {badge(totalBadge)}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 text-slate-400 transition-transform ${totalBadge ? "" : "ml-auto"} ${groupOpen ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6" /></svg>
            </button>
            {groupOpen && (
              <div className={it.scrollChildren ? "mt-0.5 max-h-[300px] space-y-0.5 overflow-y-auto pr-1" : "mt-0.5 space-y-0.5"}>
                {it.children.map((c) => (
                  <Link key={c.href} href={c.href} onClick={onNavigate}
                    className={`flex items-center gap-2.5 rounded-xl py-2 pl-11 pr-3.5 text-sm whitespace-nowrap transition ${c === winner ? "bg-brand-50 text-brand-700 font-semibold shadow-[inset_0_0_0_1px] shadow-brand-100" : "font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}>
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

/** Cụm đáy menu GHIM CỐ ĐỊNH: luôn hiện ở đáy khung menu không cần cuộn. Thứ tự +
 *  thành phần (lệnh Tín 2026-11-07 19:29, thay bản 15:18/15:32): BỎ Điều khoản; còn
 *  Nạp tiền → Admin Panel (nếu có quyền) → thẻ tài khoản → nút Đăng xuất. Cỡ cụm:
 *  thu nhỏ lần 2 (lệnh Tín 2026-11-07 19:59 "vẫn bự"): mỗi hàng ≈36–38px — thẻ py-2,
 *  icon 18px, avatar 32px, tên 13px, email 11px, khoảng cách giữa thẻ 6px. Toàn cụm
 *  ĐỒNG MÀU với menu (bề mặt slate-50/viền slate-200, chữ + icon slate — không tông
 *  riêng) ở cả sáng lẫn tối. Cụm này đứng NGOÀI vùng cuộn của danh sách (drawer
 *  mobile: thanh riêng shrink-0; sidebar desktop: chân thẻ, danh sách cuộn nội bộ). */
export function MenuBottomCluster({ accountName, accountEmail, accountInitials, depositLabel, adminLabel, logoutLabel }: {
  accountName: string; accountEmail: string; accountInitials: string;
  depositLabel: string; adminLabel: string | null; logoutLabel: string;
}) {
  const card = "flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition";
  return (
    <div className="space-y-1.5">
      <Link href="/dashboard/nap-tien" className={`${card} border-slate-200/80 bg-slate-50 text-slate-800 hover:bg-slate-100`}>
        <span className="relative shrink-0 text-slate-700 [&>svg]:h-[18px] [&>svg]:w-[18px]">
          {I.wallet}
          <span className="absolute -bottom-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-white text-slate-700 [&>svg]:h-2 [&>svg]:w-2">{I.plus}</span>
        </span>
        {depositLabel}
      </Link>
      {adminLabel && (
        <Link href="/admin" className={`${card} border-slate-200/80 bg-slate-50 text-slate-800 hover:bg-slate-100`}>
          <span className="shrink-0 text-slate-700 [&>svg]:h-[18px] [&>svg]:w-[18px]">{I.shield}</span>
          {adminLabel}
        </Link>
      )}
      <Link href="/dashboard/ho-so"
        className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2 transition hover:bg-slate-100">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-extrabold text-slate-700">{accountInitials}</span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-bold text-slate-900">{accountName}</span>
          <span className="block truncate text-[11px] text-slate-500">{accountEmail}</span>
        </span>
      </Link>
      <form action={logoutAction}>
        <button className={`${card} border-slate-200/80 bg-slate-50 text-slate-800 hover:bg-slate-100`}>
          <span className="shrink-0 text-slate-700 [&>svg]:h-[18px] [&>svg]:w-[18px]">{I.logout}</span>
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
 *  Đầu ngăn kéo: CHỈ logo MENU (ảnh chữ nhật ngang, căn giữa) — không hiện tên
 *  website; nguồn ảnh + fallback do layout quyết định (logo menu → logo nhỏ → ô
 *  chữ viết tắt mặc định của hệ). Header vẫn dùng logo nhỏ, không dùng logo này. */
export function MobileSideNav({ items, siteName, footer, logoUrl, logoText }: {
  items: NavEntry[]; siteName: string; footer?: ReactNode; logoUrl?: string | null; logoText?: string;
}) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => { setOpen(false); }, [path]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={t("Mở menu")}
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
                <img src={logoUrl} alt={siteName} className="max-h-14 w-auto max-w-[220px] object-contain" />
              ) : (
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-2xl font-black text-white">{logoText || "B"}</span>
              )}
              <button type="button" onClick={() => setOpen(false)} aria-label={t("Đóng menu")} className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100">
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
