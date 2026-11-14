import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageHead, Flash, Badge } from "@/components/ui";
import { PRE_STATUS, dt } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";
import { telegramRecipient, TELEGRAM_GROUPS } from "@/lib/tg";
import { fzrOrderStatus } from "@/lib/fzr";
import { adminTelegramPollAction } from "@/app/actions/telegram";

export const dynamic = "force-dynamic";

/** Chi tiết 1 đơn Telegram: khách, người nhận, mã + trạng thái phía FZR,
 *  nút kiểm tra trạng thái theo yêu cầu và trạng thái hoàn tiền. */
export default async function AdminTelegramOrderDetail( { params: paramsPromise, searchParams: searchParamsPromise }: { params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; err?: string }>; }) {
  const params = await paramsPromise;
  const searchParams = await searchParamsPromise;
  const { L, Ld, M } = await getServerI18n();
  const id = parseInt(params.id);
  const o = id ? await prisma.premiumOrder.findUnique({
    where: { id },
    include: { variant: { select: { name: true, providerGroup: true, providerId: true } }, user: { select: { username: true, email: true } } },
  }) : null;
  if (!o || !TELEGRAM_GROUPS.includes(o.variant.providerGroup || "")) notFound();
  const r = telegramRecipient(o.buyerInfo);
  const isStars = o.variant.providerGroup === "telegram_stars";
  let rawStatus = "";
  try { rawStatus = o.providerRaw ? fzrOrderStatus(JSON.parse(o.providerRaw)) : ""; } catch { rawStatus = ""; }
  const refunded = o.status === "REFUNDED" || o.status === "CANCELED";

  const Row = ({ k, children }: { k: string; children: React.ReactNode }) => (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-2.5 text-sm last:border-0">
      <span className="text-slate-500">{k}</span><span className="text-right font-semibold text-slate-800">{children}</span>
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl">
      <PageHead title={`${L("Đơn Telegram")} ${o.code}`} />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <div className="card p-5">
        <Row k={L("Khách hàng")}>{o.user.username} · {o.user.email}</Row>
        <Row k={L("Loại đơn")}><Badge cls={isStars ? "bg-amber-100 text-amber-700" : "bg-violet-100 text-violet-700"}>{isStars ? "Stars" : "Premium"}</Badge></Row>
        <Row k={L("Người nhận")}>{r.username || "—"} · ID: {r.id || "—"}</Row>
        <Row k={isStars ? L("Số sao") : L("Gói")}>{isStars ? `${o.quantity.toLocaleString("vi-VN")} Stars` : o.variant.name}</Row>
        <Row k={L("Tổng tiền")}>{M(o.total)}</Row>
        <Row k={L("Trạng thái đơn")}><Badge cls={PRE_STATUS[o.status]?.cls || "bg-slate-100 text-slate-600"}>{L(PRE_STATUS[o.status]?.label || o.status)}</Badge></Row>
        <Row k={L("Hoàn tiền")}>{refunded ? L("Đã hoàn tiền cho khách") : L("Chưa hoàn")}</Row>
        <Row k={L("Mã đơn phía nhà cung cấp")}>{o.providerOrderId || "—"}</Row>
        <Row k={L("Trạng thái phía nhà cung cấp")}>{rawStatus || "—"}</Row>
        <Row k={L("Ngày tạo")}>{dt(o.createdAt)}</Row>
        {o.adminNote && <Row k={L("Ghi chú hệ thống")}>{o.adminNote}</Row>}
      </div>
      {o.deliveryData && (
        <div className="card mt-5 p-5">
          <div className="font-bold text-slate-900">{L("Nội dung đã giao")}</div>
          <pre className="mt-2 whitespace-pre-wrap break-all rounded-xl bg-slate-50 p-3 text-xs text-slate-600">{o.deliveryData}</pre>
        </div>
      )}
      {o.providerRaw && (
        <div className="card mt-5 p-5">
          <div className="font-bold text-slate-900">{L("Dữ liệu thô từ nhà cung cấp")}</div>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-slate-950 p-3 text-xs text-slate-100">{o.providerRaw}</pre>
        </div>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        {o.providerOrderId && (
          <form action={adminTelegramPollAction}>
            <input type="hidden" name="orderId" value={o.id} />
            <button className="btn-primary">{L("Kiểm tra trạng thái")}</button>
          </form>
        )}
        <Link href="/admin/telegram" className="btn-ghost">{L("Quay lại danh sách")}</Link>
        <Link href={`/admin/don-premium/${o.id}`} className="btn-ghost">{L("Mở ở Đơn Premium")}</Link>
      </div>
    </div>
  );
}
