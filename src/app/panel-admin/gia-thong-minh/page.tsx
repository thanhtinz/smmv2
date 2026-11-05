import { prisma } from "@/lib/db";
import { requirePanelOwnerPage } from "@/lib/panel-access";
import { PageHead, Flash, Stat, I } from "@/components/ui";
import { num, vnd } from "@/lib/format";
import { panelSmartPriceAction } from "@/app/actions/panel";

export const dynamic = "force-dynamic";

/** Giá thông minh — như web mẹ nhưng áp trong panel: chỉnh HÀNG LOẠT theo %
 *  trên các giá riêng đã đặt + giá của dịch vụ panel tự thêm. */
export default async function PanelSmartPricing({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const { panel } = await requirePanelOwnerPage();
  const [priceCount, ownServices, logs] = await Promise.all([
    prisma.panelServicePrice.count({ where: { panelId: panel.id } }),
    prisma.smmService.findMany({ where: { panelId: panel.id }, select: { id: true, name: true, rate: true }, orderBy: { id: "asc" }, take: 20 }),
    prisma.apiLog.findMany({ where: { kind: "bulk_price", ref: panel.slug }, orderBy: { id: "desc" }, take: 6 }),
  ]);
  return (
    <div>
      <PageHead title="Giá thông minh" desc="Chỉnh giá bán hàng loạt theo % trong panel: áp lên mọi giá riêng theo bậc đã đặt và giá của các dịch vụ panel tự thêm. Giá mới làm tròn tới hàng chục, tối thiểu 100đ." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Giá riêng đã đặt" value={num(priceCount)} icon={I.list} tone="blue" />
        <Stat label="Dịch vụ panel tự thêm" value={num(ownServices.length)} icon={I.layers} tone="violet" />
        <Stat label="Phụ phí chung (markup)" value={`+${panel.markup}%`} icon={I.percent} tone="rose" sub="Chỉnh ở Nhật ký hoa hồng" />
        <Stat label="Lần chỉnh hàng loạt" value={num(logs.length)} icon={I.clock} tone="amber" sub="6 lần gần nhất bên dưới" />
      </div>
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <form action={panelSmartPriceAction} className="card space-y-4 p-6">
          <div className="font-bold text-slate-900">Điều chỉnh theo %</div>
          <div>
            <label className="lbl">% thay đổi (âm = giảm giá)</label>
            <input name="pct" type="number" step="0.5" min={-90} max={500} required className="inp" placeholder="VD: 10 hoặc -5" />
          </div>
          <p className="text-xs leading-relaxed text-slate-400">Ví dụ: nhập 10 = tăng 10% mọi giá riêng + giá dịch vụ tự thêm; nhập −5 = giảm 5%. Giá chuẩn theo phụ phí % (dịch vụ chưa đặt giá riêng) không đổi — muốn đổi nhóm đó hãy chỉnh % phụ phí chung.</p>
          <button className="btn-primary w-full !py-2.5">Áp dụng cho toàn panel</button>
        </form>
        <div className="space-y-6">
          <div className="card overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-4 font-bold text-slate-900">Dịch vụ panel tự thêm (giá hiện tại)</div>
            {ownServices.length === 0 ? <p className="px-5 py-6 text-sm text-slate-400">Panel chưa tự thêm dịch vụ nào.</p> : (
              <table className="w-full">
                <tbody className="divide-y divide-slate-50">
                  {ownServices.map((sv) => (
                    <tr key={sv.id}><td className="td">{sv.name}</td><td className="td text-right font-bold">{vnd(sv.rate)}<span className="font-normal text-slate-400"> /1000</span></td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {logs.length > 0 && (
            <div className="card overflow-hidden">
              <div className="border-b border-slate-100 px-5 py-4 font-bold text-slate-900">Lịch sử chỉnh giá hàng loạt</div>
              <div className="divide-y divide-slate-50">
                {logs.map((l) => <p key={l.id} className="px-5 py-3 text-sm text-slate-600">{l.detail}</p>)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
