import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PageHead, Flash, Badge, Empty } from "@/components/ui";
import { vnd, num, SMM_STATUS, dt } from "@/lib/format";

export const dynamic = "force-dynamic";
const PAGE = 20;

export default async function MySmmOrders({ searchParams }: { searchParams: { status?: string; q?: string; page?: string; msg?: string; err?: string } }) {
  const user = (await getCurrentUser())!;
  const page = Math.max(1, parseInt(searchParams.page || "1"));
  const where: any = { userId: user.id };
  if (searchParams.status) where.status = searchParams.status;
  if (searchParams.q) where.OR = [{ code: { contains: searchParams.q } }, { link: { contains: searchParams.q } }];
  const [total, orders] = await Promise.all([
    prisma.smmOrder.count({ where }),
    prisma.smmOrder.findMany({ where, orderBy: { id: "desc" }, skip: (page - 1) * PAGE, take: PAGE, include: { service: true } }),
  ]);
  const pages = Math.ceil(total / PAGE);
  return (
    <div>
      <PageHead title="Đơn SMM của tôi" desc={`${num(total)} đơn`}><Link href="/dashboard/dat-hang" className="btn-primary">+ Đặt đơn mới</Link></PageHead>
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <form className="flex flex-wrap gap-2 mb-5">
        <input className="inp !w-64" name="q" placeholder="Tìm mã đơn / link..." defaultValue={searchParams.q || ""} />
        <select className="inp !w-48" name="status" defaultValue={searchParams.status || ""}>
          <option value="">Tất cả trạng thái</option>
          {Object.entries(SMM_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button className="btn-dark">Lọc</button>
      </form>
      {orders.length === 0 ? <Empty text="Chưa có đơn nào khớp bộ lọc" /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead className="bg-slate-50 border-b border-slate-200"><tr>
              <th className="th">Mã đơn</th><th className="th">Dịch vụ</th><th className="th">Số lượng</th><th className="th">Đã chạy / Còn lại</th><th className="th">Tổng tiền</th><th className="th">Trạng thái</th><th className="th">Thời gian</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50/60">
                  <td className="td"><Link href={`/dashboard/don-hang/${o.id}`} className="font-mono text-xs font-semibold text-brand-700">{o.code}</Link>{o.viaApi && <div className="text-[11px] text-slate-400">qua API</div>}</td>
                  <td className="td"><div className="font-medium max-w-[260px] truncate">{o.service.name}</div><div className="text-xs text-slate-400 max-w-[260px] truncate">{o.link}</div></td>
                  <td className="td">{num(o.quantity)}</td>
                  <td className="td text-slate-500">{o.startCount !== null ? num(o.startCount) : "—"} / {o.remains !== null ? num(o.remains) : "—"}</td>
                  <td className="td font-semibold">{vnd(o.charge)}{o.refundedAmount > 0 && <div className="text-xs text-emerald-600">đã hoàn {vnd(o.refundedAmount)}</div>}</td>
                  <td className="td"><Badge cls={SMM_STATUS[o.status].cls}>{SMM_STATUS[o.status].label}</Badge></td>
                  <td className="td text-slate-500 text-xs">{dt(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="flex gap-2 mt-5">
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <Link key={p} href={`/dashboard/don-hang?page=${p}${searchParams.status ? `&status=${searchParams.status}` : ""}`} className={`btn-sm rounded-lg font-semibold px-3 py-2 ${p === page ? "bg-brand-600 text-white" : "bg-white border border-slate-200"}`}>{p}</Link>
          ))}
        </div>
      )}
    </div>
  );
}
