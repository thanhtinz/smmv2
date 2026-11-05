import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePanelAccessPage } from "@/lib/panel-access";
import { PageHead, Flash, Stat, I, Badge } from "@/components/ui";
import { setPanelMemberLevelAction } from "@/app/actions/user";
import { vnd, num, dt } from "@/lib/format";

export const dynamic = "force-dynamic";

const LEVELS = [
  { v: "MEMBER", label: "Thành viên" },
  { v: "RESELLER", label: "Đại lý" },
  { v: "AGENCY", label: "Tổng đại lý" },
  { v: "VIP", label: "VIP" },
] as const;

/** Chi tiết một khách của panel: số liệu, đơn SMM/Premium và nạp tiền qua panel. */
export default async function PanelMemberDetail({ params, searchParams }: { params: { id: string }; searchParams: { msg?: string; err?: string } }) {
  const { user, panel, isOwner } = await requirePanelAccessPage();
  const member = await prisma.user.findFirst({ where: { id: parseInt(params.id), panelId: panel.id } });
  if (!member) notFound();
  const [smmAgg, smmOrders, preOrders, depAgg, deposits] = await Promise.all([
    prisma.smmOrder.aggregate({ where: { userId: member.id, panelId: panel.id }, _count: true, _sum: { charge: true, commission: true } }),
    prisma.smmOrder.findMany({ where: { userId: member.id, panelId: panel.id }, orderBy: { createdAt: "desc" }, take: 10, include: { service: { select: { name: true } } } }),
    prisma.premiumOrder.findMany({ where: { userId: member.id, panelId: panel.id }, orderBy: { createdAt: "desc" }, take: 10, include: { variant: { include: { product: { select: { name: true } } } } } }),
    prisma.deposit.aggregate({ where: { userId: member.id, status: "APPROVED" }, _count: true, _sum: { amount: true, bonus: true } }),
    prisma.deposit.findMany({ where: { userId: member.id }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  return (
    <div>
      <PageHead title={`Khách: ${member.username}`} desc={`${member.email} · đăng ký ${dt(member.createdAt)}`}>
        <Link href="/panel-admin/khach-hang" className="btn-ghost btn-sm !px-4 !py-2">← Danh sách khách</Link>
      </PageHead>
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Số dư hiện tại" value={vnd(member.balance)} icon={I.wallet} tone="blue" />
        <Stat label="Đơn SMM qua panel" value={num(smmAgg._count)} sub={`Đã chi ${vnd(smmAgg._sum.charge || 0)}`} icon={I.cart} tone="violet" />
        <Stat label="Hoa hồng từ khách này" value={vnd((smmAgg._sum.commission || 0) + preOrders.reduce((a, o) => a + o.commission, 0))} icon={I.money} tone="emerald" />
        <Stat label="Đã nạp thành công" value={vnd((depAgg._sum.amount || 0) + (depAgg._sum.bonus || 0))} sub={`${num(depAgg._count)} lượt`} icon={I.money} tone="amber" />
      </div>
      {isOwner && (
        <div className="card mb-6 flex flex-wrap items-end gap-4 p-6">
          <div>
            <div className="font-bold text-slate-900">Cấp bậc tại panel</div>
            <p className="mt-0.5 text-sm text-slate-400">Cấp bậc quyết định % giảm giá panel áp cho khách này.</p>
          </div>
          <form action={setPanelMemberLevelAction} className="ml-auto flex items-end gap-3">
            <input type="hidden" name="memberId" value={member.id} />
            <select name="level" defaultValue={member.level} className="inp !w-48">
              {LEVELS.map((l) => <option key={l.v} value={l.v}>{l.label}</option>)}
            </select>
            <button className="btn-primary !py-2.5">Lưu cấp bậc</button>
          </form>
        </div>
      )}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <div className="mb-4 font-bold text-slate-900">Đơn SMM gần nhất</div>
          <div className="divide-y divide-slate-100">
            {smmOrders.map((o) => (
              <div key={o.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0"><span className="font-mono font-semibold text-slate-700">{o.code}</span><div className="truncate text-slate-500">{o.service.name}</div></div>
                <div className="shrink-0 text-right"><div className="font-bold text-slate-800">{vnd(o.charge)}</div><div className="text-xs text-slate-400">{dt(o.createdAt)}</div></div>
              </div>
            ))}
            {smmOrders.length === 0 && <p className="py-3 text-sm text-slate-400">Chưa có đơn SMM nào.</p>}
          </div>
        </div>
        <div className="space-y-6">
          <div className="card p-6">
            <div className="mb-4 font-bold text-slate-900">Đơn Premium gần nhất</div>
            <div className="divide-y divide-slate-100">
              {preOrders.map((o) => (
                <div key={o.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0"><span className="font-mono font-semibold text-slate-700">{o.code}</span><div className="truncate text-slate-500">{o.variant.product.name} — {o.variant.name}</div></div>
                  <div className="shrink-0 text-right"><div className="font-bold text-slate-800">{vnd(o.total)}</div><div className="text-xs text-slate-400">{dt(o.createdAt)}</div></div>
                </div>
              ))}
              {preOrders.length === 0 && <p className="py-3 text-sm text-slate-400">Chưa có đơn Premium nào.</p>}
            </div>
          </div>
          <div className="card p-6">
            <div className="mb-4 font-bold text-slate-900">Nạp tiền gần nhất</div>
            <div className="divide-y divide-slate-100">
              {deposits.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="font-mono font-semibold text-slate-700">{d.code}</span>
                  <span className="font-bold text-slate-800">{vnd(d.amount + d.bonus)}</span>
                  <Badge cls="bg-slate-100 text-slate-600">{d.status}</Badge>
                </div>
              ))}
              {deposits.length === 0 && <p className="py-3 text-sm text-slate-400">Chưa có lượt nạp nào.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
