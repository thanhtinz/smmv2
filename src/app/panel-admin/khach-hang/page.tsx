import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePanelAccessPage } from "@/lib/panel-access";
import { PageHead, Flash, Badge } from "@/components/ui";
import { setPanelMemberLevelAction } from "@/app/actions/user";
import { vnd, num, dt } from "@/lib/format";

export const dynamic = "force-dynamic";

const LEVELS = [
  { v: "MEMBER", label: "Thành viên" },
  { v: "RESELLER", label: "Đại lý" },
  { v: "AGENCY", label: "Tổng đại lý" },
  { v: "VIP", label: "VIP" },
] as const;

/** Khách hàng của panel — xem danh sách + gán cấp bậc (giá theo bậc do panel đặt). */
export default async function PanelMembersPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const { panel } = await requirePanelAccessPage();
  const [members, orderCounts] = await Promise.all([
    prisma.user.findMany({ where: { panelId: panel.id }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, username: true, email: true, balance: true, level: true, createdAt: true } }),
    prisma.smmOrder.groupBy({ by: ["userId"], where: { panelId: panel.id }, _count: true, _sum: { charge: true } }),
  ]);
  const stats = new Map(orderCounts.map((o) => [o.userId, o]));
  return (
    <div>
      <PageHead title="Khách hàng của panel" desc="Khách đăng ký tại website của bạn. Bấm vào tên khách để xem chi tiết.">
        <a href="/panel-admin/khach-hang/csv" className="btn-ghost btn-sm !px-4 !py-2">Xuất CSV</a>
      </PageHead>
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr><th className="th">Khách</th><th className="th">Số dư</th><th className="th">Đơn qua panel</th><th className="th">Đã chi</th><th className="th">Ngày đăng ký</th><th className="th">Cấp bậc</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50/60">
                  <td className="td"><Link href={`/panel-admin/khach-hang/${m.id}`} className="font-medium text-brand-700 hover:underline">{m.username}</Link><div className="text-xs text-slate-400">{m.email}</div></td>
                  <td className="td">{vnd(m.balance)}</td>
                  <td className="td">{num(stats.get(m.id)?._count || 0)}</td>
                  <td className="td">{vnd(stats.get(m.id)?._sum.charge || 0)}</td>
                  <td className="td text-slate-500">{dt(m.createdAt)}</td>
                  <td className="td">
                    <form action={setPanelMemberLevelAction} className="flex items-center gap-2">
                      <input type="hidden" name="memberId" value={m.id} />
                      <select name="level" defaultValue={m.level} className="inp !w-auto !py-1.5 !px-2.5 text-xs font-semibold">
                        {LEVELS.map((l) => <option key={l.v} value={l.v}>{l.label}</option>)}
                      </select>
                      <button className="btn-ghost btn-sm !py-1.5" type="submit">Đặt bậc</button>
                    </form>
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr><td className="td text-slate-400" colSpan={6}>Chưa có khách nào. Chia sẻ link website <Badge cls="bg-brand-50 text-brand-700">/cua-hang/{panel.slug}</Badge> để khách đăng ký vào panel của bạn.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
