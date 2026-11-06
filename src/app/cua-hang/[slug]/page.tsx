import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { SiteFooter } from "@/components/site";
import { getCurrentUser } from "@/lib/auth";
import { LandingView } from "@/components/landing";
import { LandingLight, LandingClassic } from "@/components/landing-variants";

export const dynamic = "force-dynamic";

export default async function PanelStorefront({ params }: { params: { slug: string } }) {
  const panel = await prisma.childPanel.findUnique({ where: { slug: params.slug } });
  if (!panel || panel.status !== "ACTIVE") notFound();
  const { getSettings } = await import("@/lib/settings");
  const motherSettings = await getSettings();
  if (motherSettings.module_panels === "0") notFound();
  const user = await getCurrentUser().catch(() => null);
  // Khách của panel này đã đăng nhập thì về thẳng bảng điều khiển (chủ panel vẫn xem được gian hàng của mình)
  if (user && user.panelId === panel.id) { const { redirect } = await import("next/navigation"); redirect("/dashboard"); }
  const panelRate = (r: number) => Math.round(r * (1 + panel.markup / 100));
  const [services, categories, memberCount, panelOrderCount, panelPremiumCount, premiums, statusGroups] = await Promise.all([
    prisma.smmService.findMany({ where: { active: true, OR: [{ panelId: null }, { panelId: panel.id }] }, include: { category: true }, orderBy: [{ categoryId: "asc" }, { sort: "asc" }, { id: "asc" }] }),
    prisma.smmCategory.findMany({ where: { active: true }, orderBy: { sort: "asc" } }),
    prisma.user.count({ where: { panelId: panel.id } }),
    prisma.smmOrder.count({ where: { panelId: panel.id } }),
    prisma.premiumOrder.count({ where: { panelId: panel.id } }),
    prisma.premiumProduct.findMany({ where: { active: true, OR: [{ panelId: null }, { panelId: panel.id }] }, take: 4, orderBy: { sort: "asc" }, include: { variants: { where: { active: true }, orderBy: { price: "asc" }, take: 1 } } }),
    prisma.smmOrder.groupBy({ by: ["status"], where: { panelId: panel.id }, _count: true }),
  ]);
  const platformStats = Object.values(
    services.reduce<Record<string, { platform: string; count: number; from: number }>>((acc, sv) => {
      const p = sv.category.platform;
      if (!acc[p]) acc[p] = { platform: p, count: 0, from: sv.panelId ? sv.rate : panelRate(sv.rate) };
      acc[p].count += 1;
      acc[p].from = Math.min(acc[p].from, sv.panelId ? sv.rate : panelRate(sv.rate));
      return acc;
    }, {})
  ).sort((a, b) => b.count - a.count);
  const catsByPlatform = new Map<string, string[]>();
  for (const c of categories) {
    const arr = catsByPlatform.get(c.platform) || [];
    const pt = c.name.replace(/^(Facebook|TikTok|Instagram|YouTube|Telegram|Shopee)\s*/i, "").trim(); if (pt) arr.push(pt);
    catsByPlatform.set(c.platform, arr);
  }
  const doneCount = statusGroups.filter((g) => g.status === "COMPLETED" || g.status === "PARTIAL").reduce((a, g) => a + g._count, 0);
  const completion = panelOrderCount > 0 ? Math.round((doneCount / panelOrderCount) * 1000) / 10 : 100;
  const registerHref = `/cua-hang/${panel.slug}/dang-ky`;

  const tpl = panel.landingTemplate || motherSettings.landing_template;
  const Landing = tpl === "sang" ? LandingLight : tpl === "co-dien" ? LandingClassic : LandingView;
  return (
    <div data-accent={panel.accent}>
      <Landing
        showSmm={panel.sellSmm}
        showPremium={panel.sellPremium}
        brandName={panel.name}
        tagline={panel.landingSubtitle || panel.tagline}
        headline={panel.landingHeadline}
        loggedIn={!!user}
        stats={{ services: services.length, premium: premiums.length, orders: panelOrderCount + panelPremiumCount, users: memberCount, completion }}
        platforms={platformStats.map((p) => ({ ...p, points: catsByPlatform.get(p.platform) || [] }))}
        premiums={premiums.filter((p) => p.variants[0]).map((p) => ({ name: p.name, tagline: p.tagline, from: p.panelId ? p.variants[0].price : panelRate(p.variants[0].price), href: `/cua-hang/${panel.slug}/premium/${p.slug}` }))}
        sampleService={services[0]?.name}
        links={{ login: "/login", register: registerHref, dashboard: "/dashboard", order: "/dashboard/dat-hang", services: registerHref, api: "/dashboard/api-docs" }}
        announcement={panel.announcement}
        footer={<SiteFooter noTabBar brand={{ slug: panel.slug, name: panel.name, tagline: panel.tagline, zalo: panel.supportZalo, telegram: panel.supportTelegram, facebook: panel.supportFacebook, hotline: panel.supportHotline }} />}
      />
    </div>
  );
}
