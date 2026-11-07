import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { ensureRefCode } from "@/lib/wallet";
import { Empty, Stat, I } from "@/components/ui";
import { CopyBtn } from "@/components/client";
import { KiemTienTabs } from "@/components/kiemtien-tabs";
import { vnd, num, dt, dshort } from "@/lib/format";

type SP = Record<string, string | string[] | undefined>;

/* ===== Giới thiệu & hoa hồng — bố cục theo panel mẫu: 4 thẻ số liệu, thẻ link giới thiệu,
 *  2 tab (Người đã giới thiệu | Lịch sử hoa hồng). Hoa hồng cộng thẳng vào số dư, không có rút tiền.
 *  Dùng chung cho web mẹ (link /register?ref=) và panel con (link /cua-hang/[slug]/dang-ky?ref=) */
export async function KiemTienView({ userId, linkBase, sp, tabBase }: { userId: number; linkBase: string; sp?: SP; tabBase?: string }) {
  const settings = await getSettings();
  const pct = parseFloat(settings.affiliate_percent || "6") || 0;
  const code = await ensureRefCode(userId);
  const link = `${linkBase}?ref=${code}`;
  const tab = sp?.tab === "hist" ? "hist" : "ref";
  void tabBase; // tab đã chuyển client-side tại chỗ, không còn Link ?tab=
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [refCount, referrals, spentAgg, depositedAgg, commissionAgg, monthAgg, history] = await Promise.all([
    prisma.user.count({ where: { referredById: userId } }),
    prisma.user.findMany({ where: { referredById: userId }, orderBy: { id: "desc" }, take: 50, select: { username: true, createdAt: true, totalSpent: true, totalDeposited: true } }),
    prisma.user.aggregate({ where: { referredById: userId }, _sum: { totalSpent: true } }),
    prisma.user.aggregate({ where: { referredById: userId }, _sum: { totalDeposited: true } }),
    prisma.transaction.aggregate({ where: { userId, type: "REFERRAL_COMMISSION", amount: { gt: 0 } }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { userId, type: "REFERRAL_COMMISSION", amount: { gt: 0 }, createdAt: { gte: monthStart } }, _sum: { amount: true } }),
    prisma.transaction.findMany({ where: { userId, type: "REFERRAL_COMMISSION" }, orderBy: { id: "desc" }, take: 20 }),
  ]);
  const commission = commissionAgg._sum.amount || 0;
  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Giới thiệu &amp; hoa hồng</h1>
        <p className="mt-0.5 text-sm text-slate-500">Chia sẻ link giới thiệu và nhận hoa hồng từ mỗi giao dịch mua của người được mời</p>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Tổng hoa hồng" value={vnd(commission)} icon={I.money} />
        <Stat label="Hoa hồng tháng này" value={vnd(monthAgg._sum.amount || 0)} icon={I.chart} />
        <Stat label="Người đã giới thiệu" value={num(refCount)} icon={I.users} />
        <Stat label="Tổng mua của người được mời" value={vnd(spentAgg._sum.totalSpent || 0)} icon={I.cart} />
      </div>

      <div className="card mt-5 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-brand-600 px-3 py-1 text-xs font-bold text-white">{pct}% hoa hồng</span>
          <span className="text-sm text-slate-500">cho mỗi giao dịch mua thành công của người được bạn giới thiệu — trọn đời tài khoản đó.</span>
        </div>
        <div className="lbl !mb-2 mt-4">Link giới thiệu của bạn</div>
        <div className="flex flex-wrap gap-2">
          <input className="inp min-w-[260px] flex-1 font-mono !text-[13px]" readOnly value={link} />
          <CopyBtn text={link} label="Sao chép link giới thiệu" />
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-slate-400">Chia sẻ link này cho bạn bè, người thân. Khi họ đăng ký qua link này và mua dịch vụ, hoa hồng sẽ tự động cộng vào số dư của bạn.</p>
      </div>

      <KiemTienTabs
        initial={tab}
        refLabel={`Người đã giới thiệu (${refCount})`}
        histLabel={`Lịch sử hoa hồng (${history.length})`}
        refContent={
          referrals.length === 0 ? <div className="mt-4"><Empty text="Chưa có người được giới thiệu" /></div> : (
            <div className="card mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead className="border-b border-slate-200 bg-slate-50"><tr><th className="th">Người dùng</th><th className="th">Ngày tham gia</th><th className="th">Tổng nạp</th><th className="th">Đã mua</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {referrals.map((r) => (
                    <tr key={r.username} className="hover:bg-slate-50/60">
                      <td className="td font-medium">{r.username}</td>
                      <td className="td text-xs text-slate-500">{dshort(r.createdAt)}</td>
                      <td className="td">{vnd(r.totalDeposited)}</td>
                      <td className="td font-semibold">{vnd(r.totalSpent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        histContent={
          history.length === 0 ? <div className="mt-4"><Empty text="Chưa có lịch sử nhận hoa hồng" /></div> : (
            <div className="card mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead className="border-b border-slate-200 bg-slate-50"><tr><th className="th">Thời gian</th><th className="th">Nội dung</th><th className="th">Hoa hồng</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {history.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/60">
                      <td className="td whitespace-nowrap text-xs text-slate-500">{dt(t.createdAt)}</td>
                      <td className="td text-slate-600">{t.note || "Hoa hồng giới thiệu"}</td>
                      <td className={`td font-bold ${t.amount >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{t.amount >= 0 ? "+" : "−"}{vnd(Math.abs(t.amount))}</td>
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
