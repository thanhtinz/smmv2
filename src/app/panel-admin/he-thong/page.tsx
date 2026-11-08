import { prisma } from "@/lib/db";
import { requirePanelOwnerPage } from "@/lib/panel-access";
import { panelOrderCodes } from "@/lib/panel-orders";
import { PageHead, Flash, Stat, I } from "@/components/ui";
import { num, dt } from "@/lib/format";
import { panelCleanupAction } from "@/app/actions/panel";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

/** Hệ thống & Dọn dẹp — như hai trang Hệ thống / Dọn dẹp của web mẹ, phạm vi panel:
 *  thông tin panel + dọn dữ liệu cũ của khách panel. Đơn hàng, số dư, sổ tiền không bao giờ bị dọn. */
export default async function PanelSystem({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const { panel } = await requirePanelOwnerPage();
  const { L, Ld } = await getServerI18n((panel as { langConfig?: string | null }).langConfig ?? null);
  const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const codes = await panelOrderCodes(panel.id);
  const [memberCount, orderCount, oldNoti, oldEvents, oldLogs, dbOk] = await Promise.all([
    prisma.user.count({ where: { panelId: panel.id } }),
    prisma.smmOrder.count({ where: { panelId: panel.id } }),
    prisma.notification.count({ where: { user: { panelId: panel.id }, read: true, createdAt: { lt: cutoff } } }),
    prisma.orderEvent.count({ where: { createdAt: { lt: cutoff }, order: { panelId: panel.id } } }),
    codes.length ? prisma.apiLog.count({ where: { ref: { in: codes }, createdAt: { lt: cutoff } } }) : Promise.resolve(0),
    prisma.$queryRaw`SELECT 1 as ok`.then(() => true).catch(() => false),
  ]);
  // Sức khoẻ phạm vi panel: hàng chờ + tỉ lệ lỗi 24h của đơn qua panel + hạn dùng panel
  const d24p = new Date(Date.now() - 24 * 3600000);
  const [panelPending, panelErr24, panelTot24] = await Promise.all([
    prisma.smmOrder.count({ where: { panelId: panel.id, status: { in: ["PENDING", "PROCESSING", "IN_PROGRESS"] } } }),
    prisma.smmOrder.count({ where: { panelId: panel.id, updatedAt: { gte: d24p }, status: { in: ["CANCELED", "REFUNDED"] } } }),
    prisma.smmOrder.count({ where: { panelId: panel.id, updatedAt: { gte: d24p } } }),
  ]);
  const jobs = [
    { kind: "notifications", label: "Thông báo đã đọc của khách (cũ hơn 30 ngày)", count: oldNoti },
    { kind: "events", label: "Dòng thời gian đơn của panel (cũ hơn 30 ngày)", count: oldEvents },
    { kind: "apilogs", label: "Nhật ký API liên quan đơn của panel (cũ hơn 30 ngày)", count: oldLogs },
  ];
  return (
    <div>
      <PageHead title={L("Hệ thống & Dọn dẹp")} desc={L("Thông tin panel và dọn dữ liệu cũ trong phạm vi website của bạn — đơn hàng, người dùng và sổ tiền không bao giờ bị dọn.")} />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={L("Trạng thái panel")} value={panel.status === "ACTIVE" ? L("Đang mở bán") : L("Đã tạm ngưng")} icon={I.home} tone="emerald" />
        <Stat label="Database" value={dbOk ? L("Đã kết nối") : L("Mất kết nối")} icon={I.server} tone={dbOk ? "blue" : "rose"} />
        <Stat label={L("Khách của panel")} value={num(memberCount)} icon={I.users} tone="violet" />
        <Stat label={L("Đơn SMM qua panel")} value={num(orderCount)} icon={I.cart} tone="amber" />
        <Stat label={L("Đơn đang xử lý (hàng chờ)")} value={num(panelPending)} icon={I.clock} tone="blue" />
        <Stat label={L("Tỉ lệ đơn lỗi 24 giờ")} value={panelTot24 ? `${Math.round((panelErr24 / panelTot24) * 1000) / 10}%` : "0%"} icon={I.chart} tone="rose" />
      </div>
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <div className="card p-6">
          <div className="mb-4 font-bold text-slate-900">{L("Thông tin panel")}</div>
          <dl className="space-y-2.5 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-slate-400">{L("Tên website")}</dt><dd className="font-semibold text-slate-800">{panel.name}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-400">{L("Đường dẫn")}</dt><dd className="font-mono text-[13px] font-semibold text-slate-800">/cua-hang/{panel.slug}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-400">{L("Tên miền riêng")}</dt><dd className="font-semibold text-slate-800">{panel.domain || L("Chưa gắn")}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-400">{L("Nguồn dịch vụ")}</dt><dd className="font-semibold text-slate-800">{L("Web mẹ (API SMM v2 · /api/v2)")}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-400">{L("Tài khoản liên kết web mẹ")}</dt><dd className="font-semibold text-slate-800">{panel.apiUserId ? L("Đã liên kết") : L("Chưa liên kết")}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-400">{L("Ngày tạo panel")}</dt><dd className="font-semibold text-slate-800">{dt(panel.createdAt)}</dd></div>
          </dl>
        </div>
        <div className="card p-6">
          <div className="mb-1 font-bold text-slate-900">{L("Dọn dẹp dữ liệu cũ")}</div>
          <p className="mb-4 text-sm text-slate-400">{L("Chỉ xoá bản ghi cũ hơn 30 ngày trong phạm vi panel của bạn.")}</p>
          <div className="space-y-3">
            {jobs.map((j) => (
              <form key={j.kind} action={panelCleanupAction} className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
                <input type="hidden" name="kind" value={j.kind} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-700">{L(j.label)}</div>
                  <div className="text-xs text-slate-400">{Ld(`${num(j.count)} bản ghi có thể dọn`)}</div>
                </div>
                <button className="btn-ghost btn-sm shrink-0" disabled={j.count === 0}>{L("Dọn ngay")}</button>
              </form>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
