import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getCurrentUser } from "@/lib/auth";
import { SiteFooter } from "@/components/site";
import { LandingView } from "@/components/landing";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const s = await getSettings();
  const user = await getCurrentUser().catch(() => null);
  if (s.landing_enabled === "0") redirect(user ? "/dashboard" : "/login");
  const [serviceCount, premiumCount, smmOrderCount, premiumOrderCount, userCount, featured, premiums, allServices, categories, statusGroups] = await Promise.all([
    prisma.smmService.count({ where: { active: true } }),
    prisma.premiumProduct.count({ where: { active: true } }),
    prisma.smmOrder.count(),
    prisma.premiumOrder.count(),
    prisma.user.count(),
    prisma.smmService.findMany({ where: { active: true }, take: 5, orderBy: { id: "asc" }, include: { category: true } }),
    prisma.premiumProduct.findMany({ where: { active: true, panelId: null }, take: 4, orderBy: { sort: "asc" }, include: { variants: { where: { active: true }, orderBy: { price: "asc" }, take: 1 } } }),
    prisma.smmService.findMany({ where: { active: true }, select: { rate: true, category: { select: { platform: true } } } }),
    prisma.smmCategory.findMany({ where: { active: true }, orderBy: { sort: "asc" } }),
    prisma.smmOrder.groupBy({ by: ["status"], _count: true }),
  ]);
  const platformStats = Object.values(
    allServices.reduce<Record<string, { platform: string; count: number; from: number }>>((acc, sv) => {
      const p = sv.category.platform;
      if (!acc[p]) acc[p] = { platform: p, count: 0, from: sv.rate };
      acc[p].count += 1;
      acc[p].from = Math.min(acc[p].from, sv.rate);
      return acc;
    }, {})
  ).sort((a, b) => b.count - a.count);
  const catsByPlatform = new Map<string, string[]>();
  for (const c of categories) {
    const arr = catsByPlatform.get(c.platform) || [];
    arr.push(c.name.replace(/^(Facebook|TikTok|Instagram|YouTube|Telegram|Shopee)\s*/i, ""));
    catsByPlatform.set(c.platform, arr);
  }
  const doneCount = statusGroups.filter((g) => g.status === "COMPLETED" || g.status === "PARTIAL").reduce((a, g) => a + g._count, 0);
  const completion = smmOrderCount > 0 ? Math.round((doneCount / smmOrderCount) * 1000) / 10 : 100;

  return (
    <LandingView
      showSmm={s.module_smm !== "0"}
      showPremium={s.module_premium !== "0"}
      brandName={s.site_name}
      tagline={s.landing_subtitle || s.site_tagline}
      headline={s.landing_headline || null}
      loggedIn={!!user}
      stats={{ services: serviceCount, premium: premiumCount, orders: smmOrderCount + premiumOrderCount, users: userCount, completion }}
      platforms={platformStats.map((p) => ({ ...p, points: catsByPlatform.get(p.platform) || [] }))}
      premiums={premiums.filter((p) => p.variants[0]).map((p) => ({ name: p.name, tagline: p.tagline, from: p.variants[0].price, href: `/premium/${p.slug}` }))}
      sampleService={featured[0]?.name}
      links={{ login: "/login", register: "/register", dashboard: "/dashboard", order: "/dashboard/dat-hang", services: "/dich-vu", api: "/api-docs" }}
      footer={<SiteFooter />}
    />
  );
}
