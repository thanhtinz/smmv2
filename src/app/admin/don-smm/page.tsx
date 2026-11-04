import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHead, Flash, Badge, Empty } from "@/components/ui";
import { vnd, num, SMM_STATUS, dt } from "@/lib/format";

export const dynamic = "force-dynamic";
const PAGE = 25;

export default async function AdminSmmOrders({ searchParams }: { searchParams: { status?: string; mode?: string; q?: string; page?: string; msg?: string; err?: string } }) {
  const page = Math.max(1, parseInt(searchParams.page || "1"));
  const where: any = {};
  if (searchParams.status) where.status = searchParams.status;
  if (searchParams.mode) where.fulfillment = searchParams.mode;
  if (searchParams.q) where.OR = [{ code: { contains: searchParams.q } }, { link: { contains: searchParams.q } }, { user: { username: { contains: searchParams.q } } }];
  const [total, orders, manualPending] = await Promise.all([
    prisma.smmOrder.count({ where }),
    prisma.smmOrder.findMany({ where, orderBy: { id: "desc" }, skip: (page - 1) * PAGE, take: PAGE, include: { service: true, user: true } }),
    prisma.smmOrder.count({ where: { fulfillment: "MANUAL", status: { in: ["PENDING", "PROCESSING"] } } }),
  ]);
  return (
    <div>
      <PageHead title="Đơn SMM" desc={`${num(total)} đơn · ${manualPending} đơn thủ công đang chờ xử lý`} />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <form className="flex flex-wrap gap-2 mb-5">
        <input className="inp !w-72" name="q" placeholder="Mã đơn / link / username..." defaultValue={searchParams.q || ""} />
        <select className="inp !w-44" name="mode" defaultValue={searchParams.mode || ""}>
          <option value="">Tất cả hình thức</option><option value="API">Qua API provider</option><option value="MANUAL">Thủ công</option>
        </select>
        <select className="inp !w-48" name="status" defaultValue={searchParams.status || ""}>
          <option value="">Tất cả trạng thái</option>
          {Object.entries(SMM_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button className="btn-dark">Lọc</button>
      </form>
      {orders.length === 0 ? <Empty text="Không có đơn nào khớp bộ lọc" /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[920px]">
            <thead className="bg-slate-50 border-b border-slate-200"><tr>
              <th className="th">Mã đơn</th><th className="th">Khách</th><th className="th">Dịch vụ</th><th className="th">SL</th><th className="th">Thu / Vốn</th><th className="th">Hình thức</th><th className="th">Trạng thái</th><th className="th">Thời gian</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50/60">
                  <td className="td"><Link href={`/admin/don-smm/${o.id}`} className="font-mono text-xs font-semibold text-brand-700">{o.code}</Link>{o.providerOrderId && <div className="text-[11px] text-slate-400">P#{o.providerOrderId}</div>}</td>
                  <td className="td font-medium">{o.user.username}</td>
                  <td className="td"><div className="max-w-[240px] truncate font-medium">{o.service.name}</div><div className="max-w-[240px] truncate text-xs text-slate-400">{o.link}</div></td>
                  <td className="td">{num(o.quantity)}</td>
                  <td className="td"><div className="font-semibold">{vnd(o.charge)}</div><div className="text-xs text-slate-400">vốn {vnd(o.cost)}</div></td>
                  <td className="td"><Badge cls={o.fulfillment === "API" ? "bg-indigo-100 text-indigo-800" : "bg-amber-100 text-amber-800"}>{o.fulfillment === "API" ? "API" : "Thủ công"}</Badge></td>
                  <td className="td"><Badge cls={SMM_STATUS[o.status].cls}>{SMM_STATUS[o.status].label}</Badge></td>
                  <td className="td text-xs text-slate-500">{dt(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {Math.ceil(total / PAGE) > 1 && <p className="text-sm text-slate-400 mt-4">Trang {page}/{Math.ceil(total / PAGE)}</p>}
    </div>
  );
}
