import { prisma } from "@/lib/db";
import { requirePanelOwnerPage } from "@/lib/panel-access";
import { PageHead, Flash, Badge } from "@/components/ui";
import { num } from "@/lib/format";
import { updatePanelAction } from "@/app/actions/user";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

const LEVELS: { v: string; label: string; desc: string; cls: string; field: "discountMember" | "discountReseller" | "discountAgency" | "discountVip" }[] = [
  { v: "MEMBER", label: "Thành viên", desc: "Khách thường của panel", cls: "bg-slate-100 text-slate-600", field: "discountMember" },
  { v: "RESELLER", label: "Cộng tác viên", desc: "Khách bán lại", cls: "bg-sky-100 text-sky-700", field: "discountReseller" },
  { v: "AGENCY", label: "Đại lý", desc: "Khách đại lý", cls: "bg-violet-100 text-violet-700", field: "discountAgency" },
  { v: "VIP", label: "VIP", desc: "Khách VIP, ưu đãi cao nhất", cls: "bg-amber-100 text-amber-700", field: "discountVip" },
];

/** Cấp bậc — như web mẹ nhưng % giảm là bảng giảm RIÊNG của panel cho khách của mình. */
export default async function PanelLevels({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const { panel } = await requirePanelOwnerPage();
  const { L, Ld } = await getServerI18n((panel as { langConfig?: string | null }).langConfig ?? null);
  const counts = await prisma.user.groupBy({ by: ["level"], where: { panelId: panel.id }, _count: true });
  const countOf = (lv: string) => counts.find((c) => c.level === lv)?._count || 0;
  return (
    <div>
      <PageHead title={L("Cấp bậc")} desc={L("% giảm theo cấp bậc mà panel áp cho khách của mình trên giá đã gồm phụ phí (đây là bảng giảm riêng của panel, khác bảng giảm toàn hệ thống của web mẹ).")} />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead><tr><th className="th">{L("Cấp bậc")}</th><th className="th">{L("Giảm giá tại panel")}</th><th className="th">{L("Số khách của panel")}</th><th className="th">{L("Mô tả")}</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {LEVELS.map((lv) => (
                <tr key={lv.v}>
                  <td className="td"><Badge cls={lv.cls}>{L(lv.label)}</Badge></td>
                  <td className="td font-bold">{panel[lv.field]}%</td>
                  <td className="td">{Ld(`${num(countOf(lv.v))} khách`)}</td>
                  <td className="td text-slate-500">{L(lv.desc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form action={updatePanelAction} className="card space-y-4 p-6">
          <input type="hidden" name="back" value="/panel-admin/cap-bac" />
          <div className="font-bold text-slate-900">{L("Chỉnh % giảm theo cấp bậc")}</div>
          {LEVELS.map((lv) => (
            <div key={lv.v}>
              <label className="lbl">{Ld(`Giảm — ${lv.label} (%)`)}</label>
              <input className="inp" name={lv.field} type="number" min={0} max={90} defaultValue={panel[lv.field]} />
            </div>
          ))}
          <button className="btn-primary w-full !py-2.5">{L("Lưu cấp bậc")}</button>
        </form>
      </div>
    </div>
  );
}
