import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { ensureRefCode } from "@/lib/wallet";
import { Empty } from "@/components/ui";
import { CopyBtn } from "@/components/client";
import { vnd, num, dt, dshort } from "@/lib/format";

/* ===== Kiếm tiền / Tiếp thị liên kết — kiểu thatim: hoa hồng trên giao dịch mua =====
 *  Dùng chung cho web mẹ (link /register?ref=) và panel con (link /cua-hang/[slug]/dang-ky?ref=) */
export async function KiemTienView({ userId, linkBase }: { userId: number; linkBase: string }) {
  const settings = await getSettings();
  const pct = parseFloat(settings.affiliate_percent || "6") || 0;
  const code = await ensureRefCode(userId);
  const link = `${linkBase}?ref=${code}`;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [referrals, spentAgg, commissionAgg, monthAgg, history] = await Promise.all([
    prisma.user.findMany({ where: { referredById: userId }, orderBy: { id: "desc" }, take: 50, select: { username: true, createdAt: true, totalSpent: true } }),
    prisma.user.aggregate({ where: { referredById: userId }, _sum: { totalSpent: true } }),
    prisma.transaction.aggregate({ where: { userId, type: "REFERRAL_COMMISSION", amount: { gt: 0 } }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { userId, type: "REFERRAL_COMMISSION", amount: { gt: 0 }, createdAt: { gte: monthStart } }, _sum: { amount: true } }),
    prisma.transaction.findMany({ where: { userId, type: "REFERRAL_COMMISSION" }, orderBy: { id: "desc" }, take: 20 }),
  ]);
  const stats = [
    { label: "Người đã giới thiệu", value: num(referrals.length) },
    { label: "Họ đã mua tổng cộng", value: vnd(spentAgg._sum.totalSpent || 0) },
    { label: "Tổng hoa hồng đã nhận", value: vnd(commissionAgg._sum.amount || 0) },
    { label: "Hoa hồng tháng này", value: vnd(monthAgg._sum.amount || 0) },
  ];
  return (
    <div>
      <div className="mb-5">
        <h1 className="text-[22px] font-black tracking-tight text-slate-900 uppercase">Kiếm tiền affiliate</h1>
        <p className="text-sm text-slate-500 mt-0.5">Giới thiệu bạn bè — nhận {pct}% hoa hồng trên mỗi giao dịch mua của họ</p>
      </div>
      <div className="grid lg:grid-cols-3 gap-4 mb-6 items-stretch">
        <div className="rounded-3xl bg-slate-900 text-white p-6 lg:col-span-1">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Tổng hoa hồng</div>
          <div className="text-3xl font-black mt-2">{vnd(commissionAgg._sum.amount || 0)}</div>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className="rounded-full bg-brand-600 px-3 py-1 text-xs font-bold">{pct}% Hoa hồng</span>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">Trạng thái: Hoạt động</span>
          </div>
          <p className="text-[13px] text-slate-400 mt-4 leading-relaxed">Hoa hồng cộng thẳng vào số dư tài khoản ngay khi người được giới thiệu mua hàng thành công — vĩnh viễn cho tài khoản đó.</p>
        </div>
        <div className="card p-6 lg:col-span-2">
          <div className="lbl !mb-2">Link giới thiệu của bạn</div>
          <div className="flex flex-wrap gap-2">
            <input className="inp flex-1 min-w-[260px] font-mono !text-[13px]" readOnly value={link} />
            <CopyBtn text={link} label="Sao chép" />
          </div>
          <div className="grid sm:grid-cols-3 gap-4 mt-5">
            {stats.slice(0, 3).map((s) => (
              <div key={s.label}><div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{s.label}</div><div className="text-xl font-extrabold text-slate-900 mt-1">{s.value}</div></div>
            ))}
          </div>
          <div className="grid sm:grid-cols-3 gap-3 mt-5 text-[13px]">
            <div className="rounded-2xl bg-slate-50 p-3.5"><b className="text-slate-800">01 · Chia sẻ link</b><div className="text-slate-500 mt-1">Gửi link giới thiệu cho bạn bè đăng ký tài khoản.</div></div>
            <div className="rounded-2xl bg-slate-50 p-3.5"><b className="text-slate-800">02 · Nạp tiền và sử dụng</b><div className="text-slate-500 mt-1">Người được giới thiệu nạp tiền và sử dụng dịch vụ, hoa hồng tính trên giao dịch mua.</div></div>
            <div className="rounded-2xl bg-slate-50 p-3.5"><b className="text-slate-800">03 · Nhận hoa hồng</b><div className="text-slate-500 mt-1">Hoa hồng cộng vào số dư của bạn, dùng mua dịch vụ như tiền thường.</div></div>
          </div>
        </div>
      </div>
      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <div className="card overflow-x-auto">
          <div className="px-5 py-4 font-bold text-slate-900 border-b border-slate-100">Người dùng đã mời</div>
          {referrals.length === 0 ? <div className="p-5"><Empty text="Chưa có người được giới thiệu" /></div> : (
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200"><tr><th className="th">Tài khoản</th><th className="th">Ngày tham gia</th><th className="th">Đã mua</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {referrals.map((r) => (
                  <tr key={r.username} className="hover:bg-slate-50/60">
                    <td className="td font-medium">{r.username}</td>
                    <td className="td text-slate-500 text-xs">{dshort(r.createdAt)}</td>
                    <td className="td font-semibold">{vnd(r.totalSpent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card overflow-x-auto">
          <div className="px-5 py-4 font-bold text-slate-900 border-b border-slate-100">Lịch sử nhận hoa hồng</div>
          {history.length === 0 ? <div className="p-5"><Empty text="Chưa có lịch sử nhận hoa hồng" /></div> : (
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200"><tr><th className="th">Thời gian</th><th className="th">Nội dung</th><th className="th">Số tiền</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/60">
                    <td className="td text-slate-500 text-xs whitespace-nowrap">{dt(t.createdAt)}</td>
                    <td className="td text-slate-600">{t.note || "Hoa hồng giới thiệu"}</td>
                    <td className={`td font-bold ${t.amount >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{t.amount >= 0 ? "+" : "−"}{vnd(Math.abs(t.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
