import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePanelAccessPage } from "@/lib/panel-access";
import { BackLink, Flash, Badge } from "@/components/ui";
import { panelPremiumOrderAction } from "@/app/actions/panel";
import { PRE_STATUS, dt, dshort } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

/** Chi tiết đơn Premium của khách panel — chỉ xem; giao hàng do web mẹ xử lý. */
export default async function PanelPremiumOrderDetail({ params, searchParams }: { params: { id: string }; searchParams: { msg?: string; err?: string } }) {
  const { panel } = await requirePanelAccessPage();
  const { L, Ld, M } = await getServerI18n((panel as { langConfig?: string | null }).langConfig ?? null);
  const o = await prisma.premiumOrder.findFirst({
    where: { id: parseInt(params.id), panelId: panel.id },
    include: { variant: { include: { product: true } }, user: true },
  });
  if (!o) notFound();
  const own = o.variant.product.panelId === panel.id;
  return (
    <div>
      <BackLink href="/panel-admin/don-premium">{L("Danh sách đơn Premium")}</BackLink>
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <div className={`grid grid-cols-1 gap-6 items-start ${own ? "lg:grid-cols-5" : ""}`}>
      <div className={`card p-6 ${own ? "lg:col-span-3" : "max-w-3xl"}`}>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-slate-900">{L("Đơn")} {o.code}</h1>
          <Badge cls={PRE_STATUS[o.status].cls}>{L(PRE_STATUS[o.status].label)}</Badge>
        </div>
        <dl className="divide-y divide-slate-100 text-sm">
          {[
            [L("Khách"), `${o.user.username} (${o.user.email})`],
            [L("Sản phẩm"), `${o.variant.product.name} — ${o.variant.name}`],
            [L("Hình thức gốc"), o.variant.product.fulfillment === "AUTO_STOCK" ? L("Kho tự động") : o.variant.product.fulfillment === "API" ? L("Đấu API") : L("Thủ công")],
            [L("Số lượng"), String(o.quantity)],
            [L("Khách trả / Hoa hồng"), `${M(o.total)} / ${M(o.commission)}`],
            [L("Thông tin khách cung cấp"), o.buyerInfo || "—"],
            [L("Bảo hành đến"), o.warrantyUntil ? dshort(o.warrantyUntil) : L("Không bảo hành")],
            [L("Tạo lúc"), dt(o.createdAt)],
          ].map(([k, v]) => (
            <div key={k} className="py-2.5 grid grid-cols-[170px_1fr] gap-4"><dt className="text-slate-500">{k}</dt><dd className="font-medium break-all">{v}</dd></div>
          ))}
        </dl>
        {o.deliveryData && (
          <div className="mt-5">
            <div className="text-sm font-semibold text-slate-700 mb-2">{L("Nội dung đã giao")}</div>
            <pre className="bg-slate-950 text-emerald-300 rounded-xl p-4 text-sm whitespace-pre-wrap break-all">{o.deliveryData}</pre>
          </div>
        )}
        {o.adminNote && <p className="mt-4 text-sm bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-amber-800">{o.adminNote}</p>}
      </div>
      {own && (
        <div className="lg:col-span-2 space-y-4">
          <form action={panelPremiumOrderAction} className="card p-6 space-y-4">
            <input type="hidden" name="id" value={o.id} />
            <div className="font-bold text-slate-900">{L("Giao hàng / cập nhật")}</div>
            <div>
              <label className="lbl">{L("Nội dung giao cho khách")}</label>
              <textarea className="inp font-mono" name="deliveryData" rows={5} defaultValue={o.deliveryData || ""} placeholder={L("Tài khoản: ...\nMật khẩu: ...\nHướng dẫn: ...")} />
            </div>
            <div>
              <label className="lbl">{L("Trạng thái")}</label>
              <select className="inp" name="status" defaultValue={o.status}>
                {Object.entries(PRE_STATUS).filter(([k]) => k !== "REFUNDED").map(([k, v]) => <option key={k} value={k}>{L(v.label)}</option>)}
              </select>
            </div>
            <div><label className="lbl">{L("Ghi chú nội bộ")}</label><textarea className="inp" name="adminNote" rows={2} defaultValue={o.adminNote || ""} /></div>
            <button className="btn-primary w-full" name="kind" value="update">{L("Lưu + giao cho khách")}</button>
          </form>
          {!["REFUNDED", "CANCELED"].includes(o.status) && (
            <form action={panelPremiumOrderAction} className="card p-5">
              <input type="hidden" name="id" value={o.id} />
              <button className="btn-danger w-full" name="kind" value="cancel">{L("Huỷ đơn + hoàn tiền")}</button>
            </form>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
