import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Stat, I, Badge, PageHead } from "@/components/ui";
import { vnd, num, SMM_STATUS, DEP_STATUS, LEVEL_NAME, dt } from "@/lib/format";

export const dynamic = "force-dynamic";

const TX_LABEL: Record<string, string> = {
  DEPOSIT: "Nạp tiền", SMM_ORDER: "Đặt đơn SMM", PREMIUM_ORDER: "Mua Premium",
  REFUND: "Hoàn tiền", ADJUST: "Điều chỉnh", BONUS: "Thưởng nạp",
  PANEL_COMMISSION: "Hoa hồng panel", REFERRAL_COMMISSION: "Hoa hồng giới thiệu",
};
const LEVEL_DOT: Record<string, string> = { MEMBER: "bg-slate-400", RESELLER: "bg-blue-500", AGENCY: "bg-violet-500", VIP: "bg-amber-500" };
const LEVEL_BAR: Record<string, string> = { MEMBER: "bg-slate-400", RESELLER: "bg-blue-500", AGENCY: "bg-violet-500", VIP: "bg-amber-500" };

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 truncate text-base font-bold text-slate-900">{value}</div>
    </div>
  );
}

export default async function AdminHome() {
  const me = await getCurrentUser();
  const isAdmin = me?.role === "ADMIN";
  const now = new Date();
  const startDay = new Date(now); startDay.setHours(0, 0, 0, 0);
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const since14 = new Date(Date.now() - 13 * 86400000); since14.setHours(0, 0, 0, 0);
  const notRefunded = { notIn: ["REFUNDED"] } as any;
  const preValid = { notIn: ["REFUNDED", "CANCELED"] } as any;

  const [userAgg, newUsers, levelGroups, depAll, depToday, depMonth,
    smmToday, smmMonth, preToday, preMonth, smmAllAgg, preAllAgg,
    smmTotal, smmCompleted, smmPending, smmRunning, preTotal, ticketOpen,
    serviceCount, providerCount, providers, stockAgg,
    recentSmm, recentDep, recentTx, days] = await Promise.all([
    prisma.user.aggregate({ _sum: { balance: true }, _count: true }),
    prisma.user.count({ where: { createdAt: { gte: startMonth } } }),
    prisma.user.groupBy({ by: ["level"], _count: true }),
    prisma.deposit.aggregate({ where: { status: "APPROVED" }, _sum: { amount: true } }),
    prisma.deposit.aggregate({ where: { status: "APPROVED", createdAt: { gte: startDay } }, _sum: { amount: true } }),
    prisma.deposit.aggregate({ where: { status: "APPROVED", createdAt: { gte: startMonth } }, _sum: { amount: true } }),
    prisma.smmOrder.aggregate({ where: { createdAt: { gte: startDay }, status: notRefunded }, _sum: { charge: true, cost: true }, _count: true }),
    prisma.smmOrder.aggregate({ where: { createdAt: { gte: startMonth }, status: notRefunded }, _sum: { charge: true, cost: true }, _count: true }),
    prisma.premiumOrder.aggregate({ where: { createdAt: { gte: startDay }, status: preValid }, _sum: { total: true, cost: true }, _count: true }),
    prisma.premiumOrder.aggregate({ where: { createdAt: { gte: startMonth }, status: preValid }, _sum: { total: true, cost: true }, _count: true }),
    prisma.smmOrder.aggregate({ where: { status: notRefunded }, _sum: { charge: true } }),
    prisma.premiumOrder.aggregate({ where: { status: preValid }, _sum: { total: true } }),
    prisma.smmOrder.count(),
    prisma.smmOrder.count({ where: { status: "COMPLETED" } }),
    prisma.smmOrder.count({ where: { status: { in: ["PENDING", "PROCESSING"] } } }),
    prisma.smmOrder.count({ where: { status: "IN_PROGRESS" } }),
    prisma.premiumOrder.count(),
    prisma.ticket.count({ where: { status: "OPEN" } }),
    prisma.smmService.count(),
    prisma.provider.count(),
    prisma.provider.findMany({ where: { active: true } }),
    prisma.premiumStock.aggregate({ where: { status: "AVAILABLE" }, _count: true }),
    prisma.smmOrder.findMany({ orderBy: { id: "desc" }, take: 6, include: { service: true, user: true } }),
    prisma.deposit.findMany({ orderBy: { id: "desc" }, take: 5, include: { user: true } }),
    prisma.transaction.findMany({ orderBy: { id: "desc" }, take: 5, include: { user: true } }),
    prisma.smmOrder.findMany({ where: { createdAt: { gte: since14 }, status: notRefunded }, select: { createdAt: true, charge: true } }),
  ]);

  const revToday = (smmToday._sum.charge || 0) + (preToday._sum.total || 0);
  const profitToday = revToday - ((smmToday._sum.cost || 0) + (preToday._sum.cost || 0));
  const revMonth = (smmMonth._sum.charge || 0) + (preMonth._sum.total || 0);
  const profitMonth = revMonth - ((smmMonth._sum.cost || 0) + (preMonth._sum.cost || 0));
  const totalSpend = (smmAllAgg._sum.charge || 0) + (preAllAgg._sum.total || 0);
  const totalUsers = userAgg._count || 0;
  const stockLeft = stockAgg._count || 0;

  const buckets: { label: string; value: number }[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(since14.getTime() + i * 86400000);
    const next = new Date(d.getTime() + 86400000);
    const value = days.filter((x) => x.createdAt >= d && x.createdAt < next).reduce((s, x) => s + x.charge, 0);
    buckets.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, value });
  }
  const maxBar = Math.max(...buckets.map((b) => b.value), 1);

  const quick = isAdmin
    ? [
        { href: "/admin/don-smm", label: "Quản lý đơn hàng", icon: I.cart },
        { href: "/admin/nguoi-dung", label: "Quản lý người dùng", icon: I.users },
        { href: "/admin/nap-tien", label: "Quản lý nạp tiền", icon: I.wallet },
        { href: "/admin/cau-hinh", label: "Cài đặt hệ thống", icon: I.gear },
      ]
    : [
        { href: "/admin/don-smm", label: "Quản lý đơn hàng", icon: I.cart },
        { href: "/admin/don-premium", label: "Đơn Premium", icon: I.box },
        { href: "/admin/ticket", label: "Ticket hỗ trợ", icon: I.ticket },
        { href: "/admin/nhat-ky", label: "Nhật ký API", icon: I.clock },
      ];

  return (
    <div>
      <PageHead title="Tổng quan" desc="Toàn cảnh kinh doanh: số dư, doanh thu, lợi nhuận và hoạt động gần nhất của hệ thống." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
        <Stat label="Tổng số dư người dùng" value={vnd(userAgg._sum.balance || 0)} icon={I.wallet} tone="blue" />
        <Stat label="Tổng tiền đã nạp" value={vnd(depAll._sum.amount || 0)} icon={I.db} tone="emerald" />
        <Stat label="Tổng chi tiêu" value={vnd(totalSpend)} icon={I.chart} tone="violet" />
        <Stat label="Lợi nhuận hôm nay" value={vnd(profitToday)} icon={I.money} tone="emerald" />
        <Stat label="Lợi nhuận tháng này" value={vnd(profitMonth)} icon={I.money} tone="cyan" />
        <Stat label="Tổng đơn hàng" value={num(smmTotal + preTotal)} icon={I.cart} tone="blue" sub={`${num(smmTotal)} SMM · ${num(preTotal)} Premium`} />
        <Stat label="Đơn hoàn thành" value={num(smmCompleted)} icon={I.check} tone="emerald" />
        <Stat label="Đơn chờ xử lý" value={num(smmPending)} icon={I.clock} tone="orange" />
        <Stat label="Tổng số người dùng" value={num(totalUsers)} icon={I.users} tone="violet" />
        <Stat label="Người dùng mới tháng này" value={num(newUsers)} icon={I.users} tone="cyan" />
        <Stat label="Đơn Premium" value={num(preTotal)} icon={I.box} tone="orange" />
        <Stat label="Doanh thu Premium tháng này" value={vnd(preMonth._sum.total || 0)} icon={I.gem} tone="rose" />
        <Stat label="Ticket đang mở" value={num(ticketOpen)} icon={I.ticket} tone="rose" />
        <Stat label="Tổng dịch vụ" value={num(serviceCount)} icon={I.list} tone="blue" />
        <Stat label="Tổng nhà cung cấp" value={num(providerCount)} icon={I.server} tone="cyan" />
        <Stat label="Tài khoản Premium còn trong kho" value={num(stockLeft)} icon={I.db} tone="amber" />
      </div>

      <div className="card mt-6 p-5">
        <div className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-400">Thao tác nhanh</div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {quick.map((q) => (
            <Link key={q.href} href={q.href} className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3.5 font-semibold text-slate-700 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700">
              <span className="text-brand-600">{q.icon}</span>{q.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 items-start gap-6 xl:grid-cols-3">
        <div className="card p-5">
          <div className="mb-4 font-bold text-slate-900">Thống kê nhanh</div>
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="Đơn hàng hôm nay" value={num(smmToday._count + preToday._count)} />
            <MiniStat label="Đơn hàng tháng này" value={num(smmMonth._count + preMonth._count)} />
            <MiniStat label="Doanh thu tháng này" value={vnd(revMonth)} />
            <MiniStat label="Nạp tiền hôm nay" value={vnd(depToday._sum.amount || 0)} />
            <MiniStat label="Nạp tiền tháng này" value={vnd(depMonth._sum.amount || 0)} />
            <MiniStat label="Đơn đang chạy" value={num(smmRunning)} />
          </div>
        </div>
        <div className="card p-5">
          <div className="mb-4 font-bold text-slate-900">Người dùng theo cấp bậc</div>
          <div className="space-y-3.5">
            {["MEMBER", "RESELLER", "AGENCY", "VIP"].map((lv) => {
              const c = levelGroups.find((g) => g.level === lv)?._count || 0;
              const pct = totalUsers ? Math.round((c / totalUsers) * 100) : 0;
              return (
                <div key={lv}>
                  <div className="mb-1.5 flex items-center gap-2 text-sm">
                    <span className={`h-2.5 w-2.5 rounded-full ${LEVEL_DOT[lv]}`} />
                    <span className="font-medium text-slate-700">{LEVEL_NAME[lv]}</span>
                    <span className="ml-auto font-semibold text-slate-900">{num(c)} người dùng</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${LEVEL_BAR[lv]}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="card p-5">
          <div className="mb-4 font-bold text-slate-900">Số dư nhà cung cấp API</div>
          {providers.length === 0 && <p className="text-sm text-slate-400">Chưa có nhà cung cấp nào đang bật.</p>}
          <div className="space-y-3">
            {providers.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-brand-600 shadow-sm">{I.server}</span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-800">{p.name}</div>
                  <div className="text-xs text-slate-400">{p.active ? "Đang hoạt động" : "Đã tắt"}</div>
                </div>
                <b className={`ml-auto ${p.balanceCache < 200000 ? "text-rose-600" : "text-emerald-700"}`}>{vnd(p.balanceCache)}</b>
              </div>
            ))}
          </div>
          {providers.some((p) => p.balanceCache < 200000) && <p className="mt-3 text-xs font-medium text-rose-500">Có nhà cung cấp sắp hết số dư — cần nạp thêm.</p>}
        </div>
      </div>

      <div className="card mt-6 p-6">
        <div className="mb-4 font-bold text-slate-900">Doanh thu SMM — 14 ngày gần nhất</div>
        <div className="flex h-36 items-end gap-1.5">
          {buckets.map((b) => (
            <div key={b.label} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              <div className="w-full truncate text-center text-[10px] text-slate-400">{b.value ? vnd(b.value) : ""}</div>
              <div className="w-full rounded-t-md bg-brand-500/85" style={{ height: `${Math.max(3, (b.value / maxBar) * 90)}px` }} />
              <div className="text-[10px] text-slate-500">{b.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 items-start gap-6 xl:grid-cols-5">
        <div className="card overflow-hidden xl:col-span-3">
          <div className="flex justify-between border-b border-slate-100 px-5 py-4"><span className="font-bold text-slate-900">Đơn hàng gần đây</span><Link href="/admin/don-smm" className="text-sm font-medium text-brand-600">Tất cả</Link></div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr><th className="th">Mã đơn</th><th className="th">Người dùng</th><th className="th">Dịch vụ</th><th className="th">Số lượng</th><th className="th">Tổng tiền</th><th className="th">Trạng thái</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {recentSmm.map((o) => (
                  <tr key={o.id}>
                    <td className="td"><Link href={`/admin/don-smm/${o.id}`} className="font-mono text-xs font-semibold text-brand-700">{o.code}</Link><div className="text-xs text-slate-400">{dt(o.createdAt)}</div></td>
                    <td className="td font-medium">{o.user.username}</td>
                    <td className="td"><div className="max-w-[220px] truncate">{o.service.name}</div></td>
                    <td className="td">{num(o.quantity)}</td>
                    <td className="td font-semibold">{vnd(o.charge)}</td>
                    <td className="td"><Badge cls={SMM_STATUS[o.status].cls}>{SMM_STATUS[o.status].label}</Badge></td>
                  </tr>
                ))}
                {recentSmm.length === 0 && <tr><td className="td text-slate-400" colSpan={6}>Chưa có đơn nào</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div className="space-y-6 xl:col-span-2">
          <div className="card overflow-hidden">
            <div className="flex justify-between border-b border-slate-100 px-5 py-4"><span className="font-bold text-slate-900">Nạp tiền gần đây</span><Link href="/admin/nap-tien" className="text-sm font-medium text-brand-600">Tất cả</Link></div>
            <table className="w-full"><tbody className="divide-y divide-slate-100">
              {recentDep.map((d) => (
                <tr key={d.id}>
                  <td className="td"><span className="font-medium">{d.user.username}</span><div className="text-xs text-slate-400">{d.method} · {dt(d.createdAt)}</div></td>
                  <td className="td font-semibold">{vnd(d.amount)}</td>
                  <td className="td"><Badge cls={DEP_STATUS[d.status].cls}>{DEP_STATUS[d.status].label}</Badge></td>
                </tr>
              ))}
              {recentDep.length === 0 && <tr><td className="td text-slate-400">Chưa có lượt nạp</td></tr>}
            </tbody></table>
          </div>
          <div className="card overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-4"><span className="font-bold text-slate-900">Biến động số dư gần đây</span></div>
            <table className="w-full"><tbody className="divide-y divide-slate-100">
              {recentTx.map((t) => (
                <tr key={t.id}>
                  <td className="td"><span className="font-medium">{t.user.username}</span><div className="text-xs text-slate-400">{TX_LABEL[t.type] || t.type} · {dt(t.createdAt)}</div></td>
                  <td className={`td font-bold ${t.amount >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{t.amount >= 0 ? "+" : "−"}{vnd(Math.abs(t.amount))}</td>
                </tr>
              ))}
              {recentTx.length === 0 && <tr><td className="td text-slate-400">Chưa có biến động</td></tr>}
            </tbody></table>
          </div>
        </div>
      </div>
    </div>
  );
}
