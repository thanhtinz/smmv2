import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Stat, I, Badge } from "@/components/ui";
import { vnd, num, SMM_STATUS, dt } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { RichText } from "@/components/rich-text";

export const dynamic = "force-dynamic";

/** Nhãn mục nhỏ phía trên mỗi hàng thẻ như panel mẫu (TÀI CHÍNH / THỐNG KÊ ĐƠN HÀNG) */
const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="text-xs font-bold uppercase tracking-widest text-slate-400">{children}</div>
);

/** Trang tổng quan khách — đúng cấu trúc panel mẫu: chào mừng + 2 nút hành động,
 *  banner thông báo, mục TÀI CHÍNH (4 thẻ), mục THỐNG KÊ ĐƠN HÀNG (4 thẻ),
 *  dưới là 2 cột (đơn gần đây | bảng giá / API / giao dịch ví). */
export default async function DashboardHome() {
  const user = (await getCurrentUser())!;
  const [smmCount, smmRunning, recent, statusGroup, txCount, spendSmmAgg, spendPreAgg, recentTx] = await Promise.all([
    prisma.smmOrder.count({ where: { userId: user.id } }),
    prisma.smmOrder.count({ where: { userId: user.id, status: { in: ["PENDING", "PROCESSING", "IN_PROGRESS"] } } }),
    prisma.smmOrder.findMany({ where: { userId: user.id }, orderBy: { id: "desc" }, take: 6, include: { service: true } }),
    prisma.smmOrder.groupBy({ by: ["status"], where: { userId: user.id }, _count: true }),
    prisma.transaction.count({ where: { userId: user.id } }),
    prisma.smmOrder.aggregate({ where: { userId: user.id, status: { not: "CANCELED" } }, _sum: { charge: true } }),
    prisma.premiumOrder.aggregate({ where: { userId: user.id, status: { not: "CANCELED" } }, _sum: { total: true } }),
    prisma.transaction.findMany({ where: { userId: user.id }, orderBy: { id: "desc" }, take: 5 }),
  ]);
  const stCount = (st: string) => statusGroup.find((g) => g.status === st)?._count || 0;
  const totalSpent = (spendSmmAgg._sum.charge || 0) + (spendPreAgg._sum.total || 0);

  // Banner thông báo hệ thống (như panel mẫu): 1 banner duy nhất ngay dưới lời chào —
  // khách panel thấy banner của panel mình, panel chưa đặt thì dùng của web mẹ.
  const s = await getSettings();
  let bannerHtml: string | null = null;
  let panelTagline: string | null = null;
  if (user.panelId) {
    const p = await prisma.childPanel.findUnique({ where: { id: user.panelId }, select: { sysAnnounceEnabled: true, sysAnnounceContent: true, tagline: true } });
    if (p?.sysAnnounceEnabled && p.sysAnnounceContent) bannerHtml = p.sysAnnounceContent;
    panelTagline = p?.tagline || null;
  }
  if (!bannerHtml && s.sys_announce_enabled === "1" && s.sys_announce_content) bannerHtml = s.sys_announce_content;

  const name = user.fullName || user.username;
  const tagline = panelTagline || s.site_tagline || "Hệ thống cung cấp dịch vụ mạng xã hội chuyên nghiệp, tự động 100%.";
  const smmOn = s.module_smm !== "0";
  const premiumOn = s.module_premium !== "0";
  const txTime = (d: Date) => new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Ho_Chi_Minh" }).format(d);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Chào mừng, {name}!</h1>
          <p className="mt-1 text-sm text-slate-500">{tagline}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          {premiumOn && (
            <Link href="/premium" className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700">
              <span className="grid h-4 w-4 place-items-center [&>svg]:h-4 [&>svg]:w-4">{I.gem}</span>Mua Premium
            </Link>
          )}
          {smmOn && (
            <Link href="/dashboard/dat-hang" className="btn-primary inline-flex items-center gap-1.5 px-4 py-2.5 text-sm"><span aria-hidden="true">+</span><span>Đặt Đơn Mới</span></Link>
          )}
        </div>
      </div>

      {bannerHtml && (
        <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4">
          <RichText value={bannerHtml} />
        </div>
      )}

      <div className="mt-6"><SectionLabel>Tài chính</SectionLabel></div>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Link href="/dashboard/nap-tien" className="block transition hover:-translate-y-0.5">
          <Stat label="Số dư khả dụng" value={vnd(user.balance)} icon={I.wallet} sub={<span className="font-medium text-brand-600">Nhấn để nạp thêm →</span>} />
        </Link>
        <Stat label="Tổng nạp" value={vnd(user.totalDeposited)} icon={I.db} />
        <Stat label="Tổng chi tiêu" value={vnd(totalSpent)} icon={I.chart} />
        <Stat label="Giao dịch thành công" value={`${num(txCount)} phát sinh`} icon={I.check} />
      </div>

      <div className="mt-6"><SectionLabel>Thống kê đơn hàng</SectionLabel></div>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Tổng đơn hàng" value={num(smmCount)} icon={I.cart} />
        <Stat label="Đang xử lý" value={num(smmRunning)} icon={I.clock} />
        <Stat label="Hoàn thành" value={num(stCount("COMPLETED"))} icon={I.check} />
        <Stat label="Hủy / Hoàn tiền" value={num(stCount("CANCELED") + stCount("REFUNDED"))} icon={I.refresh} />
      </div>

      <div className="mt-6 grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <div className="card overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div className="font-bold text-slate-900">Đơn hàng gần đây</div>
            <Link href="/dashboard/don-hang" className="text-sm font-medium text-brand-600">Xem tất cả đơn hàng →</Link>
          </div>
          {recent.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">Chưa có đơn nào. <Link href="/dashboard/dat-hang" className="font-medium text-brand-600">Đặt đơn đầu tiên</Link></div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recent.map((o) => (
                <div key={o.id} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-slate-800">{o.service.name}</div>
                    <div className="mt-0.5 text-xs text-slate-400">Số lượng: {num(o.quantity)} · {dt(o.createdAt)}</div>
                  </div>
                  <Badge cls={SMM_STATUS[o.status].cls}>{SMM_STATUS[o.status].label}</Badge>
                  <div className="w-24 text-right font-semibold text-slate-900">{vnd(o.charge)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Link href="/dashboard/dich-vu" className="card block p-5 transition hover:-translate-y-0.5">
            <div className="font-bold text-slate-900">Bảng giá</div>
            <div className="mt-1 text-sm font-medium text-brand-600">Xem tất cả dịch vụ →</div>
          </Link>
          <Link href="/dashboard/api-docs" className="card block p-5 transition hover:-translate-y-0.5">
            <div className="font-bold text-slate-900">Kết nối API</div>
            <div className="mt-1 text-sm font-medium text-brand-600">Tài liệu API V2 →</div>
          </Link>
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <div className="font-bold text-slate-900">Giao dịch ví</div>
              <Link href="/dashboard/giao-dich" className="text-sm font-medium text-brand-600">Xem thêm →</Link>
            </div>
            {recentTx.length === 0 ? (
              <div className="p-5 text-sm text-slate-400">Chưa có giao dịch nào.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {recentTx.map((t) => (
                  <div key={t.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className={`font-bold ${t.amount >= 0 ? "text-emerald-600" : "text-rose-500"}`}>{t.amount >= 0 ? "+" : ""}{vnd(t.amount)}</span>
                      <span className="text-xs text-slate-400">{txTime(t.createdAt)}</span>
                    </div>
                    {t.note && <div className="mt-0.5 truncate text-xs text-slate-500">{t.note}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
