import { prisma } from "./db";
import { adminProductPageSize } from "./settings";
import { getTelegramProvider, TELEGRAM_GROUPS } from "./tg";
import type { PremiumVariant, Provider } from "@prisma/client";

/** FIX8 TASK 4 — Admin họ Telegram/Steam theo đúng cấu trúc nhà cung cấp FZR.
 *  Dữ liệu vẫn nằm trong catalog Premium chung (PremiumProduct/PremiumVariant
 *  với providerGroup telegram_stars / telegram_premium / steam_topup /
 *  steam_gift) — KHÔNG bảng song song: trang khách và đồng bộ FZR đọc cùng
 *  những dòng này.
 *
 *  Quyền sở hữu khi đồng bộ (fzr-sync):
 *  - Gói do đồng bộ tạo: giá bị ghi đè mỗi đợt sync khi nhà cung cấp bật
 *    autoUpdatePrice; tên bị ghi đè khi bật syncContent; gói bị tắt sẽ được
 *    sync bật lại nếu FZR còn bán, gói biến mất phía FZR bị sync tắt.
 *  - Gói ADMIN TỰ THÊM mang dấu deliveryType = "CUSTOM": sync không ghi đè
 *    giá và không tắt trong đợt quét dọn (xem fzr-sync) — admin toàn quyền. */
export const ADMIN_VARIANT_MARK = "CUSTOM";

export type FamilyVariant = PremiumVariant & {
  product: { id: number; name: string; slug: string; imageUrl: string | null; active: boolean; providerId: number | null; providerProductId: string | null };
};

const PRODUCT_SELECT = { id: true, name: true, slug: true, imageUrl: true, active: true, providerId: true, providerProductId: true } as const;

export async function loadTelegramFamilies(): Promise<{
  provider: Provider | null;
  stars: FamilyVariant | null;
  starsPackages: FamilyVariant[];
  premium: FamilyVariant[];
}> {
  const provider = await getTelegramProvider();
  const variants = (await prisma.premiumVariant.findMany({
    where: {
      providerGroup: { in: TELEGRAM_GROUPS },
      ...(provider ? { providerId: provider.id } : {}),
    },
    include: { product: { select: PRODUCT_SELECT } },
    orderBy: [{ providerGroup: "asc" }, { price: "asc" }],
  })) as FamilyVariant[];
  const starsAll = variants.filter((v) => v.providerGroup === "telegram_stars");
  const stars = starsAll.find((v) => v.providerItemId === "stars") || null;
  // Gói sao theo số lượng (itemId là số sao) — danh sách trang khách cho chọn,
  // admin thêm/sửa/xoá/bật tắt tại trang Sản phẩm Telegram.
  const starsPackages = starsAll
    .filter((v) => /^\d+$/.test(v.providerItemId || ""))
    .sort((a, b) => parseInt(a.providerItemId || "0") - parseInt(b.providerItemId || "0"));
  const premium = variants
    .filter((v) => v.providerGroup === "telegram_premium")
    .sort((a, b) => (a.providerCycle ?? parseInt(a.providerItemId || "0") ?? 0) - (b.providerCycle ?? parseInt(b.providerItemId || "0") ?? 0));
  return { provider, stars, starsPackages, premium };
}

export async function loadSteamFamilies(): Promise<{
  providers: Provider[];
  topup: FamilyVariant[];
  giftGroups: { product: FamilyVariant["product"]; variants: FamilyVariant[] }[];
}> {
  const variants = (await prisma.premiumVariant.findMany({
    where: { providerGroup: { in: ["steam_topup", "steam_gift"] } },
    include: { product: { select: PRODUCT_SELECT } },
    orderBy: [{ providerGroup: "asc" }, { price: "asc" }],
  })) as FamilyVariant[];
  const topup = variants
    .filter((v) => v.providerGroup === "steam_topup")
    .sort((a, b) => (parseFloat(a.providerItemId || "0") || 0) - (parseFloat(b.providerItemId || "0") || 0));
  const giftGroups: { product: FamilyVariant["product"]; variants: FamilyVariant[] }[] = [];
  for (const v of variants.filter((x) => x.providerGroup === "steam_gift")) {
    let g = giftGroups.find((x) => x.product.id === v.product.id);
    if (!g) { g = { product: v.product, variants: [] }; giftGroups.push(g); }
    g.variants.push(v);
  }
  const providerIds = Array.from(new Set(variants.map((v) => v.providerId).filter((x): x is number => !!x)));
  const providers = providerIds.length
    ? await prisma.provider.findMany({ where: { id: { in: providerIds } }, orderBy: { id: "asc" } })
    : await prisma.provider.findMany({ where: { driver: "FZR", active: true }, orderBy: { id: "asc" }, take: 1 });
  return { providers, topup, giftGroups };
}

export type GameKeyProduct = FamilyVariant["product"] & {
  providerPlatform: string | null;
  providerRegion: string | null;
  providerProductId: string | null;
  providerAppId: number | null;
  providerRegionRestricted: boolean | null;
};

/** Họ Game Key (FIX10, theo OpenAPI FZR): 1 game = 1 sản phẩm (provider
 *  ProductId = game_id; platform/region là dữ liệu thật từ API lưu ở cột
 *  providerPlatform/providerRegion), editions = các variant gamekeys
 *  (providerItemId = key_id, providerStock = tồn kho phía FZR).
 *  Catalog phía FZR tới hàng nghìn game nên trang admin PHÂN TRANG phía
 *  máy chủ theo SẢN PHẨM (count + skip/take ở tầng DB, tìm theo tên game
 *  qua `q`) — editions của các game trong trang nạp kèm theo. */
export async function loadGameKeyFamilies(opts?: { q?: string; page?: number; pageSize?: number }): Promise<{
  providers: Provider[];
  groups: { product: GameKeyProduct; variants: FamilyVariant[] }[];
  total: number;
  page: number;
  pages: number;
  platformOptions: string[];
  regionOptions: string[];
}> {
  const pageSize = opts?.pageSize ?? (await adminProductPageSize());
  const q = (opts?.q || "").trim();
  const productWhere: any = {
    variants: { some: { providerGroup: "gamekeys" } },
    ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
  };
  const total = await prisma.premiumProduct.count({ where: productWhere });
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pages, Math.max(1, opts?.page || 1));
  const productRows = (await prisma.premiumProduct.findMany({
    where: productWhere,
    orderBy: { name: "asc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: { id: true, name: true, slug: true, imageUrl: true, active: true, providerPlatform: true, providerRegion: true, providerProductId: true, providerAppId: true, providerRegionRestricted: true },
  })) as GameKeyProduct[];
  const variants = productRows.length
    ? ((await prisma.premiumVariant.findMany({
        where: { providerGroup: "gamekeys", productId: { in: productRows.map((p) => p.id) } },
        include: { product: { select: PRODUCT_SELECT } },
        orderBy: [{ price: "asc" }],
      })) as FamilyVariant[])
    : [];
  const groups = productRows.map((product) => ({
    product,
    variants: variants.filter((v) => v.product.id === product.id),
  }));
  const provRows = await prisma.premiumVariant.findMany({
    where: { providerGroup: "gamekeys", providerId: { not: null } },
    distinct: ["providerId"],
    select: { providerId: true },
  });
  const providerIds = provRows.map((r) => r.providerId).filter((x): x is number => !!x);
  const providers = providerIds.length
    ? await prisma.provider.findMany({ where: { id: { in: providerIds } }, orderBy: { id: "asc" } })
    : await prisma.provider.findMany({ where: { driver: "FZR", active: true }, orderBy: { id: "asc" }, take: 1 });
  // Giá trị platform/region ĐANG có trong kho — gợi ý cho ô nhập ở form
  // thêm/sửa game (admin chọn giá trị cũ hoặc gõ giá trị MỚI đều được; bộ
  // lọc phía khách lấy từ chính các giá trị đã lưu này).
  const [platformRows, regionRows] = await Promise.all([
    prisma.premiumProduct.findMany({ where: { variants: { some: { providerGroup: "gamekeys" } }, providerPlatform: { not: null } }, distinct: ["providerPlatform"], select: { providerPlatform: true }, orderBy: { providerPlatform: "asc" } }),
    prisma.premiumProduct.findMany({ where: { variants: { some: { providerGroup: "gamekeys" } }, providerRegion: { not: null } }, distinct: ["providerRegion"], select: { providerRegion: true }, orderBy: { providerRegion: "asc" } }),
  ]);
  return {
    providers, groups, total, page, pages,
    platformOptions: platformRows.map((r) => r.providerPlatform!).filter(Boolean),
    regionOptions: regionRows.map((r) => r.providerRegion!).filter(Boolean),
  };
}

/** Nhà cung cấp dùng khi admin THÊM game/edition Game Key: ưu tiên nhà cung
 *  cấp đã có gói gamekeys, sau đó tới nhà cung cấp FZR đang bật đầu tiên. */
export async function gameKeyAddProvider(): Promise<Provider | null> {
  const withGk = await prisma.premiumVariant.findFirst({
    where: { providerGroup: "gamekeys", providerId: { not: null } },
    select: { providerId: true },
    orderBy: { id: "asc" },
  });
  if (withGk?.providerId) {
    const p = await prisma.provider.findUnique({ where: { id: withGk.providerId } });
    if (p) return p;
  }
  return prisma.provider.findFirst({ where: { driver: "FZR", active: true }, orderBy: { id: "asc" } });
}

export type GiftCardProduct = FamilyVariant["product"] & {
  providerProductId: string | null;
  description: string | null;
};

/** Họ Gift Card (theo OpenAPI FZR, đọc lại 2026-11-08): 1 category = 1 sản
 *  phẩm (providerProductId = category_id; note của NCC lưu ở description),
 *  mệnh giá = các variant giftcards (providerItemId = card_id, providerStock
 *  = tồn kho phía FZR tại lần đồng bộ gần nhất). Trang admin PHÂN TRANG phía
 *  máy chủ theo SẢN PHẨM như họ Game Key (tìm theo tên danh mục qua `q`). */
export async function loadGiftCardFamilies(opts?: { q?: string; page?: number; pageSize?: number }): Promise<{
  providers: Provider[];
  groups: { product: GiftCardProduct; variants: FamilyVariant[] }[];
  total: number;
  page: number;
  pages: number;
}> {
  const pageSize = opts?.pageSize ?? (await adminProductPageSize());
  const q = (opts?.q || "").trim();
  const productWhere: any = {
    variants: { some: { providerGroup: "giftcards" } },
    ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
  };
  const total = await prisma.premiumProduct.count({ where: productWhere });
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pages, Math.max(1, opts?.page || 1));
  const productRows = (await prisma.premiumProduct.findMany({
    where: productWhere,
    orderBy: { name: "asc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: { id: true, name: true, slug: true, imageUrl: true, active: true, providerProductId: true, description: true },
  })) as GiftCardProduct[];
  const variants = productRows.length
    ? ((await prisma.premiumVariant.findMany({
        where: { providerGroup: "giftcards", productId: { in: productRows.map((p) => p.id) } },
        include: { product: { select: PRODUCT_SELECT } },
        orderBy: [{ price: "asc" }],
      })) as FamilyVariant[])
    : [];
  const groups = productRows.map((product) => ({
    product,
    variants: variants.filter((v) => v.product.id === product.id),
  }));
  const provRows = await prisma.premiumVariant.findMany({
    where: { providerGroup: "giftcards", providerId: { not: null } },
    distinct: ["providerId"],
    select: { providerId: true },
  });
  const providerIds = provRows.map((r) => r.providerId).filter((x): x is number => !!x);
  const providers = providerIds.length
    ? await prisma.provider.findMany({ where: { id: { in: providerIds } }, orderBy: { id: "asc" } })
    : await prisma.provider.findMany({ where: { driver: "FZR", active: true }, orderBy: { id: "asc" }, take: 1 });
  return { providers, groups, total, page, pages };
}

/** Nhà cung cấp dùng khi admin THÊM category/mệnh giá Gift Card: ưu tiên nhà
 *  cung cấp đã có gói giftcards, sau đó tới nhà cung cấp FZR đang bật đầu tiên. */
export async function giftCardAddProvider(): Promise<Provider | null> {
  const withGc = await prisma.premiumVariant.findFirst({
    where: { providerGroup: "giftcards", providerId: { not: null } },
    select: { providerId: true },
    orderBy: { id: "asc" },
  });
  if (withGc?.providerId) {
    const p = await prisma.provider.findUnique({ where: { id: withGc.providerId } });
    if (p) return p;
  }
  return prisma.provider.findFirst({ where: { driver: "FZR", active: true }, orderBy: { id: "asc" } });
}

export type TopupProduct = FamilyVariant["product"] & {
  providerProductId: string | null;
  description: string | null;
  customFields: string | null;
};

/** Họ Top-Up (theo OpenAPI FZR, đọc lại 2026-11-08): 1 category = 1 sản
 *  phẩm (providerProductId = category_id; note của NCC lưu ở description),
 *  gói nạp = các variant topups (providerItemId = offer_id). customFields
 *  của sản phẩm mang fields[] của category (key khoá cứng + nhãn admin đặt)
 *  để trang admin sửa nhãn. Phân trang phía máy chủ theo SẢN PHẨM như các
 *  họ khác (10/trang, tìm theo tên category qua `q`). */
export async function loadTopupFamilies(opts?: { q?: string; page?: number; pageSize?: number }): Promise<{
  providers: Provider[];
  groups: { product: TopupProduct; variants: FamilyVariant[] }[];
  total: number;
  page: number;
  pages: number;
}> {
  const pageSize = opts?.pageSize ?? (await adminProductPageSize());
  const q = (opts?.q || "").trim();
  const productWhere: any = {
    variants: { some: { providerGroup: "topups" } },
    ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
  };
  const total = await prisma.premiumProduct.count({ where: productWhere });
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pages, Math.max(1, opts?.page || 1));
  const productRows = (await prisma.premiumProduct.findMany({
    where: productWhere,
    orderBy: { name: "asc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: { id: true, name: true, slug: true, imageUrl: true, active: true, providerProductId: true, description: true, customFields: true },
  })) as TopupProduct[];
  const variants = productRows.length
    ? ((await prisma.premiumVariant.findMany({
        where: { providerGroup: "topups", productId: { in: productRows.map((p) => p.id) } },
        include: { product: { select: PRODUCT_SELECT } },
        orderBy: [{ price: "asc" }],
      })) as FamilyVariant[])
    : [];
  const groups = productRows.map((product) => ({
    product,
    variants: variants.filter((v) => v.product.id === product.id),
  }));
  const provRows = await prisma.premiumVariant.findMany({
    where: { providerGroup: "topups", providerId: { not: null } },
    distinct: ["providerId"],
    select: { providerId: true },
  });
  const providerIds = provRows.map((r) => r.providerId).filter((x): x is number => !!x);
  const providers = providerIds.length
    ? await prisma.provider.findMany({ where: { id: { in: providerIds } }, orderBy: { id: "asc" } })
    : await prisma.provider.findMany({ where: { driver: "FZR", active: true }, orderBy: { id: "asc" }, take: 1 });
  return { providers, groups, total, page, pages };
}

/** Nhà cung cấp dùng khi admin THÊM category/gói Top-Up: ưu tiên nhà cung
 *  cấp đã có gói topups, sau đó tới nhà cung cấp FZR đang bật đầu tiên. */
export async function topupAddProvider(): Promise<Provider | null> {
  const withTp = await prisma.premiumVariant.findFirst({
    where: { providerGroup: "topups", providerId: { not: null } },
    select: { providerId: true },
    orderBy: { id: "asc" },
  });
  if (withTp?.providerId) {
    const p = await prisma.provider.findUnique({ where: { id: withTp.providerId } });
    if (p) return p;
  }
  return prisma.provider.findFirst({ where: { driver: "FZR", active: true }, orderBy: { id: "asc" } });
}

export type ManualProduct = FamilyVariant["product"] & {
  providerProductId: string | null;
  providerKind: string | null;
  description: string | null;
  customFields: string | null;
};

/** Khu Manual Services trong admin: 1 category FZR = 1 sản phẩm
 *  (providerProductId = manual_service_id), offer = variant; kind của
 *  category (providerKind) + info (description) + fields[] replenishment
 *  đều là dữ liệu thật phía FZR khi đồng bộ. Phân trang 10/trang như các
 *  trang sản phẩm admin khác. */
export async function loadManualFamilies(opts?: { q?: string; page?: number; pageSize?: number }): Promise<{
  providers: Provider[];
  groups: { product: ManualProduct; variants: FamilyVariant[] }[];
  total: number;
  page: number;
  pages: number;
}> {
  const pageSize = opts?.pageSize ?? (await adminProductPageSize());
  const q = (opts?.q || "").trim();
  const productWhere: any = {
    variants: { some: { providerGroup: "manual" } },
    ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
  };
  const total = await prisma.premiumProduct.count({ where: productWhere });
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pages, Math.max(1, opts?.page || 1));
  const productRows = (await prisma.premiumProduct.findMany({
    where: productWhere,
    orderBy: { name: "asc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: { id: true, name: true, slug: true, imageUrl: true, active: true, providerProductId: true, providerKind: true, description: true, customFields: true },
  })) as ManualProduct[];
  const variants = productRows.length
    ? ((await prisma.premiumVariant.findMany({
        where: { providerGroup: "manual", productId: { in: productRows.map((p) => p.id) } },
        include: { product: { select: PRODUCT_SELECT } },
        orderBy: [{ price: "asc" }],
      })) as FamilyVariant[])
    : [];
  const groups = productRows.map((product) => ({
    product,
    variants: variants.filter((v) => v.product.id === product.id),
  }));
  const provRows = await prisma.premiumVariant.findMany({
    where: { providerGroup: "manual", providerId: { not: null } },
    distinct: ["providerId"],
    select: { providerId: true },
  });
  const providerIds = provRows.map((r) => r.providerId).filter((x): x is number => !!x);
  const providers = providerIds.length
    ? await prisma.provider.findMany({ where: { id: { in: providerIds } }, orderBy: { id: "asc" } })
    : await prisma.provider.findMany({ where: { driver: "FZR", active: true }, orderBy: { id: "asc" }, take: 1 });
  return { providers, groups, total, page, pages };
}

/** Nhà cung cấp dùng khi admin THÊM dịch vụ Manual: ưu tiên nhà cung cấp
 *  đã có gói manual, sau đó tới nhà cung cấp FZR đang bật đầu tiên. */
export async function manualAddProvider(): Promise<Provider | null> {
  const withMs = await prisma.premiumVariant.findFirst({
    where: { providerGroup: "manual", providerId: { not: null } },
    select: { providerId: true },
    orderBy: { id: "asc" },
  });
  if (withMs?.providerId) {
    const p = await prisma.provider.findUnique({ where: { id: withMs.providerId } });
    if (p) return p;
  }
  return prisma.provider.findFirst({ where: { driver: "FZR", active: true }, orderBy: { id: "asc" } });
}

/** Nhà cung cấp dùng khi admin THÊM gói Steam: ưu tiên nhà cung cấp đã có gói
 *  steam_topup, sau đó tới nhà cung cấp FZR đang bật đầu tiên. */
export async function steamAddProvider(): Promise<Provider | null> {
  const withTopup = await prisma.premiumVariant.findFirst({
    where: { providerGroup: "steam_topup", providerId: { not: null } },
    select: { providerId: true },
    orderBy: { id: "asc" },
  });
  if (withTopup?.providerId) {
    const p = await prisma.provider.findUnique({ where: { id: withTopup.providerId } });
    if (p) return p;
  }
  return prisma.provider.findFirst({ where: { driver: "FZR", active: true }, orderBy: { id: "asc" } });
}
