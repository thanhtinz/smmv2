import { requireAdminPage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHead, Flash } from "@/components/ui";
import { cleanupSystemAction } from "@/app/actions/admin-features";
import { num } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Dọn dẹp hệ thống — xoá các bản ghi rác/cũ để database gọn nhẹ.
 *  Chỉ dọn nhật ký và thông báo cũ; đơn hàng, người dùng và sổ giao dịch tiền KHÔNG bao giờ bị xoá ở đây. */
export default async function AdminCleanupPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  await requireAdminPage();
  const d30 = new Date(Date.now() - 30 * 86400000);
  const [users, smmOrders, preOrders, txs, apiLogOld, apiLogTotal, notifOld, notifTotal, eventsOld] = await Promise.all([
    prisma.user.count(),
    prisma.smmOrder.count(),
    prisma.premiumOrder.count(),
    prisma.transaction.count(),
    prisma.apiLog.count({ where: { createdAt: { lt: d30 } } }),
    prisma.apiLog.count(),
    prisma.notification.count({ where: { read: true, createdAt: { lt: d30 } } }),
    prisma.notification.count(),
    prisma.orderEvent.count({ where: { createdAt: { lt: d30 } } }),
  ]);
  const stats = [
    { label: "Người dùng", value: num(users) },
    { label: "Đơn SMM", value: num(smmOrders) },
    { label: "Đơn Premium", value: num(preOrders) },
    { label: "Giao dịch tiền (sổ cái)", value: num(txs) },
    { label: "Nhật ký API (tổng)", value: num(apiLogTotal) },
    { label: "Thông báo (tổng)", value: num(notifTotal) },
  ];
  const jobs = [
    { kind: "apilog", title: "Nhật ký API cũ", desc: "Bản ghi gọi API nhà cung cấp / webhook cũ hơn 30 ngày", count: apiLogOld },
    { kind: "notifications", title: "Thông báo đã đọc cũ", desc: "Thông báo khách đã đọc, cũ hơn 30 ngày (thông báo chưa đọc được giữ lại)", count: notifOld },
    { kind: "events", title: "Dòng thời gian đơn cũ", desc: "Mốc tiến độ đơn hàng cũ hơn 30 ngày (bản thân đơn hàng vẫn giữ nguyên)", count: eventsOld },
  ];
  return (
    <div>
      <PageHead title="Dọn dẹp hệ thống" desc="Xoá các bản ghi nhật ký cũ để hệ thống gọn nhẹ. Đơn hàng, người dùng và sổ giao dịch tiền không bao giờ bị xoá ở đây." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {stats.map((c) => (
          <div key={c.label} className="card p-4"><div className="text-xl font-extrabold text-slate-900">{c.value}</div><div className="mt-0.5 text-xs text-slate-400">{c.label}</div></div>
        ))}
      </div>
      <div className="card mt-6 divide-y divide-slate-100">
        {jobs.map((j) => (
          <div key={j.kind} className="flex flex-wrap items-center gap-4 p-5">
            <div className="min-w-0 flex-1">
              <div className="font-bold text-slate-800">{j.title}</div>
              <p className="mt-0.5 text-sm text-slate-400">{j.desc}</p>
            </div>
            <div className="text-right">
              <div className="text-lg font-extrabold text-slate-900">{num(j.count)}</div>
              <div className="text-xs text-slate-400">bản ghi có thể dọn</div>
            </div>
            <form action={cleanupSystemAction}>
              <input type="hidden" name="kind" value={j.kind} />
              <input type="hidden" name="from" value="/admin/don-dep" />
              <button className="btn-primary !py-2 px-5" disabled={j.count === 0}>Dọn ngay</button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
