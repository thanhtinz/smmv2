import Link from "next/link";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Stat, I, Badge } from "@/components/ui";
import { vnd, num, SMM_STATUS, LEVEL_NAME, dt } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { RichText } from "@/components/rich-text";
import { CopyBtn } from "@/components/client";
import { TodayText } from "@/components/display";
import { ensureRefCode } from "@/lib/wallet";

export const dynamic = "force-dynamic";

/** Trang chủ khu khách — bố cục theo panel mẫu: lời chào + thẻ chia sẻ link giới thiệu,
 *  hàng thẻ tiền, hàng thẻ đơn, dưới là 2 cột (đơn gần đây | bảng giá/API/dòng tiền). */
export default async function DashboardHome() {
  const user = (await getCurrentUser())!;
  const [smmCount, smmRunning, recent, statusGroup, commissionAgg, spendSmmAgg, spendPreAgg, recentTx, serviceCount] = await Promise.all([
    prisma.smmOrder.count({ where: { userId: user.id } }),
    prisma.smmOrder.count({ where: { userId: user.id, status: { in: ["PENDING", "PROCESSING", "IN_PROGRESS"] } } }),
    prisma.smmOrder.findMany({ where: { userId: user.id }, orderBy: { id: "desc" }, take: 6, include: { service: true } }),
    prisma.smmOrder.groupBy({ by: ["status"], where: { userId: user.id }, _count: true }),
    prisma.transaction.aggregate({ where: { userId: user.id, type: { in: ["PANEL_COMMISSION", "REFERRAL_COMMISSION"] } }, _sum: { amount: true } }),
    prisma.smmOrder.aggregate({ where: { userId: user.id, status: { not: "CANCELED" } }, _sum: { charge: true } }),
    prisma.premiumOrder.aggregate({ where: { userId: user.id, status: { not: "CANCELED" } }, _sum: { total: true } }),
    prisma.transaction.findMany({ where: { userId: user.id }, orderBy: { id: "desc" }, take: 5 }),
    prisma.smmService.count({ where: { active: true, OR: [{ panelId: null }, ...(user.panelId ? [{ panelId: user.panelId }] : [])] } }),
  ]);
  const stCount = (st: string) => statusGroup.find((g) => g.status === st)?._count || 0;
  const commission = commissionAgg._sum.amount || 0;
  const totalSpent = (spendSmmAgg._sum.charge || 0) + (spendPreAgg._sum.total || 0);

  // Banner thông báo hệ thống (như panel mẫu): 1 banner duy nhất ngay dưới lời chào —
  // khách panel thấy banner của panel mình, panel chưa đặt thì dùng của web mẹ.
  const s = await getSettings();
  let bannerHtml: string | null = null;
  let panelAffiliate: number | null = null;
  if (user.panelId) {
    const p = await prisma.childPanel.findUnique({ where: { id: user.panelId }, select: { sysAnnounceEnabled: true, sysAnnounceContent: true, affiliatePercent: true } });
    if (p?.sysAnnounceEnabled && p.sysAnnounceContent) bannerHtml = p.sysAnnounceContent;
    panelAffiliate = p?.affiliatePercent ?? null;
  }
  if (!bannerHtml && s.sys_announce_enabled === "1" && s.sys_announce_content) bannerHtml = s.sys_announce_content;

  // Thẻ chia sẻ link giới thiệu (góc phải đầu trang như panel mẫu)
  const affiliateOn = s.module_affiliate !== "0";
  const affPct = panelAffiliate ?? (parseFloat(s.affiliate_percent || "6") || 0);
  const h = headers();
  const host = h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const refLink = affiliateOn ? `${proto}://${host}/register?ref=${await ensureRefCode(user.id)}` : null;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Tổng quan</h1>
          <p className="mt-1 text-sm text-slate-500">Chào mừng trở lại, <b className="text-slate-800">{user.fullName || user.username}</b></p>
          <p className="mt-0.5 text-xs capitalize text-slate-400"><TodayText /> · Cấp bậc: {LEVEL_NAME[user.level]} · Mã nạp tiền: SMM {user.depositCode}</p>
        </div>
        {refLink && (
          <div className="card w-full max-w-sm px-4 py-3.5">
            <div className="text-sm text-slate-600">Chia sẻ link giới thiệu để nhận hoa hồng <b className="text-brand-700">{affPct}%</b> trọn đời!</div>
            <div className="mt-2 flex items-center gap-2">
              <input readOnly value={refLink} className="inp !py-1.5 min-w-0 flex-1 text-xs" />
              <CopyBtn text={refLink} label="Sao chép link giới thiệu" />
            </div>
          </div>
        )}
      </div>

      {bannerHtml && (
        <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4">
          <RichText value={bannerHtml} />
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Số dư" value={vnd(user.balance)} icon={I.wallet} sub={<Link href="/dashboard/nap-tien" className="font-medium text-brand-600">Nạp thêm →</Link>} />
        <Stat label="Tổng nạp vào" value={vnd(user.totalDeposited)} icon={I.db} />
        <Stat label="Tổng chi tiêu" value={vnd(totalSpent)} icon={I.chart} />
        <Stat label="Hoa hồng" value={vnd(commission)} icon={I.money} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Tổng đơn hàng" value={num(smmCount)} icon={I.cart} />
        <Stat label="Đơn hàng đang chạy" value={num(smmRunning)} icon={I.clock} />
        <Stat label="Đơn hàng hoàn thành" value={num(stCount("COMPLETED"))} icon={I.check} />
        <Stat label="Đơn hàng bị hủy" value={num(stCount("CANCELED"))} icon={I.refresh} />
      </div>

      <div className="mt-6 grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <div className="card overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div className="font-bold text-slate-900">Đơn hàng gần đây</div>
            <Link href="/dashboard/don-hang" className="text-sm font-medium text-brand-600">Xem tất cả</Link>
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
          <div className="card p-5">
            <div className="font-bold text-slate-900">Bảng giá dịch vụ</div>
            <p className="mt-1 text-sm text-slate-500">Khám phá {num(serviceCount)} dịch vụ đang bán với giá theo cấp bậc của bạn.</p>
            <Link href="/dashboard/dich-vu" className="btn-primary btn-sm mt-3">Xem tất cả dịch vụ</Link>
          </div>
          <div className="card p-5">
            <div className="font-bold text-slate-900">Kết nối API</div>
            <p className="mt-1 text-sm text-slate-500">Tài liệu API V2 để tích hợp đặt đơn tự động.</p>
            <Link href="/dashboard/api" className="btn-ghost btn-sm mt-3">Xem tài liệu API</Link>
          </div>
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <div className="font-bold text-slate-900">Dòng tiền gần đây</div>
              <Link href="/dashboard/giao-dich" className="text-sm font-medium text-brand-600">Xem thêm</Link>
            </div>
            {recentTx.length === 0 ? (
              <div className="p-5 text-sm text-slate-400">Chưa có giao dịch nào.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {recentTx.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-slate-700">{t.note || t.type}</div>
                      <div className="text-xs text-slate-400">{dt(t.createdAt)}</div>
                    </div>
                    <div className={`font-semibold ${t.amount >= 0 ? "text-emerald-600" : "text-rose-500"}`}>{t.amount >= 0 ? "+" : ""}{vnd(t.amount)}</div>
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
