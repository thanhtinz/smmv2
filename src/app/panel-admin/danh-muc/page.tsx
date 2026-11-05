import { prisma } from "@/lib/db";
import { requirePanelOwnerPage } from "@/lib/panel-access";
import { PageHead, Flash, Badge } from "@/components/ui";
import { num } from "@/lib/format";
import { panelToggleCategoryAction } from "@/app/actions/panel";

export const dynamic = "force-dynamic";

/** Danh mục — danh mục dịch vụ dùng chung của web mẹ; panel không sửa được danh mục
 *  nhưng được ẨN/HIỆN từng danh mục trên gian hàng của mình. */
export default async function PanelCategories({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const { panel } = await requirePanelOwnerPage();
  const hidden = new Set((panel.hiddenCats || "").split(",").map((x) => x.trim()).filter(Boolean));
  const cats = await prisma.smmCategory.findMany({
    where: { active: true },
    orderBy: { sort: "asc" },
    include: { _count: { select: { services: { where: { active: true, OR: [{ panelId: null }, { panelId: panel.id }] } } } } },
  });
  return (
    <div>
      <PageHead title="Danh mục" desc="Danh mục dịch vụ là của web mẹ (dùng chung cho mọi gian hàng). Bạn không sửa được danh mục, nhưng có thể ẩn những danh mục không muốn bán khỏi gian hàng của mình." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[680px]">
          <thead><tr><th className="th">Danh mục</th><th className="th">Nền tảng</th><th className="th">Số dịch vụ</th><th className="th">Trên gian hàng</th><th className="th"></th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {cats.map((c) => {
              const isHidden = hidden.has(String(c.id));
              return (
                <tr key={c.id} className={isHidden ? "opacity-55" : ""}>
                  <td className="td font-semibold text-slate-800">{c.name}</td>
                  <td className="td"><Badge cls="bg-slate-100 text-slate-600">{c.platform}</Badge></td>
                  <td className="td">{num(c._count.services)} dịch vụ</td>
                  <td className="td">{isHidden ? <Badge cls="bg-rose-100 text-rose-700">Đang ẩn</Badge> : <Badge cls="bg-emerald-100 text-emerald-700">Đang hiện</Badge>}</td>
                  <td className="td text-right">
                    <form action={panelToggleCategoryAction}>
                      <input type="hidden" name="catId" value={c.id} />
                      <button className="btn-ghost btn-sm">{isHidden ? "Hiện lại" : "Ẩn khỏi gian hàng"}</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
