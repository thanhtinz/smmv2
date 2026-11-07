import { prisma } from "@/lib/db";
import { requirePanelOwnerPage } from "@/lib/panel-access";
import { PageHead, Flash, Stat, I } from "@/components/ui";
import { panelSaveConfigAction } from "@/app/actions/panel";
import { num } from "@/lib/format";

export const dynamic = "force-dynamic";

const BACK = "/panel-admin/khuyen-mai";

/** Khuyến mãi của panel: thưởng nạp theo mốc riêng, hoa hồng giới thiệu riêng, mã giảm giá riêng. */
export default async function PanelPromotions({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const { panel } = await requirePanelOwnerPage();
  let savedTiers: { from: number; percent: number }[] = [];
  try { savedTiers = JSON.parse(panel.depositBonusTiers || "[]"); } catch { savedTiers = []; }
  const [activeCodes, usedAgg] = await Promise.all([
    prisma.discountCode.count({ where: { panelId: panel.id, active: true } }),
    prisma.discountCode.aggregate({ where: { panelId: panel.id }, _sum: { usedCount: true } }),
  ]);
  return (
    <div>
      <PageHead title="Khuyến mãi" desc="Thưởng nạp tiền, hoa hồng giới thiệu và mã giảm giá của website." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <form action={panelSaveConfigAction} className="card space-y-4 p-6">
          <input type="hidden" name="section" value="promo" />
          <input type="hidden" name="back" value={BACK} />
          <div className="font-bold text-slate-900">Thưởng nạp tiền của panel</div>
          <p className="text-sm text-slate-500">Chỉ khách của panel được hưởng các mốc này. Để trống cả 3 mốc là không thưởng.</p>
          {[1, 2, 3].map((i) => (
            <div key={i} className="grid grid-cols-2 gap-4">
              <div><label className="lbl">Mốc {i} — nạp từ (VNĐ)</label><input name={`tierFrom${i}`} type="number" min={0} defaultValue={savedTiers[i - 1]?.from || ""} className="inp" placeholder="VD: 100000" /></div>
              <div><label className="lbl">Thưởng (%)</label><input name={`tierPct${i}`} type="number" min={0} max={100} defaultValue={savedTiers[i - 1]?.percent || ""} className="inp" placeholder="VD: 10" /></div>
            </div>
          ))}
          <div><label className="lbl">Số tiền nạp tối thiểu (VNĐ)</label><input name="depositMin" type="number" min={0} defaultValue={panel.depositMin || ""} className="inp" placeholder="Để trống = theo mặc định" /></div>
          <button className="btn-primary !py-2.5">Lưu khuyến mãi</button>
        </form>

        <div className="space-y-6">
          <form action={panelSaveConfigAction} className="card space-y-4 p-6">
            <input type="hidden" name="section" value="affiliate" />
            <input type="hidden" name="back" value={BACK} />
            <div className="font-bold text-slate-900">Chương trình giới thiệu của panel</div>
            <label className="flex items-center justify-between gap-4"><span className="text-sm text-slate-600">Bật mục Kiếm tiền cho khách của panel</span><input type="checkbox" name="moduleAffiliate" defaultChecked={panel.moduleAffiliate} className="h-5 w-5 accent-slate-900" /></label>
            <div><label className="lbl">% hoa hồng giới thiệu</label><input name="affiliatePercent" type="number" min={0} max={50} defaultValue={panel.affiliatePercent ?? ""} className="inp" placeholder="Để trống = theo tỉ lệ của web mẹ" /></div>
            <button className="btn-primary !py-2.5">Lưu chương trình giới thiệu</button>
          </form>

          <div className="card space-y-4 p-6">
            <div className="font-bold text-slate-900">Mã giảm giá của panel</div>
            <div className="grid grid-cols-2 gap-4">
              <Stat label="Mã đang bật" value={num(activeCodes)} icon={I.gift} />
              <Stat label="Lượt đã dùng" value={num(usedAgg._sum.usedCount || 0)} icon={I.ticket} tone="emerald" />
            </div>
            <a href="/panel-admin/ma-giam-gia" className="btn-ghost !py-2">Mở trang Mã giảm giá</a>
          </div>
        </div>
      </div>
    </div>
  );
}
