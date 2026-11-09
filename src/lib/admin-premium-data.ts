import { prisma } from "@/lib/db";
import { productImages } from "@/lib/format";
import type { PremiumProductDTO, PremiumCategoryDTO, PremiumProviderOpt } from "@/components/admin-premium";

/** Lắp dữ liệu cho editor sản phẩm Premium dùng chung (FIX7 E2/E3/E4): trang
 *  /admin/premium và các trang theo khu (Telegram, Steam) chỉ khác nhau ở
 *  `where` — DTO, số đơn, tồn kho AUTO_STOCK và danh mục/NCC y hệt nhau. */
export async function loadAdminPremiumData(where: any, pageOpts?: { skip?: number; take?: number }): Promise<{ products: PremiumProductDTO[]; categories: PremiumCategoryDTO[]; providers: PremiumProviderOpt[] }> {
  const [products, categories, providers] = await Promise.all([
    prisma.premiumProduct.findMany({ where: { ...where, panelId: null }, orderBy: [{ sort: "asc" }, { id: "asc" }], ...(pageOpts?.take !== undefined ? { skip: pageOpts.skip || 0, take: pageOpts.take } : {}), include: { category: true, variants: { orderBy: [{ sort: "asc" }, { id: "asc" }] } } }),
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
    metaTitle: p.metaTitle, metaDescription: p.metaDescription,
    active: p.active, sort: p.sort, orderCount: p.variants.reduce((sum, v) => sum + (orderCountByVariant.get(v.id) || 0), 0),
    variants: p.variants.map((v) => ({ id: v.id, name: v.name, price: v.price, cost: v.cost, warrantyDays: v.warrantyDays, providerCycle: v.providerCycle, providerId: v.providerId, providerGroup: v.providerGroup, providerItemId: v.providerItemId, deliveryType: v.deliveryType, outOfStock: v.outOfStock, stockQty: v.stockQty, active: v.active, sort: v.sort, stockAvailable: stockMap.get(v.id)?.avail || 0, stockTotal: stockMap.get(v.id)?.total || 0 })),
  }));
  const catDtos: PremiumCategoryDTO[] = categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug, description: c.description, icon: c.icon, sort: c.sort, active: c.active, productCount: c._count.products }));
  return { products: dtos, categories: catDtos, providers };
}

/** Điều kiện "thuộc khu" cho các trang sản phẩm theo nhóm NCC: có ít nhất một
 *  gói mang providerGroup thuộc khu, HOẶC slug chứa từ khoá khu (bắt các sản
 *  phẩm tổng hợp kiểu telegram-stars/steam-topup và sản phẩm admin tự đặt
 *  tên theo khu). Khi admin gõ tìm kiếm (q) thì tìm trên TOÀN catalog như
 *  trang Premium gốc — nhờ vậy sản phẩm vừa tạo từ trang khu hiện ngay để
 *  gán gói thuộc khu. */
export function scopedProductWhere(groups: string[], keyword: string, q?: string, cat?: string, status?: string): any {
  const where: any = {};
  if (q) {
    where.OR = [{ name: { contains: q, mode: "insensitive" } }, { slug: { contains: q.toLowerCase(), mode: "insensitive" } }];
  } else {
    where.OR = [
      { variants: { some: { providerGroup: { in: groups } } } },
      { slug: { contains: keyword, mode: "insensitive" } },
    ];
  }
  if (cat) where.categoryId = parseInt(cat);
  if (status === "on") where.active = true;
  if (status === "off") where.active = false;
  return where;
}
