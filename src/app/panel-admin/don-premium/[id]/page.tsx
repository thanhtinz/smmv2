import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePanelAccessPage } from "@/lib/panel-access";
import { BackLink, Flash, Badge } from "@/components/ui";
import { panelPremiumOrderAction } from "@/app/actions/panel";
import { vnd, PRE_STATUS, dt, dshort } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Chi tiết đơn Premium của khách panel — chỉ xem; giao hàng do web mẹ xử lý. */
export default async function PanelPremiumOrderDetail({ params, searchParams }: { params: { id: string }; searchParams: { msg?: string; err?: string } }) {
  const { panel } = await requirePanelAccessPage();
  const o = await prisma.premiumOrder.findFirst({
    where: { id: parseInt(params.id), panelId: panel.id },
    include: { variant: { include: { product: true } }, user: true },
  });
  if (!o) notFound();
  const own = o.variant.product.panelId === panel.id;
  return (
    <div>
      <BackLink href="/panel-admin/don-premium">Danh sách đơn Premium</BackLink>
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className={`grid grid-cols-1 gap-6 items-start ${own ? "lg:grid-cols-5" : ""}`}>
      <div className={`card p-6 ${own ? "lg:col-span-3" : "max-w-3xl"}`}>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-slate-900">Đơn {o.code}</h1>
          <Badge cls={PRE_STATUS[o.status].cls}>{PRE_STATUS[o.status].label}</Badge>
        </div>
        <dl className="divide-y divide-slate-100 text-sm">
          {[
            ["Khách", `${o.user.username} (${o.user.email})`],
            ["Sản phẩm", `${o.variant.product.name} — ${o.variant.name}`],
            ["Hình thức gốc", o.variant.product.fulfillment === "AUTO_STOCK" ? "Kho tự động" : o.variant.product.fulfillment === "API" ? "Đấu API" : "Thủ công"],
            ["Số lượng", String(o.quantity)],
            ["Khách trả / Hoa hồng", `${vnd(o.total)} / ${vnd(o.commission)}`],
            ["Thông tin khách cung cấp", o.buyerInfo || "—"],
            ["Bảo hành đến", o.warrantyUntil ? dshort(o.warrantyUntil) : "Không bảo hành"],
            ["Tạo lúc", dt(o.createdAt)],
          ].map(([k, v]) => (
            <div key={k} className="py-2.5 grid grid-cols-[170px_1fr] gap-4"><dt className="text-slate-500">{k}</dt><dd className="font-medium break-all">{v}</dd></div>
          ))}
        </dl>
        {o.deliveryData && (
          <div className="mt-5">
            <div className="text-sm font-semibold text-slate-700 mb-2">Nội dung đã giao</div>
            <pre className="bg-slate-950 text-emerald-300 rounded-xl p-4 text-sm whitespace-pre-wrap break-all">{o.deliveryData}</pre>
          </div>
        )}
        {o.adminNote && <p className="mt-4 text-sm bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-amber-800">{o.adminNote}</p>}
      </div>
      {own && (
        <div className="lg:col-span-2 space-y-4">
          <form action={panelPremiumOrderAction} className="card p-6 space-y-4">
            <input type="hidden" name="id" value={o.id} />
            <div className="font-bold text-slate-900">Giao hàng / cập nhật</div>
            <div>
              <label className="lbl">Nội dung giao cho khách</label>
              <textarea className="inp font-mono" name="deliveryData" rows={5} defaultValue={o.deliveryData || ""} placeholder={"Tài khoản: ...\nMật khẩu: ...\nHướng dẫn: ..."} />
            </div>
            <div>
              <label className="lbl">Trạng thái</label>
              <select className="inp" name="status" defaultValue={o.status}>
                {Object.entries(PRE_STATUS).filter(([k]) => k !== "REFUNDED").map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div><label className="lbl">Ghi chú nội bộ</label><textarea className="inp" name="adminNote" rows={2} defaultValue={o.adminNote || ""} /></div>
            <button className="btn-primary w-full" name="kind" value="update">Lưu + giao cho khách</button>
          </form>
          {!["REFUNDED", "CANCELED"].includes(o.status) && (
            <form action={panelPremiumOrderAction} className="card p-5">
              <input type="hidden" name="id" value={o.id} />
              <button className="btn-danger w-full" name="kind" value="cancel">Huỷ đơn + hoàn tiền</button>
            </form>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
