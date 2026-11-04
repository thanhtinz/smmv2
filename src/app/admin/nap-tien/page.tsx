import { prisma } from "@/lib/db";
import { PageHead, Flash, Badge } from "@/components/ui";
import { adminDepositAction, adminManualDeposit } from "@/app/actions/admin";
import { vnd, DEP_STATUS, dt } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminDeposits({ searchParams }: { searchParams: { msg?: string; err?: string; status?: string } }) {
  const where: any = {};
  if (searchParams.status) where.status = searchParams.status;
  const deposits = await prisma.deposit.findMany({ where, orderBy: { id: "desc" }, take: 60, include: { user: true } });
  const users = await prisma.user.findMany({ orderBy: { username: "asc" }, select: { id: true, username: true }, take: 500 });
  return (
    <div>
      <PageHead title="Nạp tiền" desc="Giao dịch chuyển khoản đúng nội dung được webhook cộng tự động. Danh sách chờ duyệt là các khai báo cần kiểm tra tay." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        <div className="xl:col-span-2 card overflow-x-auto">
          <table className="w-full min-w-[680px]">
            <thead className="bg-slate-50 border-b border-slate-200"><tr>
              <th className="th">Mã</th><th className="th">Khách</th><th className="th">Kênh</th><th className="th">Số tiền</th><th className="th">Trạng thái</th><th className="th">Thời gian</th><th className="th"></th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {deposits.map((d) => (
                <tr key={d.id}>
                  <td className="td font-mono text-xs">{d.code}{d.auto && <div className="text-[11px] text-emerald-600">tự động (webhook)</div>}</td>
                  <td className="td font-medium">{d.user.username}<div className="text-xs text-slate-400">{d.content || ""}</div></td>
                  <td className="td">{d.method}</td>
                  <td className="td font-semibold">{vnd(d.amount)}{d.bonus > 0 && <div className="text-xs text-emerald-600">+{vnd(d.bonus)} thưởng</div>}</td>
                  <td className="td"><Badge cls={DEP_STATUS[d.status].cls}>{DEP_STATUS[d.status].label}</Badge></td>
                  <td className="td text-xs text-slate-500">{dt(d.createdAt)}</td>
                  <td className="td text-right">
                    {d.status === "PENDING" && (
                      <form action={adminDepositAction} className="flex gap-1.5 justify-end">
                        <input type="hidden" name="id" value={d.id} />
                        <button className="btn-primary btn-sm" name="kind" value="approve">Duyệt + cộng tiền</button>
                        <button className="btn-ghost btn-sm !text-rose-600" name="kind" value="reject">Từ chối</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
              {deposits.length === 0 && <tr><td colSpan={7} className="td text-center text-slate-400 py-8">Chưa có giao dịch nạp</td></tr>}
            </tbody>
          </table>
        </div>
        <form action={adminManualDeposit} className="card p-6 space-y-4">
          <div className="font-bold text-slate-900">Cộng tiền tay cho khách</div>
          <div>
            <label className="lbl">Khách hàng</label>
            <select className="inp" name="userId" required>
              <option value="" disabled selected>— Chọn khách —</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.username}</option>)}
            </select>
          </div>
          <div><label className="lbl">Số tiền cộng (VND)</label><input className="inp" name="amount" type="number" required min={1000} /></div>
          <button className="btn-primary w-full">Cộng tiền ngay</button>
          <p className="text-xs text-slate-400">Dùng khi khách chuyển khoản sai nội dung hoặc nạp qua kênh ngoài hệ thống. Giao dịch được ghi sổ như một lần nạp đã duyệt.</p>
        </form>
      </div>
    </div>
  );
}
