import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePanelOwnerPage } from "@/lib/panel-access";
import { PageHead, Flash, Badge } from "@/components/ui";
import { vnd, num } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Website con lồng nhau — các website tạo từ khách của panel này, như mục Panel con của web mẹ. */
export default async function PanelChildren({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const { panel } = await requirePanelOwnerPage();
  const panels = await prisma.childPanel.findMany({
    where: { parentPanelId: panel.id },
    orderBy: { createdAt: "desc" },
    include: {
      owner: { select: { username: true } },
      _count: { select: { members: true, orders: true } },
      orders: { select: { commission: true } },
    },
  });
  return (
    <div>
      <PageHead title="Website con" desc="Các website con tạo từ website của bạn." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
              <th className="px-5 py-3.5">Website con</th><th className="px-5 py-3.5">Chủ panel</th><th className="px-5 py-3.5">Phụ phí</th>
              <th className="px-5 py-3.5">Khách</th><th className="px-5 py-3.5">Đơn</th><th className="px-5 py-3.5">Hoa hồng đã trả</th>
              <th className="px-5 py-3.5">Trạng thái</th>
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
                </tr>
              ))}
              {panels.length === 0 && <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-400">Chưa có website con nào.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
