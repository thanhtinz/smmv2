import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHead, Flash, Badge, Empty } from "@/components/ui";
import { vnd, PRE_STATUS, dt } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminPremiumOrders({ searchParams }: { searchParams: { status?: string; q?: string; msg?: string; err?: string } }) {
  const where: any = { variant: { product: { panelId: null } } };
  if (searchParams.status) where.status = searchParams.status;
  if (searchParams.q) where.OR = [{ code: { contains: searchParams.q } }, { user: { username: { contains: searchParams.q } } }];
  const orders = await prisma.premiumOrder.findMany({ where, orderBy: { id: "desc" }, take: 50, include: { variant: { include: { product: true } }, user: true } });
  return (
    <div>
      <PageHead title="Đơn Premium" desc="Đơn Chờ giao = khách đã trả tiền, cần giao tay. Đơn Bảo hành = khách báo lỗi, cần đổi/hoàn." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <form className="flex flex-wrap gap-2 mb-5">
        <input className="inp min-w-[220px] flex-1" name="q" placeholder="Mã đơn / username..." defaultValue={searchParams.q || ""} />
        <select className="inp !w-48" name="status" defaultValue={searchParams.status || ""}>
          <option value="">Tất cả trạng thái</option>
          {Object.entries(PRE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button className="btn-dark">Lọc</button>
      </form>
      {orders.length === 0 ? <Empty text="Không có đơn nào" /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead className="bg-slate-50 border-b border-slate-200"><tr>
              <th className="th">Mã đơn</th><th className="th">Khách</th><th className="th">Sản phẩm</th><th className="th">Thu / Vốn</th><th className="th">Trạng thái</th><th className="th">Thời gian</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50/60">
                  <td className="td"><Link href={`/admin/don-premium/${o.id}`} className="font-mono text-xs font-semibold text-brand-700">{o.code}</Link></td>
                  <td className="td font-medium">{o.user.username}</td>
                  <td className="td"><div className="font-medium">{o.variant.product.name} — {o.variant.name} × {o.quantity}</div><div className="text-xs text-slate-400 max-w-[280px] truncate">{o.buyerInfo || ""}</div></td>
                  <td className="td"><div className="font-semibold">{vnd(o.total)}</div><div className="text-xs text-slate-400">vốn {vnd(o.cost)}</div></td>
                  <td className="td"><Badge cls={PRE_STATUS[o.status].cls}>{PRE_STATUS[o.status].label}</Badge></td>
                  <td className="td text-xs text-slate-500">{dt(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
