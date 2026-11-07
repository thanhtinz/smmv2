import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PageHead, Flash, Stat, I } from "@/components/ui";
import { BonusTiersEditor } from "@/components/settings-editors";
import { adminSaveMethodsAction, adminSaveSettings } from "@/app/actions/admin";
import { FlashSaleAdmin } from "@/components/flash-admin";
import { num } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Khuyến mãi của web mẹ: thưởng nạp theo mốc, hoa hồng giới thiệu, mã giảm giá. */
export default async function AdminPromotions({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  await requireAdminPage();
  const s = await getSettings();
  const [activeCodes, usedAgg] = await Promise.all([
    prisma.discountCode.count({ where: { panelId: null, active: true } }),
    prisma.discountCode.aggregate({ where: { panelId: null }, _sum: { usedCount: true } }),
  ]);
  return (
    <div>
      <PageHead title="Khuyến mãi" desc="Thưởng nạp tiền, hoa hồng giới thiệu và mã giảm giá của hệ thống." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <form action={adminSaveMethodsAction} className="card space-y-4 p-6">
          <input type="hidden" name="back" value="/admin/khuyen-mai" />
          <div className="font-bold text-slate-900">Thưởng nạp theo mốc</div>
          <p className="text-sm text-slate-500">Khách nạp đạt mốc được cộng thêm % thưởng vào số tiền nạp.</p>
          <BonusTiersEditor initial={s.deposit_bonus_tiers} />
          <div><label className="lbl">Số tiền nạp tối thiểu (đ)</label><input className="inp" name="deposit_min" type="number" min={0} defaultValue={s.deposit_min} /></div>
          <button className="btn-primary !py-2.5">Lưu thưởng nạp</button>
        </form>

        <div className="space-y-6">
          <form action={adminSaveMethodsAction} className="card space-y-4 p-6">
            <input type="hidden" name="back" value="/admin/khuyen-mai" />
            <div className="font-bold text-slate-900">Hoa hồng giới thiệu</div>
            <p className="text-sm text-slate-500">Người giới thiệu nhận % trên tiền mua của người được giới thiệu.</p>
            <div><label className="lbl">% hoa hồng</label><input className="inp" name="affiliate_percent" type="number" min={0} max={50} step="0.5" defaultValue={s.affiliate_percent} /></div>
            <button className="btn-primary !py-2.5">Lưu hoa hồng</button>
          </form>

          <div className="card space-y-4 p-6">
            <div className="font-bold text-slate-900">Mã giảm giá</div>
            <div className="grid grid-cols-2 gap-4">
              <Stat label="Mã đang bật" value={num(activeCodes)} icon={I.gift} />
              <Stat label="Lượt đã dùng" value={num(usedAgg._sum.usedCount || 0)} icon={I.ticket} tone="emerald" />
            </div>
            <a href="/admin/ma-giam-gia" className="btn-ghost !py-2">Mở trang Mã giảm giá</a>
          </div>
        </div>
      </div>
      <FlashSaleAdmin panelId={null} />
      <form action={adminSaveSettings} className="card mt-6 space-y-4 p-6">
        <div className="font-bold text-slate-900">Tích điểm khách hàng thân thiết</div>
        <p className="text-sm text-slate-500">Khách được cộng điểm tự động khi đơn SMM/Premium hoàn thành, đổi điểm ra số dư ví ngay trong trang Hồ sơ.</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div><label className="lbl">Điểm nhận mỗi 100.000đ chi tiêu</label><input className="inp" name="points_per_100k" type="number" min={0} defaultValue={s.points_per_100k} /></div>
          <div><label className="lbl">Giá trị 1 điểm khi đổi (VNĐ)</label><input className="inp" name="points_value_vnd" type="number" min={1} defaultValue={s.points_value_vnd} /></div>
          <div><label className="lbl">Tối thiểu điểm mỗi lần đổi</label><input className="inp" name="points_min_redeem" type="number" min={1} defaultValue={s.points_min_redeem} /></div>
        </div>
        <button className="btn-primary !py-2.5">Lưu cấu hình điểm</button>
      </form>
    </div>
  );
}
