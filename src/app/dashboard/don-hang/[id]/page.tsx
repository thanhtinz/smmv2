import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Badge, BackLink } from "@/components/ui";
import { CopyBtn } from "@/components/client";
import { num, SMM_STATUS, dt } from "@/lib/format";
import { parseDripfeed } from "@/lib/orders";
import { OrderSupportActions } from "@/components/order-support-actions";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

export default async function SmmOrderDetail({ params }: { params: { id: string } }) {
  const user = (await getCurrentUser())!;
  const { L, Ld, M } = await getServerI18n();
  const o = await prisma.smmOrder.findFirst({ where: { id: parseInt(params.id), userId: user.id }, include: { service: { include: { category: true } } } });
  if (!o) notFound();
  const events = await prisma.orderEvent.findMany({ where: { orderId: o.id }, orderBy: { id: "asc" } });
  const progress = o.status === "COMPLETED" ? 100 : o.remains !== null && o.quantity > 0 ? Math.max(0, Math.min(100, Math.round(((o.quantity - o.remains) / o.quantity) * 100))) : 0;
  const drip = parseDripfeed(o.params);
  // Mã đơn + Tạo lúc đã chuyển lên thẻ header (kiểu trang Telegram) nên không
  // lặp lại trong bảng thông tin bên dưới.
  const rows: [string, string][] = [
    [L("Dịch vụ"), o.service.name],
    [L("Danh mục"), o.service.category.name],
    ["Link", o.link],
    [L("Số lượng"), num(o.quantity)],
    [L("Số bắt đầu"), o.startCount !== null ? num(o.startCount) : L("Chưa cập nhật")],
    [L("Còn lại"), o.remains !== null ? num(o.remains) : "—"],
    [L("Tổng tiền"), M(o.charge)],
    [L("Đã hoàn"), M(o.refundedAmount)],
    [L("Hình thức xử lý"), o.fulfillment === "API" ? L("Tự động qua nhà cung cấp") : L("Xử lý thủ công bởi đội ngũ")],
    [L("Cập nhật"), dt(o.updatedAt)],
    ...(drip ? [[
      "Drip-feed",
      drip.cancelled
        ? `${L("Đã dừng ở lượt ")}${drip.doneRuns}/${drip.runs}`
        : `${L("Đã thả ")}${drip.doneRuns}/${drip.runs}${L(" lượt · mỗi lượt ")}${num(drip.perRun)}${L(" · cách nhau ")}${drip.intervalMinutes}${L(" phút")}${drip.doneRuns < drip.runs ? `${L(" · lượt tiếp theo: ")}${dt(new Date(drip.nextRunAt))}` : ""}`,
    ] as [string, string]] : []),
  ];
  const panelTitle = (n: number, label: string) => (
    <div className="flex items-center gap-3 border-b border-slate-100 pb-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-[15px] font-extrabold text-violet-600">{n}</span>
      <span className="text-[17px] font-extrabold text-slate-900">{label}</span>
    </div>
  );
  const infoRow = "flex items-start justify-between gap-3 px-4 py-3.5";
  return (
    <div className="mx-auto w-full max-w-[640px]">
      <BackLink href="/dashboard/don-hang">{L("Danh sách đơn SMM")}</BackLink>
      {/* Thẻ header DUY NHẤT: mã đơn (mono, sao chép được) + trạng thái + ngày tạo */}
      <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-[#ece8ff] via-[#f5f3ff] to-white px-6 py-6 sm:px-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[22px] font-black leading-tight text-slate-900">{o.code}</span>
              <CopyBtn text={o.code} />
            </div>
            <p className="mt-1 text-sm text-slate-500">{L("Tạo lúc")} {dt(o.createdAt)}</p>
          </div>
          <Badge cls={SMM_STATUS[o.status].cls}>{L(SMM_STATUS[o.status].label)}</Badge>
        </div>
        <div className="mt-5">
          <div className="mb-1.5 flex justify-between text-xs text-slate-500">
            <span>{L("Tiến độ đã chạy")}</span>
            <span><b className="text-slate-800">{progress}%</b>{o.remains !== null ? `${L(" · còn lại ")}${num(o.remains)}/${num(o.quantity)}` : ""}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-200/70">
            <div className={`h-full rounded-full transition-all ${o.status === "CANCELED" || o.status === "REFUNDED" ? "bg-rose-400" : "bg-brand-500"}`} style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      <section className="card mt-4 p-3.5 sm:mt-5 sm:p-5">
        {panelTitle(1, L("Thông tin đơn hàng"))}
        <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
          {rows.map(([k, v]) => (
            <div key={k} className={infoRow}>
              <span className="shrink-0 text-[15px] text-slate-500">{k}</span>
              {k === "Link" ? (
                <span className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 break-all text-right font-bold text-slate-900">{v}</span>
                  <CopyBtn text={o.link} />
                </span>
              ) : (
                <span className="min-w-0 break-words text-right font-bold text-slate-900">{v}</span>
              )}
            </div>
          ))}
          {o.note && (
            <div className={infoRow}>
              <span className="shrink-0 text-[15px] text-slate-500">{L("Ghi chú của bạn")}</span>
              <span className="min-w-0 break-words text-right font-bold text-slate-900">{o.note}</span>
            </div>
          )}
          {o.adminNote && (
            <div className={infoRow}>
              <span className="shrink-0 text-[15px] text-slate-500">{L("Phản hồi từ hỗ trợ")}</span>
              <span className="min-w-0 break-words text-right font-bold text-slate-900">{o.adminNote}</span>
            </div>
          )}
        </div>
      </section>

      {events.length > 0 && (
        <section className="card mt-4 p-3.5 sm:mt-5 sm:p-5">
          {panelTitle(2, L("Lịch sử trạng thái"))}
          <div className="mt-4 space-y-0">
            {events.map((ev, i) => (
              <div key={ev.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className={`mt-1 h-2.5 w-2.5 rounded-full ${i === events.length - 1 ? "bg-brand-500" : "bg-slate-300"}`} />
                  {i < events.length - 1 && <span className="my-0.5 w-px flex-1 bg-slate-200" />}
                </div>
                <div className="min-w-0 pb-4">
                  <div className="text-sm"><b className="text-slate-800">{SMM_STATUS[ev.status as keyof typeof SMM_STATUS]?.label ? L(SMM_STATUS[ev.status as keyof typeof SMM_STATUS].label) : ev.status}</b> <span className="ml-1.5 text-xs text-slate-400">{dt(ev.createdAt)}</span></div>
                  {ev.note && <div className="mt-0.5 text-sm text-slate-500">{ev.note}</div>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card mt-4 p-5 sm:mt-5">
        <div className="text-[17px] font-extrabold text-slate-900">{L("Hỗ trợ đơn này")}</div>
        <OrderSupportActions code={o.code} category="smm" />
      </section>
    </div>
  );
}
