"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { getTelegramProvider } from "@/lib/tg";
import { ADMIN_VARIANT_MARK, steamAddProvider, gameKeyAddProvider, giftCardAddProvider } from "@/lib/families";
import { FZR_LABELS, fzrGameKeys, fzrGameKeyKeys, fzrGiftCards, fzrGiftCardCards, fzrSteamGiftGames, fzrTelegramPremiumPlans } from "@/lib/fzr";
import { syncFzrCatalog } from "@/lib/fzr-sync";
import { fzrMarkupKey, fzrMarkupResolver } from "@/lib/fzr-markup";
import { setSetting } from "@/lib/settings";
import type { Provider } from "@prisma/client";

/** FIX8 TASK 4 — Actions cho admin họ Telegram/Steam (/admin/telegram/san-pham,
 *  /admin/steam/san-pham). Mọi thao tác ghi thẳng vào PremiumVariant /
 *  PremiumProduct / Provider của catalog chung — đúng những dòng trang khách
 *  đọc và đơn hàng tính tiền. Gói admin tự thêm mang dấu deliveryType=CUSTOM
 *  để đồng bộ FZR không ghi đè giá / không tắt (xem lib/families). */

function back(returnTo: string, ok: boolean, text: string): never {
  const rt = returnTo.startsWith("/admin/") ? returnTo : "/admin";
  // returnTo có thể đã mang query (vd ?tab=premium của trang Telegram) —
  // nối msg/err bằng "&" khi đã có "?", tránh nuốt mất tham số cũ.
  redirect(`${rt}${rt.includes("?") ? "&" : "?"}${ok ? "msg" : "err"}=${encodeURIComponent(text)}`);
}
const rt = (fd: FormData) => String(fd.get("returnTo") || "");
const money = (v: FormDataEntryValue | null) => Math.max(0, Math.floor(Number(String(v || "0").replace(/[^\d]/g, "")) || 0));

/** Sửa tên + giá bán của một gói (giá này là giá trang khách tính tiền, trừ
 *  Stars/Gift vốn chốt theo báo giá FZR — markup nằm ở thẻ nhà cung cấp). */
export async function famSaveVariant(fd: FormData) {
  await requireAdmin();
  const id = parseInt(String(fd.get("id") || "0"));
  const name = String(fd.get("name") || "").trim();
  const price = money(fd.get("price"));
  if (!id || !name) back(rt(fd), false, "Thiếu tên gói hoặc gói không hợp lệ");
  await prisma.premiumVariant.update({ where: { id }, data: { name, price } });
  back(rt(fd), true, "Đã lưu gói");
}

/** Bật/tắt bán một gói: tắt = active=false + outOfStock=true (chặn mua ngay
 *  cả khi đồng bộ bật lại active); bật = mở cả hai. */
export async function famToggleVariant(fd: FormData) {
  await requireAdmin();
  const id = parseInt(String(fd.get("id") || "0"));
  const on = String(fd.get("on") || "") === "1";
  if (!id) back(rt(fd), false, "Gói không hợp lệ");
  await prisma.premiumVariant.update({ where: { id }, data: { active: on, outOfStock: !on } });
  back(rt(fd), true, on ? "Đã bật bán gói" : "Đã tắt bán gói");
}

/* (Đã gỡ famSaveProviderPricing: markup CHUNG + tỉ giá của nhà cung cấp
 *  chỉ còn sửa trong form nhà cung cấp — Admin → Nhà cung cấp, action
 *  adminSaveProvider ghi Provider.exchangeRate + markupPercent. Các trang
 *  khu vực không còn thẻ nhà cung cấp; markup riêng của khu đi qua
 *  famSaveAreaMarkup.) */

async function categoryId(name: string, providerId: number): Promise<number> {
  const found = await prisma.premiumCategory.findFirst({ where: { name } });
  if (found) return found.id;
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${providerId}`;
  const created = await prisma.premiumCategory.create({ data: { name, slug } });
  return created.id;
}

const TELEGRAM_FIELDS = JSON.stringify([
  { label: FZR_LABELS.telegramId, type: "text", required: false, placeholder: "ID số của tài khoản Telegram (không bắt buộc)" },
  { label: "Tên người dùng Telegram", type: "text", required: true, placeholder: "@username của tài khoản nhận" },
]);

/** Sản phẩm tổng hợp Telegram Premium của nhà cung cấp (tạo vỏ đúng hình
 *  đồng bộ FZR tạo nếu chưa có). */
async function telegramPremiumProduct(provider: Provider) {
  const existing = await prisma.premiumProduct.findFirst({ where: { providerId: provider.id, providerProductId: "telegram-premium" } });
  if (existing) return existing;
  const viaVariant = await prisma.premiumVariant.findFirst({
    where: { providerId: provider.id, providerGroup: "telegram_premium" },
    select: { productId: true },
  });
  if (viaVariant) {
    const p = await prisma.premiumProduct.findUnique({ where: { id: viaVariant.productId } });
    if (p) return p;
  }
  return prisma.premiumProduct.create({
    data: {
      categoryId: await categoryId("Telegram", provider.id),
      name: "Telegram Premium",
      slug: `fzr-${provider.id}-telegram_premium-telegram-premium`.slice(0, 150),
      fulfillment: "API",
      providerId: provider.id,
      providerProductId: "telegram-premium",
      customFields: TELEGRAM_FIELDS,
    },
  });
}

async function steamTopupProduct(provider: Provider) {
  const existing = await prisma.premiumProduct.findFirst({ where: { providerId: provider.id, providerProductId: "steam-topup" } });
  if (existing) return existing;
  const viaVariant = await prisma.premiumVariant.findFirst({
    where: { providerId: provider.id, providerGroup: "steam_topup" },
    select: { productId: true },
  });
  if (viaVariant) {
    const p = await prisma.premiumProduct.findUnique({ where: { id: viaVariant.productId } });
    if (p) return p;
  }
  return prisma.premiumProduct.create({
    data: {
      categoryId: await categoryId("Steam", provider.id),
      name: "Nạp Steam Wallet (USD)",
      slug: `fzr-${provider.id}-steam_topup-steam-topup`.slice(0, 150),
      fulfillment: "API",
      providerId: provider.id,
      providerProductId: "steam-topup",
      customFields: JSON.stringify([{ label: FZR_LABELS.steamLogin, type: "text", required: true, placeholder: "Tên đăng nhập Steam" }]),
    },
  });
}

/** Sản phẩm tổng hợp Telegram Stars của nhà cung cấp (tạo vỏ đúng hình đồng bộ
 *  FZR tạo nếu chưa có) — nơi chứa gói đơn vị và các gói sao theo số lượng. */
async function telegramStarsProduct(provider: Provider) {
  const existing = await prisma.premiumProduct.findFirst({ where: { providerId: provider.id, providerProductId: "telegram-stars" } });
  if (existing) return existing;
  const viaVariant = await prisma.premiumVariant.findFirst({
    where: { providerId: provider.id, providerGroup: "telegram_stars" },
    select: { productId: true },
  });
  if (viaVariant) {
    const p = await prisma.premiumProduct.findUnique({ where: { id: viaVariant.productId } });
    if (p) return p;
  }
  return prisma.premiumProduct.create({
    data: {
      categoryId: await categoryId("Telegram", provider.id),
      name: "Telegram Stars",
      slug: `fzr-${provider.id}-telegram_stars-telegram-stars`.slice(0, 150),
      fulfillment: "API",
      providerId: provider.id,
      providerProductId: "telegram-stars",
      customFields: TELEGRAM_FIELDS,
    },
  });
}

/** Thêm GÓI SAO Telegram theo số lượng (vd 777 sao) — gói tự thêm (dấu CUSTOM,
 *  sync không đụng), hiện ngay trong lưới gói của trang đặt đơn. Giá gói là
 *  giá HIỂN THỊ (trống = tự tính theo giá mỗi sao hiện tại x số sao); giá
 *  tính tiền thật vẫn chốt theo báo giá FZR tại lúc mua như mọi đơn sao. */
export async function famAddStarPackage(fd: FormData) {
  await requireAdmin();
  const amount = parseInt(String(fd.get("amount") || "0"));
  const name = String(fd.get("name") || "").trim() || (amount > 0 ? `${amount} sao` : "");
  const priceIn = money(fd.get("price"));
  const provider = await getTelegramProvider();
  if (!provider) back(rt(fd), false, "Chưa cấu hình nhà cung cấp FZR cho Telegram (Admin → Telegram → Cài đặt)");
  if (!(amount >= 1 && amount <= 10000000)) back(rt(fd), false, "Số sao phải từ 1 đến 10.000.000");
  const product = await telegramStarsProduct(provider!);
  const dup = await prisma.premiumVariant.findFirst({
    where: { productId: product.id, providerGroup: "telegram_stars", providerItemId: String(amount) },
    select: { id: true },
  });
  if (dup) back(rt(fd), false, `Đã có gói ${amount} sao — hãy sửa gói đó`);
  let price = priceIn;
  if (price <= 0) {
    const unit = await prisma.premiumVariant.findFirst({
      where: { productId: product.id, providerGroup: "telegram_stars", providerItemId: "stars" },
      select: { price: true },
    });
    if (!unit) back(rt(fd), false, "Chưa có gói Stars đơn vị — hãy đồng bộ catalog FZR trước, hoặc nhập giá hiển thị cho gói");
    price = unit!.price * amount;
  }
  await prisma.premiumVariant.create({
    data: {
      productId: product.id, name, price, cost: 0, warrantyDays: 0,
      providerId: provider!.id, providerGroup: "telegram_stars",
      providerItemId: String(amount),
      deliveryType: ADMIN_VARIANT_MARK,
    },
  });
  back(rt(fd), true, `Đã thêm gói ${amount} sao`);
}

/** Xoá hẳn một gói (trang họ Telegram/Steam). Chặn xoá gói ĐƠN VỊ Stars
 *  (neo thực thi của mọi đơn sao) và gói đã phát sinh đơn/kho — các gói đó
 *  chỉ tắt bán được. Gói do đồng bộ tạo có thể được đồng bộ tạo lại ở đợt
 *  sync sau; gói tự thêm (CUSTOM) xoá là mất hẳn. */
export async function famDeleteVariant(fd: FormData) {
  await requireAdmin();
  const id = parseInt(String(fd.get("id") || "0"));
  if (!id) back(rt(fd), false, "Gói không hợp lệ");
  const v = await prisma.premiumVariant.findUnique({ where: { id }, select: { name: true, providerGroup: true, providerItemId: true } });
  if (!v) back(rt(fd), false, "Gói không tồn tại");
  if (v!.providerGroup === "telegram_stars" && v!.providerItemId === "stars")
    back(rt(fd), false, "Không xoá được gói Stars đơn vị — đây là gói thực thi của mọi đơn sao, chỉ tắt bán được");
  const used = await prisma.premiumOrder.count({ where: { variantId: id } });
  if (used > 0) back(rt(fd), false, `Gói "${v!.name}" đã có ${used} đơn hàng — chỉ tắt bán được, không xoá được`);
  const stocked = await prisma.premiumStock.count({ where: { variantId: id } }).catch(() => 0);
  if (stocked > 0) back(rt(fd), false, `Gói "${v!.name}" đang có ${stocked} mục trong kho — không xoá được`);
  await prisma.premiumVariant.delete({ where: { id } });
  back(rt(fd), true, `Đã xoá gói ${v!.name}`);
}

/** Thêm gói Premium Telegram (số tháng tự chọn) — gói tự thêm, sync không đụng. */
export async function famAddTelegramPlan(fd: FormData) {
  await requireAdmin();
  const months = parseInt(String(fd.get("months") || "0"));
  const name = String(fd.get("name") || "").trim() || (months > 0 ? `${months} tháng` : "");
  const price = money(fd.get("price"));
  const provider = await getTelegramProvider();
  if (!provider) back(rt(fd), false, "Chưa cấu hình nhà cung cấp FZR cho Telegram (Admin → Telegram → Cài đặt)");
  if (!(months >= 1 && months <= 36) || price <= 0) back(rt(fd), false, "Số tháng (1–36) và giá bán là bắt buộc");
  const product = await telegramPremiumProduct(provider!);
  const dup = await prisma.premiumVariant.findFirst({
    where: { productId: product.id, providerGroup: "telegram_premium", providerItemId: String(months) },
    select: { id: true },
  });
  if (dup) back(rt(fd), false, `Đã có gói ${months} tháng — hãy sửa giá của gói đó`);
  await prisma.premiumVariant.create({
    data: {
      productId: product.id, name, price, cost: 0, warrantyDays: 0,
      providerId: provider!.id, providerGroup: "telegram_premium",
      providerItemId: String(months), providerCycle: months,
      deliveryType: ADMIN_VARIANT_MARK,
    },
  });
  back(rt(fd), true, `Đã thêm gói Premium ${months} tháng`);
}

/** Thêm mệnh giá Top-Up Steam — gói tự thêm, sync không đụng. */
export async function famAddTopupDenom(fd: FormData) {
  await requireAdmin();
  const amount = parseInt(String(fd.get("amount") || "0"));
  const price = money(fd.get("price"));
  const provider = await steamAddProvider();
  if (!provider) back(rt(fd), false, "Chưa có nhà cung cấp FZR đang bật");
  if (!(amount > 0) || price <= 0) back(rt(fd), false, "Mệnh giá USD và giá bán là bắt buộc");
  const product = await steamTopupProduct(provider!);
  const dup = await prisma.premiumVariant.findFirst({
    where: { productId: product.id, providerGroup: "steam_topup", providerItemId: String(amount) },
    select: { id: true },
  });
  if (dup) back(rt(fd), false, `Đã có mệnh giá ${amount} USD — hãy sửa giá của gói đó`);
  await prisma.premiumVariant.create({
    data: {
      productId: product.id, name: `${amount} USD`, price, cost: 0, warrantyDays: 0,
      providerId: provider!.id, providerGroup: "steam_topup",
      providerItemId: String(amount),
      deliveryType: ADMIN_VARIANT_MARK,
    },
  });
  back(rt(fd), true, `Đã thêm mệnh giá ${amount} USD`);
}

/** Sửa tên + ảnh bìa của một game gift (appid nằm ở gói, không sửa ở đây). */
export async function famSaveGiftProduct(fd: FormData) {
  await requireAdmin();
  const productId = parseInt(String(fd.get("productId") || "0"));
  const name = String(fd.get("name") || "").trim();
  const imageUrl = String(fd.get("imageUrl") || "").trim();
  if (!productId || !name) back(rt(fd), false, "Thiếu tên game hoặc game không hợp lệ");
  await prisma.premiumProduct.update({ where: { id: productId }, data: { name, imageUrl: imageUrl || null } });
  back(rt(fd), true, "Đã lưu thông tin game");
}

/** Thêm game gift theo appid — tạo sản phẩm + gói "Bản gift" đúng hình đồng bộ. */
export async function famAddGiftGame(fd: FormData) {
  await requireAdmin();
  const appid = parseInt(String(fd.get("appid") || "0"));
  const name = String(fd.get("name") || "").trim();
  const imageUrl = String(fd.get("imageUrl") || "").trim();
  const price = money(fd.get("price"));
  const provider = await steamAddProvider();
  if (!provider) back(rt(fd), false, "Chưa có nhà cung cấp FZR đang bật");
  if (!(appid > 0) || !name) back(rt(fd), false, "App ID và tên game là bắt buộc");
  const dup = await prisma.premiumProduct.findFirst({
    where: { providerId: provider!.id, providerProductId: `app-${appid}` },
    select: { id: true },
  });
  if (dup) back(rt(fd), false, `Game appid ${appid} đã có trong danh sách`);
  const product = await prisma.premiumProduct.create({
    data: {
      categoryId: await categoryId("Steam Gift Games", provider!.id),
      name,
      slug: `fzr-${provider!.id}-steam_gift-app-${appid}`.slice(0, 150),
      imageUrl: imageUrl || null,
      fulfillment: "API",
      providerId: provider!.id,
      providerProductId: `app-${appid}`,
      customFields: JSON.stringify([{ label: FZR_LABELS.giftReceiver, type: "text", required: true, placeholder: "Tài khoản Steam nhận gift" }]),
    },
  });
  await prisma.premiumVariant.create({
    data: {
      productId: product.id, name: "Bản gift", price, cost: 0, warrantyDays: 0,
      providerId: provider!.id, providerGroup: "steam_gift",
      providerItemId: String(appid),
      deliveryType: ADMIN_VARIANT_MARK,
    },
  });
  back(rt(fd), true, `Đã thêm game ${name}`);
}

/** FIX10 — Thêm một EDITION (key) vào game Game Key đã có: variant gamekeys
 *  với providerItemId = key_id phía FZR, mang dấu CUSTOM để đồng bộ không
 *  ghi đè giá/tắt (đúng quy ước các họ khác). */
export async function famAddGameKeyEdition(fd: FormData) {
  await requireAdmin();
  const productId = parseInt(String(fd.get("productId") || "0"));
  const keyId = String(fd.get("keyId") || "").trim();
  const name = String(fd.get("name") || "").trim();
  const price = money(fd.get("price"));
  const product = productId ? await prisma.premiumProduct.findUnique({ where: { id: productId }, select: { id: true, providerId: true } }) : null;
  if (!product) back(rt(fd), false, "Game không hợp lệ");
  if (!keyId || !name) back(rt(fd), false, "Key ID và tên phiên bản là bắt buộc");
  const dup = await prisma.premiumVariant.findFirst({
    where: { productId: product!.id, providerGroup: "gamekeys", providerItemId: keyId },
    select: { id: true },
  });
  if (dup) back(rt(fd), false, `Key ID ${keyId} đã có trong game này`);
  await prisma.premiumVariant.create({
    data: {
      productId: product!.id, name, price, cost: 0, warrantyDays: 0,
      providerId: product!.providerId, providerGroup: "gamekeys",
      providerItemId: keyId,
      deliveryType: ADMIN_VARIANT_MARK,
    },
  });
  back(rt(fd), true, `Đã thêm phiên bản ${name}`);
}

/** FIX10 — Thêm GAME Game Key thủ công theo game_id phía FZR: tạo sản phẩm
 *  (providerProductId = game_id, platform/region admin điền từ dữ liệu FZR)
 *  + edition đầu tiên (dấu CUSTOM). */
export async function famAddGameKey(fd: FormData) {
  await requireAdmin();
  const gameId = String(fd.get("gameId") || "").trim();
  const name = String(fd.get("name") || "").trim();
  const platform = String(fd.get("platform") || "").trim();
  const region = String(fd.get("region") || "").trim();
  const imageUrl = String(fd.get("imageUrl") || "").trim();
  const keyId = String(fd.get("keyId") || "").trim();
  const editionName = String(fd.get("editionName") || "").trim() || name;
  const price = money(fd.get("price"));
  const provider = await gameKeyAddProvider();
  if (!provider) back(rt(fd), false, "Chưa có nhà cung cấp FZR đang bật");
  if (!gameId || !name || !keyId) back(rt(fd), false, "Game ID, tên game và Key ID phiên bản đầu là bắt buộc");
  const dup = await prisma.premiumProduct.findFirst({
    where: { providerId: provider!.id, providerProductId: gameId },
    select: { id: true },
  });
  if (dup) back(rt(fd), false, `Game ID ${gameId} đã có trong danh sách`);
  const slugify = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "game";
  const product = await prisma.premiumProduct.create({
    data: {
      categoryId: await categoryId("Game Keys", provider!.id),
      name,
      slug: `fzr-${provider!.id}-gamekeys-${slugify(gameId)}`.slice(0, 150),
      imageUrl: imageUrl || null,
      providerPlatform: platform || null,
      providerRegion: region || null,
      fulfillment: "API",
      providerId: provider!.id,
      providerProductId: gameId,
    },
  });
  await prisma.premiumVariant.create({
    data: {
      productId: product.id, name: editionName, price, cost: 0, warrantyDays: 0,
      providerId: provider!.id, providerGroup: "gamekeys",
      providerItemId: keyId,
      deliveryType: ADMIN_VARIANT_MARK,
    },
  });
  back(rt(fd), true, `Đã thêm game ${name}`);
}

/** Thêm một MỆNH GIÁ (offer) vào category Gift Card đã có: variant giftcards
 *  với providerItemId = card_id phía FZR, mang dấu CUSTOM để đồng bộ không
 *  ghi đè giá/tắt (đúng quy ước các họ khác). */
export async function famAddGiftCardDenomination(fd: FormData) {
  await requireAdmin();
  const productId = parseInt(String(fd.get("productId") || "0"));
  const cardId = String(fd.get("cardId") || "").trim();
  const name = String(fd.get("name") || "").trim();
  const price = money(fd.get("price"));
  const product = productId ? await prisma.premiumProduct.findUnique({ where: { id: productId }, select: { id: true, providerId: true } }) : null;
  if (!product) back(rt(fd), false, "Danh mục không hợp lệ");
  if (!cardId || !name) back(rt(fd), false, "Card ID và tên mệnh giá là bắt buộc");
  const dup = await prisma.premiumVariant.findFirst({
    where: { productId: product!.id, providerGroup: "giftcards", providerItemId: cardId },
    select: { id: true },
  });
  if (dup) back(rt(fd), false, `Card ID ${cardId} đã có trong danh mục này`);
  await prisma.premiumVariant.create({
    data: {
      productId: product!.id, name, price, cost: 0, warrantyDays: 0,
      providerId: product!.providerId, providerGroup: "giftcards",
      providerItemId: cardId,
      deliveryType: ADMIN_VARIANT_MARK,
    },
  });
  back(rt(fd), true, `Đã thêm mệnh giá ${name}`);
}

/** Thêm CATEGORY Gift Card thủ công theo category_id phía FZR: tạo sản phẩm
 *  (providerProductId = category_id) + mệnh giá đầu tiên (dấu CUSTOM). */
export async function famAddGiftCardCategory(fd: FormData) {
  await requireAdmin();
  const categoryIdFzr = String(fd.get("categoryId") || "").trim();
  const name = String(fd.get("name") || "").trim();
  const imageUrl = String(fd.get("imageUrl") || "").trim();
  const cardId = String(fd.get("cardId") || "").trim();
  const denomName = String(fd.get("denomName") || "").trim() || name;
  const price = money(fd.get("price"));
  const provider = await giftCardAddProvider();
  if (!provider) back(rt(fd), false, "Chưa có nhà cung cấp FZR đang bật");
  if (!categoryIdFzr || !name || !cardId) back(rt(fd), false, "Category ID, tên danh mục và Card ID mệnh giá đầu là bắt buộc");
  const dup = await prisma.premiumProduct.findFirst({
    where: { providerId: provider!.id, providerProductId: categoryIdFzr },
    select: { id: true },
  });
  if (dup) back(rt(fd), false, `Category ID ${categoryIdFzr} đã có trong danh sách`);
  const slugify = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "gift-card";
  const product = await prisma.premiumProduct.create({
    data: {
      categoryId: await categoryId("Gift Cards", provider!.id),
      name,
      slug: `fzr-${provider!.id}-giftcards-${slugify(categoryIdFzr)}`.slice(0, 150),
      imageUrl: imageUrl || null,
      fulfillment: "API",
      providerId: provider!.id,
      providerProductId: categoryIdFzr,
    },
  });
  await prisma.premiumVariant.create({
    data: {
      productId: product.id, name: denomName, price, cost: 0, warrantyDays: 0,
      providerId: provider!.id, providerGroup: "giftcards",
      providerItemId: cardId,
      deliveryType: ADMIN_VARIANT_MARK,
    },
  });
  back(rt(fd), true, `Đã thêm danh mục ${name}`);
}

/* ================= FIX11 TASK 3 — Đồng bộ + markup theo khu & picker ====
 * Mỗi trang sản phẩm của một khu FZR có nút đồng bộ RIÊNG chỉ chạm nhóm
 * của khu đó + ô markup % riêng của khu (Setting fzr_markup_<group>, xem
 * lib/fzr-markup) — và luồng THÊM sản phẩm chọn thẳng từ catalog thật của
 * nhà cung cấp (tìm kiếm hoặc dán mã để kiểm chứng) thay cho ô nhập mã tự
 * do, để không gói nào bị trói nhầm dịch vụ. */

/** Lưu markup % riêng của các nhóm trong khu (ô để trống = xoá override,
 *  quay về markup chung của nhà cung cấp). */
export async function famSaveAreaMarkup(fd: FormData) {
  await requireAdmin();
  const groups = String(fd.get("groups") || "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const g of groups) {
    const raw = String(fd.get(`markup_${g}`) || "").trim();
    if (!raw) {
      await prisma.setting.deleteMany({ where: { key: fzrMarkupKey(g) } });
    } else {
      const n = Math.max(0, Math.min(1000, parseInt(raw) || 0));
      await setSetting(fzrMarkupKey(g), String(n));
    }
  }
  back(rt(fd), true, "Đã lưu markup của khu");
}

/** Đồng bộ RIÊNG các nhóm của khu này từ nhà cung cấp FZR (markup hiệu lực
 *  = override của khu nếu có). Nhóm khác trong catalog không bị đụng. */
export async function famSyncArea(fd: FormData) {
  await requireAdmin();
  const providerId = parseInt(String(fd.get("providerId") || "0"));
  const groups = String(fd.get("groups") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const provider = providerId ? await prisma.provider.findUnique({ where: { id: providerId } }) : null;
  let okFlag = true;
  let msg: string;
  if (!provider || provider.driver !== "FZR" || !groups.length) {
    okFlag = false;
    msg = "Chưa có nhà cung cấp FZR cho khu này";
  } else {
    try {
      const markupFor = await fzrMarkupResolver(provider);
      const r = await syncFzrCatalog(provider, { groups, markupFor });
      msg = `Đồng bộ xong: tạo ${r.created} sản phẩm, cập nhật ${r.updated}, ${r.variants} gói, tắt ${r.deactivated} gói cũ`;
    } catch (e: any) {
      okFlag = false;
      msg = `Đồng bộ lỗi: ${String(e?.message || e).slice(0, 160)}`;
    }
  }
  back(rt(fd), okFlag, msg!);
}

type PickItem = { id: string; name: string; priceUsd: string | null; extra: string; extra2?: string };
type PickResult = { ok: boolean; items?: PickItem[]; item?: PickItem; error?: string; hasMore?: boolean; page?: number };

/** Số kết quả picker mỗi trang — picker lật trang THẬT qua catalog phía
 *  nhà cung cấp (cursor của gamekeys/giftcards, page của steam-gifts). */
const PICK_PAGE_SIZE = 20;

/** Nhà cung cấp dùng cho picker của một nhóm — cùng quy tắc chọn NCC như
 *  luồng thêm sản phẩm của khu đó. */
async function pickerProvider(group: string): Promise<Provider | null> {
  if (group === "gamekeys") return gameKeyAddProvider();
  if (group === "giftcards") return giftCardAddProvider();
  if (group === "steam_gift") return steamAddProvider();
  if (group === "telegram_premium") return getTelegramProvider();
  return null;
}

const asArr = (v: any): any[] => (Array.isArray(v) ? v : []);

/** Tìm trong catalog THẬT của nhà cung cấp, CHỈ trong nhóm của trang đang
 *  mở (lọc phía máy chủ theo nhóm — trang khác không lọt item sang được).
 *  Các list endpoint gamekeys/giftcards của FZR không có tham số tìm kiếm
 *  nên ta kéo lần lượt theo CURSOR rồi lọc theo tên tại đây; picker lật
 *  trang theo lô 20 kết quả khớp (đi tiếp cursor phía NCC cho tới khi đủ
 *  lô của trang yêu cầu hoặc hết catalog — tối đa 30 trang NCC mỗi lần
 *  gọi). steam-gifts có sẵn page + search phía NCC (mỗi trang NCC 100
 *  game, tối đa 5 trang mỗi lần gọi vì rate limit của endpoint này). */
export async function fzrPickSearch(group: string, query: string, pageRaw?: number): Promise<PickResult> {
  await requireAdmin();
  const provider = await pickerProvider(group);
  if (!provider) return { ok: false, error: "Chưa có nhà cung cấp FZR đang bật cho khu này" };
  const q = query.trim().toLowerCase();
  const page = Math.max(1, Math.floor(pageRaw || 1));
  const need = page * PICK_PAGE_SIZE + 1; // +1 để biết còn trang sau hay không
  const slicePage = (all: PickItem[]) => ({
    ok: true,
    items: all.slice((page - 1) * PICK_PAGE_SIZE, page * PICK_PAGE_SIZE),
    hasMore: all.length > page * PICK_PAGE_SIZE,
    page,
  });
  try {
    if (group === "gamekeys" || group === "giftcards") {
      const listFn = group === "gamekeys" ? fzrGameKeys : fzrGiftCards;
      const matches: PickItem[] = [];
      let cursor: string | undefined;
      for (let p = 0; p < 30 && matches.length < need; p++) {
        const raw: any = await listFn(provider, cursor);
        for (const g of asArr(raw?.items)) {
          const id = group === "gamekeys" ? (g?.game_id ?? g?.id) : (g?.category_id ?? g?.id);
          if (id === undefined || id === null) continue;
          const name = String(g?.name || id);
          if (q && !name.toLowerCase().includes(q)) continue;
          matches.push({
            id: String(id), name, priceUsd: null,
            extra: group === "gamekeys" ? String(g?.platform || "") : "",
            extra2: group === "gamekeys" ? String(g?.region || "") : "",
          });
          if (matches.length >= need) break;
        }
        const next = raw?.meta?.next_cursor;
        if (!raw?.meta?.has_more || !next) break;
        cursor = String(next);
      }
      return slicePage(matches);
    }
    if (group === "steam_gift") {
      const matches: PickItem[] = [];
      for (let p = 1; p <= 5 && matches.length < need; p++) {
        const raw: any = await fzrSteamGiftGames(provider, p, query || undefined);
        const games = asArr(raw?.games || raw?.data?.games || raw?.data || raw?.items);
        for (const g of games) {
          const appid = g?.appid ?? g?.app_id ?? g?.id;
          if (appid === undefined || appid === null) continue;
          const name = String(g?.name || `App ${appid}`);
          if (q && !name.toLowerCase().includes(q)) continue;
          matches.push({ id: String(appid), name, priceUsd: null, extra: `AppID ${appid}` });
          if (matches.length >= need) break;
        }
        if (games.length < 100) break; // trang NCC chưa đầy = đã hết catalog
      }
      return slicePage(matches);
    }
    if (group === "telegram_premium") {
      const plans = await fzrTelegramPremiumPlans(provider);
      return {
        ok: true,
        items: plans.map((p) => ({ id: String(p.durationMonths), name: `Premium ${p.durationMonths} tháng`, priceUsd: p.finalPrice || p.price, extra: "" })),
        hasMore: false,
        page: 1,
      };
    }
    return { ok: false, error: "Nhóm này không có catalog để chọn" };
  } catch (e: any) {
    return { ok: false, error: `Không gọi được nhà cung cấp: ${String(e?.message || e).slice(0, 140)}` };
  }
}

/** Các gói con (edition/offer) của một item đã chọn — cho bước chọn gói
 *  đầu tiên khi thêm sản phẩm Game Key / Gift Card. */
export async function fzrPickEditions(group: string, parentId: string): Promise<PickResult> {
  await requireAdmin();
  const provider = await pickerProvider(group);
  if (!provider) return { ok: false, error: "Chưa có nhà cung cấp FZR đang bật cho khu này" };
  try {
    if (group === "gamekeys") {
      const raw: any = await fzrGameKeyKeys(provider, parentId);
      return {
        ok: true,
        items: asArr(raw?.keys).map((k) => ({
          id: k?.key_id != null && k?.key_id !== "" ? String(k.key_id) : `name:${String(k?.name || "Key")}`,
          name: String(k?.name || "Key"),
          priceUsd: k?.price_usd != null ? String(k.price_usd) : (k?.price != null ? String(k.price) : null),
          extra: k?.stock != null ? `Tồn kho ${k.stock}` : "",
        })),
      };
    }
    if (group === "giftcards") {
      const raw: any = await fzrGiftCardCards(provider, parentId);
      return {
        ok: true,
        items: asArr(raw?.offers).map((k) => ({
          id: k?.card_id != null && k?.card_id !== "" ? String(k.card_id) : `name:${String(k?.name || "Card")}`,
          name: String(k?.name || "Card"),
          priceUsd: k?.price_usd != null ? String(k.price_usd) : null,
          extra: k?.stock != null ? `Tồn kho ${k.stock}` : "",
        })),
      };
    }
    return { ok: false, error: "Nhóm này không có gói con" };
  } catch (e: any) {
    return { ok: false, error: `Không gọi được nhà cung cấp: ${String(e?.message || e).slice(0, 140)}` };
  }
}

/** Kiểm chứng một mã do admin dán vào: tra đúng mã đó trong nhóm của trang
 *  phía nhà cung cấp — thấy thì trả item (để điền form), không thấy thì lỗi
 *  rõ ràng và KHÔNG lưu gì. */
export async function fzrPickLookup(group: string, idRaw: string): Promise<PickResult> {
  await requireAdmin();
  const provider = await pickerProvider(group);
  if (!provider) return { ok: false, error: "Chưa có nhà cung cấp FZR đang bật cho khu này" };
  const id = idRaw.trim();
  if (!id) return { ok: false, error: "Chưa nhập mã" };
  const notFound: PickResult = { ok: false, error: `Không tìm thấy mã "${id}" trong nhóm này phía nhà cung cấp` };
  try {
    if (group === "gamekeys") {
      let cursor: string | undefined;
      for (let page = 0; page < 10; page++) {
        const raw: any = await fzrGameKeys(provider, cursor);
        for (const g of asArr(raw?.items)) {
          if (String(g?.game_id ?? g?.id) === id) {
            return { ok: true, item: { id, name: String(g?.name || id), priceUsd: null, extra: String(g?.platform || ""), extra2: String(g?.region || "") } };
          }
        }
        const next = raw?.meta?.next_cursor;
        if (!raw?.meta?.has_more || !next) break;
        cursor = String(next);
      }
      return notFound;
    }
    if (group === "giftcards") {
      const raw: any = await fzrGiftCardCards(provider, id);
      if (raw && (raw.name || raw.offers)) return { ok: true, item: { id, name: String(raw.name || id), priceUsd: null, extra: "" } };
      return notFound;
    }
    if (group === "steam_gift") {
      for (let page = 1; page <= 3; page++) {
        const raw: any = await fzrSteamGiftGames(provider, page);
        const games = asArr(raw?.games || raw?.data?.games || raw?.data || raw?.items);
        for (const g of games) {
          if (String(g?.appid ?? g?.app_id ?? g?.id) === id) {
            return { ok: true, item: { id, name: String(g?.name || `App ${id}`), priceUsd: null, extra: `AppID ${id}` } };
          }
        }
        if (!games.length) break;
      }
      return notFound;
    }
    if (group === "telegram_premium") {
      const plans = await fzrTelegramPremiumPlans(provider);
      const p = plans.find((x) => String(x.durationMonths) === id);
      if (p) return { ok: true, item: { id, name: `Premium ${p.durationMonths} tháng`, priceUsd: p.finalPrice || p.price, extra: "" } };
      return notFound;
    }
    return { ok: false, error: "Nhóm này không hỗ trợ tra mã" };
  } catch {
    return notFound;
  }
}
