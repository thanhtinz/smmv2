import Link from "next/link";
import { requireAdminPage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHead, Flash, Badge, Empty } from "@/components/ui";
import { num, LEVEL_NAME, dt } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

export default async function AdminUsers({ searchParams }: { searchParams: { q?: string; msg?: string; err?: string } }) {
  await requireAdminPage();
  const { L, Ld, M } = await getServerI18n(null);
  // Web mẹ CHỈ quản lý tài khoản của mẹ: tài khoản thuộc site con (panelId != null)
  // là riêng của site con — mẹ không xem account, không xem số dư của họ.
  const where: any = { panelId: null, ...(searchParams.q
    ? { OR: [{ username: { contains: searchParams.q, mode: "insensitive" } }, { email: { contains: searchParams.q, mode: "insensitive" } }, { phone: { contains: searchParams.q, mode: "insensitive" } }] }
    : {}) };
  const users = await prisma.user.findMany({ where, orderBy: { id: "desc" }, take: 100, include: { _count: { select: { smmOrders: true, premiumOrders: true } } } });
  const totalBalance = await prisma.user.aggregate({ where: { panelId: null }, _sum: { balance: true } });
  return (
    <div>
      <PageHead title={L("Người dùng")} desc={Ld(`${num(users.length)} tài khoản hiển thị · Tổng số dư khách đang giữ: ${M(totalBalance._sum.balance || 0)} (nợ phải trả của hệ thống)`)} />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <form className="flex gap-2 mb-5">
        <input className="inp !w-80" name="q" placeholder={L("Tìm username / email / SĐT...")} defaultValue={searchParams.q || ""} />
        <button className="btn-dark">{L("Tìm")}</button>
      </form>
      {users.length === 0 ? <Empty text={L("Không tìm thấy người dùng")} /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead className="bg-slate-50 border-b border-slate-200"><tr>
              <th className="th">{L("Người dùng")}</th><th className="th">{L("Cấp / Vai trò")}</th><th className="th">{L("Số dư")}</th><th className="th">{L("Đã nạp / Đã chi")}</th><th className="th">{L("Đơn SMM / Premium")}</th><th className="th">{L("Đăng ký")}</th><th className="th">{L("Trạng thái")}</th><th className="th"></th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/60">
                  <td className="td"><div className="font-semibold">{u.username}</div><div className="text-xs text-slate-400">{u.email}{u.phone ? ` · ${u.phone}` : ""} · {u.emailVerified ? <span className="font-semibold text-emerald-600">{L("Email đã xác thực")}</span> : <span className="text-amber-600">{L("Email chưa xác thực")}</span>}</div></td>
                  <td className="td">{L(LEVEL_NAME[u.level])}{u.role !== "USER" && <Badge cls="bg-slate-900 text-white ml-2">{u.role}</Badge>}</td>
                  <td className="td font-bold text-emerald-700">{M(u.balance)}</td>
                  <td className="td text-slate-500">{M(u.totalDeposited)} / {M(u.totalSpent)}</td>
                  <td className="td">{u._count.smmOrders} / {u._count.premiumOrders}</td>
                  <td className="td text-xs text-slate-500">{dt(u.createdAt)}</td>
                  <td className="td"><Badge cls={u.status === "ACTIVE" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}>{u.status === "ACTIVE" ? L("Hoạt động") : L("Đã khoá")}</Badge></td>
                  <td className="td text-right"><Link href={`/admin/nguoi-dung/${u.id}`} className="btn-ghost btn-sm">{L("Chi tiết")}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
