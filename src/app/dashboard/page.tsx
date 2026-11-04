import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Stat, I, Badge, PageHead } from "@/components/ui";
import { vnd, num, SMM_STATUS, LEVEL_NAME, dt } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardHome() {
  const user = (await getCurrentUser())!;
  const since = new Date(Date.now() - 13 * 86400000);
  since.setHours(0, 0, 0, 0);
  const [smmCount, smmRunning, preCount, announcements, recent, spendSmm, spendPre] = await Promise.all([
    prisma.smmOrder.count({ where: { userId: user.id } }),
    prisma.smmOrder.count({ where: { userId: user.id, status: { in: ["PENDING", "PROCESSING", "IN_PROGRESS"] } } }),
    prisma.premiumOrder.count({ where: { userId: user.id } }),
    prisma.announcement.findMany({ where: { active: true }, orderBy: { id: "desc" }, take: 3 }),
    prisma.smmOrder.findMany({ where: { userId: user.id }, orderBy: { id: "desc" }, take: 6, include: { service: true } }),
    prisma.smmOrder.findMany({ where: { userId: user.id, createdAt: { gte: since }, status: { not: "CANCELED" } }, select: { charge: true, createdAt: true } }),
    prisma.premiumOrder.findMany({ where: { userId: user.id, createdAt: { gte: since }, status: { not: "CANCELED" } }, select: { total: true, createdAt: true } }),
  ]);
  // Smart Dashboard: hiệu quả đơn + dịch vụ dùng nhiều + lợi nhuận reseller + dự đoán chi phí
  const nowD = new Date();
  const monthStart = new Date(nowD.getFullYear(), nowD.getMonth(), 1);
  const daysInMonth = new Date(nowD.getFullYear(), nowD.getMonth() + 1, 0).getDate();
  const [statusGroup, topGroup, profitAgg, monthSmm, monthPre, myPanel] = await Promise.all([
    prisma.smmOrder.groupBy({ by: ["status"], where: { userId: user.id }, _count: true }),
    prisma.smmOrder.groupBy({ by: ["serviceId"], where: { userId: user.id }, _count: true, _sum: { charge: true }, orderBy: { _count: { serviceId: "desc" } }, take: 5 }),
    prisma.transaction.aggregate({ where: { userId: user.id, type: { in: ["PANEL_COMMISSION", "REFERRAL_COMMISSION"] } }, _sum: { amount: true } }),
    prisma.smmOrder.aggregate({ where: { userId: user.id, createdAt: { gte: monthStart }, status: { not: "CANCELED" } }, _sum: { charge: true } }),
    prisma.premiumOrder.aggregate({ where: { userId: user.id, createdAt: { gte: monthStart }, status: { not: "CANCELED" } }, _sum: { total: true } }),
    prisma.childPanel.findUnique({ where: { ownerId: user.id }, select: { id: true } }),
  ]);
  const stCount = (st: string) => statusGroup.find((g) => g.status === st)?._count || 0;
  const terminal = stCount("COMPLETED") + stCount("PARTIAL") + stCount("CANCELED") + stCount("REFUNDED");
  const completionRate = terminal > 0 ? Math.round((stCount("COMPLETED") / terminal) * 100) : null;
  const topServices = await prisma.smmService.findMany({ where: { id: { in: topGroup.map((g) => g.serviceId) } }, select: { id: true, name: true } });
  const topMax = Math.max(...topGroup.map((g) => g._count), 1);
  const profitNet = profitAgg._sum.amount || 0;
  const monthSpent = (monthSmm._sum.charge || 0) + (monthPre._sum.total || 0);
  const projectedMonth = Math.round((monthSpent / Math.max(1, nowD.getDate())) * daysInMonth);
  const days: { label: string; value: number }[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(since.getTime() + i * 86400000);
    days.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, value: 0 });
  }
  const addSpend = (createdAt: Date, amount: number) => {
    const idx = Math.floor((createdAt.getTime() - since.getTime()) / 86400000);
    const clamped = Math.max(0, Math.min(13, idx));
    days[clamped].value += amount;
  };
  for (const o of spendSmm) addSpend(o.createdAt, o.charge);
  for (const o of spendPre) addSpend(o.createdAt, o.total);
  const maxDay = Math.max(...days.map((d) => d.value), 1);
  const totalSpend14 = days.reduce((s, d) => s + d.value, 0);
  return (
    <div>
      <PageHead title={`Xin chào, ${user.fullName || user.username}`} desc={`Cấp bậc: ${LEVEL_NAME[user.level]} · Mã nạp tiền của bạn: SMM ${user.depositCode}`} />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Stat label="Số dư khả dụng" value={vnd(user.balance)} icon={I.wallet} sub={<Link href="/dashboard/nap-tien" className="text-brand-600 font-medium">Nạp thêm →</Link>} />
        <Stat label="Tổng đã nạp" value={vnd(user.totalDeposited)} icon={I.db} />
        <Stat label="Đơn SMM" value={num(smmCount)} icon={I.cart} sub={`${smmRunning} đơn đang chạy`} />
        <Stat label="Đơn Premium" value={num(preCount)} icon={I.gem} />
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mt-4">
        {[
          { href: "/dashboard/dat-hang", t: "Đặt đơn SMM", d: "Tăng like / follow / view", icon: I.cart },
          { href: "/dashboard/nap-tien", t: "Nạp tiền", d: "VietQR cộng tự động", icon: I.wallet },
          { href: "/premium", t: "Mua Premium", d: "Giao ngay từ kho", icon: I.gem },
          { href: "/dashboard/ticket", t: "Gửi hỗ trợ", d: "Ticket trả lời trong ngày", icon: I.ticket },
        ].map((a) => (
          <Link key={a.href} href={a.href} className="card p-4 flex items-center gap-3 hover:shadow-lg transition group">
            <span className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0 [&>svg]:w-5 [&>svg]:h-5">{a.icon}</span>
            <span className="min-w-0">
              <span className="block font-bold text-sm text-slate-900 group-hover:text-brand-700 truncate">{a.t}</span>
              <span className="block text-xs text-slate-400 truncate">{a.d}</span>
            </span>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <div className="card p-5">
          <div className="font-bold text-slate-900 mb-3">Hiệu quả đơn hàng</div>
          <div className="flex items-end gap-2">
            <span className="text-4xl font-black text-slate-900">{completionRate === null ? "—" : `${completionRate}%`}</span>
            <span className="text-sm text-slate-400 mb-1.5">tỷ lệ hoàn thành</span>
          </div>
          <div className="mt-3 space-y-1.5 text-sm text-slate-500">
            <div className="flex justify-between"><span>Hoàn thành</span><b className="text-emerald-600">{num(stCount("COMPLETED"))}</b></div>
            <div className="flex justify-between"><span>Đang chạy</span><b className="text-slate-700">{num(smmRunning)}</b></div>
            <div className="flex justify-between"><span>Huỷ / hoàn tiền</span><b className="text-rose-500">{num(stCount("CANCELED") + stCount("REFUNDED"))}</b></div>
          </div>
        </div>
        <div className="card p-5">
          <div className="font-bold text-slate-900 mb-3">Dịch vụ dùng nhiều nhất</div>
          {topGroup.length === 0 ? <div className="text-sm text-slate-400">Chưa có dữ liệu</div> : (
            <div className="space-y-2.5">
              {topGroup.map((g) => (
                <div key={g.serviceId}>
                  <div className="flex justify-between text-xs mb-1"><span className="font-medium text-slate-700 truncate max-w-[180px]">{topServices.find((x) => x.id === g.serviceId)?.name || `#${g.serviceId}`}</span><span className="text-slate-400">{g._count} đơn · {vnd(g._sum.charge || 0)}</span></div>
                  <div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-brand-500" style={{ width: `${Math.round((g._count / topMax) * 100)}%` }} /></div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card p-5">
          <div className="font-bold text-slate-900 mb-3">Lợi nhuận & dự đoán</div>
          <div className="space-y-1.5 text-sm text-slate-500">
            <div className="flex justify-between"><span>Hoa hồng panel + giới thiệu (ròng)</span><b className={profitNet > 0 ? "text-emerald-600" : "text-slate-700"}>{profitNet > 0 ? `+${vnd(profitNet)}` : vnd(profitNet)}</b></div>
            <div className="flex justify-between"><span>Đã chi tháng này</span><b className="text-slate-700">{vnd(monthSpent)}</b></div>
            <div className="flex justify-between"><span>Dự đoán chi cả tháng này</span><b className="text-brand-700">{vnd(projectedMonth)}</b></div>
            <div className="flex justify-between"><span>Ước tính tháng tới (cùng nhịp)</span><b className="text-slate-700">{vnd(projectedMonth)}</b></div>
          </div>
          {myPanel ? (
            <Link href="/panel-admin" className="btn-ghost btn-sm mt-4">Mở Panel Admin →</Link>
          ) : (
            <Link href="/dashboard/kiem-tien" className="btn-ghost btn-sm mt-4">Kiếm tiền với link giới thiệu →</Link>
          )}
        </div>
      </div>

      <div className="card p-5 mt-6">
        <div className="flex items-center justify-between mb-4">
          <div className="font-bold text-slate-900">Chi tiêu 14 ngày gần nhất</div>
          <div className="text-sm text-slate-500">Tổng <b className="text-slate-800">{vnd(totalSpend14)}</b></div>
        </div>
        <div className="flex items-end gap-1.5 h-32">
          {days.map((d, i) => (
            <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1.5 min-w-0 h-full" title={`${d.label}: ${vnd(d.value)}`}>
              <div className="w-full rounded-t-md bg-brand-500/85 hover:bg-brand-600 transition-all" style={{ height: `${d.value > 0 ? Math.max(5, Math.round((d.value / maxDay) * 92)) : 2}px` }} />
              <div className="text-[10px] text-slate-400 whitespace-nowrap">{i % 2 === 0 || i === 13 ? d.label : ""}</div>
            </div>
          ))}
        </div>
      </div>

      {announcements.length > 0 && (
        <div className="card p-5 mt-6">
          <div className="flex items-center gap-2 font-bold text-slate-900 mb-3"><span className="text-brand-600">{I.megaphone}</span>Thông báo</div>
          <div className="space-y-3">
            {announcements.map((a) => (
              <div key={a.id} className="border-l-4 border-brand-500 bg-slate-50 rounded-r-xl px-4 py-3">
                <div className="font-semibold text-sm text-slate-800">{a.title} <span className="text-slate-400 font-normal text-xs ml-2">{dt(a.createdAt)}</span></div>
                <p className="text-sm text-slate-500 mt-0.5">{a.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card mt-6 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="font-bold text-slate-900">Đơn SMM gần nhất</div>
          <Link href="/dashboard/don-hang" className="text-sm text-brand-600 font-medium">Xem tất cả</Link>
        </div>
        {recent.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">Chưa có đơn nào. <Link href="/dashboard/dat-hang" className="text-brand-600 font-medium">Đặt đơn đầu tiên</Link></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <tbody className="divide-y divide-slate-100">
                {recent.map((o) => (
                  <tr key={o.id}>
                    <td className="td font-mono text-xs">{o.code}</td>
                    <td className="td"><div className="font-medium">{o.service.name}</div><div className="text-xs text-slate-400 truncate max-w-[280px]">{o.link}</div></td>
                    <td className="td">{num(o.quantity)}</td>
                    <td className="td font-semibold">{vnd(o.charge)}</td>
                    <td className="td"><Badge cls={SMM_STATUS[o.status].cls}>{SMM_STATUS[o.status].label}</Badge></td>
                    <td className="td text-right"><Link href={`/dashboard/dat-hang?service=${o.serviceId}&link=${encodeURIComponent(o.link)}&qty=${o.quantity}`} className="text-sm font-semibold text-brand-600 hover:text-brand-700 whitespace-nowrap">Đặt lại</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
