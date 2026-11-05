import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PageHead, Flash, Badge, Stat, I } from "@/components/ui";
import { vnd, num, dt } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PanelAdminHome({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const user = (await getCurrentUser())!;
  const panel = (await prisma.childPanel.findUnique({ where: { ownerId: user.id } }))!;
  const [memberCount, orderAgg, commissionAgg, members, orders, depositAgg, deposits] = await Promise.all([
    prisma.user.count({ where: { panelId: panel.id } }),
    prisma.smmOrder.aggregate({ where: { panelId: panel.id }, _count: true, _sum: { charge: true } }),
    prisma.transaction.aggregate({ where: { userId: user.id, type: "PANEL_COMMISSION", amount: { gt: 0 } }, _sum: { amount: true } }),
    prisma.user.findMany({ where: { panelId: panel.id }, orderBy: { createdAt: "desc" }, take: 6, select: { id: true, username: true, createdAt: true, level: true } }),
    prisma.smmOrder.findMany({ where: { panelId: panel.id }, orderBy: { createdAt: "desc" }, take: 8, include: { user: { select: { username: true } }, service: { select: { name: true } } } }),
    prisma.deposit.aggregate({ where: { user: { panelId: panel.id }, status: "APPROVED" }, _count: true, _sum: { amount: true, bonus: true } }),
    prisma.deposit.findMany({ where: { user: { panelId: panel.id } }, orderBy: { createdAt: "desc" }, take: 5, include: { user: { select: { username: true } } } }),
  ]);
  return (
    <div>
      <PageHead title="Tổng quan panel" desc={`Gian hàng của bạn: /cua-hang/${panel.slug}${panel.domain ? ` · tên miền ${panel.domain}` : ""}`}>
        <Link href={`/cua-hang/${panel.slug}`} className="btn-primary btn-sm !px-4 !py-2">Xem gian hàng</Link>
      </PageHead>
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat label="Trạng thái panel" value={panel.status === "ACTIVE" ? "Đang mở bán" : "Đã tạm ngưng"} icon={I.home} tone="emerald" />
        <Stat label="Khách của panel" value={num(memberCount)} icon={I.users} tone="blue" />
        <Stat label="Đơn qua panel" value={num(orderAgg._count)} icon={I.cart} tone="violet" />
        <Stat label="Doanh thu qua panel" value={vnd(orderAgg._sum.charge || 0)} icon={I.money} tone="amber" />
        <Stat label="Hoa hồng đã nhận" value={vnd(commissionAgg._sum.amount || 0)} icon={I.wallet} tone="emerald" />
        <Stat label="Phụ phí hiện tại" value={`+${panel.markup}%`} icon={I.percent} tone="rose" />
        <Stat label="Số dư của bạn" value={vnd(user.balance)} icon={I.wallet} tone="blue" />
        <Stat label="Khách đã nạp (SePay chung)" value={vnd((depositAgg._sum.amount || 0) + (depositAgg._sum.bonus || 0))} icon={I.money} tone="violet" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="font-bold text-slate-900">Đơn mới nhất qua panel</div>
            <Link href="/panel-admin/don-hang" className="text-sm font-semibold text-brand-600">Xem tất cả</Link>
          </div>
          {orders.length === 0 ? <p className="text-sm text-slate-400">Chưa có đơn nào qua panel. Chia sẻ link gian hàng để bắt đầu có hoa hồng.</p> : (
            <div className="divide-y divide-slate-100">{orders.map((o) => (
              <div key={o.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0"><span className="font-mono font-semibold text-slate-700">{o.code}</span> <span className="text-slate-400">· {o.user.username}</span><div className="text-slate-500 truncate">{o.service.name}</div></div>
                <div className="text-right shrink-0"><div className="font-semibold">{vnd(o.charge)}</div><div className="text-xs text-emerald-600 font-semibold">+{vnd(o.commission)} hoa hồng</div></div>
              </div>
            ))}</div>
          )}
        </div>
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="font-bold text-slate-900">Khách mới nhất</div>
            <Link href="/panel-admin/khach-hang" className="text-sm font-semibold text-brand-600">Quản lý khách</Link>
          </div>
          {members.length === 0 ? <p className="text-sm text-slate-400">Chưa có khách nào đăng ký tại panel.</p> : (
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
          <div className="font-bold text-slate-900">Nạp tiền gần nhất của khách</div>
          <span className="text-xs text-slate-400">{num(depositAgg._count)} lượt nạp thành công qua SePay</span>
        </div>
        {deposits.length === 0 ? <p className="text-sm text-slate-400">Chưa có lượt nạp nào.</p> : (
          <div className="divide-y divide-slate-100">{deposits.map((d) => (
            <div key={d.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0"><span className="font-mono font-semibold text-slate-700">{d.code}</span> <span className="text-slate-400">· {d.user.username}</span>{d.auto && <span className="ml-2 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold px-2 py-0.5">SePay tự động</span>}</div>
              <div className="text-right shrink-0 flex items-center gap-3">
                <span className="font-semibold">{vnd(d.amount + d.bonus)}</span>
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
