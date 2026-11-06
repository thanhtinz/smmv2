import { requirePanelOwnerPage } from "@/lib/panel-access";
import { PageHead, Flash, I } from "@/components/ui";
import { panelSaveModulesAction } from "@/app/actions/panel";

export const dynamic = "force-dynamic";

type Mod = { key: string; name: string; desc: string; icon: React.ReactNode };

const MODULES: Mod[] = [
  { key: "sellSmm", name: "Đặt đơn SMM", desc: "Bán dịch vụ SMM cho khách của panel.", icon: I.cart },
  { key: "sellPremium", name: "Tài khoản Premium", desc: "Bán Premium theo giá panel đặt.", icon: I.gem },
  { key: "moduleRegister", name: "Đăng ký tài khoản", desc: "Cho khách đăng ký tại gian hàng.", icon: I.users },
  { key: "moduleBulk", name: "Đặt hàng loạt", desc: "Đặt nhiều đơn cùng lúc.", icon: I.layers },
  { key: "moduleSubscriptions", name: "Đăng ký định kỳ", desc: "Đơn hẹn giờ và lặp lại tự động.", icon: I.clock },
  { key: "moduleCampaigns", name: "Chiến dịch", desc: "Gom đơn theo chiến dịch, có trần ngân sách.", icon: I.megaphone },
  { key: "modulePromo", name: "Mã giảm giá", desc: "Áp mã giảm giá khi đặt đơn.", icon: I.gift },
  { key: "moduleAffiliate", name: "Kiếm tiền (Affiliate)", desc: "Hoa hồng cho người giới thiệu.", icon: I.money },
  { key: "moduleTickets", name: "Hỗ trợ / Ticket", desc: "Khách mở ticket hỗ trợ.", icon: I.ticket },
  { key: "moduleApi", name: "API đại lý", desc: "API /api/v2 cho khách của panel.", icon: I.key },
  { key: "moduleBlog", name: "Bài viết", desc: "Bài viết riêng của gian hàng.", icon: I.file },
];

/** Mô-đun của panel — chỗ bật/tắt từng tính năng cho khách của gian hàng, danh sách phẳng.
 *  Web mẹ tắt tính năng nào ở trang Mô-đun hệ thống thì tính năng đó tắt cho mọi gian hàng. */
export default async function PanelModules({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const { panel } = await requirePanelOwnerPage();
  return (
    <div>
      <PageHead title="Mô-đun" desc="Bật / tắt từng tính năng cho khách của gian hàng. Web mẹ tắt thì tắt chung.">
        <button className="btn-primary !py-2.5" form="panel-modules-form" type="submit">Lưu thay đổi</button>
      </PageHead>
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <form id="panel-modules-form" action={panelSaveModulesAction}>
        <div className="card divide-y divide-slate-100 p-0">
          {MODULES.map((m) => {
            const on = (panel as unknown as Record<string, unknown>)[m.key] !== false;
            return (
              <label key={m.key} className="flex cursor-pointer items-center gap-4 px-6 py-4 transition hover:bg-slate-50">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${on ? "bg-brand-50 text-brand-600" : "bg-slate-100 text-slate-400"}`}>{m.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-slate-900">{m.name}</span>
                  <span className="mt-0.5 block text-sm leading-relaxed text-slate-500">{m.desc}</span>
                </span>
                <span className={`shrink-0 text-sm font-semibold ${on ? "text-emerald-600" : "text-slate-400"}`}>{on ? "Đang bật" : "Đang tắt"}</span>
                <input type="checkbox" name={m.key} defaultChecked={on} className="h-5 w-5 shrink-0 accent-brand-600" />
              </label>
            );
          })}
        </div>
        <div className="card mt-5 p-6">
          <label className="lbl">% hoa hồng giới thiệu riêng của panel (để trống = theo web mẹ)</label>
          <input name="affiliatePercent" type="number" min={0} max={100} defaultValue={panel.affiliatePercent ?? ""} placeholder="VD: 8" className="inp max-w-xs" />
        </div>
        <button className="btn-primary mt-5 w-full !py-3 md:w-auto">Lưu thay đổi</button>
      </form>
    </div>
  );
}
