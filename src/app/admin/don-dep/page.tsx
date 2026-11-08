import { requireAdminPage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHead, Flash } from "@/components/ui";
import { cleanupSystemAction, clearCacheAction, cleanupAllAction } from "@/app/actions/admin-features";
import { num } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

/** Dọn dẹp hệ thống — quản lý bộ nhớ đệm, dọn các tệp nhật ký rác và tối ưu hệ thống.
 *  Cache ở stack này: cache dựng trang của Next.js + số dư nhà cung cấp lưu đệm trong DB.
 *  Dọn dữ liệu chỉ xoá nhật ký/thông báo cũ — đơn hàng, người dùng, sổ tiền không bao giờ bị xoá. */
export default async function AdminCleanupPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  await requireAdminPage();
  const { L, Ld } = await getServerI18n(null);
  const d30 = new Date(Date.now() - 30 * 86400000);
  let dbOk = true;
  try { await prisma.$queryRaw`SELECT 1`; } catch { dbOk = false; }
  const [apiLogOld, notifOld, eventsOld, providersCached] = await Promise.all([
    prisma.apiLog.count({ where: { createdAt: { lt: d30 } } }),
    prisma.notification.count({ where: { read: true, createdAt: { lt: d30 } } }),
    prisma.orderEvent.count({ where: { createdAt: { lt: d30 } } }),
    prisma.provider.count({ where: { balanceCache: { gt: 0 } } }),
  ]);
  const statuses = [
    { label: L("TRẠNG THÁI CACHE"), value: L("Đang hoạt động"), cls: "bg-blue-50 text-blue-500", icon: (<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m13 11 8-8" /><path d="m14 11-7.5 1L9 20l3 2 3-2 2-1-3-8Z" /><path d="m5 21 3-8" /><path d="M2 21h20" /></svg>) },
    { label: L("BỘ NHỚ ĐỆM"), value: L("Tự động tối ưu"), cls: "bg-amber-50 text-amber-500", icon: (<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><circle cx="12" cy="13" r="3" /></svg>) },
    { label: "DATABASE", value: dbOk ? L("Đã kết nối") : L("Mất kết nối"), cls: "bg-emerald-50 text-emerald-500", icon: (<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14a9 3 0 0 0 18 0V5" /><path d="M3 12a9 3 0 0 0 18 0" /></svg>) },
  ];
  const caches = [
    { kind: "pages", title: L("Cache trang"), desc: L("Xoá cache dựng sẵn của các trang công khai (trang chủ, dịch vụ, premium, bài viết, website) để khách thấy dữ liệu mới nhất") },
    { kind: "routes", title: L("Cache route"), desc: L("Xoá toàn bộ cache route/layout của Next.js trên toàn hệ thống — mọi trang dựng lại từ đầu ở lần mở kế tiếp") },
    { kind: "providers", title: L("Cache số dư nhà cung cấp"), desc: Ld(`Đặt lại số dư nhà cung cấp đang lưu đệm (${num(providersCached)} nguồn) — lần kiểm tra kế tiếp sẽ lấy số dư thật từ nguồn`) },
  ];
  const jobs = [
    { kind: "apilog", title: L("Nhật ký API cũ"), desc: L("Bản ghi gọi API nhà cung cấp / webhook cũ hơn 30 ngày"), count: apiLogOld },
    { kind: "notifications", title: L("Thông báo đã đọc cũ"), desc: L("Thông báo khách đã đọc, cũ hơn 30 ngày (thông báo chưa đọc được giữ lại)"), count: notifOld },
    { kind: "events", title: L("Dòng thời gian đơn cũ"), desc: L("Mốc tiến độ đơn hàng cũ hơn 30 ngày (bản thân đơn hàng vẫn giữ nguyên)"), count: eventsOld },
  ];
  const trashIcon = (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5 inline"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>);
  return (
    <div>
      <PageHead title={L("Dọn dẹp hệ thống")} desc={L("Quản lý bộ nhớ đệm, dọn dẹp các tệp tin logs rác và tối ưu hóa hệ thống")} />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />

      <div className="grid gap-4 md:grid-cols-3">
        {statuses.map((c) => (
          <div key={c.label} className="card flex items-center gap-4 p-6">
            <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${c.cls}`}>{c.icon}</span>
            <div className="min-w-0">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">{c.label}</div>
              <div className="mt-0.5 truncate text-xl font-extrabold text-slate-900">{c.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="card mt-6 p-6">
        <div className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
          <span className="text-blue-500">{statuses[0].icon}</span> {L("Quản lý bộ nhớ đệm (Cache)")}
        </div>
        <div className="mt-4 space-y-3">
          {caches.map((c) => (
            <div key={c.kind} className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="min-w-0 flex-1">
                <div className="font-bold text-slate-800">{c.title}</div>
                <p className="mt-0.5 text-sm text-slate-400">{c.desc}</p>
              </div>
              <form action={clearCacheAction}>
                <input type="hidden" name="kind" value={c.kind} />
                <input type="hidden" name="from" value="/admin/don-dep" />
                <button className="btn-ghost !py-2">{trashIcon}{L("Xoá")}</button>
              </form>
            </div>
          ))}
        </div>
        <form action={clearCacheAction} className="mt-5">
          <input type="hidden" name="kind" value="all" />
          <input type="hidden" name="from" value="/admin/don-dep" />
          <button className="w-full rounded-xl bg-red-500 py-3.5 text-base font-bold text-white shadow-sm transition hover:bg-red-600">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="mr-2 inline"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" /></svg>
            {L("Xoá toàn bộ Cache")}
          </button>
        </form>
        <form action={cleanupAllAction} className="mt-3">
          <input type="hidden" name="from" value="/admin/don-dep" />
          <button className="w-full rounded-xl bg-amber-500 py-3.5 text-base font-bold text-white shadow-sm transition hover:bg-amber-600">
            {trashIcon}{L("Dọn dẹp hệ thống")}
          </button>
        </form>
        <p className="mt-3 text-center text-xs text-slate-400">{L("Nút Dọn dẹp hệ thống xoá toàn bộ nhật ký API, thông báo đã đọc và dòng thời gian đơn cũ hơn 30 ngày bên dưới.")}</p>
      </div>

      <div className="card mt-6 divide-y divide-slate-100">
        <div className="p-5 pb-2 font-bold text-slate-900">{L("Dọn dữ liệu cũ chi tiết")}</div>
        {jobs.map((j) => (
          <div key={j.kind} className="flex flex-wrap items-center gap-4 p-5">
            <div className="min-w-0 flex-1">
              <div className="font-bold text-slate-800">{j.title}</div>
              <p className="mt-0.5 text-sm text-slate-400">{j.desc}</p>
            </div>
            <div className="text-right">
              <div className="text-lg font-extrabold text-slate-900">{num(j.count)}</div>
              <div className="text-xs text-slate-400">{L("bản ghi có thể dọn")}</div>
            </div>
            <form action={cleanupSystemAction}>
              <input type="hidden" name="kind" value={j.kind} />
              <input type="hidden" name="from" value="/admin/don-dep" />
              <button className="btn-primary !py-2 px-5" disabled={j.count === 0}>{L("Dọn ngay")}</button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
