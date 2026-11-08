import { requireAdminPage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHead, Flash } from "@/components/ui";
import { cleanupSystemAction } from "@/app/actions/admin-features";
import { num, dt } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

export default async function AdminSystem({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  await requireAdminPage();
  const { L, Ld } = await getServerI18n(null);
  const d30 = new Date(Date.now() - 30 * 86400000);
  const [apiLogOld, apiLogTotal, notifOld, eventsOld, users, orders] = await Promise.all([
    prisma.apiLog.count({ where: { createdAt: { lt: d30 } } }),
    prisma.apiLog.count(),
    prisma.notification.count({ where: { read: true, createdAt: { lt: d30 } } }),
    prisma.orderEvent.count({ where: { createdAt: { lt: d30 } } }),
    prisma.user.count(),
    prisma.smmOrder.count(),
  ]);
  // --- Sức khoẻ hệ thống (đợt bổ sung): DB, cron gần nhất, hàng chờ, sức khoẻ provider, backup
  const t0 = Date.now();
  const dbOk = await prisma.$queryRaw`SELECT 1 as ok`.then(() => true).catch(() => false);
  const dbMs = Date.now() - t0;
  const d24 = new Date(Date.now() - 24 * 3600000);
  const [lastCron, pendingOrders, activeSubs, providers, err24, tot24] = await Promise.all([
    prisma.apiLog.findFirst({ where: { kind: "cron_sync" }, orderBy: { id: "desc" } }),
    prisma.smmOrder.count({ where: { status: { in: ["PENDING", "PROCESSING", "IN_PROGRESS"] } } }),
    prisma.subscription.count({ where: { active: true } }),
    prisma.provider.findMany({ where: { active: true }, orderBy: { id: "asc" } }),
    prisma.smmOrder.count({ where: { updatedAt: { gte: d24 }, status: { in: ["CANCELED", "REFUNDED"] } } }),
    prisma.smmOrder.count({ where: { updatedAt: { gte: d24 } } }),
  ]);
  const healthCards = [
    { label: L("Cơ sở dữ liệu"), value: dbOk ? L("Đang kết nối") + " · " + dbMs + "ms" : L("Mất kết nối") },
    { label: L("Cron đồng bộ gần nhất"), value: lastCron ? dt(lastCron.createdAt) : L("Chưa ghi nhận") },
    { label: L("Đơn đang xử lý (hàng chờ)"), value: num(pendingOrders) },
    { label: L("Gói định kỳ đang chạy"), value: num(activeSubs) },
    { label: L("Tỉ lệ đơn lỗi 24 giờ"), value: tot24 ? Ld(`${Math.round((err24 / tot24) * 1000) / 10}% (${num(err24)}/${num(tot24)})`) : "0%" },
    { label: L("Sao lưu dữ liệu"), value: L("Xem deploy/backup.sh — bản sao nằm ở máy chủ (/var/backups/smmv2)") },
  ];
  const cards = [
    { label: L("Phiên bản SMMv2"), value: "1.0" },
    { label: L("Môi trường chạy"), value: Ld(`Next.js 14 · Node ${process.versions.node}`) },
    { label: L("Tổng người dùng"), value: num(users) },
    { label: L("Tổng đơn SMM"), value: num(orders) },
    { label: L("Nhật ký API (tổng)"), value: num(apiLogTotal) },
    { label: L("Uptime tiến trình"), value: Math.floor(process.uptime() / 60) + " " + L("phút") },
  ];
  const cleanups = [
    { kind: "apilog", title: L("Nhật ký API cũ"), desc: L("Bản ghi gọi API nhà cung cấp / webhook cũ hơn 30 ngày"), count: apiLogOld },
    { kind: "notifications", title: L("Thông báo cũ"), desc: L("Thông báo khách đã đọc, cũ hơn 30 ngày"), count: notifOld },
    { kind: "events", title: L("Lịch sử trạng thái đơn cũ"), desc: L("Sự kiện chuyển trạng thái đơn cũ hơn 30 ngày"), count: eventsOld },
  ];
  return (
    <div>
      <PageHead title={L("Hệ thống")} desc={L("Thông tin môi trường và dọn dẹp dữ liệu cũ để hệ thống nhẹ và nhanh.")} />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <div className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">{L("Sức khoẻ hệ thống")}</div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {healthCards.map((c) => (
          <div key={c.label} className="card p-5">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{c.label}</div>
            <div className="mt-1 truncate text-lg font-bold text-slate-900">{c.value}</div>
          </div>
        ))}
      </div>
      {providers.length > 0 && (
        <div className="card mt-6 overflow-x-auto">
          <div className="border-b border-slate-100 px-5 py-4 font-bold text-slate-900">{L("Nhà cung cấp — lần kiểm tra gần nhất")}</div>
          <table className="w-full min-w-[560px]">
            <thead><tr><th className="th">{L("Nhà cung cấp")}</th><th className="th">{L("Số dư (quy VNĐ)")}</th><th className="th">{L("Đồng bộ gần nhất")}</th><th className="th">{L("Trạng thái")}</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {providers.map((pv) => (
                <tr key={pv.id}>
                  <td className="td font-medium">{pv.name}</td>
                  <td className="td">{num(pv.balanceCache)}</td>
                  <td className="td whitespace-nowrap text-slate-500">{pv.lastSyncAt ? dt(pv.lastSyncAt) : L("Chưa đồng bộ")}</td>
                  <td className="td">{pv.active ? L("Đang bật") : L("Đã tắt")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mb-3 mt-8 text-xs font-bold uppercase tracking-widest text-slate-400">{L("Thông tin & dọn dẹp")}</div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="card p-5">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{c.label}</div>
            <div className="mt-1 truncate text-lg font-bold text-slate-900">{c.value}</div>
          </div>
        ))}
      </div>
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {cleanups.map((c) => (
          <div key={c.kind} className="card p-5">
            <div className="font-bold text-slate-900">{c.title}</div>
            <p className="mt-1 text-sm text-slate-500">{c.desc}</p>
            <div className="mt-3 text-sm">{L("Có thể xoá:")} <b>{num(c.count)}</b> {L("bản ghi")}</div>
            <form action={cleanupSystemAction} className="mt-4">
              <input type="hidden" name="kind" value={c.kind} />
              <button className="btn bg-rose-600 text-white hover:bg-rose-700" disabled={c.count === 0}>{L("Dọn dẹp")}</button>
            </form>
            <p className="mt-2 text-xs text-rose-500">{L("Xoá là không khôi phục được.")}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
