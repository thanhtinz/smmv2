import { requireAdminPage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHead, Flash, Badge } from "@/components/ui";
import { vnd, num, dt } from "@/lib/format";
import { adminPanelAction } from "@/app/actions/admin";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminPanels({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  await requireAdminPage();
  const panels = await prisma.childPanel.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      owner: { select: { username: true } },
      _count: { select: { members: true, orders: true } },
      orders: { select: { commission: true } },
    },
  });
  return (
    <div>
      <PageHead title="Panel con" desc="Các website riêng do đại lý tạo — khách của panel mua giá cộng markup, chủ panel hưởng hoa hồng." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
              <th className="px-5 py-3.5">Panel</th><th className="px-5 py-3.5">Chủ panel</th><th className="px-5 py-3.5">Phụ phí</th>
              <th className="px-5 py-3.5">Khách</th><th className="px-5 py-3.5">Đơn</th><th className="px-5 py-3.5">Hoa hồng đã trả</th>
              <th className="px-5 py-3.5">Trạng thái</th><th className="px-5 py-3.5"></th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {panels.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/60">
                  <td className="px-5 py-3.5">
                    <div className="font-semibold text-slate-800">{p.name}</div>
                    <Link href={`/cua-hang/${p.slug}`} className="text-xs text-brand-600">/cua-hang/{p.slug}</Link>
                    {p.domain && <div className="text-xs text-slate-400">{p.domain}</div>}
                  </td>
                  <td className="px-5 py-3.5">{p.owner.username}</td>
                  <td className="px-5 py-3.5">{p.markup}%</td>
                  <td className="px-5 py-3.5">{num(p._count.members)}</td>
                  <td className="px-5 py-3.5">{num(p._count.orders)}</td>
                  <td className="px-5 py-3.5 font-semibold">{vnd(p.orders.reduce((s, o) => s + o.commission, 0))}</td>
                  <td className="px-5 py-3.5">{p.status === "ACTIVE" ? <Badge cls="bg-emerald-50 text-emerald-700 border border-emerald-200">Đang mở</Badge> : <Badge cls="bg-rose-50 text-rose-700 border border-rose-200">Đã khoá</Badge>}</td>
                  <td className="px-5 py-3.5">
                    <form action={adminPanelAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="kind" value="toggle" />
                      <button className="btn-ghost btn-sm !py-1.5" type="submit">{p.status === "ACTIVE" ? "Khoá" : "Mở lại"}</button>
                    </form>
                  </td>
                </tr>
              ))}
              {panels.length === 0 && <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-400">Chưa có panel con nào.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-slate-400 mt-4">Tạo lúc: {panels[0] ? dt(panels[0].createdAt) : "—"} · Khoá panel = khách của panel mua theo giá gốc và chủ panel không nhận hoa hồng nữa; website cũng ẩn.</p>
    </div>
  );
}
