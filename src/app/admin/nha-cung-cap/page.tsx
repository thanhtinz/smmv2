import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth";
import { PageHead, Flash, Stat, I } from "@/components/ui";
import { ProvidersClient, type ProviderDTO } from "@/components/admin-catalog";
import { dt } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

export default async function AdminProviders({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  await requireAdminPage();
  const { L, Ld } = await getServerI18n(null);
  const [providers, totalServices, enabledServices] = await Promise.all([
    prisma.provider.findMany({ orderBy: { id: "asc" }, include: { _count: { select: { services: true } } } }),
    prisma.smmService.count(),
    prisma.smmService.count({ where: { active: true } }),
  ]);
  const dtos: ProviderDTO[] = providers.map((p) => ({
    id: p.id, kind: p.kind, driver: p.driver, name: p.name, apiUrl: p.apiUrl, currency: p.currency, exchangeRate: p.exchangeRate,
    markupPercent: p.markupPercent, balanceCache: p.balanceCache, active: p.active, note: p.note,
    syncServices: p.syncServices, syncCategories: p.syncCategories, autoUpdatePrice: p.autoUpdatePrice,
    syncContent: p.syncContent, filterHtml: p.filterHtml, syncAdvanced: p.syncAdvanced, coupon: p.coupon, cronSyncLimit: p.cronSyncLimit,
    minBalanceAlert: p.minBalanceAlert, dailyLimit: p.dailyLimit, serviceCount: p._count.services,
    lastSyncAt: p.lastSyncAt ? dt(p.lastSyncAt) : null,
  }));
  const activeCount = providers.filter((p) => p.active).length;
  return (
    <div>
      <PageHead title={L("Quản lý nhà cung cấp")} desc={L("Nhà cung cấp đấu API theo chuẩn SMM v2 — hệ thống tự đồng bộ dịch vụ + giá (cộng markup), tự đẩy đơn và tự cập nhật trạng thái.")} />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={L("Tổng số nhà cung cấp")} value={String(providers.length)} icon={I.server} />
        <Stat label={L("Nhà cung cấp đang hoạt động")} value={String(activeCount)} icon={I.check} tone="emerald" />
        <Stat label={L("Tổng số dịch vụ")} value={String(totalServices)} icon={I.list} tone="violet" />
        <Stat label={L("Tổng số dịch vụ đang bật")} value={String(enabledServices)} icon={I.check} tone="cyan" />
      </div>
      <div className="mt-2">
        <ProvidersClient providers={dtos} />
      </div>
    </div>
  );
}
