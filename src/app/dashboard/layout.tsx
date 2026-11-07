import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { logoutAction } from "@/app/actions/auth";
import { SideNav, MobileSideNav, MenuFooter, type NavEntry } from "@/components/nav";
import { DisplaySettings } from "@/components/display";
import { NotificationBell } from "@/components/notification-bell";
import { LiveChat } from "@/components/livechat";
import { TermsGate, HomeModal } from "@/components/gates";
import { I, PLATFORM_COLORS } from "@/components/ui";
import { vnd, LEVEL_NAME, PLATFORMS } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";
import { prisma } from "@/lib/db";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const s = await getSettings();
  if (s.maintenance === "1" && user.role === "USER") {
    return <div className="min-h-screen flex items-center justify-center p-6 text-center"><div><h1 className="text-2xl font-bold mb-2">Hệ thống đang bảo trì</h1><p className="text-slate-500">Vui lòng quay lại sau ít phút.</p></div></div>;
  }
  const openTickets = await prisma.ticket.count({ where: { userId: user.id, status: "ANSWERED" } });
  // Khách của panel: điều khoản + modal trang chủ dùng bản RIÊNG của panel (nếu panel có bật);
  // panel không bật thì theo web mẹ như cũ.
  const myPanelGate = user.panelId ? await prisma.childPanel.findUnique({
    where: { id: user.panelId },
    select: { termsEnabled: true, termsTitle: true, termsContent: true, termsVersion: true, termsCheckboxText: true, termsButtonText: true, homeModalEnabled: true, homeModalContent: true, langConfig: true, logoUrl: true },
  }) : null;
  const { L } = await getServerI18n(myPanelGate?.langConfig ?? undefined);
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
  const myPanelFlags = user.panelId ? await prisma.childPanel.findUnique({ where: { id: user.panelId }, select: { sellSmm: true, sellPremium: true, moduleAffiliate: true, moduleBulk: true, moduleTickets: true, moduleApi: true, hiddenCats: true } }) : null;
  const smmOn = s.module_smm !== "0" && (myPanelFlags ? myPanelFlags.sellSmm : true);
  const premiumOn = s.module_premium !== "0" && (myPanelFlags ? myPanelFlags.sellPremium : true);
  const affiliateOn = s.module_affiliate !== "0" && (myPanelFlags ? myPanelFlags.moduleAffiliate : true);
  // Mô-đun tính năng: web mẹ tắt là tắt chung; panel tắt chỉ áp cho khách của panel đó
  const bulkOn = s.module_bulk !== "0" && (myPanelFlags ? myPanelFlags.moduleBulk : true);
  const ticketsOn = s.module_tickets !== "0" && (myPanelFlags ? myPanelFlags.moduleTickets : true);
  const apiOn = s.module_api !== "0" && (myPanelFlags ? myPanelFlags.moduleApi : true);
  const unreadNoti = await prisma.notification.count({ where: { userId: user.id, read: false } });
  // Menu gom nhóm dropdown cho gọn: nhóm nào đang chứa trang hiện tại thì tự mở
  const smmChildren = [
    ...(smmOn ? [{ href: "/dashboard/dat-hang", label: L("Đặt đơn SMM") }] : []),
    ...(smmOn && bulkOn ? [{ href: "/dashboard/dat-hang-loat", label: L("Đặt hàng loạt") }] : []),
    { href: "/dashboard/don-hang", label: L("Đơn hàng SMM") },
  ];
  const premiumChildren = [
    ...(premiumOn ? [{ href: "/dashboard/premium", label: L("Mua Premium") }] : []),
    { href: "/dashboard/don-premium", label: L("Đơn hàng Premium") },
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
  // Phân đoạn DỊCH VỤ SMM (mẫu trumapi): từng nền tảng là một mục dropdown riêng, mục con là
  // các phân loại của nền tảng đó; bấm phân loại mở trang đặt đơn đã chọn sẵn nền tảng + phân loại.
  // Nguồn dữ liệu = đúng truy vấn trang đặt đơn dùng (dịch vụ đang bật theo phạm vi site hiện tại,
  // phân loại đang bật, trừ phân loại panel ẩn) để menu không bao giờ lệch catalog thật.
  let platformEntries: NavEntry[] = [];
  if (smmOn) {
    const [svcRows, catRows] = await Promise.all([
      prisma.smmService.findMany({ where: { active: true, OR: [{ panelId: null }, ...(user.panelId ? [{ panelId: user.panelId }] : [])] }, select: { categoryId: true } }),
      prisma.smmCategory.findMany({ where: { active: true }, orderBy: { sort: "asc" } }),
    ]);
    const hiddenCatIds = new Set((myPanelFlags?.hiddenCats || "").split(",").map((x) => parseInt(x.trim())).filter((n) => Number.isFinite(n)));
    const withSvc = new Set(svcRows.map((r) => r.categoryId));
    const visCats = catRows.filter((c) => withSvc.has(c.id) && !hiddenCatIds.has(c.id));
    const platOrder = ["facebook", "tiktok", "youtube", "instagram", "telegram", "x", "twitter", "threads", "discord", "google"];
    const rank = (p: string) => (p === "other" ? 999 : platOrder.indexOf(p) >= 0 ? platOrder.indexOf(p) : 100);
    const plats = Array.from(new Set(visCats.map((c) => c.platform))).sort((a, b) => rank(a) - rank(b) || (PLATFORMS[a] || a).localeCompare(PLATFORMS[b] || b));
    if (plats.length) {
      platformEntries = [
        { section: L("Dịch vụ SMM") },
        ...plats.map((p) => ({
          label: p === "other" ? L("Khác") : PLATFORMS[p] || p,
          icon: <span className="flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-black text-white" style={{ background: PLATFORM_COLORS[p] || "#64748b" }}>{(PLATFORMS[p] || p).charAt(0)}</span>,
          scrollChildren: true,
          children: visCats.filter((c) => c.platform === p).map((c) => ({ href: `/dashboard/dat-hang?platform=${encodeURIComponent(p)}&cat=${c.id}`, label: c.name })),
        })),
      ];
    }
  }
  const items: NavEntry[] = [
    { href: "/dashboard", label: L("Tổng quan"), icon: I.home },
    ...(smmChildren.length ? [{ label: L("Đơn SMM"), icon: I.cart, children: smmChildren }] : []),
    ...(premiumChildren.length ? [{ label: L("Premium"), icon: I.gem, children: premiumChildren }] : []),
    ...(financeChildren.length ? [{ label: L("Tài chính"), icon: I.wallet, children: financeChildren }] : []),
    ...(apiOn ? [{ href: "/dashboard/api-docs", label: L("Tài liệu API"), icon: I.key }] : []),
    ...(s.module_panels !== "0" ? [{ href: "/dashboard/panel-cua-toi", label: L("Đăng ký panel con"), icon: I.panels }] : []),
    ...(supportChildren.length ? [{ label: L("Hỗ trợ"), icon: I.ticket, children: supportChildren }] : []),
    ...platformEntries,
    { href: "/dashboard/ho-so", label: L("Hồ sơ"), icon: I.users },
    ...(user.role === "ADMIN" ? [{ href: "/admin", label: "Admin Panel", icon: I.shield }] : []),
  ];
  // Cụm thẻ cuối menu: Nạp tiền (thẻ riêng) + thẻ tài khoản (tên/email thật của người dùng)
  const nameParts = (user.fullName || user.username).trim().split(/\s+/);
  const accountInitials = (nameParts.length > 1 ? nameParts[0][0] + nameParts[nameParts.length - 1][0] : (user.fullName || user.username).slice(0, 2)).toUpperCase();
  const menuFooter = <MenuFooter depositLabel={L("Nạp tiền")} accountName={user.fullName || user.username} accountEmail={user.email} accountInitials={accountInitials} />;
  // Logo đầu menu burger: panel có logo riêng thì dùng logo panel, không thì logo web mẹ (settings logo_url)
  const drawerLogoUrl = (user.panelId ? myPanelGate?.logoUrl : null) || s.logo_url || null;
  return (
    <div className="min-h-screen">
      <header className="bg-white/90 backdrop-blur border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-[1400px] mx-auto px-3 sm:px-4 h-16 flex items-center gap-2 sm:gap-4">
          <MobileSideNav items={items} siteName={s.site_name} footer={menuFooter} logoUrl={drawerLogoUrl} logoText={s.site_logo_text || "S"} />
          <Link href="/" className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-brand-600 text-white font-black flex items-center justify-center">{s.site_logo_text || "S"}</span>
            <span className="font-extrabold text-slate-900 hidden sm:inline">{s.site_name}</span>
          </Link>
          <div className="ml-auto flex items-center gap-1 sm:gap-2.5">
            <Link href="/dashboard/dich-vu" className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-brand-100 bg-brand-50 px-2 py-1.5 text-xs font-bold text-brand-700 transition hover:bg-brand-100 sm:px-3.5 sm:text-sm">
              <span className="shrink-0 [&>svg]:h-4 [&>svg]:w-4">{I.chart}</span>
              {L("Bảng giá")}
            </Link>
            <NotificationBell />
            <DisplaySettings />
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hidden sm:inline-block">{LEVEL_NAME[user.level]}</span>
            <span className="rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-1.5 text-xs font-bold sm:px-3.5 sm:text-sm">{vnd(user.balance)}</span>
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
  );
}
