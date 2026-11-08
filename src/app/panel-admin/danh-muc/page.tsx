import { prisma } from "@/lib/db";
import { requirePanelOwnerPage } from "@/lib/panel-access";
import { PageHead, Flash, Badge } from "@/components/ui";
import { num } from "@/lib/format";
import { panelToggleCategoryAction } from "@/app/actions/panel";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

/** Danh mục — danh mục dịch vụ dùng chung của web mẹ; panel không sửa được danh mục
 *  nhưng được ẨN/HIỆN từng danh mục trên website của mình. */
export default async function PanelCategories({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const { panel } = await requirePanelOwnerPage();
  const { L, Ld } = await getServerI18n((panel as { langConfig?: string | null }).langConfig ?? null);
  const hidden = new Set((panel.hiddenCats || "").split(",").map((x) => x.trim()).filter(Boolean));
  const cats = await prisma.smmCategory.findMany({
    where: { active: true },
    orderBy: { sort: "asc" },
    include: { _count: { select: { services: { where: { active: true, OR: [{ panelId: null }, { panelId: panel.id }] } } } } },
  });
  return (
    <div>
      <PageHead title={L("Danh mục")} desc={L("Danh mục dịch vụ là của web mẹ (dùng chung cho mọi website). Bạn không sửa được danh mục, nhưng có thể ẩn những danh mục không muốn bán khỏi website của mình.")} />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[680px]">
          <thead><tr><th className="th">{L("Danh mục")}</th><th className="th">{L("Nền tảng")}</th><th className="th">{L("Số dịch vụ")}</th><th className="th">{L("Trên website")}</th><th className="th"></th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {cats.map((c) => {
              const isHidden = hidden.has(String(c.id));
              return (
                <tr key={c.id} className={isHidden ? "opacity-55" : ""}>
                  <td className="td font-semibold text-slate-800">{c.name}</td>
                  <td className="td"><Badge cls="bg-slate-100 text-slate-600">{c.platform}</Badge></td>
                  <td className="td">{Ld(`${num(c._count.services)} dịch vụ`)}</td>
                  <td className="td">{isHidden ? <Badge cls="bg-rose-100 text-rose-700">{L("Đang ẩn")}</Badge> : <Badge cls="bg-emerald-100 text-emerald-700">{L("Đang hiện")}</Badge>}</td>
                  <td className="td text-right">
                    <form action={panelToggleCategoryAction}>
                      <input type="hidden" name="catId" value={c.id} />
                      <button className="btn-ghost btn-sm">{isHidden ? L("Hiện lại") : L("Ẩn khỏi website")}</button>
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
