import Link from "next/link";
import { prisma } from "@/lib/db";
import { Stat, I, Badge, PageHead } from "@/components/ui";
import { vnd, num, SMM_STATUS, PRE_STATUS, dt } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const now = new Date();
  const startDay = new Date(now); startDay.setHours(0, 0, 0, 0);
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const since14 = new Date(Date.now() - 13 * 86400000); since14.setHours(0, 0, 0, 0);

  const [smmToday, smmMonth, preToday, preMonth, users, lowStock, providers, recentSmm, recentPre, days] = await Promise.all([
    prisma.smmOrder.aggregate({ where: { createdAt: { gte: startDay }, status: { notIn: ["REFUNDED"] } }, _sum: { charge: true, cost: true }, _count: true }),
    prisma.smmOrder.aggregate({ where: { createdAt: { gte: startMonth }, status: { notIn: ["REFUNDED"] } }, _sum: { charge: true, cost: true }, _count: true }),
    prisma.premiumOrder.aggregate({ where: { createdAt: { gte: startDay }, status: { notIn: ["REFUNDED", "CANCELED"] } }, _sum: { total: true, cost: true }, _count: true }),
    prisma.premiumOrder.aggregate({ where: { createdAt: { gte: startMonth }, status: { notIn: ["REFUNDED", "CANCELED"] } }, _sum: { total: true, cost: true }, _count: true }),
    prisma.user.count(),
    prisma.premiumStock.groupBy({ by: ["variantId"], where: { status: "AVAILABLE" }, _count: true }),
    prisma.provider.findMany({ where: { active: true } }),
    prisma.smmOrder.findMany({ orderBy: { id: "desc" }, take: 8, include: { service: true, user: true } }),
    prisma.premiumOrder.findMany({ orderBy: { id: "desc" }, take: 6, include: { variant: { include: { product: true } }, user: true } }),
    prisma.smmOrder.findMany({ where: { createdAt: { gte: since14 }, status: { notIn: ["REFUNDED"] } }, select: { createdAt: true, charge: true } }),
  ]);
  const revToday = (smmToday._sum.charge || 0) + (preToday._sum.total || 0);
  const profitToday = revToday - ((smmToday._sum.cost || 0) + (preToday._sum.cost || 0));
  const revMonth = (smmMonth._sum.charge || 0) + (preMonth._sum.total || 0);
  const profitMonth = revMonth - ((smmMonth._sum.cost || 0) + (preMonth._sum.cost || 0));

  // Biểu đồ 14 ngày (doanh thu SMM theo ngày)
  const buckets: { label: string; value: number }[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(since14.getTime() + i * 86400000);
    const next = new Date(d.getTime() + 86400000);
    const value = days.filter((x) => x.createdAt >= d && x.createdAt < next).reduce((s, x) => s + x.charge, 0);
    buckets.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, value });
  }
  const maxBar = Math.max(...buckets.map((b) => b.value), 1);
  const totalStock = lowStock.reduce((s, x) => s + x._count, 0);

  return (
    <div>
      <PageHead title="Tổng quan kinh doanh" desc="Doanh thu và lợi nhuận gộp (doanh thu trừ vốn dịch vụ/kho) — chưa gồm chi phí vận hành." />
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Stat label="Doanh thu hôm nay" value={vnd(revToday)} icon={I.chart} sub={`${smmToday._count + preToday._count} đơn`} />
        <Stat label="Lợi nhuận hôm nay" value={vnd(profitToday)} icon={I.wallet} />
        <Stat label="Doanh thu tháng này" value={vnd(revMonth)} icon={I.db} sub={`Lợi nhuận ${vnd(profitMonth)}`} />
        <Stat label="Người dùng" value={num(users)} icon={I.users} sub={`Kho premium còn ${num(totalStock)} mục`} />
      </div>

      <div className="card p-6 mt-6">
        <div className="font-bold text-slate-900 mb-4">Doanh thu SMM — 14 ngày gần nhất</div>
        <div className="flex items-end gap-1.5 h-36">
          {buckets.map((b) => (
            <div key={b.label} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
              <div className="text-[10px] text-slate-400 truncate w-full text-center">{b.value ? vnd(b.value) : ""}</div>
              <div className="w-full bg-brand-500/85 rounded-t-md" style={{ height: `${Math.max(3, (b.value / maxBar) * 90)}px` }} />
              <div className="text-[10px] text-slate-500">{b.label}</div>
            </div>
          ))}
        </div>
      </div>

      {providers.length > 0 && (
        <div className="card p-5 mt-6">
          <div className="font-bold text-slate-900 mb-3">Số dư nhà cung cấp API</div>
          <div className="flex flex-wrap gap-3">
            {providers.map((p) => (
              <div key={p.id} className="rounded-xl border border-slate-200 px-4 py-3 text-sm">
                <span className="font-semibold">{p.name}</span>
                <span className="text-slate-500"> · Số dư ≈ </span>
                <b className={p.balanceCache < 200000 ? "text-rose-600" : "text-emerald-700"}>{vnd(p.balanceCache)}</b>
                {p.balanceCache < 200000 && <span className="text-rose-500 text-xs ml-2">Sắp hết — cần nạp</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid xl:grid-cols-2 gap-6 mt-6 items-start">
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex justify-between"><span className="font-bold text-slate-900">Đơn SMM mới nhất</span><Link href="/admin/don-smm" className="text-sm text-brand-600 font-medium">Tất cả</Link></div>
          <table className="w-full"><tbody className="divide-y divide-slate-100">
            {recentSmm.map((o) => (
              <tr key={o.id}>
                <td className="td"><Link href={`/admin/don-smm/${o.id}`} className="font-mono text-xs font-semibold text-brand-700">{o.code}</Link><div className="text-xs text-slate-400">{o.user.username} · {dt(o.createdAt)}</div></td>
                <td className="td"><div className="max-w-[200px] truncate font-medium">{o.service.name}</div><div className="text-xs text-slate-400">{o.fulfillment === "API" ? "API" : "Thủ công"}</div></td>
                <td className="td font-semibold">{vnd(o.charge)}</td>
                <td className="td"><Badge cls={SMM_STATUS[o.status].cls}>{SMM_STATUS[o.status].label}</Badge></td>
              </tr>
            ))}
            {recentSmm.length === 0 && <tr><td className="td text-slate-400">Chưa có đơn</td></tr>}
          </tbody></table>
        </div>
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex justify-between"><span className="font-bold text-slate-900">Đơn Premium mới nhất</span><Link href="/admin/don-premium" className="text-sm text-brand-600 font-medium">Tất cả</Link></div>
          <table className="w-full"><tbody className="divide-y divide-slate-100">
            {recentPre.map((o) => (
              <tr key={o.id}>
                <td className="td"><Link href={`/admin/don-premium/${o.id}`} className="font-mono text-xs font-semibold text-brand-700">{o.code}</Link><div className="text-xs text-slate-400">{o.user.username} · {dt(o.createdAt)}</div></td>
                <td className="td font-medium max-w-[200px] truncate">{o.variant.product.name} — {o.variant.name}</td>
                <td className="td font-semibold">{vnd(o.total)}</td>
                <td className="td"><Badge cls={PRE_STATUS[o.status].cls}>{PRE_STATUS[o.status].label}</Badge></td>
              </tr>
            ))}
            {recentPre.length === 0 && <tr><td className="td text-slate-400">Chưa có đơn</td></tr>}
          </tbody></table>
        </div>
      </div>
    </div>
  );
}
