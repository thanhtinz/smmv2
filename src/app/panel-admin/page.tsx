import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePanelAccessPage } from "@/lib/panel-access";
import { PageHead, Flash, Badge, Stat, I } from "@/components/ui";
import { num, dt } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

export default async function PanelAdminHome({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const { user, panel } = await requirePanelAccessPage();
  const { L, Ld, M } = await getServerI18n((panel as { langConfig?: string | null }).langConfig ?? null);
  const [memberCount, orderAgg, commissionAgg, members, orders, depositAgg, deposits] = await Promise.all([
    prisma.user.count({ where: { panelId: panel.id } }),
    prisma.smmOrder.aggregate({ where: { panelId: panel.id }, _count: true, _sum: { charge: true } }),
    prisma.transaction.aggregate({ where: { userId: panel.ownerId, type: "PANEL_COMMISSION", amount: { gt: 0 } }, _sum: { amount: true } }),
    prisma.user.findMany({ where: { panelId: panel.id }, orderBy: { createdAt: "desc" }, take: 6, select: { id: true, username: true, createdAt: true, level: true } }),
    prisma.smmOrder.findMany({ where: { panelId: panel.id }, orderBy: { createdAt: "desc" }, take: 8, include: { user: { select: { username: true } }, service: { select: { name: true } } } }),
    prisma.deposit.aggregate({ where: { user: { panelId: panel.id }, status: "APPROVED" }, _count: true, _sum: { amount: true, bonus: true } }),
    prisma.deposit.findMany({ where: { user: { panelId: panel.id } }, orderBy: { createdAt: "desc" }, take: 5, include: { user: { select: { username: true } } } }),
  ]);
  return (
    <div>
      <PageHead title={L("Tổng quan panel")} desc={<>{L("Website của bạn:")} <span>/cua-hang/{panel.slug}</span>{panel.domain ? <> {L("· tên miền")} {panel.domain}</> : null}</>}>
        <Link href={`/cua-hang/${panel.slug}`} className="btn-primary btn-sm !px-4 !py-2">{L("Xem website")}</Link>
      </PageHead>
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat label={L("Trạng thái panel")} value={panel.status === "ACTIVE" ? L("Đang mở bán") : L("Đã tạm ngưng")} icon={I.home} tone="emerald" />
        <Stat label={L("Khách của panel")} value={num(memberCount)} icon={I.users} tone="blue" />
        <Stat label={L("Đơn qua panel")} value={num(orderAgg._count)} icon={I.cart} tone="violet" />
        <Stat label={L("Doanh thu qua panel")} value={M(orderAgg._sum.charge || 0)} icon={I.money} tone="amber" />
        <Stat label={L("Hoa hồng đã nhận")} value={M(commissionAgg._sum.amount || 0)} icon={I.wallet} tone="emerald" />
        <Stat label={L("Phụ phí hiện tại")} value={`+${panel.markup}%`} icon={I.percent} tone="rose" />
        <Stat label={L("Số dư của bạn")} value={M(user.balance)} icon={I.wallet} tone="blue" />
        <Stat label={L("Khách đã nạp (SePay chung)")} value={M((depositAgg._sum.amount || 0) + (depositAgg._sum.bonus || 0))} icon={I.money} tone="violet" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="font-bold text-slate-900">{L("Đơn mới nhất qua panel")}</div>
            <Link href="/panel-admin/don-hang" className="text-sm font-semibold text-brand-600">{L("Xem tất cả")}</Link>
          </div>
          {orders.length === 0 ? <p className="text-sm text-slate-400">{L("Chưa có đơn nào qua panel. Chia sẻ link website để bắt đầu có hoa hồng.")}</p> : (
            <div className="divide-y divide-slate-100">{orders.map((o) => (
              <div key={o.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0"><span className="font-mono font-semibold text-slate-700">{o.code}</span> <span className="text-slate-400">· {o.user.username}</span><div className="text-slate-500 truncate">{o.service.name}</div></div>
                <div className="text-right shrink-0"><div className="font-semibold">{M(o.charge)}</div><div className="text-xs text-emerald-600 font-semibold">+{M(o.commission)} {L("hoa hồng")}</div></div>
              </div>
            ))}</div>
          )}
        </div>
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="font-bold text-slate-900">{L("Khách mới nhất")}</div>
            <Link href="/panel-admin/khach-hang" className="text-sm font-semibold text-brand-600">{L("Quản lý khách")}</Link>
          </div>
          {members.length === 0 ? <p className="text-sm text-slate-400">{L("Chưa có khách nào đăng ký tại panel.")}</p> : (
            <div className="divide-y divide-slate-100">{members.map((m) => (
              <div key={m.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-slate-800">{m.username}</span>
                <span className="flex items-center gap-2"><Badge cls="bg-brand-50 text-brand-700">{m.level}</Badge><span className="text-xs text-slate-400">{dt(m.createdAt)}</span></span>
              </div>
            ))}</div>
          )}
        </div>
      </div>
      <div className="card p-6 mt-6">
        <div className="flex items-center justify-between mb-4">
          <div className="font-bold text-slate-900">{L("Nạp tiền gần nhất của khách")}</div>
          <span className="text-xs text-slate-400">{num(depositAgg._count)} {L("lượt nạp thành công qua SePay")}</span>
        </div>
        {deposits.length === 0 ? <p className="text-sm text-slate-400">{L("Chưa có lượt nạp nào.")}</p> : (
          <div className="divide-y divide-slate-100">{deposits.map((d) => (
            <div key={d.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0"><span className="font-mono font-semibold text-slate-700">{d.code}</span> <span className="text-slate-400">· {d.user.username}</span>{d.auto && <span className="ml-2 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold px-2 py-0.5">{L("SePay tự động")}</span>}</div>
              <div className="text-right shrink-0 flex items-center gap-3">
                <span className="font-semibold">{M(d.amount + d.bonus)}</span>
                <Badge cls={d.status === "APPROVED" ? "bg-emerald-50 text-emerald-700" : d.status === "REJECTED" ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-700"}>{d.status}</Badge>
                <span className="text-xs text-slate-400 hidden sm:inline">{dt(d.createdAt)}</span>
              </div>
            </div>
          ))}</div>
        )}
      </div>
    </div>
  );
}
