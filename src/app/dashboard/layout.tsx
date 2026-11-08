import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { logoutAction } from "@/app/actions/auth";
import { SideNav, MobileSideNav, MenuBottomCluster, type NavEntry } from "@/components/nav";
import { DisplaySettings } from "@/components/display";
import { NotificationBell } from "@/components/notification-bell";
import { CartHeaderLink } from "@/components/cart";
import { LiveChat } from "@/components/livechat";
import { TermsGate, HomeModal } from "@/components/gates";
import { I } from "@/components/ui";
import { vnd, LEVEL_NAME } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";
import { LangProvider } from "@/components/lang";
import { prisma } from "@/lib/db";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const s = await getSettings();
  const openTickets = await prisma.ticket.count({ where: { userId: user.id, status: "ANSWERED" } });
  const i18n = await getServerI18n();
  const { L, M } = i18n;
  if (s.maintenance === "1" && user.role === "USER") {
    return <div className="min-h-screen flex items-center justify-center p-6 text-center"><div><h1 className="text-2xl font-bold mb-2">{L("Hệ thống đang bảo trì")}</h1><p className="text-slate-500">{L("Vui lòng quay lại sau ít phút.")}</p></div></div>;
  }
  let termsGate: React.ReactNode = null;
  if (s.terms_enabled === "1" && s.terms_content?.trim()) {
    const fresh = await prisma.user.findUnique({ where: { id: user.id }, select: { termsAcceptedVersion: true } });
    const ver = parseInt(s.terms_version || "1") || 1;
    if ((fresh?.termsAcceptedVersion || 0) < ver) {
      termsGate = <TermsGate title={s.terms_title} content={s.terms_content} checkboxText={s.terms_checkbox_text} buttonText={s.terms_button_text} version={ver} />;
    }
  }
  const homeModalContent = s.home_modal_enabled === "1" && s.home_modal_content?.trim() ? s.home_modal_content : null;
  const smmOn = s.module_smm !== "0";
  const premiumOn = s.module_premium !== "0";
  const affiliateOn = s.module_affiliate !== "0";
  const bulkOn = s.module_bulk !== "0";
  const ticketsOn = s.module_tickets !== "0";
  const apiOn = s.module_api !== "0";
  const telegramOn = s.telegram_enabled !== "0";
  const unreadNoti = await prisma.notification.count({ where: { userId: user.id, read: false } });
  // Menu gom nhóm dropdown cho gọn: nhóm nào đang chứa trang hiện tại thì tự mở
  const smmChildren = [
    ...(smmOn ? [{ href: "/dashboard/dat-hang", label: L("Đặt đơn SMM") }] : []),
    ...(smmOn && bulkOn ? [{ href: "/dashboard/dat-hang-loat", label: L("Đặt hàng loạt") }] : []),
    { href: "/dashboard/don-hang", label: L("Đơn hàng SMM") },
    ...(smmOn ? [{ href: "/dashboard/dich-vu", label: L("Bảng giá") }] : []),
  ];
  const premiumChildren = [
    ...(premiumOn ? [{ href: "/dashboard/premium", label: L("Mua Premium") }] : []),
    { href: "/dashboard/don-premium", label: L("Đơn hàng Premium") },
  ];
  const telegramChildren = [
    { href: "/dashboard/telegram", label: L("Đặt đơn") },
    { href: "/dashboard/telegram/lich-su", label: L("Lịch sử") },
  ];
  const financeChildren = [
    { href: "/dashboard/giao-dich", label: L("Lịch sử số dư") },
    ...(affiliateOn ? [{ href: "/dashboard/kiem-tien", label: L("Kiếm tiền") }] : []),
  ];
  const supportChildren = [
    ...(ticketsOn ? [{ href: "/dashboard/ticket", label: L("Hỗ trợ / Ticket"), badge: openTickets }] : []),
    { href: "/dashboard/faq", label: L("Hỏi đáp thường gặp") },
    { href: "/dashboard/thong-bao", label: L("Thông báo"), badge: unreadNoti },
    ...(s.module_blog !== "0" ? [{ href: "/dashboard/bai-viet", label: L("Bài viết") }] : []),
  ];
  // (Đã bỏ phân đoạn nền tảng SMM riêng trong menu theo lệnh Tín 2026-11-07 20:33 —
  // khách đặt đơn qua mục Đặt đơn SMM và tự chọn nền tảng/phân loại trong form.)
  const items: NavEntry[] = [
    { href: "/", label: L("Trang chủ"), icon: I.home },
    ...(smmChildren.length ? [{ label: L("Đơn SMM"), icon: I.cart, children: smmChildren }] : []),
    ...(premiumChildren.length ? [{ label: L("Premium"), icon: I.gem, children: premiumChildren }] : []),
    ...(telegramOn ? [{ label: "Telegram Premium", icon: I.star, children: telegramChildren }] : []),
    ...(financeChildren.length ? [{ label: L("Tài chính"), icon: I.wallet, children: financeChildren }] : []),
    ...(apiOn ? [{ href: "/dashboard/api-docs", label: L("Tài liệu API"), icon: I.key }] : []),
    ...(supportChildren.length ? [{ label: L("Hỗ trợ"), icon: I.ticket, children: supportChildren }] : []),
    { href: "/dashboard/ho-so", label: L("Hồ sơ"), icon: I.users },
  ];
  // Cụm đáy menu ghim cố định: tài khoản + Nạp tiền + Điều khoản + Admin Panel (chỉ đúng
  // tài khoản đang thấy link Admin Panel như hiện tại: role ADMIN) + Đăng xuất.
  const nameParts = (user.fullName || user.username).trim().split(/\s+/);
  const accountInitials = (nameParts.length > 1 ? nameParts[0][0] + nameParts[nameParts.length - 1][0] : (user.fullName || user.username).slice(0, 2)).toUpperCase();
  const menuFooter = <MenuBottomCluster accountName={user.fullName || user.username} accountEmail={user.email} accountInitials={accountInitials} depositLabel={L("Nạp tiền")} adminLabel={user.role === "ADMIN" ? "Admin Panel" : null} logoutLabel={L("Đăng xuất")} />;
  // Logo đầu ngăn kéo menu = LOGO MENU (ảnh chữ nhật ngang): logo menu web mẹ
  // (logo_menu_url) → logo nhỏ web mẹ (logo_url) → ô chữ viết tắt mặc định.
  // Header vẫn dùng logo nhỏ như cũ.
  const drawerLogoUrl = s.logo_menu_url || s.logo_url || null;
  return (
    <LangProvider lang={i18n.lang} ov={i18n.cfg.overrides[i18n.lang]} cur={i18n.cur} rates={i18n.rates}>
    <div className="min-h-screen">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-[1400px] mx-auto px-3 sm:px-4 h-16 flex items-center gap-2 sm:gap-4">
          <MobileSideNav items={items} siteName={s.site_name} footer={menuFooter} logoUrl={drawerLogoUrl} logoText={s.site_logo_text || "S"} />
          <Link href="/" className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-brand-600 text-white font-black flex items-center justify-center">{s.site_logo_text || "S"}</span>
            <span className="font-extrabold text-slate-900 hidden sm:inline">{s.site_name}</span>
          </Link>
          <div className="ml-auto flex items-center gap-1 sm:gap-2.5">
            <NotificationBell />
              <CartHeaderLink />
            <DisplaySettings />
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hidden sm:inline-block">{L(LEVEL_NAME[user.level])}</span>
            <span className="rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-1.5 text-xs font-bold sm:px-3.5 sm:text-sm">{M(user.balance)}</span>
            <span className="hidden md:inline text-sm font-medium text-slate-700">{user.username}</span>
            {user.role === "ADMIN" && <Link href="/admin" className="hidden md:inline-flex items-center rounded-full bg-slate-900 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-slate-700">Admin Panel</Link>}
            <form action={logoutAction} className="hidden sm:block"><button className="btn-ghost btn-sm !py-2 whitespace-nowrap">{L("Đăng xuất")}</button></form>
          </div>
        </div>
      </header>
      <div className="max-w-[1400px] mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-[248px_1fr] gap-6 items-start">
        <aside className="hidden lg:block lg:sticky lg:top-24 lg:bg-white lg:rounded-2xl lg:border lg:border-slate-200/60 lg:shadow-soft lg:p-3">
          <SideNav items={items} footer={menuFooter} />
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
      {s.livechat_enabled !== "0" && <LiveChat />}
      {termsGate}
      {homeModalContent ? <HomeModal content={homeModalContent} /> : null}
    </div>
    </LangProvider>
  );
}
