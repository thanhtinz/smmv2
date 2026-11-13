import { redirect } from "next/navigation";
import { guardSetupDone } from "@/lib/setup";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { SideNav } from "@/components/nav";
import { AppTopBar } from "@/components/topbar";
import { wideLogoUrl } from "@/lib/brand";
import { buildCustomerNav } from "@/components/customer-nav";
import { LiveChat } from "@/components/livechat";
import { SiteFooter } from "@/components/site";
import { TermsGate, HomeModal } from "@/components/gates";
import { LEVEL_NAME } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";
import { LangProvider } from "@/components/lang";
import { prisma } from "@/lib/db";
import SeasonalDecor from "@/components/seasonal-decor";
import { parseSeasonalTheme } from "@/lib/seasonal";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await guardSetupDone();
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const s = await getSettings();
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
  // Menu + cụm đáy + header nay là component dùng chung với khung công khai
  // (components/customer-nav + components/topbar) — markup không đổi.
  const { items, menuFooter } = await buildCustomerNav(user, s, L);
  // Chuỗi logo (đợt 117 + 118): logo menu (logo_menu_url) → logo nhỏ
  // (logo_url) → logo BNT Shop gói sẵn bản ngang (lib/brand). Header mọi khổ
  // + đầu ngăn kéo đều dùng bản ngang (bỏ icon vuông ở header desktop).
  const drawerLogoUrl = wideLogoUrl(s.logo_menu_url, s.logo_url);
  // Trang trí mùa lễ hội: cùng nguồn settings + cùng component với khung công khai.
  const decorTheme = s.seasonal_decor_enabled === "1" ? parseSeasonalTheme(s.seasonal_theme) : null;
  return (
    <LangProvider lang={i18n.lang} ov={i18n.cfg.overrides[i18n.lang]} cur={i18n.cur} rates={i18n.rates}>
    <div className="min-h-screen">
      <AppTopBar user={{ username: user.username, balance: user.balance, role: user.role, levelLabel: LEVEL_NAME[user.level] }} siteName={s.site_name} logoText={s.site_logo_text || "B"} wideLogoUrl={drawerLogoUrl} drawerLogoUrl={drawerLogoUrl} items={items} menuFooter={menuFooter} L={L} M={M} />
      {decorTheme ? <SeasonalDecor theme={decorTheme} /> : null}
      <div className="max-w-[1400px] mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-[248px_1fr] gap-6 items-start">
        <aside className="hidden lg:block lg:sticky lg:top-24 lg:bg-white lg:rounded-2xl lg:border lg:border-slate-200/60 lg:shadow-soft lg:p-3">
          <SideNav items={items} footer={menuFooter} />
        </aside>
        <main className="min-w-0">
          {children}
          {/* Footer dùng chung với trang công khai (lệnh Tín 2026-11-12: dashboard
              mất footer) — nằm cuối cột nội dung, widgets tắt vì layout đã có
              LiveChat riêng ở dưới. */}
          <SiteFooter widgets={false} />
        </main>
      </div>
      {s.livechat_enabled !== "0" && <LiveChat />}
      {termsGate}
      {homeModalContent ? <HomeModal content={homeModalContent} /> : null}
    </div>
    </LangProvider>
  );
}
