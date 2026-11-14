import type { ReactNode } from "react";
import { getSettings } from "@/lib/settings";
import { guardSetupDone } from "@/lib/setup";
import { getServerI18n } from "@/lib/lang-server";
import { getCurrentUser } from "@/lib/auth";
import { LEVEL_NAME } from "@/lib/format";
import { AppTopBar } from "@/components/topbar";
import { wideLogoUrl } from "@/lib/brand";
import SeasonalDecor from "@/components/seasonal-decor";
import { parseSeasonalTheme } from "@/lib/seasonal";
import { buildCustomerNav } from "@/components/customer-nav";
import { SiteFooter } from "@/components/site";
import { I } from "@/components/ui";
import type { NavEntry } from "@/components/nav";

/** Khung công khai DÙNG CHUNG từ 2026-11-07 23:03 (lệnh Tín): trang chủ,
 *  /premium, chi tiết, giỏ hàng và mọi trang auth đều mang HEADER TRẮNG của
 *  khu khách hàng (AppTopBar) + footer SÁNG cùng hệ — thay cho pill tối của
 *  landing cũ và footer slate-950. Đã đăng nhập: header + ngăn kéo mobile
 *  giống hệt dashboard (buildCustomerNav). Chưa đăng nhập: ngăn kéo gồm các
 *  mục công khai Trang chủ / Premium / Đăng nhập / Đăng ký. Thanh thông báo
 *  (announcement_bar) giữ nguyên như các header công khai trước vẫn hiện. */
export async function PublicFrame({ children, skipSetupGate }: { children: ReactNode; skipSetupGate?: boolean }) {
  // Cổng thiết lập lần đầu: chưa có tài khoản nào thì mọi trang khách về /setup
  // (chính trang /setup truyền skipSetupGate để khỏi vòng lặp).
  if (!skipSetupGate) await guardSetupDone();
  const s = await getSettings();
  const { L, M } = await getServerI18n();
  const user = await getCurrentUser().catch(() => null);
  // Chuỗi logo (đợt 117 + 118): admin tự tải thắng tuyệt đối; trống → logo
  // BNT Shop gói sẵn (lib/brand). Header mọi khổ + ngăn kéo dùng bản NGANG.
  const drawerLogoUrl = wideLogoUrl(s.logo_menu_url, s.logo_url);
  let items: NavEntry[];
  let menuFooter: ReactNode = undefined;
  if (user) {
    const nav = await buildCustomerNav(user, s, L);
    items = nav.items;
    menuFooter = nav.menuFooter;
  } else {
    items = [
      { href: "/", label: L("Trang chủ"), icon: I.home },
      ...(s.module_premium !== "0" ? [{ href: "/premium", label: L("Tất cả sản phẩm"), icon: I.gem }] : []),
      // Tài chính (lệnh Tín 2026-11-13): khách chưa đăng nhập cũng gộp Ưu
      // đãi + Pass vào dropdown Tài chính như menu khách đã đăng nhập
      // (buildCustomerNav) — nhóm đứng đúng vị trí Ưu đãi phẳng trước đây.
      // Đợt 126: Ưu đãi theo module_promo, mục Đăng ký theo module_register
      // — khớp điều kiện ẩn của menu khách đã đăng nhập. Cả hai con đều tắt
      // thì nhóm không dựng (tránh dropdown rỗng).
      ...((s.module_promo !== "0" || s.pass_enabled === "1")
        ? [{
            label: L("Tài chính"), icon: I.wallet, children: [
              ...(s.module_promo !== "0" ? [{ href: "/uu-dai", label: L("Ưu đãi") }] : []),
              ...(s.pass_enabled === "1" ? [{ href: "/pass", label: (s.pass_name || "").trim() || "Pass" }] : []),
            ]
          }]
        : []),
      { href: "/login", label: L("Đăng nhập"), icon: I.lock },
      ...(s.module_register !== "0" ? [{ href: "/register", label: L("Đăng ký"), icon: I.plus }] : []),
    ];
  }
  const decorTheme = s.seasonal_decor_enabled === "1" ? parseSeasonalTheme(s.seasonal_theme) : null;
  return (
    <div className="flex min-h-screen flex-col">
      {s.announcement_bar ? (
        <div
          className="bg-brand-600 px-4 py-2 text-center text-xs font-medium text-white sm:text-sm"
        >{s.announcement_bar}</div>
      ) : null}
      <AppTopBar
        user={user ? { username: user.username, balance: user.balance, role: user.role, levelLabel: LEVEL_NAME[user.level] } : null}
        siteName={s.site_name}
        logoText={s.site_logo_text || "B"}
        wideLogoUrl={drawerLogoUrl}
        drawerLogoUrl={drawerLogoUrl}
        items={items}
        menuFooter={menuFooter}
        L={L}
        M={M}
      />
      {decorTheme ? <SeasonalDecor theme={decorTheme} /> : null}
      {children}
      <SiteFooter />
    </div>
  );
}
