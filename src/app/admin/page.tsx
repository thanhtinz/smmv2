import Link from "next/link";
import { prisma } from "@/lib/db";
import { Stat, I, Badge, PageHead } from "@/components/ui";
import { num, SMM_STATUS, dt } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

const TX_LABEL: Record<string, string> = {
  DEPOSIT: "Nạp tiền", SMM_ORDER: "Đặt đơn SMM", PREMIUM_ORDER: "Mua Premium",
  REFUND: "Hoàn tiền", ADJUST: "Điều chỉnh", BONUS: "Thưởng nạp",
  PANEL_COMMISSION: "Hoa hồng panel", REFERRAL_COMMISSION: "Hoa hồng giới thiệu", PANEL_FEE: "Phí tạo website con",
};

/** Tổng quan admin — bố cục khối bám panel mẫu: 2 thẻ lớn → 4 ô thống kê →
 *  Phân Tích Tài Chính (Thu–Chi + Top 5 nền tảng) → Báo cáo chi tiết
 *  (Giao dịch gần đây + Hoạt động gần đây) → Đơn hàng mới nhất + số dư/ticket. */
export default async function AdminHome() {
  const { L, Ld, M } = await getServerI18n(null);
  const now = new Date();
  const startDay = new Date(now); startDay.setHours(0, 0, 0, 0);
  const notRefunded = { notIn: ["REFUNDED"] } as any;
  const preValid = { notIn: ["REFUNDED", "CANCELED"] } as any;

  const [userAgg, newUsersToday, totalUsers, depAll,
    smmToday, preToday, smmAllAgg, preAllAgg,
    smmTotal, preTotal, ticketOpen, openTickets,
    recentSmm, recentTx, recentEvents, byService] = await Promise.all([
    // Tổng quan của MẸ chỉ tính tài khoản/nạp của MẸ — account + số dư của site con là riêng, mẹ không xem
    prisma.user.aggregate({ where: { panelId: null }, _sum: { balance: true } }),
    prisma.user.count({ where: { createdAt: { gte: startDay }, panelId: null } }),
    prisma.user.count({ where: { panelId: null } }),
    prisma.deposit.aggregate({ where: { status: "APPROVED", user: { panelId: null } }, _sum: { amount: true } }),
    prisma.smmOrder.aggregate({ where: { createdAt: { gte: startDay }, status: notRefunded }, _sum: { charge: true }, _count: true }),
    prisma.premiumOrder.aggregate({ where: { createdAt: { gte: startDay }, status: preValid }, _sum: { total: true }, _count: true }),
    prisma.smmOrder.aggregate({ where: { status: notRefunded }, _sum: { charge: true } }),
    prisma.premiumOrder.aggregate({ where: { status: preValid }, _sum: { total: true } }),
    prisma.smmOrder.count(),
    prisma.premiumOrder.count(),
    prisma.ticket.count({ where: { status: "OPEN", user: { panelId: null } } }),
    prisma.ticket.findMany({ where: { status: "OPEN", user: { panelId: null } }, orderBy: { id: "desc" }, take: 5, include: { user: true } }),
    prisma.smmOrder.findMany({ orderBy: { id: "desc" }, take: 6, include: { service: true, user: true } }),
    prisma.transaction.findMany({ where: { user: { panelId: null } }, orderBy: { id: "desc" }, take: 6, include: { user: true } }),
    prisma.orderEvent.findMany({ orderBy: { id: "desc" }, take: 6, include: { order: { include: { user: true } } } }),
    prisma.smmOrder.groupBy({ by: ["serviceId"], _count: true }),
  ]);

  const totalRevenue = (smmAllAgg._sum.charge || 0) + (preAllAgg._sum.total || 0);
  const revToday = (smmToday._sum.charge || 0) + (preToday._sum.total || 0);
  const ordersToday = smmToday._count + preToday._count;
  const totalOrders = smmTotal + preTotal;
  const thu = depAll._sum.amount || 0;
  const chi = totalRevenue;

  // Top 5 nền tảng theo số đơn
  const svcIds = byService.map((g) => g.serviceId);
  const svcs = svcIds.length ? await prisma.smmService.findMany({ where: { id: { in: svcIds } }, include: { category: true } }) : [];
  const platOf = new Map(svcs.map((sv) => [sv.id, sv.category?.platform || L("Khác")]));
  const platCount = new Map<string, number>();
  for (const g of byService) {
    const p = platOf.get(g.serviceId) || L("Khác");
    platCount.set(p, (platCount.get(p) || 0) + g._count);
  }
  const topPlatforms = Array.from(platCount.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5);
  const maxPlat = Math.max(...topPlatforms.map((p) => p.count), 1);

  return (
    <div>
      <PageHead title={L("Tổng quan")} desc={L("Toàn cảnh kinh doanh của hệ thống.")} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="card relative overflow-hidden p-6">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-500 to-brand-300" />
          <div className="text-sm font-medium text-slate-400">{L("Tổng doanh thu")}</div>
          <div className="mt-1 text-3xl font-extrabold text-slate-900">{M(totalRevenue)}</div>
          <div className="mt-2 text-sm text-slate-500">{L("Hôm nay:")} <b className="text-slate-700">{M(revToday)}</b></div>
        </div>
        <div className="card relative overflow-hidden p-6">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-500 to-violet-300" />
          <div className="text-sm font-medium text-slate-400">{L("Tổng đơn hàng")}</div>
          <div className="mt-1 text-3xl font-extrabold text-slate-900">{num(totalOrders)}</div>
          <div className="mt-2 text-sm text-slate-500">{L("Hôm nay:")} <b className="text-slate-700">{Ld(`${num(ordersToday)} đơn`)}</b> {Ld(`· ${num(smmTotal)} SMM · ${num(preTotal)} Premium`)}</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label={L("Người dùng mới hôm nay")} value={num(newUsersToday)} icon={I.users} tone="cyan" />
        <Stat label={L("Ticket đang mở")} value={num(ticketOpen)} icon={I.ticket} tone="rose" />
        <Stat label={L("Tổng số dư khách")} value={M(userAgg._sum.balance || 0)} icon={I.wallet} tone="blue" />
        <Stat label={L("Tổng người dùng")} value={num(totalUsers)} icon={I.users} tone="violet" />
      </div>

      <h2 className="mb-3 mt-8 text-sm font-extrabold uppercase tracking-wide text-slate-400">{L("Phân tích tài chính")}</h2>
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <div className="card p-6">
          <div className="mb-4 font-bold text-slate-900">{L("Báo cáo thu - chi")}</div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-emerald-50 px-4 py-3.5">
              <div className="text-[11px] font-medium uppercase tracking-wide text-emerald-500">{L("Thu (tổng nạp)")}</div>
              <div className="mt-0.5 truncate text-lg font-bold text-emerald-700">{M(thu)}</div>
            </div>
            <div className="rounded-xl bg-rose-50 px-4 py-3.5">
              <div className="text-[11px] font-medium uppercase tracking-wide text-rose-500">{L("Chi (tổng đơn)")}</div>
              <div className="mt-0.5 truncate text-lg font-bold text-rose-700">{M(chi)}</div>
            </div>
            <div className="rounded-xl bg-brand-50 px-4 py-3.5">
              <div className="text-[11px] font-medium uppercase tracking-wide text-brand-500">{L("Chênh lệch")}</div>
              <div className="mt-0.5 truncate text-lg font-bold text-brand-700">{M(thu - chi)}</div>
            </div>
          </div>
        </div>
        <div className="card p-6">
          <div className="mb-4 font-bold text-slate-900">{L("Top 5 nền tảng")}</div>
          <div className="space-y-3.5">
            {topPlatforms.map((p, i) => (
              <div key={p.name}>
                <div className="mb-1.5 flex items-center gap-2 text-sm">
                  <span className="font-bold text-slate-400">#{i + 1}</span>
                  <span className="font-medium text-slate-700">{p.name}</span>
                  <span className="ml-auto font-semibold text-slate-900">{Ld(`${num(p.count)} đơn`)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-400" style={{ width: `${Math.round((p.count / maxPlat) * 100)}%` }} />
                </div>
              </div>
            ))}
            {topPlatforms.length === 0 && <p className="text-sm text-slate-400">{L("Chưa có đơn nào.")}</p>}
          </div>
        </div>
      </div>

      <h2 className="mb-3 mt-8 text-sm font-extrabold uppercase tracking-wide text-slate-400">{L("Báo cáo chi tiết")}</h2>
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <div className="card overflow-hidden">
          <div className="flex justify-between border-b border-slate-100 px-5 py-4"><span className="font-bold text-slate-900">{L("Giao dịch gần đây")}</span><Link href="/admin/bien-dong" className="text-sm font-medium text-brand-600">{L("Xem tất cả")}</Link></div>
          <table className="w-full">
            <thead><tr><th className="th">{L("Loại")}</th><th className="th">{L("Số tiền")}</th><th className="th">{L("Người dùng")}</th><th className="th">{L("Thời gian")}</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {recentTx.map((t) => (
                <tr key={t.id}>
                  <td className="td font-medium">{L(TX_LABEL[t.type] || t.type)}</td>
                  <td className={`td font-bold ${t.amount >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{t.amount >= 0 ? "+" : "−"}{M(Math.abs(t.amount))}</td>
                  <td className="td">{t.user.username}</td>
                  <td className="td whitespace-nowrap text-slate-400">{dt(t.createdAt)}</td>
                </tr>
              ))}
              {recentTx.length === 0 && <tr><td className="td text-slate-400" colSpan={4}>{L("Chưa có giao dịch")}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card overflow-hidden">
          <div className="flex justify-between border-b border-slate-100 px-5 py-4"><span className="font-bold text-slate-900">{L("Hoạt động gần đây")}</span><Link href="/admin/don-smm" className="text-sm font-medium text-brand-600">{L("Xem tất cả")}</Link></div>
          <table className="w-full">
            <thead><tr><th className="th">{L("Người dùng")}</th><th className="th">{L("Hoạt động")}</th><th className="th">{L("Thời gian")}</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {recentEvents.map((ev) => (
                <tr key={ev.id}>
                  <td className="td font-medium">{ev.order.user.username}</td>
                  <td className="td"><span className="font-mono text-xs font-semibold text-brand-700">{ev.order.code}</span> <span className="text-slate-500">→ {SMM_STATUS[ev.status as keyof typeof SMM_STATUS]?.label || ev.status}</span></td>
                  <td className="td whitespace-nowrap text-slate-400">{dt(ev.createdAt)}</td>
                </tr>
              ))}
              {recentEvents.length === 0 && <tr><td className="td text-slate-400" colSpan={3}>{L("Chưa có hoạt động")}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 items-start gap-6 xl:grid-cols-3">
        <div className="card overflow-hidden xl:col-span-2">
          <div className="flex justify-between border-b border-slate-100 px-5 py-4"><span className="font-bold text-slate-900">{L("Đơn hàng mới nhất")}</span><Link href="/admin/don-smm" className="text-sm font-medium text-brand-600">{L("Xem tất cả")}</Link></div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr><th className="th">#</th><th className="th">{L("Người dùng")}</th><th className="th">{L("Dịch vụ")}</th><th className="th">{L("Số tiền")}</th><th className="th">{L("Trạng thái")}</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {recentSmm.map((o) => (
                  <tr key={o.id}>
                    <td className="td"><Link href={`/admin/don-smm/${o.id}`} className="font-mono text-xs font-semibold text-brand-700">{o.code}</Link></td>
                    <td className="td font-medium">{o.user.username}</td>
                    <td className="td"><div className="max-w-[240px] truncate">{o.service.name}</div></td>
                    <td className="td font-semibold">{M(o.charge)}</td>
                    <td className="td"><Badge cls={SMM_STATUS[o.status].cls}>{L(SMM_STATUS[o.status].label)}</Badge></td>
                  </tr>
                ))}
                {recentSmm.length === 0 && <tr><td className="td text-slate-400" colSpan={5}>{L("Chưa có đơn nào")}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div className="space-y-6">
          <div className="card overflow-hidden bg-gradient-to-br from-violet-600 to-purple-700 p-6 text-white">
            <div className="text-sm font-medium text-violet-200">{L("Tổng số dư người dùng")}</div>
            <div className="mt-1 text-3xl font-extrabold">{M(userAgg._sum.balance || 0)}</div>
            <div className="mt-2 text-sm text-violet-200">{Ld(`${num(totalUsers)} tài khoản của web mẹ`)}</div>
          </div>
          <div className="card overflow-hidden">
            <div className="flex justify-between border-b border-slate-100 px-5 py-4"><span className="font-bold text-slate-900">{L("Ticket cần xử lý")}</span><Link href="/admin/ticket" className="text-sm font-medium text-brand-600">{L("Xem tất cả")}</Link></div>
            <div className="divide-y divide-slate-100">
              {openTickets.map((t) => (
                <Link key={t.id} href={`/admin/ticket/${t.id}`} className="block px-5 py-3 transition hover:bg-slate-50">
                  <div className="truncate text-sm font-medium text-slate-800">{t.subject}</div>
                  <div className="text-xs text-slate-400">{t.user.username} · {dt(t.createdAt)}</div>
                </Link>
              ))}
              {openTickets.length === 0 && <p className="px-5 py-4 text-sm text-slate-400">{L("Không có ticket nào đang mở.")}</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
