import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { ensureRefCode } from "@/lib/wallet";
import { affiliateWithdrawMin } from "@/lib/affiliate";
import { withdrawAffiliateAction } from "@/app/actions/affiliate";
import { Empty, Flash, I } from "@/components/ui";
import { CopyBtn } from "@/components/client";
import { ShareRow } from "@/components/share-row";
import { KiemTienTabs } from "@/components/kiemtien-tabs";
import { num, dt, dshort } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

type SP = Record<string, string | string[] | undefined>;

/* ===== Giới thiệu bạn bè (Affiliate) — bố cục theo mẫu shopkey Tín gửi
 *  2026-11-12: thẻ số dư hoa hồng gradient (Rút tiền / Lịch sử, chip % đơn
 *  hàng, 3 dòng thống kê) → thẻ link giới thiệu + chia sẻ nhanh → thẻ tiến
 *  độ rút tiền → thẻ chi tiết hoa hồng → 2 tab (Thành viên | Lịch sử).
 *  Hoa hồng cộng vào SỐ DƯ HOA HỒNG RIÊNG (sổ AffiliateTxn), rút về ví
 *  chính khi đạt mức tối thiểu admin cấu hình. linkBase = gốc site,
 *  link đầy đủ dạng <gốc>?aff=MÃ (cookie first-touch 30 ngày + đếm click). */
export async function KiemTienView({ userId, linkBase, sp, tabBase }: { userId: number; linkBase: string; sp?: SP; tabBase?: string }) {
  const { L, Ld, M } = await getServerI18n();
  const settings = await getSettings();
  const pct = parseFloat(settings.affiliate_percent || "6") || 0;
  const withdrawMin = affiliateWithdrawMin(settings);
  const code = await ensureRefCode(userId);
  const link = `${linkBase}?aff=${code}`;
  const tab = sp?.tab === "hist" ? "hist" : "ref";
  void tabBase;
  const shareText = `${L("Đăng ký")} ${settings.site_name || "SMMv2"} ${L("qua link giới thiệu của tôi")}`;

  // Lọc thời gian cho danh sách thành viên: all | 7 | 30 | month
  const range = ["7", "30", "month"].includes(String(sp?.range || "")) ? String(sp?.range) : "all";
  let memberSince: Date | undefined;
  if (range === "7") memberSince = new Date(Date.now() - 7 * 86400000);
  if (range === "30") memberSince = new Date(Date.now() - 30 * 86400000);
  if (range === "month") { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); memberSince = d; }

  const [me, refCount, clicks, earnedAgg, withdrawnAgg, referrals, history] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { affiliateBalance: true } }),
    prisma.user.count({ where: { referredById: userId } }),
    prisma.affiliateClick.count({ where: { referrerId: userId } }),
    prisma.affiliateTxn.aggregate({ where: { userId, kind: "EARN" }, _sum: { amount: true } }),
    prisma.affiliateTxn.aggregate({ where: { userId, kind: "WITHDRAW" }, _sum: { amount: true } }),
    prisma.user.findMany({
      where: { referredById: userId, ...(memberSince ? { createdAt: { gte: memberSince } } : {}) },
      orderBy: { id: "desc" }, take: 50,
      select: { id: true, username: true, createdAt: true, totalSpent: true },
    }),
    prisma.affiliateTxn.findMany({ where: { userId }, orderBy: { id: "desc" }, take: 30 }),
  ]);
  const balance = me?.affiliateBalance || 0;
  const earned = earnedAgg._sum.amount || 0;
  const withdrawn = Math.abs(withdrawnAgg._sum.amount || 0);
  const canWithdraw = balance >= withdrawMin && balance > 0;
  const progress = withdrawMin > 0 ? Math.min(100, Math.floor((balance / withdrawMin) * 100)) : 100;
  const needMore = Math.max(0, withdrawMin - balance);

  // Hoa hồng theo từng thành viên (ròng EARN − CLAWBACK gắn fromUserId)
  const memberIds = referrals.map((r) => r.id);
  const perMember = memberIds.length
    ? await prisma.affiliateTxn.groupBy({ by: ["fromUserId"], where: { userId, fromUserId: { in: memberIds }, kind: { in: ["EARN", "CLAWBACK"] } }, _sum: { amount: true } })
    : [];
  const memberCommission = new Map(perMember.map((g) => [g.fromUserId, g._sum.amount || 0]));

  const withdrawBtn = (primary: boolean) => canWithdraw ? (
    <form action={withdrawAffiliateAction}>
      <button type="submit" className={primary ? "btn-primary w-full sm:w-auto" : "inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-slate-900 shadow transition hover:bg-slate-100 [&>svg]:h-4 [&>svg]:w-4"}>
        {I.wallet}{L("Rút tiền")}
      </button>
    </form>
  ) : (
    <button type="button" disabled title={L("Chưa đạt mức rút tối thiểu")} className={`${primary ? "btn-primary w-full sm:w-auto" : "inline-flex items-center gap-2 rounded-xl bg-white/60 px-5 py-2.5 text-sm font-bold text-slate-500 [&>svg]:h-4 [&>svg]:w-4"} cursor-not-allowed opacity-70`}>
      {I.wallet}{L("Rút tiền")}
    </button>
  );
  const historyBtn = (light: boolean) => (
    <Link href="?tab=hist" className={light
      ? "inline-flex items-center gap-2 rounded-xl border border-white/50 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-white/10 [&>svg]:h-4 [&>svg]:w-4"
      : "btn-ghost w-full sm:w-auto"}>
      {I.clock}{L("Lịch sử")}
    </Link>
  );
  const rangeHref = (r: string) => (r === "all" ? "?" : `?range=${r}`);
  const rangeCls = (r: string) => `rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${range === r ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"}`;

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{L("Giới thiệu bạn bè")}</h1>
        <p className="mt-0.5 text-sm text-slate-500">{L("Giới thiệu bạn bè và nhận hoa hồng hấp dẫn")}</p>
      </div>
      <Flash msg={typeof sp?.msg === "string" ? Ld(sp.msg) : undefined} err={typeof sp?.err === "string" ? Ld(sp.err) : undefined} />

      {/* Thẻ số dư hoa hồng */}
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-teal-500 p-6 text-white shadow-lg sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-white/85 [&>svg]:h-5 [&>svg]:w-5">{I.wallet}{L("Số dư hoa hồng khả dụng")}</span>
          <span className="flex flex-wrap gap-2">{withdrawBtn(false)}{historyBtn(true)}</span>
        </div>
        <div className="mt-3 text-4xl font-black tracking-tight">{M(balance)}</div>
        <div className="mt-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-bold [&>svg]:h-3.5 [&>svg]:w-3.5">{I.cart}{L("Đơn hàng:")} {pct}%</span>
        </div>
        <div className="mt-5 space-y-2.5 border-t border-white/20 pt-5">
          {[
            [L("THÀNH VIÊN"), num(refCount)],
            [L("LƯỢT CLICK"), num(clicks)],
            [L("TỔNG KIẾM ĐƯỢC"), M(earned)],
          ].map(([l, v]) => (
            <div key={l} className="flex items-center justify-between rounded-xl bg-white/10 px-4 py-3">
              <span className="text-xs font-bold tracking-wide text-white/75">{l}</span>
              <span className="text-base font-extrabold">{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Thẻ link giới thiệu */}
      <div className="card mt-5 p-6">
        <div className="flex items-center gap-2 text-base font-extrabold text-slate-900 [&>svg]:h-5 [&>svg]:w-5 [&>svg]:text-brand-600">{I.link}{L("Liên kết giới thiệu của bạn")}</div>
        <div className="mt-4 flex flex-wrap gap-2">
          <input className="inp min-w-[260px] flex-1 font-mono !text-[13px]" readOnly value={link} />
          <CopyBtn text={link} label={L("Sao chép link giới thiệu")} />
        </div>
        <div className="mt-4"><ShareRow url={link} text={shareText} /></div>
        <div className="mt-5 rounded-xl border-l-4 border-amber-400 bg-amber-50 px-4 py-3">
          <div className="text-sm font-bold text-amber-800">{L("Lưu ý")}</div>
          <p className="mt-0.5 text-sm text-amber-700">{L("Chia sẻ liên kết này lên mạng xã hội hoặc bạn bè của bạn. Khi họ đăng ký qua link này và mua dịch vụ, hoa hồng sẽ tự động cộng vào số dư hoa hồng của bạn.")}</p>
        </div>
      </div>

      {/* Tiến độ rút tiền */}
      <div className="mt-5 overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 to-purple-500 p-6 text-white shadow-lg sm:p-7">
        <div className="flex items-center justify-between">
          <span className="text-base font-extrabold">{L("Tiến độ rút tiền")}</span>
          <span className="text-lg font-black">{progress}%</span>
        </div>
        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/25">
          <div className="h-full rounded-full bg-white transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-2.5 flex items-center justify-between text-sm font-semibold text-white/85">
          <span>{M(balance)}</span><span>{M(withdrawMin)}</span>
        </div>
        <p className="mt-3 text-sm text-white/90">
          {canWithdraw
            ? L("Đã đủ điều kiện rút tiền — bấm Rút tiền để chuyển về ví chính.")
            : <>{L("Cần thêm")} <b>{M(needMore)}</b> {L("để rút tiền")}</>}
        </p>
      </div>

      {/* Chi tiết hoa hồng */}
      <div className="card mt-5 p-6">
        <div className="flex items-center gap-2 text-base font-extrabold text-slate-900 [&>svg]:h-5 [&>svg]:w-5 [&>svg]:text-emerald-600">{I.chart}{L("Chi tiết hoa hồng")}</div>
        <div className="mt-4 divide-y divide-slate-100 text-sm">
          <div className="flex items-center justify-between py-3"><span className="text-slate-500">{L("Từ đơn hàng")}</span><span className="font-extrabold text-emerald-600">{M(earned)}</span></div>
          <div className="flex items-center justify-between py-3"><span className="text-slate-500">{L("Đã rút")}</span><span className="font-extrabold text-amber-600">{M(withdrawn)}</span></div>
          <div className="flex items-center justify-between py-3"><span className="font-bold text-slate-900">{L("Số dư hiện tại")}</span><span className="font-extrabold text-slate-900">{M(balance)}</span></div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2.5">{historyBtn(false)}{withdrawBtn(true)}</div>
      </div>

      <KiemTienTabs
        initial={tab}
        refLabel={`${L("Thành viên đã giới thiệu")} (${refCount})`}
        histLabel={`${L("Lịch sử hoa hồng")} (${history.length})`}
        refContent={
          <div className="mt-4">
            <div className="mb-3 flex flex-wrap gap-2">
              <Link href={rangeHref("all")} className={rangeCls("all")}>{L("Tất cả")}</Link>
              <Link href={rangeHref("7")} className={rangeCls("7")}>{L("7 ngày qua")}</Link>
              <Link href={rangeHref("30")} className={rangeCls("30")}>{L("30 ngày qua")}</Link>
              <Link href={rangeHref("month")} className={rangeCls("month")}>{L("Tháng này")}</Link>
            </div>
            {referrals.length === 0 ? (
              <div className="card px-6 py-12 text-center">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 [&>svg]:h-7 [&>svg]:w-7">{I.users}</div>
                <div className="font-bold text-slate-900">{L("Chưa có thành viên nào")}</div>
                <p className="mt-1 text-sm text-slate-500">{L("Chia sẻ link giới thiệu để mời bạn bè")}</p>
              </div>
            ) : (
              <div className="card overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead className="border-b border-slate-200 bg-slate-50"><tr><th className="th">{L("Người dùng")}</th><th className="th">{L("Ngày đăng ký")}</th><th className="th">{L("Đã mua")}</th><th className="th">{L("Hoa hồng")}</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {referrals.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/60">
                        <td className="td font-medium">{r.username}</td>
                        <td className="td text-xs text-slate-500">{dshort(r.createdAt)}</td>
                        <td className="td">{M(r.totalSpent)}</td>
                        <td className="td font-semibold text-emerald-600">{M(memberCommission.get(r.id) || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        }
        histContent={
          history.length === 0 ? <div className="mt-4"><Empty text={L("Chưa có lịch sử nhận hoa hồng")} /></div> : (
            <div className="card mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead className="border-b border-slate-200 bg-slate-50"><tr><th className="th">{L("Thời gian")}</th><th className="th">{L("Nội dung")}</th><th className="th">{L("Số tiền")}</th><th className="th">{L("Số dư sau")}</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {history.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/60">
                      <td className="td whitespace-nowrap text-xs text-slate-500">{dt(t.createdAt)}</td>
                      <td className="td text-slate-600">{t.note || (t.kind === "WITHDRAW" ? L("Rút hoa hồng về ví chính") : t.kind === "CLAWBACK" ? L("Thu hồi hoa hồng") : L("Hoa hồng giới thiệu"))}</td>
                      <td className={`td font-bold ${t.amount >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{t.amount >= 0 ? "+" : "−"}{M(Math.abs(t.amount))}</td>
                      <td className="td text-slate-600">{M(t.balanceAfter)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      />
    </div>
  );
}
