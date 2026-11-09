import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { BackLink, Flash, Badge } from "@/components/ui";
import { adminPremiumOrderAction } from "@/app/actions/admin";
import { ManualChatPanel } from "@/components/manual-chat";
import { PRE_STATUS, dt, dshort } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

export default async function AdminPremiumOrderDetail({ params, searchParams }: { params: { id: string }; searchParams: { msg?: string; err?: string } }) {
  const { L, Ld, M } = await getServerI18n(null);
  const o = await prisma.premiumOrder.findUnique({
    where: { id: parseInt(params.id) },
    include: { variant: { include: { product: true } }, user: true },
  });
  if (!o) notFound();
  return (
    <div>
      <BackLink href="/admin/don-premium">{L("Danh sách đơn Premium")}</BackLink>
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        <div className="card p-6 lg:col-span-3">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-slate-900">{L("Đơn")} {o.code}</h1>
            <Badge cls={PRE_STATUS[o.status].cls}>{L(PRE_STATUS[o.status].label)}</Badge>
          </div>
          <dl className="divide-y divide-slate-100 text-sm">
            {[
              [L("Khách"), `${o.user.username} (${o.user.email})`],
              [L("Sản phẩm"), `${o.variant.product.name} — ${o.variant.name}`],
              [L("Hình thức gốc"), o.variant.product.fulfillment === "AUTO_STOCK" ? L("Kho tự động") : o.variant.product.fulfillment === "API" ? L("Đấu API — order_code phía nguồn:") + " " + (o.providerOrderId || L("chưa có")) : L("Thủ công")],
              [L("Số lượng"), String(o.quantity)],
              ...(o.providerRaw ? [[L("Trạng thái phía nhà cung cấp"), (() => { try { const r = JSON.parse(o.providerRaw!); const one = Array.isArray(r) ? r[0] : r; return String(one?.status || one?.state || "—"); } catch { return "—"; } })()]] as [string, string][] : []),
              [L("Thu / Vốn / Lãi"), `${M(o.total)} / ${M(o.cost)} / ${M(o.total - o.cost)}`],
              [L("Thông tin khách cung cấp"), o.buyerInfo || "—"],
              [L("Bảo hành đến"), o.warrantyUntil ? dshort(o.warrantyUntil) : L("Không bảo hành")],
              [L("Tạo lúc"), dt(o.createdAt)],
            ].map(([k, v]) => (
              <div key={k} className="py-2.5 grid grid-cols-[170px_1fr] gap-4"><dt className="text-slate-500">{k}</dt><dd className="font-medium break-all">{v}</dd></div>
            ))}
          </dl>
          {o.providerRaw && (
            <div className="mt-5">
              <div className="text-sm font-semibold text-slate-700 mb-2">{L("Dữ liệu thô từ nhà cung cấp")}</div>
              <pre className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs whitespace-pre-wrap break-all max-h-64 overflow-y-auto">{o.providerRaw}</pre>
            </div>
          )}
          {o.deliveryData && (
            <div className="mt-5">
              <div className="text-sm font-semibold text-slate-700 mb-2">{L("Nội dung đã giao")}</div>
              <pre className="bg-slate-950 text-emerald-300 rounded-xl p-4 text-sm whitespace-pre-wrap break-all">{o.deliveryData}</pre>
            </div>
          )}
          {o.adminNote && <p className="mt-4 text-sm bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-amber-800">{o.adminNote}</p>}
          {o.variant.providerGroup === "manual" && o.providerOrderId && <ManualChatPanel orderId={o.id} audience="admin" />}
        </div>
        <div className="lg:col-span-2 space-y-4">
          {o.providerOrderId && (
            <form action={adminPremiumOrderAction} className="card p-5">
              <input type="hidden" name="id" value={o.id} />
              <button className="btn-ghost w-full" name="kind" value="sync">{L("Đồng bộ bàn giao từ nhà cung cấp ngay")}</button>
            </form>
          )}
          <form action={adminPremiumOrderAction} className="card p-6 space-y-4">
            <input type="hidden" name="id" value={o.id} />
            <div className="font-bold text-slate-900">{L("Giao hàng / cập nhật")}</div>
            <div>
              <label className="lbl">{L("Nội dung giao cho khách")}</label>
              <textarea className="inp font-mono" name="deliveryData" rows={5} defaultValue={o.deliveryData || ""} placeholder={L("Tài khoản: ...\nMật khẩu: ...\nHướng dẫn: ...")} />
            </div>
            <div>
              <label className="lbl">{L("Trạng thái")}</label>
              <select className="inp" name="status" defaultValue={o.status}>
                {Object.entries(PRE_STATUS).filter(([k]) => k !== "REFUNDED").map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div><label className="lbl">{L("Ghi chú nội bộ")}</label><textarea className="inp" name="adminNote" rows={2} defaultValue={o.adminNote || ""} /></div>
            <button className="btn-primary w-full" name="kind" value="update">{L("Lưu + giao cho khách")}</button>
            <p className="text-xs text-slate-400">{L("Khi trạng thái là \"Đã giao\", khách thấy ngay nội dung ở trên trong mục Đơn Premium của họ.")}</p>
          </form>
          {!["REFUNDED", "CANCELED"].includes(o.status) && (
            <form action={adminPremiumOrderAction} className="card p-5">
              <input type="hidden" name="id" value={o.id} />
              <button className="btn-danger w-full" name="kind" value="cancel">{L("Huỷ đơn + hoàn tiền")}</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
