import { prisma } from "@/lib/db";
import { requirePanelOwnerPage } from "@/lib/panel-access";
import { PageHead, Flash, Badge, Stat } from "@/components/ui";
import { panelDepositAction, panelManualDepositAction, panelSaveDepositSettingsAction } from "@/app/actions/panel";
import { vnd, dt, DEP_STATUS } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Nạp tiền của khách panel: duyệt yêu cầu nạp (USDT / chuyển khoản ngân hàng
 *  của panel / yêu cầu chờ) và cộng tiền tay cho khách của panel. */
export default async function PanelDepositsPage({ searchParams }: { searchParams: { msg?: string; err?: string; status?: string } }) {
  const { panel } = await requirePanelOwnerPage();
  const status = searchParams.status || "";
  const [pendingCount, approvedSum, deposits, members] = await Promise.all([
    prisma.deposit.count({ where: { user: { panelId: panel.id }, status: "PENDING" } }),
    prisma.deposit.aggregate({ where: { user: { panelId: panel.id }, status: "APPROVED" }, _sum: { amount: true } }),
    prisma.deposit.findMany({
      where: { user: { panelId: panel.id }, ...(status ? { status } : {}) } as any,
      include: { user: { select: { username: true } } },
      orderBy: { id: "desc" }, take: 50,
    }),
    prisma.user.findMany({ where: { panelId: panel.id }, select: { id: true, username: true }, orderBy: { username: "asc" }, take: 500 }),
  ]);
  const chips: [string, string][] = [["", "Tất cả"], ["PENDING", "Chờ duyệt"], ["APPROVED", "Đã duyệt"], ["REJECTED", "Từ chối"]];
  const myTiers = (() => { try { return JSON.parse(panel.depositBonusTiers || "[]") as { from: number; percent: number }[]; } catch { return []; } })();
  return (
    <div>
      <PageHead title="Nạp tiền của khách" desc="Duyệt các yêu cầu nạp chờ của khách panel (USDT về ví của bạn, chuyển khoản ngân hàng của bạn…) và cộng tiền tay." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat label="Yêu cầu chờ duyệt" value={String(pendingCount)} icon="clock" />
        <Stat label="Tổng đã duyệt cộng" value={vnd(approvedSum._sum.amount || 0)} icon="wallet" />
        <Stat label="Khách của panel" value={String(members.length)} icon="users" />
      </div>

      <form action={panelSaveDepositSettingsAction} className="card mb-6 space-y-4 p-5">
        <div>
          <div className="font-bold text-slate-900">Chính sách nạp riêng của panel</div>
          <p className="mt-0.5 text-sm text-slate-400">Mốc thưởng nạp + số tiền nạp tối thiểu do panel TỰ SET cho khách của mình (mọi kênh: ngân hàng, USDT, PayPal, Stripe) — nạp của panel là riêng, không tính chung với web mẹ. Để trống mốc = khách của panel không có thưởng nạp.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1"><label className="lbl">Mốc {i} — nạp từ (đ)</label><input name={`tierFrom${i}`} type="number" min={0} step={1000} defaultValue={myTiers[i - 1]?.from || ""} placeholder="VD: 1000000" className="inp" /></div>
              <div className="w-24"><label className="lbl">Thưởng %</label><input name={`tierPct${i}`} type="number" min={0} max={100} defaultValue={myTiers[i - 1]?.percent || ""} placeholder="2" className="inp" /></div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-56"><label className="lbl">Nạp tối thiểu (đ)</label><input name="depositMin" type="number" min={0} step={1000} defaultValue={panel.depositMin || ""} placeholder="Trống = theo web mẹ" className="inp" /></div>
          <button className="btn-primary !py-2.5">Lưu chính sách nạp</button>
        </div>
      </form>

      <form action={panelManualDepositAction} className="card mb-6 flex flex-wrap items-end gap-3 p-5">
        <div className="min-w-[220px] flex-1">
          <label className="lbl">Khách</label>
          <select name="memberId" required className="inp">
            <option value="">— Chọn khách của panel —</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.username}</option>)}
          </select>
        </div>
        <div className="w-48">
          <label className="lbl">Số tiền cộng (đ)</label>
          <input name="amount" type="number" min={1000} step={1000} required placeholder="100000" className="inp" />
        </div>
        <button className="btn-primary !py-2.5">Cộng tiền tay</button>
      </form>

      <div className="mb-4 flex flex-wrap gap-2">
        {chips.map(([k, label]) => (
          <a key={k} href={k ? `/panel-admin/nap-tien?status=${k}` : "/panel-admin/nap-tien"} className={`chip ${status === k ? "chip-on" : ""}`}>{label}</a>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead className="bg-slate-50 border-b border-slate-200"><tr>
              <th className="th">Mã</th><th className="th">Khách</th><th className="th">Phương thức</th><th className="th">Số tiền</th><th className="th">Nội dung / ghi chú</th><th className="th">Trạng thái</th><th className="th">Thời gian</th><th className="th !text-right">Duyệt</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {deposits.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50/60">
                  <td className="td font-mono text-xs font-semibold">{d.code}</td>
                  <td className="td">{d.user.username}</td>
                  <td className="td">{d.method}</td>
                  <td className="td font-semibold">{vnd(d.amount)}{d.bonus > 0 && <div className="text-xs font-normal text-emerald-600">+{vnd(d.bonus)} thưởng</div>}</td>
                  <td className="td max-w-[260px] truncate text-slate-500" title={d.content || ""}>{d.content || "—"}</td>
                  <td className="td"><Badge cls={DEP_STATUS[d.status].cls}>{DEP_STATUS[d.status].label}</Badge></td>
                  <td className="td whitespace-nowrap text-slate-500">{dt(d.createdAt)}</td>
                  <td className="td">
                    {d.status === "PENDING" ? (
                      <span className="flex justify-end gap-1.5">
                        <form action={panelDepositAction}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="kind" value="approve" /><button className="btn-primary btn-sm !px-3 !py-1.5">Duyệt + cộng tiền</button></form>
                        <form action={panelDepositAction}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="kind" value="reject" /><button className="btn-ghost btn-sm !px-3 !py-1.5 !text-rose-600">Từ chối</button></form>
                      </span>
                    ) : <span className="block text-right text-xs text-slate-300">—</span>}
                  </td>
                </tr>
              ))}
              {deposits.length === 0 && <tr><td className="td text-slate-400" colSpan={8}>Chưa có yêu cầu nạp nào của khách panel.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
