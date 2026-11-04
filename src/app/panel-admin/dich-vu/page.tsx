import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PageHead, Flash } from "@/components/ui";
import { PanelPriceEditor } from "@/components/client";
import { updatePanelAction, setPanelServicePricesAction, deletePanelServicePriceAction } from "@/app/actions/user";
import { vnd, num } from "@/lib/format";

export const dynamic = "force-dynamic";

const LEVEL_LABEL: Record<string, string> = { MEMBER: "Thành viên", RESELLER: "Đại lý", AGENCY: "Tổng đại lý", VIP: "VIP" };

/** Dịch vụ & Giá — dịch vụ CHỈ đồng bộ từ web mẹ (không thêm/sửa/đấu nguồn ở đây);
 *  chủ panel chỉ chỉnh GIÁ: phụ phí chung, % giảm theo bậc, giá riêng từng dịch vụ theo bậc. */
export default async function PanelServicesPage({ searchParams }: { searchParams: { msg?: string; err?: string; q?: string } }) {
  const user = (await getCurrentUser())!;
  const panel = (await prisma.childPanel.findUnique({ where: { ownerId: user.id } }))!;
  const q = (searchParams.q || "").trim();
  const [services, overrides, totalServices] = await Promise.all([
    prisma.smmService.findMany({
      where: { active: true, ...(q ? { name: { contains: q } } : {}) },
      orderBy: { id: "asc" }, take: 200,
      select: { id: true, name: true, rate: true, min: true, max: true },
    }),
    prisma.panelServicePrice.findMany({ where: { panelId: panel.id }, orderBy: { id: "asc" } }),
    prisma.smmService.count({ where: { active: true } }),
  ]);
  const panelRate = (r: number) => Math.round(r * (1 + panel.markup / 100));
  const ovByService = new Map<number, typeof overrides>();
  for (const o of overrides) {
    const arr = ovByService.get(o.serviceId) || [];
    arr.push(o);
    ovByService.set(o.serviceId, arr);
  }
  return (
    <div>
      <PageHead title="Dịch vụ & Giá" desc="Toàn bộ dịch vụ được đồng bộ từ web mẹ — bạn không thêm dịch vụ hay đấu nguồn riêng tại đây, chỉ chỉnh giá bán của panel mình." />
      <Flash msg={searchParams.msg} err={searchParams.err} />

      <div className="card p-6 mb-6">
        <div className="font-bold text-slate-900">Giá chung của panel</div>
        <p className="text-sm text-slate-500 mt-1 mb-4">Áp dụng cho mọi dịch vụ chưa có giá riêng: giá bán = giá web mẹ cộng phụ phí, rồi giảm thêm theo cấp bậc của khách (phần giảm trừ vào hoa hồng của bạn).</p>
        <form action={updatePanelAction} className="grid grid-cols-2 lg:grid-cols-5 gap-4 items-end">
          <input type="hidden" name="back" value="/panel-admin/dich-vu" />
          <div><label className="lbl">Phụ phí (%)</label><input className="inp" name="markup" type="number" min={0} max={200} defaultValue={panel.markup} /></div>
          <div><label className="lbl">Giảm — Thành viên (%)</label><input className="inp" name="discountMember" type="number" min={0} max={90} defaultValue={panel.discountMember} /></div>
          <div><label className="lbl">Giảm — Đại lý (%)</label><input className="inp" name="discountReseller" type="number" min={0} max={90} defaultValue={panel.discountReseller} /></div>
          <div><label className="lbl">Giảm — Tổng đại lý (%)</label><input className="inp" name="discountAgency" type="number" min={0} max={90} defaultValue={panel.discountAgency} /></div>
          <div className="flex gap-3 items-end">
            <div className="flex-1"><label className="lbl">Giảm — VIP (%)</label><input className="inp" name="discountVip" type="number" min={0} max={90} defaultValue={panel.discountVip} /></div>
            <button className="btn-primary !py-2.5 shrink-0">Lưu giá</button>
          </div>
        </form>
      </div>

      <div className="card p-6 mb-6">
        <div className="font-bold text-slate-900">Giá riêng từng dịch vụ theo cấp bậc</div>
        <p className="text-sm text-slate-500 mt-1 mb-4">Đặt giá cố định cho từng dịch vụ ứng với từng bậc khách — dịch vụ nào có giá riêng thì giá đó là giá cuối cho bậc đó, không giảm thêm %.</p>
        <PanelPriceEditor
          services={services.map((s) => ({ id: s.id, name: s.name, panelRate: panelRate(s.rate) }))}
          overrides={overrides}
          action={setPanelServicePricesAction}
          deleteAction={deletePanelServicePriceAction}
        />
      </div>

      <div className="card overflow-hidden">
        <div className="px-6 py-4 flex flex-wrap items-center gap-3 border-b border-slate-100">
          <div className="font-bold text-slate-900">Danh sách dịch vụ từ web mẹ</div>
          <span className="text-xs text-slate-400">{num(totalServices)} dịch vụ đang bán</span>
          <form className="ml-auto flex gap-2" method="get">
            <input className="inp !w-56 !py-2" name="q" defaultValue={q} placeholder="Tìm dịch vụ..." />
            <button className="btn-ghost btn-sm !py-2">Tìm</button>
          </form>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr><th className="th">Dịch vụ</th><th className="th">Giá web mẹ</th><th className="th">Giá panel chuẩn</th><th className="th">Giá riêng theo bậc</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {services.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/60">
                  <td className="td"><div className="font-medium text-slate-800">{s.name}</div><div className="text-xs text-slate-400">#{s.id} · {num(s.min)} – {num(s.max)}</div></td>
                  <td className="td text-slate-500">{vnd(s.rate)}</td>
                  <td className="td font-bold text-brand-700">{vnd(panelRate(s.rate))}</td>
                  <td className="td">
                    {ovByService.has(s.id) ? (
                      <span className="flex flex-wrap gap-1.5">{ovByService.get(s.id)!.map((o) => (
                        <span key={o.id} className="rounded-full bg-brand-50 text-brand-700 text-xs font-semibold px-2.5 py-1">{LEVEL_LABEL[o.level]}: {vnd(o.price)}</span>
                      ))}</span>
                    ) : <span className="text-xs text-slate-400">— theo giá chung</span>}
                  </td>
                </tr>
              ))}
              {services.length === 0 && <tr><td className="td text-slate-400" colSpan={4}>Không tìm thấy dịch vụ nào.</td></tr>}
            </tbody>
          </table>
        </div>
        {totalServices > services.length && <p className="px-6 py-3 text-xs text-slate-400 border-t border-slate-100">Đang hiển thị {services.length}/{num(totalServices)} dịch vụ — dùng ô tìm kiếm để thu hẹp.</p>}
      </div>
    </div>
  );
}
