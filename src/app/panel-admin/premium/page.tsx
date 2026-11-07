import { prisma } from "@/lib/db";
import { requirePanelOwnerPage } from "@/lib/panel-access";
import { PageHead, Flash } from "@/components/ui";
import { PanelProductsClient, type PanelProductDTO } from "@/components/panel-premium";
import { productImages } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Sản phẩm Premium do panel tự thêm — chỉ khách của panel thấy và mua, chủ panel tự giao. */
export default async function PanelPremiumProducts({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const { panel } = await requirePanelOwnerPage();
  const [products, categories] = await Promise.all([
    prisma.premiumProduct.findMany({
      where: { panelId: panel.id },
      orderBy: [{ sort: "asc" }, { id: "asc" }],
      include: { category: true, variants: { orderBy: [{ sort: "asc" }, { id: "asc" }] } },
    }),
    prisma.premiumCategory.findMany({ where: { active: true }, orderBy: { sort: "asc" } }),
  ]);
  const variantIds = products.flatMap((p) => p.variants.map((v) => v.id));
  const orderGroups = variantIds.length ? await prisma.premiumOrder.groupBy({ by: ["variantId"], where: { variantId: { in: variantIds } }, _count: { _all: true } }) : [];
  const orderCountByVariant = new Map(orderGroups.map((g) => [g.variantId, g._count._all]));
  const dtos: PanelProductDTO[] = products.map((p) => ({
    id: p.id, name: p.name, slug: p.slug, categoryId: p.categoryId, categoryName: p.category.name,
    tagline: p.tagline, description: p.description, customFields: p.customFields, images: productImages(p.images, p.imageUrl), buyNote: p.buyNote, warrantyInfo: p.warrantyInfo,
    usageGuide: p.usageGuide, active: p.active, sort: p.sort,
    orderCount: p.variants.reduce((sum, v) => sum + (orderCountByVariant.get(v.id) || 0), 0),
    variants: p.variants.map((v) => ({ id: v.id, name: v.name, price: v.price, warrantyDays: v.warrantyDays, active: v.active, sort: v.sort })),
  }));
  return (
    <div>
      <PageHead title="Sản phẩm & Gói" desc="Sản phẩm Premium bạn tự bán tại website." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <PanelProductsClient products={dtos} categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  );
}
