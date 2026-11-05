import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PageHead, Flash } from "@/components/ui";
import { PanelOwnServicesClient, type PanelOwnServiceDTO, type PanelCategoryDTO } from "@/components/panel-features";

export const dynamic = "force-dynamic";

/** Dịch vụ riêng của panel: chủ panel tự thêm nguồn hàng của mình,
 *  chỉ khách của panel này thấy và đặt được; chủ panel tự xử lý đơn. */
export default async function PanelOwnServicesPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const user = (await getCurrentUser())!;
  const panel = (await prisma.childPanel.findUnique({ where: { ownerId: user.id } }))!;
  const [rows, categories] = await Promise.all([
    prisma.smmService.findMany({
      where: { panelId: panel.id },
      include: { category: true, _count: { select: { orders: true } } },
      orderBy: { id: "desc" },
    }),
    prisma.smmCategory.findMany({ where: { active: true }, orderBy: { sort: "asc" } }),
  ]);
  const services: PanelOwnServiceDTO[] = rows.map((sv) => ({
    id: sv.id, name: sv.name, rate: sv.rate, min: sv.min, max: sv.max, description: sv.description,
    active: sv.active, categoryId: sv.categoryId, categoryName: sv.category.name, platform: sv.category.platform, orderCount: sv._count.orders,
  }));
  const cats: PanelCategoryDTO[] = categories.map((c) => ({ id: c.id, name: c.name, platform: c.platform }));
  return (
    <div>
      <PageHead title="Dịch vụ riêng của panel" desc="Nguồn hàng của chính bạn — chỉ khách của panel này thấy và đặt được. Bạn tự xử lý đơn ở mục Đơn hàng; toàn bộ tiền đơn là doanh thu của bạn." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <PanelOwnServicesClient services={services} categories={cats} />
    </div>
  );
}
