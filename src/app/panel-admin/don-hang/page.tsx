import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PageHead, Flash, Badge } from "@/components/ui";
import { vnd, num, dt } from "@/lib/format";

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
  const user = (await getCurrentUser())!;
  const panel = (await prisma.childPanel.findUnique({ where: { ownerId: user.id } }))!;
  const orders = await prisma.smmOrder.findMany({
    where: { panelId: panel.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { user: { select: { username: true } }, service: { select: { name: true } } },
  });
  const premiumOrders = await prisma.premiumOrder.findMany({
    where: { panelId: panel.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { user: { select: { username: true } }, variant: { include: { product: { select: { name: true } } } } },
  });
  const totalCommission = orders.reduce((a, o) => a + o.commission, 0);
  return (
    <div>
      <PageHead title="Đơn hàng qua panel" desc="Đơn do khách của panel đặt — việc chạy đơn và bảo hành do web mẹ xử lý, bạn theo dõi và nhận hoa hồng tại đây." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr><th className="th">Mã đơn</th><th className="th">Khách</th><th className="th">Dịch vụ</th><th className="th">Số lượng</th><th className="th">Khách trả</th><th className="th">Hoa hồng</th><th className="th">Trạng thái</th><th className="th">Thời gian</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50/60">
                  <td className="td font-mono font-semibold text-slate-700">{o.code}</td>
                  <td className="td">{o.user.username}</td>
                  <td className="td"><div className="max-w-[280px] truncate" title={o.service.name}>{o.service.name}</div><div className="text-xs text-slate-400 max-w-[280px] truncate" title={o.link}>{o.link}</div></td>
                  <td className="td">{num(o.quantity)}</td>
                  <td className="td font-semibold">{vnd(o.charge)}</td>
                  <td className="td text-emerald-600 font-semibold">+{vnd(o.commission)}</td>
                  <td className="td"><Badge cls={STATUS_CLS[o.status] || "bg-slate-100 text-slate-500"}>{o.status}</Badge></td>
                  <td className="td text-slate-500 whitespace-nowrap">{dt(o.createdAt)}</td>
                </tr>
              ))}
              {orders.length === 0 && <tr><td className="td text-slate-400" colSpan={8}>Chưa có đơn nào qua panel.</td></tr>}
            </tbody>
          </table>
        </div>
        {orders.length > 0 && <p className="px-6 py-3 text-xs text-slate-400 border-t border-slate-100">50 đơn gần nhất · tổng hoa hồng trong danh sách: <b className="text-emerald-600">{vnd(totalCommission)}</b>. Hoa hồng bị thu hồi theo tỉ lệ nếu đơn được hoàn tiền.</p>}
      </div>

      <div className="card overflow-hidden mt-6">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="font-bold text-slate-900">Đơn Premium qua panel</div>
          <span className="text-xs text-slate-400">Sản phẩm premium dùng chung kho của web mẹ, giá bán theo panel của bạn</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr><th className="th">Mã đơn</th><th className="th">Khách</th><th className="th">Sản phẩm</th><th className="th">SL</th><th className="th">Khách trả</th><th className="th">Hoa hồng</th><th className="th">Trạng thái</th><th className="th">Thời gian</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {premiumOrders.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50/60">
                  <td className="td font-mono font-semibold text-slate-700">{o.code}</td>
                  <td className="td">{o.user.username}</td>
                  <td className="td"><div className="font-medium text-slate-800">{o.variant.product.name}</div><div className="text-xs text-slate-400">{o.variant.name}</div></td>
                  <td className="td">{num(o.quantity)}</td>
                  <td className="td font-semibold">{vnd(o.total)}</td>
                  <td className="td text-emerald-600 font-semibold">+{vnd(o.commission)}</td>
                  <td className="td"><Badge cls={STATUS_CLS[o.status] || "bg-slate-100 text-slate-500"}>{o.status}</Badge></td>
                  <td className="td text-slate-500 whitespace-nowrap">{dt(o.createdAt)}</td>
                </tr>
              ))}
              {premiumOrders.length === 0 && <tr><td className="td text-slate-400" colSpan={8}>Chưa có đơn premium nào qua panel.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
