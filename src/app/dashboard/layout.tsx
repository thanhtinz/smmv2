import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { logoutAction } from "@/app/actions/auth";
import { SideNav, MobileSideNav } from "@/components/nav";
import { DisplaySettings } from "@/components/display";
import { NotificationBell } from "@/components/notification-bell";
import { LiveChat } from "@/components/livechat";
import { TermsGate, HomeModal } from "@/components/gates";
import { I } from "@/components/ui";
import { vnd, LEVEL_NAME } from "@/lib/format";
import { tr } from "@/lib/i18n";
import { getLang } from "@/lib/lang-server";
import { prisma } from "@/lib/db";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const s = await getSettings();
  if (s.maintenance === "1" && user.role === "USER") {
    return <div className="min-h-screen flex items-center justify-center p-6 text-center"><div><h1 className="text-2xl font-bold mb-2">Hệ thống đang bảo trì</h1><p className="text-slate-500">Vui lòng quay lại sau ít phút.</p></div></div>;
  }
  const lang = getLang();
  const L = (t: string) => tr(lang, t);
  const openTickets = await prisma.ticket.count({ where: { userId: user.id, status: "ANSWERED" } });
  // Khách của panel: điều khoản + modal trang chủ dùng bản RIÊNG của panel (nếu panel có bật);
  // panel không bật thì theo web mẹ như cũ.
  const myPanelGate = user.panelId ? await prisma.childPanel.findUnique({
    where: { id: user.panelId },
    select: { termsEnabled: true, termsTitle: true, termsContent: true, termsVersion: true, termsCheckboxText: true, termsButtonText: true, homeModalEnabled: true, homeModalContent: true },
  }) : null;
  const panelTermsOn = !!(myPanelGate?.termsEnabled && myPanelGate.termsContent?.trim());
  let termsGate: React.ReactNode = null;
  if (panelTermsOn || (s.terms_enabled === "1" && s.terms_content?.trim())) {
    const fresh = await prisma.user.findUnique({ where: { id: user.id }, select: { termsAcceptedVersion: true } });
    const ver = panelTermsOn ? myPanelGate!.termsVersion : parseInt(s.terms_version || "1") || 1;
    if ((fresh?.termsAcceptedVersion || 0) < ver) {
      termsGate = panelTermsOn
        ? <TermsGate title={myPanelGate!.termsTitle || "Điều khoản sử dụng"} content={myPanelGate!.termsContent!} checkboxText={myPanelGate!.termsCheckboxText || ""} buttonText={myPanelGate!.termsButtonText || ""} version={ver} />
        : <TermsGate title={s.terms_title} content={s.terms_content} checkboxText={s.terms_checkbox_text} buttonText={s.terms_button_text} version={ver} />;
    }
  }
  const homeModalContent = myPanelGate?.homeModalEnabled && myPanelGate.homeModalContent?.trim()
    ? myPanelGate.homeModalContent
    : s.home_modal_enabled === "1" && s.home_modal_content?.trim() ? s.home_modal_content : null;
  const myPanelFlags = user.panelId ? await prisma.childPanel.findUnique({ where: { id: user.panelId }, select: { sellSmm: true, sellPremium: true, moduleAffiliate: true, moduleBulk: true, moduleSubscriptions: true, moduleCampaigns: true, moduleTickets: true, moduleApi: true } }) : null;
  const smmOn = s.module_smm !== "0" && (myPanelFlags ? myPanelFlags.sellSmm : true);
  const premiumOn = s.module_premium !== "0" && (myPanelFlags ? myPanelFlags.sellPremium : true);
  const affiliateOn = s.module_affiliate !== "0" && (myPanelFlags ? myPanelFlags.moduleAffiliate : true);
  // Mô-đun tính năng: web mẹ tắt là tắt chung; panel tắt chỉ áp cho khách của panel đó
  const bulkOn = s.module_bulk !== "0" && (myPanelFlags ? myPanelFlags.moduleBulk : true);
  const subsOn = s.module_subscriptions !== "0" && (myPanelFlags ? myPanelFlags.moduleSubscriptions : true);
  const campOn = s.module_campaigns !== "0" && (myPanelFlags ? myPanelFlags.moduleCampaigns : true);
  const ticketsOn = s.module_tickets !== "0" && (myPanelFlags ? myPanelFlags.moduleTickets : true);
  const apiOn = s.module_api !== "0" && (myPanelFlags ? myPanelFlags.moduleApi : true);
  const unreadNoti = await prisma.notification.count({ where: { userId: user.id, read: false } });
  // Menu gom nhóm dropdown cho gọn: nhóm nào đang chứa trang hiện tại thì tự mở
  const smmChildren = [
    ...(smmOn ? [{ href: "/dashboard/dat-hang", label: L("Đặt đơn SMM") }] : []),
    ...(smmOn && bulkOn ? [{ href: "/dashboard/dat-hang-loat", label: L("Đặt hàng loạt") }] : []),
    { href: "/dashboard/dich-vu", label: L("Bảng giá") },
    { href: "/dashboard/don-hang", label: L("Đơn hàng SMM") },
    ...(smmOn && subsOn ? [{ href: "/dashboard/dinh-ky", label: L("Đăng ký định kỳ") }] : []),
    ...(smmOn && campOn ? [{ href: "/dashboard/chien-dich", label: L("Chiến dịch") }] : []),
  ];
  const premiumChildren = [
    ...(premiumOn ? [{ href: "/dashboard/premium", label: L("Mua Premium") }] : []),
    { href: "/dashboard/don-premium", label: L("Đơn hàng Premium") },
  ];
  const financeChildren = [
    { href: "/dashboard/nap-tien", label: L("Nạp tiền") },
    { href: "/dashboard/giao-dich", label: L("Lịch sử số dư") },
    ...(affiliateOn ? [{ href: "/dashboard/kiem-tien", label: L("Kiếm tiền") }] : []),
  ];
  const supportChildren = [
    ...(ticketsOn ? [{ href: "/dashboard/ticket", label: L("Hỗ trợ / Ticket"), badge: openTickets }] : []),
    { href: "/dashboard/faq", label: L("Hỏi đáp thường gặp") },
    { href: "/dashboard/thong-bao", label: L("Thông báo"), badge: unreadNoti },
    ...(s.module_blog !== "0" ? [{ href: "/dashboard/bai-viet", label: L("Bài viết") }] : []),
  ];
  const items = [
    { href: "/dashboard", label: L("Tổng quan"), icon: I.home },
    ...(smmChildren.length ? [{ label: L("Đơn SMM"), icon: I.cart, children: smmChildren }] : []),
    ...(premiumChildren.length ? [{ label: L("Premium"), icon: I.gem, children: premiumChildren }] : []),
    ...(financeChildren.length ? [{ label: L("Tài chính"), icon: I.wallet, children: financeChildren }] : []),
    ...(apiOn ? [{ href: "/dashboard/api-docs", label: L("Tài liệu API"), icon: I.key }] : []),
    ...(s.module_panels !== "0" ? [{ href: "/dashboard/panel-cua-toi", label: L("Đăng ký panel con"), icon: I.panels }] : []),
    ...(supportChildren.length ? [{ label: L("Hỗ trợ"), icon: I.ticket, children: supportChildren }] : []),
    { href: "/dashboard/ho-so", label: L("Hồ sơ"), icon: I.users },
    ...(user.role === "ADMIN" ? [{ href: "/admin", label: "Admin Panel", icon: I.shield }] : []),
  ];
  return (
    <div className="min-h-screen">
      <header className="bg-white/90 backdrop-blur border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-[1400px] mx-auto px-4 h-16 flex items-center gap-3 sm:gap-4">
          <MobileSideNav items={items} siteName={s.site_name} />
          <Link href="/" className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-brand-600 text-white font-black flex items-center justify-center">{s.site_logo_text || "S"}</span>
            <span className="font-extrabold text-slate-900 hidden sm:inline">{s.site_name}</span>
          </Link>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2.5">
            <NotificationBell />
            <DisplaySettings />
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hidden sm:inline-block">{LEVEL_NAME[user.level]}</span>
            <span className="rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-1.5 text-sm font-bold sm:px-3.5">{vnd(user.balance)}</span>
            <span className="hidden md:inline text-sm font-medium text-slate-700">{user.username}</span>
            {user.role === "ADMIN" && <Link href="/admin" className="hidden md:inline-flex items-center rounded-full bg-slate-900 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-slate-700">Admin Panel</Link>}
            <form action={logoutAction} className="hidden sm:block"><button className="btn-ghost btn-sm !py-2 whitespace-nowrap">{L("Đăng xuất")}</button></form>
          </div>
        </div>
      </header>
      <div className="max-w-[1400px] mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-[248px_1fr] gap-6 items-start">
        <aside className="hidden lg:block lg:sticky lg:top-24 lg:bg-white lg:rounded-2xl lg:border lg:border-slate-200/60 lg:shadow-soft lg:p-3">
          <SideNav items={items} />
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
      {s.livechat_enabled !== "0" && <LiveChat />}
      {termsGate}
      {homeModalContent ? <HomeModal content={homeModalContent} /> : null}
    </div>
  );
}
