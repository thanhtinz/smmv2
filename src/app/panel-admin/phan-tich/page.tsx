import { prisma } from "@/lib/db";
import { requirePanelAccessPage } from "@/lib/panel-access";
import { PageHead, Flash, Stat, I, RankBadge } from "@/components/ui";
import { vnd, num } from "@/lib/format";
import { getStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

/** Phân tích riêng của panel: doanh thu + hoa hồng 30 ngày, top dịch vụ,
 *  top khách và phễu chuyển đổi — chỉ tính trên dữ liệu của panel này. */
export default async function PanelAnalyticsPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const { panel } = await requirePanelAccessPage();
  const since = new Date(Date.now() - 30 * 86400000);
  const [orders, commissionAgg, memberCount, depositedMembers, topServices, topCustomers, premiumAgg] = await Promise.all([
    prisma.smmOrder.findMany({ where: { panelId: panel.id, createdAt: { gte: since } }, select: { charge: true, createdAt: true } }),
    prisma.transaction.aggregate({ where: { userId: panel.ownerId, type: "PANEL_COMMISSION", amount: { gt: 0 }, createdAt: { gte: since } }, _sum: { amount: true } }),
    prisma.user.count({ where: { panelId: panel.id } }),
    prisma.deposit.groupBy({ by: ["userId"], where: { user: { panelId: panel.id }, status: "APPROVED" } }),
    prisma.smmOrder.groupBy({ by: ["serviceId"], where: { panelId: panel.id }, _count: true, _sum: { charge: true }, orderBy: { _count: { serviceId: "desc" } }, take: 5 }),
    prisma.smmOrder.groupBy({ by: ["userId"], where: { panelId: panel.id }, _sum: { charge: true }, _count: true, orderBy: { _sum: { charge: "desc" } }, take: 5 }),
    prisma.premiumOrder.aggregate({ where: { panelId: panel.id }, _count: true, _sum: { total: true, commission: true } }),
  ]);
  const byDay = new Map<string, number>();
  for (const o of orders) {
    const k = o.createdAt.toISOString().slice(0, 10);
    byDay.set(k, (byDay.get(k) || 0) + o.charge);
  }
  const days: { label: string; value: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const k = d.toISOString().slice(0, 10);
    days.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, value: byDay.get(k) || 0 });
  }
  const maxDay = Math.max(1, ...days.map((d) => d.value));
  const revenue30 = days.reduce((a, d) => a + d.value, 0);
  const svcNames = topServices.length ? await prisma.smmService.findMany({ where: { id: { in: topServices.map((t) => t.serviceId) } }, select: { id: true, name: true } }) : [];
  const svcMap = new Map(svcNames.map((s) => [s.id, s.name]));
  const custNames = topCustomers.length ? await prisma.user.findMany({ where: { id: { in: topCustomers.map((t) => t.userId) } }, select: { id: true, username: true } }) : [];
  const custMap = new Map(custNames.map((u) => [u.id, u.username]));
  const orderedMembers = new Set(topCustomers.map((t) => t.userId)).size;
  void orderedMembers;
  const orderedCount = await prisma.smmOrder.groupBy({ by: ["userId"], where: { panelId: panel.id } });
  const full = await getStats({ panelId: panel.id });
  return (
    <div>
      <PageHead title="Phân tích panel" desc="Số liệu 30 ngày gần nhất, chỉ tính trên website của bạn." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Doanh thu SMM (30 ngày)" value={vnd(revenue30)} icon={I.money} tone="amber" />
        <Stat label="Hoa hồng (30 ngày)" value={vnd(commissionAgg._sum.amount || 0)} icon={I.wallet} tone="emerald" />
        <Stat label="Đơn Premium qua panel" value={num(premiumAgg._count)} sub={`Doanh thu ${vnd(premiumAgg._sum.total || 0)} · hoa hồng ${vnd(premiumAgg._sum.commission || 0)}`} icon={I.gem} tone="violet" />
        <Stat label="Khách của panel" value={num(memberCount)} sub={`${num(depositedMembers.length)} khách đã nạp · ${num(orderedCount.length)} khách đã đặt đơn`} icon={I.users} tone="blue" />
      </div>
      <div className="card mb-6 p-6">
        <div className="mb-4 font-bold text-slate-900">Doanh thu theo ngày</div>
        <div className="flex h-44 gap-1">
          {days.map((d) => (
            <div key={d.label} className="flex h-full flex-1 flex-col">
              <div className="flex flex-1 items-end">
                <div className="w-full rounded-t bg-gradient-to-t from-brand-600 to-brand-400 transition hover:from-brand-700 hover:to-brand-500" style={{ height: `${Math.max(2, (d.value / maxDay) * 100)}%` }} title={`${d.label}: ${vnd(d.value)}`} />
              </div>
              <div className="mt-1.5 hidden text-center text-[10px] text-slate-400 md:block">{d.label}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <div className="mb-4 font-bold text-slate-900">Dịch vụ bán chạy qua panel</div>
          <div className="divide-y divide-slate-100">
            {topServices.map((t) => (
              <div key={t.serviceId} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0 truncate font-medium text-slate-700">{svcMap.get(t.serviceId) || `#${t.serviceId}`}</span>
                <span className="shrink-0 text-slate-500">{num(t._count)} đơn · <b className="text-slate-800">{vnd(t._sum.charge || 0)}</b></span>
              </div>
            ))}
            {topServices.length === 0 && <p className="py-3 text-sm text-slate-400">Chưa có đơn nào qua panel.</p>}
          </div>
        </div>
        <div className="card p-6">
          <div className="mb-4 font-bold text-slate-900">Khách chi tiêu nhiều nhất</div>
          <div className="divide-y divide-slate-100">
            {topCustomers.map((t) => (
              <div key={t.userId} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="font-medium text-slate-700">{custMap.get(t.userId) || `#${t.userId}`}</span>
                <span className="text-slate-500">{num(t._count)} đơn · <b className="text-slate-800">{vnd(t._sum.charge || 0)}</b></span>
              </div>
            ))}
            {topCustomers.length === 0 && <p className="py-3 text-sm text-slate-400">Chưa có dữ liệu.</p>}
          </div>
        </div>
      </div>

      <div className="card mt-6 overflow-hidden">
        <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-fuchsia-500 to-violet-600 text-white">{I.gem}</span>
          <span className="font-bold text-slate-900">Premium bán chạy qua panel — 30 ngày</span>
        </div>
        <div className="grid grid-cols-1 gap-x-8 px-5 md:grid-cols-2">
          {full.bestPremium.map((b, i) => (
            <div key={b.name} className="flex items-center gap-3 border-b border-slate-50 py-3">
              <RankBadge rank={i + 1} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">{b.name}</span>
              <span className="shrink-0 text-sm"><b className="text-slate-900">{vnd(b.revenue)}</b> <span className="text-slate-400">· {num(b.quantity)} gói</span></span>
            </div>
          ))}
          {full.bestPremium.length === 0 && <p className="py-5 text-sm text-slate-400">Chưa có đơn Premium nào qua panel trong 30 ngày.</p>}
        </div>
      </div>
    </div>
  );
}
