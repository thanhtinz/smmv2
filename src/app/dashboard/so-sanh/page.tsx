import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings, levelDiscountFromSettings } from "@/lib/settings";
import { panelTierDiscount } from "@/lib/orders";
import { PageHead, Badge } from "@/components/ui";
import { vnd, num, PLATFORMS } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ComparePage({ searchParams }: { searchParams: { cat?: string } }) {
  const user = (await getCurrentUser())!;
  const settings = await getSettings();
  const panel = user.panelId ? await prisma.childPanel.findUnique({ where: { id: user.panelId } }) : null;
  const panelActive = panel && panel.status === "ACTIVE" ? panel : null;
  const discount = panelActive ? panelTierDiscount(panelActive, user.level) : levelDiscountFromSettings(settings, user.level);

  const categories = await prisma.smmCategory.findMany({ where: { active: true }, orderBy: { sort: "asc" } });
  const catId = searchParams.cat ? parseInt(searchParams.cat) : categories[0]?.id;
  const services = catId
    ? await prisma.smmService.findMany({ where: { active: true, categoryId: catId }, include: { category: true } })
    : [];
  const priceOf = (rate: number) => Math.max(1, Math.round(rate * (panelActive ? 1 + panelActive.markup / 100 : 1) * (1 - discount / 100)));
  const rows = services.map((sv) => ({ sv, price: priceOf(sv.rate) })).sort((a, b) => a.price - b.price);
  const cheapest = rows[0]?.sv.id;
  return (
    <div>
      <PageHead title="So sánh dịch vụ" desc="Đặt các dịch vụ cùng loại cạnh nhau: giá, giới hạn, thời gian, bảo hành — giá đã gồm chiết khấu cấp bậc của bạn." />
      <div className="mb-5 flex flex-wrap gap-2">
        {categories.map((c) => (
          <Link key={c.id} href={`/dashboard/so-sanh?cat=${c.id}`} className={`rounded-full px-4 py-2 text-sm font-semibold ${catId === c.id ? "bg-brand-600 text-white" : "border border-slate-200 bg-white text-slate-600"}`}>
            {(PLATFORMS as any)[c.platform]?.label || c.platform} · {c.name}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">Danh mục này chưa có dịch vụ nào đang bán.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead><tr>
              <th className="th">Dịch vụ</th><th className="th">Giá / 1000</th><th className="th">Tối thiểu</th><th className="th">Tối đa</th><th className="th">Thời gian dự kiến</th><th className="th">Bù (refill)</th><th className="th">Huỷ</th><th className="th"></th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ sv, price }) => (
                <tr key={sv.id} className={sv.id === cheapest ? "bg-emerald-50/50" : ""}>
                  <td className="td">
                    <div className="max-w-[300px] truncate font-medium">{sv.name}</div>
                    <div className="text-xs text-slate-400">#{sv.id} · {sv.category.name}</div>
                  </td>
                  <td className="td">
                    <span className="font-extrabold text-slate-900">{vnd(price)}</span>
                    {sv.id === cheapest && <span className="ml-2"><Badge cls="bg-emerald-100 text-emerald-700">Rẻ nhất</Badge></span>}
                  </td>
                  <td className="td">{num(sv.min)}</td>
                  <td className="td">{num(sv.max)}</td>
                  <td className="td text-slate-500">{sv.avgTime || "—"}</td>
                  <td className="td">{sv.refill ? <Badge cls="bg-blue-100 text-blue-700">Có</Badge> : <span className="text-slate-400">Không</span>}</td>
                  <td className="td">{sv.cancelable ? <Badge cls="bg-blue-100 text-blue-700">Có</Badge> : <span className="text-slate-400">Không</span>}</td>
                  <td className="td"><Link href={`/dashboard/dat-hang?service=${sv.id}`} className="btn-primary btn-sm">Đặt đơn</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
