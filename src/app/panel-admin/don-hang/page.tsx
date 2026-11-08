import { prisma } from "@/lib/db";
import { requirePanelAccessPage } from "@/lib/panel-access";
import { PageHead, Flash, Badge } from "@/components/ui";
import { panelOwnOrderAction } from "@/app/actions/panel";
import { num, dt } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

const STATUS_CLS: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  PROCESSING: "bg-sky-50 text-sky-700",
  IN_PROGRESS: "bg-sky-50 text-sky-700",
  COMPLETED: "bg-emerald-50 text-emerald-700",
  DELIVERED: "bg-emerald-50 text-emerald-700",
  PARTIAL: "bg-violet-50 text-violet-700",
  CANCELED: "bg-slate-100 text-slate-500",
  REFUNDED: "bg-rose-50 text-rose-600",
};

/** Đơn hàng qua panel — chỉ xem (xử lý đơn do web mẹ đảm nhiệm), kèm hoa hồng từng đơn. */
export default async function PanelOrdersPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const { panel } = await requirePanelAccessPage();
  const { L, Ld, M } = await getServerI18n((panel as { langConfig?: string | null }).langConfig ?? null);
  const orders = await prisma.smmOrder.findMany({
    where: { panelId: panel.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { user: { select: { username: true } }, service: { select: { name: true, panelId: true, fulfillment: true } } },
  });
  const totalCommission = orders.reduce((a, o) => a + o.commission, 0);
  return (
    <div>
      <PageHead title={L("Đơn hàng qua panel")} desc={L("Đơn do khách của panel đặt.")} />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr><th className="th">{L("Mã đơn")}</th><th className="th">{L("Khách")}</th><th className="th">{L("Dịch vụ")}</th><th className="th">{L("Số lượng")}</th><th className="th">{L("Khách trả")}</th><th className="th">{L("Hoa hồng")}</th><th className="th">{L("Trạng thái")}</th><th className="th">{L("Xử lý đơn")}</th><th className="th">{L("Thời gian")}</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50/60">
                  <td className="td font-mono font-semibold text-slate-700">{o.code}</td>
                  <td className="td">{o.user.username}</td>
                  <td className="td"><div className="max-w-[280px] truncate" title={o.service.name}>{o.service.name}</div><div className="text-xs text-slate-400 max-w-[280px] truncate" title={o.link}>{o.link}</div></td>
                  <td className="td">{num(o.quantity)}</td>
                  <td className="td font-semibold">{M(o.charge)}</td>
                  <td className="td text-emerald-600 font-semibold">+{M(o.commission)}</td>
                  <td className="td"><Badge cls={STATUS_CLS[o.status] || "bg-slate-100 text-slate-500"}>{o.status}</Badge></td>
                  <td className="td whitespace-nowrap">
                    {o.service.panelId === panel.id && o.service.fulfillment === "MANUAL" && (o.status === "PENDING" || o.status === "IN_PROGRESS") ? (
                      <span className="flex gap-1.5">
                        {o.status === "PENDING" && (
                          <form action={panelOwnOrderAction}><input type="hidden" name="orderId" value={o.id} /><input type="hidden" name="kind" value="start" /><button className="btn-ghost btn-sm !px-2.5 !py-1">{L("Bắt đầu")}</button></form>
                        )}
                        <form action={panelOwnOrderAction}><input type="hidden" name="orderId" value={o.id} /><input type="hidden" name="kind" value="complete" /><button className="btn-primary btn-sm !px-2.5 !py-1">{L("Hoàn thành")}</button></form>
                        <form action={panelOwnOrderAction}><input type="hidden" name="orderId" value={o.id} /><input type="hidden" name="kind" value="cancel" /><button className="btn-ghost btn-sm !px-2.5 !py-1 !text-rose-600">{L("Huỷ + hoàn")}</button></form>
                      </span>
                    ) : <span className="text-xs text-slate-300">—</span>}
                  </td>
                  <td className="td text-slate-500 whitespace-nowrap">{dt(o.createdAt)}</td>
                </tr>
              ))}
              {orders.length === 0 && <tr><td className="td text-slate-400" colSpan={9}>{L("Chưa có đơn nào qua panel.")}</td></tr>}
            </tbody>
          </table>
        </div>
        {orders.length > 0 && <p className="px-6 py-3 text-xs text-slate-400 border-t border-slate-100">{Ld(`50 đơn gần nhất · tổng hoa hồng trong danh sách: ${M(totalCommission)}. Hoa hồng bị thu hồi theo tỉ lệ nếu đơn được hoàn tiền.`)}</p>}
      </div>

    </div>
  );
}
