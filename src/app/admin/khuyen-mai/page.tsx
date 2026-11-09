import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PageHead, Flash, Stat, I } from "@/components/ui";
import { BonusTiersEditor } from "@/components/settings-editors";
import { adminSaveMethodsAction, adminSaveSettings } from "@/app/actions/admin";
import { FlashSaleAdmin } from "@/components/flash-admin";
import { num } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

/** Khuyến mãi của web mẹ: thưởng nạp theo mốc, hoa hồng giới thiệu, mã giảm giá. */
export default async function AdminPromotions({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  await requireAdminPage();
  const { L, Ld, M } = await getServerI18n(null);
  const s = await getSettings();
  const [activeCodes, usedAgg] = await Promise.all([
    prisma.discountCode.count({ where: { panelId: null, active: true } }),
    prisma.discountCode.aggregate({ where: { panelId: null }, _sum: { usedCount: true } }),
  ]);
  const bonusTiers: { from: number; percent: number }[] = (() => {
    try {
      const a = JSON.parse(s.deposit_bonus_tiers || "[]");
      return Array.isArray(a) ? a.map((t: any) => ({ from: parseInt(String(t.from)) || 0, percent: parseFloat(String(t.percent)) || 0 })).filter((t) => t.from > 0) : [];
    } catch { return []; }
  })();
  const topTier = bonusTiers.length ? bonusTiers.reduce((a, b) => (b.percent > a.percent ? b : a)) : null;
  return (
    <div>
      <PageHead title={L("Khuyến mãi")} desc={L("Thưởng nạp tiền, hoa hồng giới thiệu và mã giảm giá của hệ thống.")} />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <form action={adminSaveMethodsAction} className="card space-y-4 p-6">
        <input type="hidden" name="back" value="/admin/khuyen-mai" />
        <div className="font-bold text-slate-900">{L("Thưởng nạp theo mốc")}</div>
        <p className="text-sm text-slate-500">{L("Khách nạp đạt mốc được cộng thêm % thưởng vào số tiền nạp.")}</p>
        <BonusTiersEditor initial={s.deposit_bonus_tiers} />
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
          <div>
            <label className="lbl">{L("Số tiền nạp tối thiểu (đ)")}</label>
            <input className="inp" name="deposit_min" type="number" min={0} defaultValue={s.deposit_min} />
            <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{L("Thưởng cộng tự động ngay khi giao dịch nạp thành công — qua cổng tự động (SePay, Stripe, PayPal) hoặc khi admin duyệt nạp tay ở trang Quản lý nạp tiền.")}</p>
          </div>
          <p className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-slate-500 md:mt-[26px]">
            {bonusTiers.length === 0
              ? L("Chưa có mốc thưởng nào — thêm mốc để khách nạp nhiều được thưởng thêm.")
              : <>{L("Đang áp dụng")} <b className="text-slate-700">{bonusTiers.length}{L(" mốc thưởng")}</b>{topTier ? <> {L("— mốc cao nhất")} <b className="text-slate-700">+{topTier.percent}%</b> {L("cho lần nạp từ")} <b className="text-slate-700">{M(topTier.from)}</b></> : null}. {L("Mốc áp theo từng lần nạp, không cộng dồn nhiều lần nạp nhỏ.")}</>}
          </p>
        </div>
        <button className="btn-primary !py-2.5">{L("Lưu thưởng nạp")}</button>
      </form>

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-2">
        <form action={adminSaveMethodsAction} className="card space-y-4 p-6">
          <input type="hidden" name="back" value="/admin/khuyen-mai" />
          <div className="font-bold text-slate-900">{L("Hoa hồng giới thiệu")}</div>
          <p className="text-sm text-slate-500">{L("Người giới thiệu nhận % trên tiền mua của người được giới thiệu.")}</p>
          <div><label className="lbl">{L("% hoa hồng")}</label><input className="inp" name="affiliate_percent" type="number" min={0} max={50} step="0.5" defaultValue={s.affiliate_percent} /></div>
          <p className="text-xs leading-relaxed text-slate-400">{L("Hoa hồng cộng thẳng vào số dư của người giới thiệu ngay khi đơn của người được giới thiệu hoàn thành, và hiện ở mục Kiếm tiền của họ. Khách lấy link giới thiệu và xem thống kê hoa hồng tại mục Kiếm tiền trong trang khách.")}</p>
          <button className="btn-primary !py-2.5">{L("Lưu hoa hồng")}</button>
        </form>

        <div className="card space-y-4 p-6">
          <div className="font-bold text-slate-900">{L("Mã giảm giá")}</div>
          <div className="grid grid-cols-2 gap-4">
            <Stat label={L("Mã đang bật")} value={num(activeCodes)} icon={I.gift} />
            <Stat label={L("Lượt đã dùng")} value={num(usedAgg._sum.usedCount || 0)} icon={I.ticket} tone="emerald" />
          </div>
          <p className="text-xs leading-relaxed text-slate-400">{L("Mã áp được cho cả đơn SMM và đơn Premium; mỗi lần khách đặt đơn thành công với mã, lượt dùng tự trừ vào giới hạn của mã.")}</p>
          <a href="/admin/ma-giam-gia" className="btn-ghost !py-2">{L("Mở trang Mã giảm giá")}</a>
          <p className="text-xs leading-relaxed text-slate-400">{L("Tạo mã mới, đặt % giảm, giới hạn lượt dùng và thời hạn áp dụng ở trang Mã giảm giá.")}</p>
        </div>
      </div>
      <FlashSaleAdmin />
      <form action={adminSaveSettings} className="card mt-6 space-y-4 p-6">
        <div className="font-bold text-slate-900">{L("Tích điểm khách hàng thân thiết")}</div>
        <p className="text-sm text-slate-500">{L("Khách được cộng điểm tự động khi đơn SMM/Premium hoàn thành, đổi điểm ra số dư ví ngay trong trang Hồ sơ.")}</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div><label className="lbl">{L("Điểm nhận mỗi 100.000đ chi tiêu")}</label><input className="inp" name="points_per_100k" type="number" min={0} defaultValue={s.points_per_100k} /></div>
          <div><label className="lbl">{L("Giá trị 1 điểm khi đổi (VNĐ)")}</label><input className="inp" name="points_value_vnd" type="number" min={1} defaultValue={s.points_value_vnd} /></div>
          <div><label className="lbl">{L("Tối thiểu điểm mỗi lần đổi")}</label><input className="inp" name="points_min_redeem" type="number" min={1} defaultValue={s.points_min_redeem} /></div>
        </div>
        <button className="btn-primary !py-2.5">{L("Lưu cấu hình điểm")}</button>
      </form>
    </div>
  );
}
