import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Badge, BackLink, Flash } from "@/components/ui";
import { adminSmmOrderAction } from "@/app/actions/admin";
import { vnd, num, SMM_STATUS, dt } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminSmmOrderDetail({ params, searchParams }: { params: { id: string }; searchParams: { msg?: string; err?: string } }) {
  const o = await prisma.smmOrder.findUnique({
    where: { id: parseInt(params.id) },
    include: { service: { include: { category: true } }, user: true, provider: true },
  });
  if (!o) notFound();
  const rows: [string, string][] = [
    ["Mã đơn", o.code],
    ["Khách", `${o.user.username} (${o.user.email})`],
    ["Dịch vụ", `[${o.service.id}] ${o.service.name}`],
    ["Link", o.link],
    ["Số lượng", num(o.quantity)],
    ["Thu khách", vnd(o.charge)],
    ["Vốn", vnd(o.cost)],
    ["Lãi dự kiến", vnd(o.charge - o.cost - o.refundedAmount)],
    ["Đã hoàn", vnd(o.refundedAmount)],
    ["Hình thức", o.fulfillment === "API" ? `API — ${o.provider?.name || ""} · đơn provider #${o.providerOrderId || "chưa có"}` : "Thủ công"],
    ["Đặt qua", o.viaApi ? "API đại lý" : "Website"],
    ["Tạo / Cập nhật", `${dt(o.createdAt)} / ${dt(o.updatedAt)}`],
  ];
  return (
    <div>
      <BackLink href="/admin/don-smm">Danh sách đơn SMM</BackLink>
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        <div className="card p-6 lg:col-span-3">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-slate-900">Đơn {o.code}</h1>
            <Badge cls={SMM_STATUS[o.status].cls}>{SMM_STATUS[o.status].label}</Badge>
          </div>
          <dl className="divide-y divide-slate-100">
            {rows.map(([k, v]) => (
              <div key={k} className="py-2.5 grid grid-cols-[140px_1fr] gap-4 text-sm"><dt className="text-slate-500">{k}</dt><dd className="font-medium break-all">{v}</dd></div>
            ))}
            {o.note && <div className="py-2.5 grid grid-cols-[140px_1fr] gap-4 text-sm"><dt className="text-slate-500">Ghi chú khách</dt><dd>{o.note}</dd></div>}
          </dl>
          {o.flagNote && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <b>Cờ rủi ro:</b> {o.flagNote}
            </div>
          )}
        </div>
        <div className="lg:col-span-2 space-y-4">
          <form action={adminSmmOrderAction} className="card p-6 space-y-4">
            <input type="hidden" name="id" value={o.id} />
            <div className="font-bold text-slate-900">Xử lý đơn</div>
            <div>
              <label className="lbl">Trạng thái</label>
              <select className="inp" name="status" defaultValue={o.status}>
                {Object.entries(SMM_STATUS).filter(([k]) => k !== "REFUNDED").map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="lbl">Số bắt đầu</label><input className="inp" name="startCount" type="number" defaultValue={o.startCount ?? ""} /></div>
              <div><label className="lbl">Còn lại</label><input className="inp" name="remains" type="number" defaultValue={o.remains ?? ""} /></div>
            </div>
            <p className="text-xs text-slate-400">Đặt trạng thái "Hoàn một phần" + số Còn lại &gt; 0: hệ thống tự hoàn tiền phần chưa chạy cho khách.</p>
            <div><label className="lbl">Ghi chú nội bộ</label><textarea className="inp" name="adminNote" rows={3} defaultValue={o.adminNote || ""} /></div>
            <button className="btn-primary w-full" name="kind" value="update">Cập nhật đơn</button>
          </form>
          {o.fulfillment === "API" && o.providerOrderId && (
            <form action={adminSmmOrderAction} className="card p-5">
              <input type="hidden" name="id" value={o.id} />
              <button className="btn-ghost w-full" name="kind" value="sync">Đồng bộ trạng thái từ provider ngay</button>
            </form>
          )}
          {!["COMPLETED", "REFUNDED", "CANCELED"].includes(o.status) && (
            <form action={adminSmmOrderAction} className="card p-5">
              <input type="hidden" name="id" value={o.id} />
              <button className="btn-danger w-full" name="kind" value="cancel">Huỷ đơn + hoàn toàn bộ tiền</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
