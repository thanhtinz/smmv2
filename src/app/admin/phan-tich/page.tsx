import Link from "next/link";
import { requireAdminPage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHead, Stat, I, RankBadge, Badge } from "@/components/ui";
import { vnd, num, LEVEL_NAME } from "@/lib/format";
import { getStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

export default async function AdminAnalytics() {
  await requireAdminPage();
  const since30 = new Date(Date.now() - 29 * 86400000); since30.setHours(0, 0, 0, 0);
  const notRefunded = { notIn: ["REFUNDED"] } as any;

  const [days, topServices, topCustomers, byProvider, funnel] = await Promise.all([
    prisma.smmOrder.findMany({ where: { createdAt: { gte: since30 }, status: notRefunded }, select: { createdAt: true, charge: true, cost: true } }),
    prisma.smmOrder.groupBy({ by: ["serviceId"], where: { status: notRefunded }, _sum: { charge: true, cost: true }, _count: true, orderBy: { _sum: { charge: "desc" } }, take: 8 }),
    prisma.smmOrder.groupBy({ by: ["userId"], where: { status: notRefunded }, _sum: { charge: true }, _count: true, orderBy: { _sum: { charge: "desc" } }, take: 8 }),
    prisma.smmOrder.groupBy({ by: ["providerId"], where: { status: notRefunded, providerId: { not: null } }, _sum: { charge: true, cost: true }, _count: true }),
    Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { totalDeposited: { gt: 0 } } }),
      prisma.smmOrder.groupBy({ by: ["userId"], where: { status: notRefunded } }).then((r) => r.length),
    ]),
  ]);
  const full = await getStats({});
  const serviceRows = await prisma.smmService.findMany({ where: { id: { in: topServices.map((t) => t.serviceId) } }, select: { id: true, name: true } });
  const serviceName = new Map(serviceRows.map((x) => [x.id, x.name]));
  const userRows = await prisma.user.findMany({ where: { id: { in: topCustomers.map((t) => t.userId) } }, select: { id: true, username: true } });
  const userName = new Map(userRows.map((x) => [x.id, x.username]));
  const providerRows = await prisma.provider.findMany({ select: { id: true, name: true } });
  const providerName = new Map(providerRows.map((x) => [x.id, x.name]));

  const buckets: { label: string; rev: number; profit: number }[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(since30.getTime() + i * 86400000);
    const next = new Date(d.getTime() + 86400000);
    const inDay = days.filter((x) => x.createdAt >= d && x.createdAt < next);
    buckets.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, rev: inDay.reduce((a, x) => a + x.charge, 0), profit: inDay.reduce((a, x) => a + x.charge - x.cost, 0) });
  }
  const maxBar = Math.max(...buckets.map((b) => b.rev), 1);
  const monthRev = buckets.reduce((a, b) => a + b.rev, 0);
  const monthProfit = buckets.reduce((a, b) => a + b.profit, 0);
  const [totalUsers, depositedUsers, orderedUsers] = funnel;

  return (
    <div>
      <PageHead title="Phân tích" desc="Thu nhập tổng (SMM + Premium), mặt hàng bán chạy, top khách và hành vi khách hàng." />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Thu nhập hôm nay" value={vnd(full.today.revenue)} sub={`Lãi ${vnd(full.today.profit)} · ${num(full.today.orders)} đơn`} icon={I.money} tone="blue" />
        <Stat label="Thu nhập 7 ngày" value={vnd(full.last7.revenue)} sub={`Lãi ${vnd(full.last7.profit)} · ${num(full.last7.orders)} đơn`} icon={I.chart} tone="cyan" />
        <Stat label="Thu nhập 30 ngày" value={vnd(full.last30.revenue)} sub={`Lãi ${vnd(full.last30.profit)} · ${num(full.last30.orders)} đơn`} icon={I.chart} tone="violet" />
        <Stat label="Thu nhập tháng này" value={vnd(full.month.revenue)} sub={`Lãi ${vnd(full.month.profit)} · Nạp ${vnd(full.month.deposits)}`} icon={I.wallet} tone="emerald" />
      </div>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Doanh thu SMM 30 ngày" value={vnd(monthRev)} icon={I.chart} tone="blue" />
        <Stat label="Lợi nhuận SMM 30 ngày" value={vnd(monthProfit)} icon={I.money} tone="emerald" sub={monthRev > 0 ? `Biên lợi nhuận ${Math.round((monthProfit / monthRev) * 100)}%` : undefined} />
        <Stat label="Tỉ lệ khách nạp tiền / đăng ký" value={totalUsers ? `${Math.round((depositedUsers / totalUsers) * 100)}%` : "0%"} icon={I.users} tone="violet" sub={`${num(depositedUsers)} / ${num(totalUsers)} tài khoản`} />
      </div>

      <div className="card p-6">
        <div className="mb-4 font-bold text-slate-900">Doanh thu theo ngày — 30 ngày</div>
        <div className="flex h-40 items-end gap-1">
          {buckets.map((b) => (
            <div key={b.label} className="group flex min-w-0 flex-1 flex-col items-center gap-1.5" title={`${b.label}: ${vnd(b.rev)}`}>
              <div className="w-full rounded-t bg-gradient-to-t from-brand-600 to-brand-400 transition group-hover:from-brand-700 group-hover:to-brand-500" style={{ height: `${Math.max(2, (b.rev / maxBar) * 120)}px` }} />
              <div className="hidden text-[9px] text-slate-400 xl:block">{b.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="card h-full overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4 font-bold text-slate-900">Dịch vụ doanh thu cao nhất</div>
          <table className="w-full"><tbody className="divide-y divide-slate-100">
            {topServices.map((t) => (
              <tr key={t.serviceId}>
                <td className="td"><div className="max-w-[220px] truncate font-medium">{serviceName.get(t.serviceId) || `#${t.serviceId}`}</div><div className="text-xs text-slate-400">{num(t._count)} đơn</div></td>
                <td className="td text-right"><div className="font-bold">{vnd(t._sum.charge || 0)}</div><div className="text-xs text-emerald-600">lãi {vnd((t._sum.charge || 0) - (t._sum.cost || 0))}</div></td>
              </tr>
            ))}
            {topServices.length === 0 && <tr><td className="td text-slate-400">Chưa có dữ liệu</td></tr>}
          </tbody></table>
        </div>
        <div className="card h-full overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4 font-bold text-slate-900">Khách chi tiêu nhiều nhất</div>
          <table className="w-full"><tbody className="divide-y divide-slate-100">
            {topCustomers.map((t) => (
              <tr key={t.userId}>
                <td className="td"><Link href={`/admin/nguoi-dung/${t.userId}`} className="font-medium text-brand-700">{userName.get(t.userId) || `#${t.userId}`}</Link><div className="text-xs text-slate-400">{num(t._count)} đơn</div></td>
                <td className="td text-right font-bold">{vnd(t._sum.charge || 0)}</td>
              </tr>
            ))}
            {topCustomers.length === 0 && <tr><td className="td text-slate-400">Chưa có dữ liệu</td></tr>}
          </tbody></table>
        </div>
        <div className="space-y-6">
          <div className="card overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-4 font-bold text-slate-900">Hiệu quả theo nhà cung cấp</div>
            <table className="w-full"><tbody className="divide-y divide-slate-100">
              {byProvider.map((t) => (
                <tr key={String(t.providerId)}>
                  <td className="td"><span className="font-medium">{providerName.get(t.providerId!) || "Thủ công"}</span><div className="text-xs text-slate-400">{num(t._count)} đơn</div></td>
                  <td className="td text-right"><div className="font-bold">{vnd(t._sum.charge || 0)}</div><div className="text-xs text-emerald-600">lãi {vnd((t._sum.charge || 0) - (t._sum.cost || 0))}</div></td>
                </tr>
              ))}
              {byProvider.length === 0 && <tr><td className="td text-slate-400">Chưa có đơn qua API</td></tr>}
            </tbody></table>
          </div>
          <div className="card p-5">
            <div className="mb-4 font-bold text-slate-900">Phễu khách hàng</div>
            <div className="space-y-3">
              {[
                { label: "Đăng ký tài khoản", value: totalUsers },
                { label: "Đã nạp tiền", value: depositedUsers },
                { label: "Đã đặt đơn SMM", value: orderedUsers },
              ].map((f, _i, arr) => (
                <div key={f.label}>
                  <div className="mb-1 flex justify-between text-sm"><span className="text-slate-600">{f.label}</span><b>{num(f.value)}</b></div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-400" style={{ width: `${arr[0].value ? Math.round((f.value / arr[0].value) * 100) : 0}%` }} /></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-fuchsia-500 to-violet-600 text-white">{I.gem}</span>
            <span className="font-bold text-slate-900">Premium bán chạy — 30 ngày</span>
          </div>
          <div className="divide-y divide-slate-50 px-5">
            {full.bestPremium.map((b, i) => (
              <div key={b.name} className="flex items-center gap-3 py-3">
                <RankBadge rank={i + 1} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">{b.name}</span>
                <span className="shrink-0 text-sm"><b className="text-slate-900">{vnd(b.revenue)}</b> <span className="text-slate-400">· {num(b.quantity)} gói</span></span>
              </div>
            ))}
            {full.bestPremium.length === 0 && <p className="py-5 text-sm text-slate-400">Chưa có đơn Premium nào trong 30 ngày.</p>}
          </div>
        </div>
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white">{I.users}</span>
            <span className="font-bold text-slate-900">Top khách chi tiêu — SMM + Premium</span>
          </div>
          <div className="divide-y divide-slate-50 px-5">
            {full.topUsers.map((u, i) => (
              <div key={u.id} className="flex items-center gap-3 py-3">
                <RankBadge rank={i + 1} />
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <Link href={`/admin/nguoi-dung/${u.id}`} className="truncate text-sm font-semibold text-slate-800 hover:text-brand-700">{u.username}</Link>
                  <Badge cls={u.level === "VIP" ? "bg-amber-100 text-amber-800" : u.level === "AGENCY" ? "bg-violet-100 text-violet-800" : u.level === "RESELLER" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-600"}>{LEVEL_NAME[u.level] || u.level}</Badge>
                </span>
                <span className="shrink-0 text-sm"><b className="text-slate-900">{vnd(u.spend)}</b> <span className="text-slate-400">· {num(u.orders)} đơn</span></span>
              </div>
            ))}
            {full.topUsers.length === 0 && <p className="py-5 text-sm text-slate-400">Chưa có dữ liệu khách.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
