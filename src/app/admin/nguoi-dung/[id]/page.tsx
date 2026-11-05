import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser, requireAdminPage } from "@/lib/auth";
import { BackLink, Flash, Badge, Stat, I } from "@/components/ui";
import { adminAdjustBalance, adminUpdateUser } from "@/app/actions/admin";
import { vnd, num, LEVEL_NAME, dt, SMM_STATUS, PRE_STATUS } from "@/lib/format";

export const dynamic = "force-dynamic";
const TX_LABEL: Record<string, string> = { DEPOSIT: "Nạp tiền", SMM_ORDER: "Đặt đơn SMM", PREMIUM_ORDER: "Mua Premium", REFUND: "Hoàn tiền", ADJUST: "Admin điều chỉnh", BONUS: "Thưởng", PANEL_COMMISSION: "Hoa hồng panel con", REFERRAL_COMMISSION: "Hoa hồng giới thiệu" };

export default async function AdminUserDetail({ params, searchParams }: { params: { id: string }; searchParams: { msg?: string; err?: string } }) {
  await requireAdminPage();
  const me = (await getCurrentUser())!;
  const u = await prisma.user.findUnique({
    where: { id: parseInt(params.id) },
    include: { panel: { select: { name: true } }, referredBy: { select: { username: true } }, _count: { select: { referrals: true } } },
  });
  if (!u) notFound();
  const [txs, smmAgg, preAgg, recentSmm, recentPre, tickets, deposits] = await Promise.all([
    prisma.transaction.findMany({ where: { userId: u.id }, orderBy: { id: "desc" }, take: 30 }),
    prisma.smmOrder.aggregate({ where: { userId: u.id, status: { notIn: ["REFUNDED"] } }, _sum: { charge: true }, _count: true }),
    prisma.premiumOrder.aggregate({ where: { userId: u.id, status: { notIn: ["REFUNDED", "CANCELED"] } }, _sum: { total: true }, _count: true }),
    prisma.smmOrder.findMany({ where: { userId: u.id }, orderBy: { id: "desc" }, take: 8, include: { service: true } }),
    prisma.premiumOrder.findMany({ where: { userId: u.id }, orderBy: { id: "desc" }, take: 5, include: { variant: { include: { product: true } } } }),
    prisma.ticket.findMany({ where: { userId: u.id }, orderBy: { id: "desc" }, take: 5 }),
    prisma.deposit.findMany({ where: { userId: u.id }, orderBy: { id: "desc" }, take: 5 }),
  ]);
  return (
    <div>
      <BackLink href="/admin/nguoi-dung">Danh sách người dùng</BackLink>
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Số dư hiện tại" value={vnd(u.balance)} icon={I.wallet} tone="blue" />
        <Stat label="Tổng đã nạp" value={vnd(u.totalDeposited)} icon={I.db} tone="emerald" />
        <Stat label="Tổng chi SMM" value={vnd(smmAgg._sum.charge || 0)} icon={I.cart} tone="violet" sub={`${num(smmAgg._count)} đơn`} />
        <Stat label="Tổng chi Premium" value={vnd(preAgg._sum.total || 0)} icon={I.gem} tone="rose" sub={`${num(preAgg._count)} đơn`} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-6">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold text-slate-900">{u.username}</h1>
              <Badge cls={u.status === "ACTIVE" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}>{u.status === "ACTIVE" ? "Hoạt động" : "Đã khoá"}</Badge>
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              {[["Email", u.email], ["Họ tên", u.fullName || "—"], ["SĐT", u.phone || "—"], ["Cấp bậc", LEVEL_NAME[u.level]], ["Panel", u.panel?.name || "Web chính"], ["Được giới thiệu bởi", u.referredBy?.username || "—"], ["Đã giới thiệu", `${u._count.referrals} người`], ["Mã nạp tiền", `SMM ${u.depositCode}`], ["API key", u.apiKey], ["Đăng ký", dt(u.createdAt)], ["Đăng nhập gần nhất", u.lastLoginAt ? dt(u.lastLoginAt) : "—"]].map(([k, v]) => (
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
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 font-bold text-slate-900">Ticket & nạp gần nhất</div>
            <table className="w-full"><tbody className="divide-y divide-slate-100">
              {tickets.map((t) => (
                <tr key={"t" + t.id}>
                  <td className="td"><Link href={`/admin/ticket/${t.id}`} className="font-medium text-brand-700">Ticket: {t.subject}</Link><div className="text-xs text-slate-400">{dt(t.createdAt)}</div></td>
                  <td className="td text-right"><Badge cls={t.status === "OPEN" ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-500"}>{t.status}</Badge></td>
                </tr>
              ))}
              {deposits.map((d) => (
                <tr key={"d" + d.id}>
                  <td className="td"><span className="font-medium">Nạp {d.code}</span><div className="text-xs text-slate-400">{d.method} · {dt(d.createdAt)}</div></td>
                  <td className="td text-right font-semibold">{vnd(d.amount)}</td>
                </tr>
              ))}
              {tickets.length === 0 && deposits.length === 0 && <tr><td className="td text-slate-400">Chưa có ticket / lượt nạp nào</td></tr>}
            </tbody></table>
          </div>
        </div>
        <div className="lg:col-span-3 space-y-6">
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 font-bold text-slate-900">Đơn SMM gần nhất</div>
            <table className="w-full"><tbody className="divide-y divide-slate-100">
              {recentSmm.map((o) => (
                <tr key={o.id}>
                  <td className="td"><Link href={`/admin/don-smm/${o.id}`} className="font-mono text-xs font-semibold text-brand-700">{o.code}</Link><div className="max-w-[260px] truncate text-xs text-slate-400">{o.service.name}</div></td>
                  <td className="td font-semibold">{vnd(o.charge)}</td>
                  <td className="td"><Badge cls={SMM_STATUS[o.status].cls}>{SMM_STATUS[o.status].label}</Badge></td>
                  <td className="td whitespace-nowrap text-slate-500">{dt(o.createdAt)}</td>
                </tr>
              ))}
              {recentSmm.length === 0 && <tr><td className="td text-slate-400">Chưa có đơn SMM</td></tr>}
            </tbody></table>
          </div>
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 font-bold text-slate-900">Đơn Premium gần nhất</div>
            <table className="w-full"><tbody className="divide-y divide-slate-100">
              {recentPre.map((o) => (
                <tr key={o.id}>
                  <td className="td"><span className="font-mono text-xs font-semibold">{o.code}</span><div className="max-w-[260px] truncate text-xs text-slate-400">{o.variant.product.name} — {o.variant.name}</div></td>
                  <td className="td font-semibold">{vnd(o.total)}</td>
                  <td className="td"><Badge cls={PRE_STATUS[o.status].cls}>{PRE_STATUS[o.status].label}</Badge></td>
                  <td className="td whitespace-nowrap text-slate-500">{dt(o.createdAt)}</td>
                </tr>
              ))}
              {recentPre.length === 0 && <tr><td className="td text-slate-400">Chưa có đơn Premium</td></tr>}
            </tbody></table>
          </div>
          <div className="card overflow-hidden">
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
    </div>
  );
}
