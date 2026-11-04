import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Stat, I, Badge, PageHead } from "@/components/ui";
import { vnd, num, SMM_STATUS, LEVEL_NAME, dt } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardHome() {
  const user = (await getCurrentUser())!;
  const [smmCount, smmRunning, preCount, announcements, recent] = await Promise.all([
    prisma.smmOrder.count({ where: { userId: user.id } }),
    prisma.smmOrder.count({ where: { userId: user.id, status: { in: ["PENDING", "PROCESSING", "IN_PROGRESS"] } } }),
    prisma.premiumOrder.count({ where: { userId: user.id } }),
    prisma.announcement.findMany({ where: { active: true }, orderBy: { id: "desc" }, take: 3 }),
    prisma.smmOrder.findMany({ where: { userId: user.id }, orderBy: { id: "desc" }, take: 6, include: { service: true } }),
  ]);
  return (
    <div>
      <PageHead title={`Xin chào, ${user.fullName || user.username}`} desc={`Cấp bậc: ${LEVEL_NAME[user.level]} · Mã nạp tiền của bạn: SMM ${user.depositCode}`} />
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Stat label="Số dư khả dụng" value={vnd(user.balance)} icon={I.wallet} sub={<Link href="/dashboard/nap-tien" className="text-brand-600 font-medium">Nạp thêm →</Link>} />
        <Stat label="Tổng đã nạp" value={vnd(user.totalDeposited)} icon={I.db} />
        <Stat label="Đơn SMM" value={num(smmCount)} icon={I.cart} sub={`${smmRunning} đơn đang chạy`} />
        <Stat label="Đơn Premium" value={num(preCount)} icon={I.gem} />
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
