import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth";
import { PageHead, Flash } from "@/components/ui";
import { productImages } from "@/lib/format";
import { ProductsClient, type PremiumProductDTO } from "@/components/admin-premium";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

export default async function AdminPremiumProducts({ searchParams }: { searchParams: { q?: string; cat?: string; status?: string; msg?: string; err?: string } }) {
  await requireAdminPage();
  const { L, Ld } = await getServerI18n(null);
  const where: any = {};
  if (searchParams.q) where.OR = [{ name: { contains: searchParams.q, mode: "insensitive" } }, { slug: { contains: searchParams.q.toLowerCase(), mode: "insensitive" } }];
  if (searchParams.cat) where.categoryId = parseInt(searchParams.cat);
  if (searchParams.status === "on") where.active = true;
  if (searchParams.status === "off") where.active = false;
  const [products, categories, providers] = await Promise.all([
    prisma.premiumProduct.findMany({ where: { ...where, panelId: null }, orderBy: [{ sort: "asc" }, { id: "asc" }], include: { category: true, variants: { orderBy: [{ sort: "asc" }, { id: "asc" }] } } }),
    prisma.premiumCategory.findMany({ orderBy: [{ sort: "asc" }, { id: "asc" }], include: { _count: { select: { products: true } } } }),
    prisma.provider.findMany({ where: { kind: { in: ["PREMIUM", "BOTH"] } }, select: { id: true, name: true }, orderBy: { id: "asc" } }),
  ]);
  const variantIds = products.flatMap((p) => p.variants.map((v) => v.id));
  const orderGroups = variantIds.length ? await prisma.premiumOrder.groupBy({ by: ["variantId"], where: { variantId: { in: variantIds } }, _count: { _all: true } }) : [];
  const orderCountByVariant = new Map(orderGroups.map((g) => [g.variantId, g._count._all]));
  const stockGroups = variantIds.length ? await prisma.premiumStock.groupBy({ by: ["variantId", "status"], where: { variantId: { in: variantIds } }, _count: { _all: true } }) : [];
  const stockMap = new Map<number, { avail: number; total: number }>();
  for (const g of stockGroups) {
    const cur = stockMap.get(g.variantId) || { avail: 0, total: 0 };
    cur.total += g._count._all;
    if (g.status === "AVAILABLE") cur.avail += g._count._all;
    stockMap.set(g.variantId, cur);
  }
  const dtos: PremiumProductDTO[] = products.map((p) => ({
    id: p.id, categoryId: p.categoryId, categoryName: p.category.name, name: p.name, slug: p.slug, tagline: p.tagline, description: p.description,
    color: p.color, fulfillment: p.fulfillment, providerId: p.providerId, providerProductId: p.providerProductId, customFields: p.customFields,
    buyNote: p.buyNote, imageUrl: p.imageUrl, images: productImages(p.images, p.imageUrl), usageGuide: p.usageGuide, warrantyInfo: p.warrantyInfo,
    active: p.active, sort: p.sort, orderCount: p.variants.reduce((sum, v) => sum + (orderCountByVariant.get(v.id) || 0), 0),
    variants: p.variants.map((v) => ({ id: v.id, name: v.name, price: v.price, cost: v.cost, warrantyDays: v.warrantyDays, providerCycle: v.providerCycle, active: v.active, sort: v.sort, stockAvailable: stockMap.get(v.id)?.avail || 0, stockTotal: stockMap.get(v.id)?.total || 0 })),
  }));
  const catDtos = categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug, description: c.description, icon: c.icon, sort: c.sort, active: c.active, productCount: c._count.products }));
  return (
    <div>
      <PageHead title={L("Quản lý Sản phẩm Premium")} desc={L("Thêm, sửa, xóa sản phẩm và các gói thời hạn (1 tháng, 3 tháng, 1 năm...)")} />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <form method="get" className="card mb-4 flex flex-wrap items-center gap-3 p-4">
        <input name="q" defaultValue={searchParams.q || ""} className="inp min-w-[220px] flex-1" placeholder={L("Tìm theo tên sản phẩm hoặc slug...")} />
        <select name="cat" defaultValue={searchParams.cat || ""} className="inp !w-52">
          <option value="">{L("Tất cả danh mục")}</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select name="status" defaultValue={searchParams.status || ""} className="inp !w-44">
          <option value="">{L("Tất cả trạng thái")}</option>
          <option value="on">{L("Đang bán")}</option>
          <option value="off">{L("Tạm dừng")}</option>
        </select>
        <button className="btn-primary btn-sm !px-4 !py-2.5">{L("Tìm kiếm")}</button>
      </form>
      <ProductsClient products={dtos} categories={catDtos} providers={providers} />
    </div>
  );
}
