import type { ReactNode } from "react";
import Link from "next/link";
import { MobileSideNav, type NavEntry } from "@/components/nav";
import { DisplaySettings } from "@/components/display";
import { NotificationBell } from "@/components/notification-bell";
import { CartHeaderLink } from "@/components/cart";
import { HeaderSearch } from "@/components/header-search";
import { logoutAction } from "@/app/actions/auth";

export type TopBarUser = { username: string; balance: number; role: string; levelLabel: string };

/** Header TRẮNG của khu khách hàng — MỘT component duy nhất cho cả dashboard
 *  và khung công khai/cửa hàng/auth (lệnh Tín 2026-11-07 23:03: "header cũ" là
 *  header khu khách hàng, không phải pill của landing cũ). Bản đã đăng nhập =
 *  nguyên xi markup dashboard trước đây: logo trái; phải = chuông thông báo,
 *  giỏ hàng, Cài đặt hiển thị, chip cấp bậc, chip số dư, tên khách, Admin Panel
 *  (chỉ ADMIN), Đăng xuất. Bản khách chưa đăng nhập: giỏ + Cài đặt + nút
 *  Đăng nhập / Đăng ký theo đúng style nút của thanh này; ngăn kéo mobile
 *  dùng chung MobileSideNav (mục do nơi gọi truyền vào). */
export function AppTopBar({ user, siteName, logoText, drawerLogoUrl, items, menuFooter, L, M }: {
  user: TopBarUser | null;
  siteName: string;
  logoText: string;
  drawerLogoUrl: string | null;
  items: NavEntry[];
  menuFooter?: ReactNode;
  L: (t: string) => string;
  M: (n: number) => string;
}) {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
      <div className="max-w-[1400px] mx-auto px-3 sm:px-4 h-16 flex items-center gap-2 sm:gap-4">
        <MobileSideNav items={items} siteName={siteName} footer={menuFooter} logoUrl={drawerLogoUrl} logoText={logoText} />
        <Link href="/" className="flex items-center gap-2.5">
          <span className="w-10 h-10 rounded-xl bg-brand-600 text-white font-black flex items-center justify-center">{logoText}</span>
          <span className="font-extrabold text-slate-900 hidden sm:inline">{siteName}</span>
        </Link>
        <div className="ml-auto flex items-center gap-1 sm:gap-2.5">
          <HeaderSearch placeholder={L("Tìm sản phẩm...")} searchLabel={L("Tìm kiếm")} closeLabel={L("Đóng")} />
          {user ? (
            <>
              <NotificationBell />
              <CartHeaderLink />
              <DisplaySettings />
              <span className="hidden h-10 items-center rounded-full bg-slate-100 px-3.5 text-xs font-semibold text-slate-600 sm:inline-flex">{L(user.levelLabel)}</span>
              <span className="inline-flex h-10 items-center rounded-full border border-emerald-200 bg-emerald-50 px-3.5 text-xs font-bold text-emerald-700 sm:text-sm">{M(user.balance)}</span>
              <span className="hidden md:inline text-sm font-medium text-slate-700">{user.username}</span>
              {user.role === "ADMIN" && <Link href="/admin" className="hidden h-10 items-center rounded-full bg-slate-900 px-3.5 text-xs font-bold text-white transition hover:bg-slate-700 md:inline-flex">Admin Panel</Link>}
              <form action={logoutAction} className="hidden sm:block"><button className="btn-ghost btn-sm h-10 whitespace-nowrap">{L("Đăng xuất")}</button></form>
            </>
          ) : (
            <>
              <CartHeaderLink />
              <DisplaySettings />
              <Link href="/login" className="btn-ghost btn-sm h-10 !px-4 whitespace-nowrap">{L("Đăng nhập")}</Link>
              <Link href="/register" className="btn-primary btn-sm h-10 !px-4 whitespace-nowrap">{L("Đăng ký")}</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
