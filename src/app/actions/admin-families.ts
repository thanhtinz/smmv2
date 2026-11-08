"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { getTelegramProvider } from "@/lib/tg";
import { ADMIN_VARIANT_MARK, steamAddProvider } from "@/lib/families";
import { FZR_LABELS } from "@/lib/fzr";
import type { Provider } from "@prisma/client";

/** FIX8 TASK 4 — Actions cho admin họ Telegram/Steam (/admin/telegram/san-pham,
 *  /admin/steam/san-pham). Mọi thao tác ghi thẳng vào PremiumVariant /
 *  PremiumProduct / Provider của catalog chung — đúng những dòng trang khách
 *  đọc và đơn hàng tính tiền. Gói admin tự thêm mang dấu deliveryType=CUSTOM
 *  để đồng bộ FZR không ghi đè giá / không tắt (xem lib/families). */

function back(returnTo: string, ok: boolean, text: string): never {
  const rt = returnTo.startsWith("/admin/") ? returnTo : "/admin";
  redirect(`${rt}?${ok ? "msg" : "err"}=${encodeURIComponent(text)}`);
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

/** Tỉ giá + markup của nhà cung cấp FZR — đầu vào giá THẬT của Stars và
 *  Steam Gift (chốt tươi mỗi đơn) và của mọi đợt đồng bộ giá. */
export async function famSaveProviderPricing(fd: FormData) {
  await requireAdmin();
  const providerId = parseInt(String(fd.get("providerId") || "0"));
  const exchangeRate = parseInt(String(fd.get("exchangeRate") || "0"));
  const markupPercent = Math.max(0, Math.min(1000, parseInt(String(fd.get("markupPercent") || "0")) || 0));
  if (!providerId || !(exchangeRate > 0)) back(rt(fd), false, "Tỉ giá phải lớn hơn 0");
  await prisma.provider.update({ where: { id: providerId }, data: { exchangeRate, markupPercent } });
  back(rt(fd), true, "Đã lưu tỉ giá và markup nhà cung cấp");
}

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
