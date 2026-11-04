import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Badge, BackLink } from "@/components/ui";
import { vnd, num, SMM_STATUS, dt } from "@/lib/format";
import { parseDripfeed } from "@/lib/orders";

export const dynamic = "force-dynamic";

export default async function SmmOrderDetail({ params }: { params: { id: string } }) {
  const user = (await getCurrentUser())!;
  const o = await prisma.smmOrder.findFirst({ where: { id: parseInt(params.id), userId: user.id }, include: { service: { include: { category: true } } } });
  if (!o) notFound();
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
        <p className="text-xs text-slate-400 mt-5">Cần hỗ trợ về đơn này? Tạo ticket và ghi mã đơn {o.code} để được xử lý nhanh nhất.</p>
      </div>
    </div>
  );
}
