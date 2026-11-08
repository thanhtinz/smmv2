import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Stat, I, Badge } from "@/components/ui";
import { num, SMM_STATUS, dt } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { RichText } from "@/components/rich-text";
import { moduleOn } from "@/lib/modules";
import { FlashBanner } from "@/components/flash-banner";
import { getServerI18n } from "@/lib/lang-server";

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
  const panelLangRaw = user.panelId
    ? ((await prisma.childPanel.findUnique({ where: { id: user.panelId }, select: { langConfig: true } }))?.langConfig ?? null)
    : undefined;
  const { L, Ld, M } = await getServerI18n(panelLangRaw);
  const [smmCount, smmRunning, recent, statusGroup, txCount, spendSmmAgg, spendPreAgg, recentTx] = await Promise.all([
    prisma.smmOrder.count({ where: { userId: user.id } }),
    prisma.smmOrder.count({ where: { userId: user.id, status: { in: ["PENDING", "PROCESSING", "IN_PROGRESS"] } } }),
    prisma.smmOrder.findMany({ where: { userId: user.id }, orderBy: { id: "desc" }, take: 5, include: { service: true } }),
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

  // Timeline thông báo: bài viết thuộc chuyên mục "Thông báo" (admin đăng ở mục Bài viết),
  // khách panel thấy bài của panel mình, panel chưa có thì dùng của web mẹ — như trang Bài viết.
  let notices: { id: number; title: string; slug: string; excerpt: string | null; content: string; createdAt: Date }[] = [];
  if (await moduleOn("blog", user.panelId)) {
    let scopePid: number | null = user.panelId ?? null;
    if (scopePid !== null) {
      const cnt = await prisma.post.count({ where: { published: true, panelId: scopePid } });
      if (cnt === 0) scopePid = null;
    }
    const cat = await prisma.postCategory.findUnique({ where: { slug: "thong-bao" }, select: { id: true } });
    if (cat) {
      notices = await prisma.post.findMany({
        where: { published: true, panelId: scopePid, categoryId: cat.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 6,
        select: { id: true, title: true, slug: true, excerpt: true, content: true, createdAt: true },
      });
    }
  }
  const noticeExcerpt = (p: (typeof notices)[number]) =>
    (p.excerpt || p.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).slice(0, 150);
  const noticeDate = (d: Date) => new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(d);

  const name = user.fullName || user.username;
  const tagline = L(panelTagline || s.site_tagline || "Hệ thống cung cấp dịch vụ mạng xã hội chuyên nghiệp, tự động 100%.");
  const smmOn = s.module_smm !== "0";
  const premiumOn = s.module_premium !== "0";
  const txTime = (d: Date) => new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Ho_Chi_Minh" }).format(d);

  return (
    <div>
      <FlashBanner panelId={user.panelId ?? null} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{L("Chào mừng, ")}{name}!</h1>
          <p className="mt-1 text-sm text-slate-500">{tagline}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          {premiumOn && (
            <Link href="/dashboard/premium" className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700">
              <span className="grid h-4 w-4 place-items-center [&>svg]:h-4 [&>svg]:w-4">{I.gem}</span>{L("Mua Premium")}
            </Link>
          )}
          {smmOn && (
            <Link href="/dashboard/dat-hang" className="btn-primary inline-flex items-center gap-1.5 px-4 py-2.5 text-sm"><span aria-hidden="true">+</span><span>{L("Đặt Đơn Mới")}</span></Link>
          )}
        </div>
      </div>

      {bannerHtml && (
        <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4">
          <RichText value={bannerHtml} />
        </div>
      )}

      <div className="mt-6"><SectionLabel>{L("Tài chính")}</SectionLabel></div>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Link href="/dashboard/nap-tien" className="block transition hover:-translate-y-0.5">
          <Stat label={L("Số dư khả dụng")} value={M(user.balance)} icon={I.wallet} sub={<span className="font-medium text-brand-600">{L("Nhấn để nạp thêm →")}</span>} />
        </Link>
        <Stat label={L("Tổng nạp")} value={M(user.totalDeposited)} icon={I.db} />
        <Stat label={L("Tổng chi tiêu")} value={M(totalSpent)} icon={I.chart} />
        <Stat label={L("Giao dịch thành công")} value={`${num(txCount)} ${L("phát sinh")}`} icon={I.check} />
      </div>

      <div className="mt-6"><SectionLabel>{L("Thống kê đơn hàng")}</SectionLabel></div>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={L("Tổng đơn hàng")} value={num(smmCount)} icon={I.cart} />
        <Stat label={L("Đang xử lý")} value={num(smmRunning)} icon={I.clock} />
        <Stat label={L("Hoàn thành")} value={num(stCount("COMPLETED"))} icon={I.check} />
        <Stat label={L("Hủy / Hoàn tiền")} value={num(stCount("CANCELED") + stCount("REFUNDED"))} icon={I.refresh} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div className="font-bold text-slate-900">{L("Đơn hàng gần đây")}</div>
            <Link href="/dashboard/don-hang" className="text-sm font-medium text-brand-600">{L("Xem tất cả đơn hàng →")}</Link>
          </div>
          {recent.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">{L("Chưa có đơn nào.")} <Link href="/dashboard/dat-hang" className="font-medium text-brand-600">{L("Đặt đơn đầu tiên")}</Link></div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recent.map((o) => (
                <div key={o.id} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-slate-800">{o.service.name}</div>
                    <div className="mt-0.5 text-xs text-slate-400">{L("Số lượng:")} {num(o.quantity)} · {dt(o.createdAt)}</div>
                  </div>
                  <Badge cls={SMM_STATUS[o.status].cls}>{L(SMM_STATUS[o.status].label)}</Badge>
                  <div className="w-24 text-right font-semibold text-slate-900">{M(o.charge)}</div>
                </div>
              ))}
            </div>
          )}
          </div>
        <div className="card flex-1 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
            <div className="font-bold text-slate-900">{L("Thông báo")}</div>
            <Link href="/dashboard/bai-viet" className="text-sm font-medium text-brand-600">{L("Xem tất cả →")}</Link>
          </div>
          {notices.length === 0 ? (
            <div className="p-6 text-sm text-slate-400">{L("Chưa có thông báo nào.")}</div>
          ) : (
            <div className="relative px-5 py-4">
              <span className="absolute bottom-5 left-[29px] top-5 w-0.5 bg-slate-100" aria-hidden="true" />
              <div className="space-y-5">
                {notices.map((p) => (
                  <div key={p.id} className="relative pl-10">
                    <span className="absolute left-[3px] top-1 h-3 w-3 rounded-full border-2 border-white bg-brand-500 shadow" aria-hidden="true" />
                    <div className="text-xs font-semibold text-slate-400">{noticeDate(p.createdAt)}</div>
                    <Link href={`/dashboard/bai-viet/${p.slug}`} className="mt-0.5 block font-semibold text-slate-800 transition hover:text-brand-700">{p.title}</Link>
                    <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-slate-500">{noticeExcerpt(p)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        </div>

        <div className="flex flex-col gap-4">
          <Link href="/dashboard/dich-vu" className="card block p-5 transition hover:-translate-y-0.5">
            <div className="font-bold text-slate-900">{L("Bảng giá")}</div>
            <div className="mt-1 text-sm font-medium text-brand-600">{L("Xem tất cả dịch vụ →")}</div>
          </Link>
          <Link href="/dashboard/api-docs" className="card block p-5 transition hover:-translate-y-0.5">
            <div className="font-bold text-slate-900">{L("Kết nối API")}</div>
            <div className="mt-1 text-sm font-medium text-brand-600">{L("Tài liệu API V2 →")}</div>
          </Link>
          <div className="card flex-1 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <div className="font-bold text-slate-900">{L("Giao dịch ví")}</div>
              <Link href="/dashboard/giao-dich" className="text-sm font-medium text-brand-600">{L("Xem thêm →")}</Link>
            </div>
            {recentTx.length === 0 ? (
              <div className="p-5 text-sm text-slate-400">{L("Chưa có giao dịch nào.")}</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {recentTx.map((t) => (
                  <div key={t.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className={`font-bold ${t.amount >= 0 ? "text-emerald-600" : "text-rose-500"}`}>{t.amount >= 0 ? "+" : ""}{M(t.amount)}</span>
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
