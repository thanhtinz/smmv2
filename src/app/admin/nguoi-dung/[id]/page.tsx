import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import {  getCurrentUser , requireAdminPage } from "@/lib/auth";
import { BackLink, Flash, Badge } from "@/components/ui";
import { adminAdjustBalance, adminUpdateUser } from "@/app/actions/admin";
import { vnd, LEVEL_NAME, dt } from "@/lib/format";

export const dynamic = "force-dynamic";
const TX_LABEL: Record<string, string> = { DEPOSIT: "Nạp tiền", SMM_ORDER: "Đặt đơn SMM", PREMIUM_ORDER: "Mua Premium", REFUND: "Hoàn tiền", ADJUST: "Admin điều chỉnh", BONUS: "Thưởng", PANEL_COMMISSION: "Hoa hồng panel con", REFERRAL_COMMISSION: "Hoa hồng giới thiệu" };

export default async function AdminUserDetail({ params, searchParams }: { params: { id: string }; searchParams: { msg?: string; err?: string } }) {
  await requireAdminPage();
  const me = (await getCurrentUser())!;
  const u = await prisma.user.findUnique({ where: { id: parseInt(params.id) } });
  if (!u) notFound();
  const [txs, smmCount, preCount] = await Promise.all([
    prisma.transaction.findMany({ where: { userId: u.id }, orderBy: { id: "desc" }, take: 30 }),
    prisma.smmOrder.count({ where: { userId: u.id } }),
    prisma.premiumOrder.count({ where: { userId: u.id } }),
  ]);
  return (
    <div>
      <BackLink href="/admin/nguoi-dung">Danh sách người dùng</BackLink>
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-6">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold text-slate-900">{u.username}</h1>
              <Badge cls={u.status === "ACTIVE" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}>{u.status === "ACTIVE" ? "Hoạt động" : "Đã khoá"}</Badge>
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              {[["Email", u.email], ["Họ tên", u.fullName || "—"], ["SĐT", u.phone || "—"], ["Số dư", vnd(u.balance)], ["Đã nạp / Đã chi", `${vnd(u.totalDeposited)} / ${vnd(u.totalSpent)}`], ["Đơn SMM / Premium", `${smmCount} / ${preCount}`], ["Mã nạp tiền", `SMM ${u.depositCode}`], ["API key", u.apiKey], ["Đăng ký", dt(u.createdAt)], ["Đăng nhập gần nhất", u.lastLoginAt ? dt(u.lastLoginAt) : "—"]].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4"><dt className="text-slate-500">{k}</dt><dd className="font-medium text-right break-all">{v}</dd></div>
              ))}
            </dl>
          </div>
          <form action={adminAdjustBalance} className="card p-6 space-y-3">
            <input type="hidden" name="userId" value={u.id} />
            <div className="font-bold text-slate-900">Cộng / trừ số dư</div>
            <div><label className="lbl">Số tiền (âm = trừ)</label><input className="inp" name="amount" type="number" required placeholder="Vd: 100000 hoặc -50000" /></div>
            <div><label className="lbl">Lý do</label><input className="inp" name="note" placeholder="Vd: hoàn tiền sự cố, khuyến mãi..." /></div>
            <button className="btn-primary w-full">Thực hiện điều chỉnh</button>
          </form>
          <form action={adminUpdateUser} className="card p-6 space-y-3">
            <input type="hidden" name="userId" value={u.id} />
            <div className="font-bold text-slate-900">Cấp bậc & trạng thái</div>
            <div>
              <label className="lbl">Cấp khách (chiết khấu SMM)</label>
              <select className="inp" name="level" defaultValue={u.level}>
                {Object.entries(LEVEL_NAME).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="lbl">Trạng thái</label>
              <select className="inp" name="status" defaultValue={u.status}><option value="ACTIVE">Hoạt động</option><option value="BANNED">Khoá tài khoản</option></select>
            </div>
            {me.role === "ADMIN" && (
              <div>
                <label className="lbl">Vai trò</label>
                <select className="inp" name="role" defaultValue={u.role}><option value="USER">Người dùng</option><option value="STAFF">Nhân viên</option><option value="ADMIN">Admin</option></select>
              </div>
            )}
            <button className="btn-dark w-full">Lưu thay đổi</button>
          </form>
        </div>
        <div className="card lg:col-span-3 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 font-bold text-slate-900">Sổ giao dịch gần nhất</div>
          <table className="w-full"><tbody className="divide-y divide-slate-100">
            {txs.map((t) => (
              <tr key={t.id}>
                <td className="td text-xs text-slate-500">{dt(t.createdAt)}</td>
                <td className="td font-medium">{TX_LABEL[t.type] || t.type}<div className="text-xs text-slate-400 font-normal">{t.note || ""}{t.ref ? ` · ${t.ref}` : ""}</div></td>
                <td className={`td font-bold text-right ${t.amount >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{t.amount >= 0 ? "+" : ""}{vnd(t.amount)}</td>
                <td className="td text-right text-slate-500">{vnd(t.balanceAfter)}</td>
              </tr>
            ))}
            {txs.length === 0 && <tr><td className="td text-slate-400">Chưa có giao dịch</td></tr>}
          </tbody></table>
        </div>
      </div>
    </div>
  );
}
