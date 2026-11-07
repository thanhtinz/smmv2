import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Badge, BackLink } from "@/components/ui";
import { vnd, num, SMM_STATUS, dt } from "@/lib/format";
import { parseDripfeed } from "@/lib/orders";
import { OrderSupportActions } from "@/components/order-support-actions";

export const dynamic = "force-dynamic";

export default async function SmmOrderDetail({ params }: { params: { id: string } }) {
  const user = (await getCurrentUser())!;
  const o = await prisma.smmOrder.findFirst({ where: { id: parseInt(params.id), userId: user.id }, include: { service: { include: { category: true } } } });
  if (!o) notFound();
  const events = await prisma.orderEvent.findMany({ where: { orderId: o.id }, orderBy: { id: "asc" } });
  const progress = o.status === "COMPLETED" ? 100 : o.remains !== null && o.quantity > 0 ? Math.max(0, Math.min(100, Math.round(((o.quantity - o.remains) / o.quantity) * 100))) : 0;
  const drip = parseDripfeed(o.params);
  const rows: [string, string][] = [
    ["Mã đơn", o.code],
    ["Dịch vụ", o.service.name],
    ["Danh mục", o.service.category.name],
    ["Link", o.link],
    ["Số lượng", num(o.quantity)],
    ["Số bắt đầu", o.startCount !== null ? num(o.startCount) : "Chưa cập nhật"],
    ["Còn lại", o.remains !== null ? num(o.remains) : "—"],
    ["Tổng tiền", vnd(o.charge)],
    ["Đã hoàn", vnd(o.refundedAmount)],
    ["Hình thức xử lý", o.fulfillment === "API" ? "Tự động qua nhà cung cấp" : "Xử lý thủ công bởi đội ngũ"],
    ["Tạo lúc", dt(o.createdAt)],
    ["Cập nhật", dt(o.updatedAt)],
    ...(drip ? [[
      "Drip-feed",
      drip.cancelled
        ? `Đã dừng ở lượt ${drip.doneRuns}/${drip.runs}`
        : `Đã thả ${drip.doneRuns}/${drip.runs} lượt · mỗi lượt ${num(drip.perRun)} · cách nhau ${drip.intervalMinutes} phút${drip.doneRuns < drip.runs ? ` · lượt tiếp theo: ${dt(new Date(drip.nextRunAt))}` : ""}`,
    ] as [string, string]] : []),
  ];
  return (
    <div>
      <BackLink href="/dashboard/don-hang">Danh sách đơn SMM</BackLink>
      <div className="card p-6 max-w-3xl">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-bold text-slate-900">Chi tiết đơn {o.code}</h1>
          <Badge cls={SMM_STATUS[o.status].cls}>{SMM_STATUS[o.status].label}</Badge>
        </div>
        <div className="mb-6">
          <div className="flex justify-between text-xs text-slate-500 mb-1.5">
            <span>Tiến độ đã chạy</span>
            <span><b className="text-slate-800">{progress}%</b>{o.remains !== null ? ` · còn lại ${num(o.remains)}/${num(o.quantity)}` : ""}</span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${o.status === "CANCELED" || o.status === "REFUNDED" ? "bg-rose-400" : "bg-brand-500"}`} style={{ width: `${progress}%` }} />
          </div>
        </div>
        <dl className="divide-y divide-slate-100">
          {rows.map(([k, v]) => (
            <div key={k} className="py-3 grid grid-cols-[160px_1fr] gap-4 text-sm">
              <dt className="text-slate-500">{k}</dt>
              <dd className="font-medium text-slate-800 break-all">{v}</dd>
            </div>
          ))}
          {o.note && <div className="py-3 grid grid-cols-[160px_1fr] gap-4 text-sm"><dt className="text-slate-500">Ghi chú của bạn</dt><dd>{o.note}</dd></div>}
          {o.adminNote && <div className="py-3 grid grid-cols-[160px_1fr] gap-4 text-sm"><dt className="text-slate-500">Phản hồi từ hỗ trợ</dt><dd>{o.adminNote}</dd></div>}
        </dl>
        {events.length > 0 && (
          <div className="mt-6 border-t border-dashed pt-5">
            <div className="font-bold text-slate-900 mb-4">Lịch sử trạng thái</div>
            <div className="space-y-0">
              {events.map((ev, i) => (
                <div key={ev.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className={`w-2.5 h-2.5 rounded-full mt-1 ${i === events.length - 1 ? "bg-brand-500" : "bg-slate-300"}`} />
                    {i < events.length - 1 && <span className="w-px flex-1 bg-slate-200 my-0.5" />}
                  </div>
                  <div className="pb-4 min-w-0">
                    <div className="text-sm"><b className="text-slate-800">{SMM_STATUS[ev.status as keyof typeof SMM_STATUS]?.label || ev.status}</b> <span className="text-slate-400 text-xs ml-1.5">{dt(ev.createdAt)}</span></div>
                    {ev.note && <div className="text-sm text-slate-500 mt-0.5">{ev.note}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <OrderSupportActions code={o.code} category="smm" />
      </div>
    </div>
  );
}
