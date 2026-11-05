import Link from "next/link";
import { requireAdminPage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHead, Flash, Badge, Empty } from "@/components/ui";
import { vnd, num, LEVEL_NAME, dt } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminUsers({ searchParams }: { searchParams: { q?: string; msg?: string; err?: string } }) {
  await requireAdminPage();
  // Web mẹ CHỈ quản lý tài khoản của mẹ: tài khoản thuộc site con (panelId != null)
  // là riêng của site con — mẹ không xem account, không xem số dư của họ.
  const where: any = { panelId: null, ...(searchParams.q
    ? { OR: [{ username: { contains: searchParams.q } }, { email: { contains: searchParams.q } }, { phone: { contains: searchParams.q } }] }
    : {}) };
  const users = await prisma.user.findMany({ where, orderBy: { id: "desc" }, take: 100, include: { _count: { select: { smmOrders: true, premiumOrders: true } } } });
  const totalBalance = await prisma.user.aggregate({ where: { panelId: null }, _sum: { balance: true } });
  return (
    <div>
      <PageHead title="Người dùng" desc={`${num(users.length)} tài khoản hiển thị · Tổng số dư khách đang giữ: ${vnd(totalBalance._sum.balance || 0)} (nợ phải trả của hệ thống)`} />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <form className="flex gap-2 mb-5">
        <input className="inp !w-80" name="q" placeholder="Tìm username / email / SĐT..." defaultValue={searchParams.q || ""} />
        <button className="btn-dark">Tìm</button>
      </form>
      {users.length === 0 ? <Empty text="Không tìm thấy người dùng" /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead className="bg-slate-50 border-b border-slate-200"><tr>
              <th className="th">Người dùng</th><th className="th">Cấp / Vai trò</th><th className="th">Số dư</th><th className="th">Đã nạp / Đã chi</th><th className="th">Đơn SMM / Premium</th><th className="th">Đăng ký</th><th className="th">Trạng thái</th><th className="th"></th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/60">
                  <td className="td"><div className="font-semibold">{u.username}</div><div className="text-xs text-slate-400">{u.email}{u.phone ? ` · ${u.phone}` : ""}</div></td>
                  <td className="td">{LEVEL_NAME[u.level]}{u.role !== "USER" && <Badge cls="bg-slate-900 text-white ml-2">{u.role}</Badge>}</td>
                  <td className="td font-bold text-emerald-700">{vnd(u.balance)}</td>
                  <td className="td text-slate-500">{vnd(u.totalDeposited)} / {vnd(u.totalSpent)}</td>
                  <td className="td">{u._count.smmOrders} / {u._count.premiumOrders}</td>
                  <td className="td text-xs text-slate-500">{dt(u.createdAt)}</td>
                  <td className="td"><Badge cls={u.status === "ACTIVE" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}>{u.status === "ACTIVE" ? "Hoạt động" : "Đã khoá"}</Badge></td>
                  <td className="td text-right"><Link href={`/admin/nguoi-dung/${u.id}`} className="btn-ghost btn-sm">Chi tiết</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
