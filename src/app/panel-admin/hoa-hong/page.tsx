import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePanelOwnerPage } from "@/lib/panel-access";
import { PageHead, Flash, Stat, I } from "@/components/ui";
import { panelSetCommissionAction } from "@/app/actions/panel";
import { num, dt } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

/** Nhật ký hoa hồng của chủ panel: mọi khoản hoa hồng được cộng và bị thu hồi,
 *  kèm số dư sau mỗi biến động — chỉ dữ liệu của chính chủ panel. */
export default async function PanelCommissionPage({ searchParams }: { searchParams: { msg?: string; err?: string; days?: string; page?: string } }) {
  const { user, panel } = await requirePanelOwnerPage();
  const { L, Ld, M } = await getServerI18n((panel as { langConfig?: string | null }).langConfig ?? null);
  const days = [7, 30, 90].includes(parseInt(searchParams.days || "30")) ? parseInt(searchParams.days || "30") : 30;
  const page = Math.max(1, parseInt(searchParams.page || "1") || 1);
  const since = new Date(Date.now() - days * 86400000);
  const where = { userId: user.id, type: "PANEL_COMMISSION" as const, createdAt: { gte: since } };
  const [rows, total, earned, clawed] = await Promise.all([
    prisma.transaction.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.transaction.count({ where }),
    prisma.transaction.aggregate({ where: { ...where, amount: { gt: 0 } }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { ...where, amount: { lt: 0 } }, _sum: { amount: true } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <div>
      <PageHead title={L("Nhật ký hoa hồng")} desc={L("Mọi biến động hoa hồng từ đơn qua website của bạn.")} />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <form action={panelSetCommissionAction} className="card mb-6 space-y-4 p-6">
        <div className="min-w-[240px]">
          <div className="font-bold text-slate-900">{L("Setup % hoa hồng")}</div>
          <p className="mt-0.5 text-sm text-slate-400">{L("Giá bán tại website = giá web mẹ + % này. Phần chênh lệch (sau khi trừ % giảm theo cấp bậc bạn tặng khách) là hoa hồng của bạn trên mỗi đơn.")}</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="lbl">{L("% hoa hồng trên mỗi đơn")}</label>
            <div className="flex items-center gap-2">
              <input name="commission" type="number" min={0} max={200} step={1} defaultValue={panel.markup} className="inp !w-28 text-center font-bold" />
              <span className="font-bold text-slate-500">%</span>
            </div>
          </div>
          <button className="btn-primary !py-2.5">{L("Lưu % hoa hồng")}</button>
        </div>
      </form>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat label={Ld(`Hoa hồng đã nhận (${days} ngày)`)} value={M(earned._sum.amount || 0)} icon={I.wallet} tone="emerald" />
        <Stat label={L("Hoa hồng bị thu hồi (đơn hoàn/huỷ)")} value={M(Math.abs(clawed._sum.amount || 0))} icon={I.money} tone="rose" />
        <Stat label={L("Tổng số biến động")} value={num(total)} icon={I.list} tone="blue" />
      </div>
      <form method="get" className="card mb-4 flex flex-wrap items-center gap-3 p-4">
        <select name="days" defaultValue={String(days)} className="inp !w-44">
          <option value="7">{L("7 ngày gần nhất")}</option>
          <option value="30">{L("30 ngày gần nhất")}</option>
          <option value="90">{L("90 ngày gần nhất")}</option>
        </select>
        <button className="btn-primary btn-sm !px-4 !py-2.5">{L("Lọc")}</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead><tr className="border-b border-slate-100"><th className="th">{L("Thời gian")}</th><th className="th">{L("Đơn liên quan")}</th><th className="th">{L("Ghi chú")}</th><th className="th">{L("Số tiền")}</th><th className="th">{L("Số dư sau")}</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50/60">
                <td className="td whitespace-nowrap text-slate-500">{dt(t.createdAt)}</td>
                <td className="td font-mono text-[13px] font-semibold text-slate-700">{t.ref || "—"}</td>
                <td className="td text-slate-600">{t.note || "—"}</td>
                <td className={`td font-bold ${t.amount >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{t.amount >= 0 ? "+" : "−"}{M(Math.abs(t.amount))}</td>
                <td className="td text-slate-600">{M(t.balanceAfter)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="td py-10 text-center text-slate-400">{L("Chưa có biến động hoa hồng trong khoảng này.")}</td></tr>}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <Link key={p} href={`/panel-admin/hoa-hong?days=${days}&page=${p}`} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${p === page ? "bg-slate-900 text-white" : "bg-white text-slate-600 border border-slate-200"}`}>{p}</Link>
          ))}
        </div>
      )}
    </div>
  );
}
