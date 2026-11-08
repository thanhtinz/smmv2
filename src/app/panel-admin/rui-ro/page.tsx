import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePanelOwnerPage } from "@/lib/panel-access";
import { PageHead, Flash, Badge } from "@/components/ui";
import { num, dt } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

/** Đơn qua panel bị hệ thống gắn cờ rủi ro/trùng lặp — chủ panel theo dõi
 *  để chủ động hỗ trợ khách và tránh thất thoát hoa hồng. */
export default async function PanelRiskPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const { panel } = await requirePanelOwnerPage();
  const { L, Ld, M } = await getServerI18n((panel as { langConfig?: string | null }).langConfig ?? null);
  const orders = await prisma.smmOrder.findMany({
    where: { panelId: panel.id, flagNote: { not: null } },
    orderBy: { id: "desc" },
    take: 50,
    include: { user: { select: { id: true, username: true } }, service: { select: { name: true } } },
  });
  return (
    <div>
      <PageHead title={L("Đơn rủi ro qua panel")} desc={L("Các đơn của khách panel bị hệ thống phát hiện trùng lặp hoặc dấu hiệu bất thường.")} />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[860px]">
          <thead><tr className="border-b border-slate-100"><th className="th">{L("Đơn")}</th><th className="th">{L("Khách")}</th><th className="th">{L("Dịch vụ")}</th><th className="th">{L("Số tiền")}</th><th className="th">{L("Trạng thái")}</th><th className="th">{L("Cờ rủi ro")}</th><th className="th">{L("Ngày tạo")}</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {orders.map((o) => (
              <tr key={o.id} className="hover:bg-slate-50/60">
                <td className="td font-mono text-[13px] font-semibold text-slate-700">{o.code}</td>
                <td className="td"><Link href={`/panel-admin/khach-hang/${o.user.id}`} className="font-medium text-brand-700 hover:underline">{o.user.username}</Link></td>
                <td className="td max-w-[260px] truncate text-slate-600">{o.service.name}</td>
                <td className="td font-bold text-slate-800">{M(o.charge)}</td>
                <td className="td"><Badge cls="bg-slate-100 text-slate-600">{o.status}</Badge></td>
                <td className="td max-w-[280px] text-amber-700">{o.flagNote ? Ld(o.flagNote) : o.flagNote}</td>
                <td className="td whitespace-nowrap text-slate-500">{dt(o.createdAt)}</td>
              </tr>
            ))}
            {orders.length === 0 && <tr><td colSpan={7} className="td py-10 text-center text-slate-400">{Ld(`Không có đơn nào bị gắn cờ. Tổng số đơn qua panel: ${num(await prisma.smmOrder.count({ where: { panelId: panel.id } }))}.`)}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
