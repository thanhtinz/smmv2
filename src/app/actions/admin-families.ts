"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { getTelegramProvider } from "@/lib/tg";
import { ADMIN_VARIANT_MARK, steamAddProvider, gameKeyAddProvider, giftCardAddProvider, topupAddProvider, manualAddProvider } from "@/lib/families";
import { FZR_LABELS, fzrGameKeys, fzrGameKeyKeys, fzrGiftCards, fzrGiftCardCards, fzrSteamGiftGames, fzrTelegramPremiumPlans, fzrTopups, fzrTopupOffers, normalizeTopupFields, fzrManualServices, fzrManualOffers, normalizeManualFields } from "@/lib/fzr";
import { syncFzrCatalog, withProviderOverride } from "@/lib/fzr-sync";
import { fzrMarkupResolver, fzrMarkupFor } from "@/lib/fzr-markup";
import { normalizePremiumFieldsJson, parsePremiumFields } from "@/lib/format";
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
/** Ô số lượng giới hạn mỗi đơn (min/max phía NCC): trống -> null (không
 *  giới hạn); số nguyên dương -> số đó; rác -> undefined (báo lỗi). */
const qtyField = (v: FormDataEntryValue | null): number | null | undefined => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = parseInt(s);
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

/** Sửa tên + giá bán của một gói (giá này là giá trang khách tính tiền, trừ
 *  Stars/Gift vốn chốt theo báo giá FZR — markup nằm ở thẻ nhà cung cấp).
 *  Các ô PHỤ theo nhóm chỉ gửi khi form của khu đó có (VariantRow):
 *  minQty/maxQty (Game Key + Gift Card — giới hạn số lượng mỗi đơn phía
 *  NCC, ô trống = bỏ giới hạn) và minutes/noteProduct (Manual — thời gian
 *  giao + ghi chú gói phía khách). */
export async function famSaveVariant(fd: FormData) {
  await requireAdmin();
  const id = parseInt(String(fd.get("id") || "0"));
  const name = String(fd.get("name") || "").trim();
  const price = money(fd.get("price"));
  if (!id || !name) back(rt(fd), false, "Thiếu tên gói hoặc gói không hợp lệ");
  const data: Record<string, unknown> = { name, price };
  const qtyOrNull = (v: FormDataEntryValue | null) => {
    const s = String(v ?? "").trim();
    if (!s) return null;
    const n = parseInt(s);
    return Number.isInteger(n) && n > 0 ? n : undefined; // undefined = không hợp lệ
  };
  if (fd.has("minQty") || fd.has("maxQty")) {
    const minQ = qtyOrNull(fd.get("minQty"));
    const maxQ = qtyOrNull(fd.get("maxQty"));
    if (minQ === undefined || maxQ === undefined) back(rt(fd), false, "Số lượng tối thiểu/tối đa phải là số nguyên dương hoặc để trống");
    if (minQ !== null && maxQ !== null && minQ > maxQ) back(rt(fd), false, "Số lượng tối thiểu không được lớn hơn tối đa");
    data.minOrderQty = minQ;
    data.maxOrderQty = maxQ;
  }
  if (fd.has("minutes")) {
    const s = String(fd.get("minutes") || "").trim();
    const n = s ? parseInt(s) : NaN;
    data.deliveryMinutes = s === "" ? null : (Number.isInteger(n) && n >= 0 ? n : undefined);
    if (data.deliveryMinutes === undefined) back(rt(fd), false, "Thời gian giao phải là số phút nguyên hoặc để trống");
  }
  if (fd.has("noteProduct")) {
    const s = String(fd.get("noteProduct") || "").trim();
    data.providerNote = s ? s.slice(0, 1000) : null;
  }
  await prisma.premiumVariant.update({ where: { id }, data });
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

/* (Mọi markup của FZR — markup chung + markup theo từng nhóm — chỉ còn
 *  sửa trong form nhà cung cấp: Admin → Nhà cung cấp, action
 *  adminSaveProvider ghi Provider.markupPercent + các Setting
 *  fzr_markup_<group>. Các trang khu vực không còn ô markup.) */

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

/** Sửa tên + ảnh bìa của một sản phẩm họ FZR (appid game gift nằm ở gói,
 *  không sửa ở đây). Các khu Gift Card / Top-Up / Manual gửi thêm ô "note"
 *  = mô tả phía NCC — admin sửa tay thì ghi dấu providerOverride để đồng
 *  bộ không đè lại. */
export async function famSaveGiftProduct(fd: FormData) {
  await requireAdmin();
  const productId = parseInt(String(fd.get("productId") || "0"));
  const name = String(fd.get("name") || "").trim();
  const imageUrl = String(fd.get("imageUrl") || "").trim();
  if (!productId || !name) back(rt(fd), false, "Thiếu tên game hoặc game không hợp lệ");
  const data: Record<string, unknown> = { name, imageUrl: imageUrl || null };
  if (fd.has("note")) {
    const note = String(fd.get("note") || "").trim().slice(0, 2000);
    const cur = await prisma.premiumProduct.findUnique({ where: { id: productId }, select: { providerOverride: true } });
    data.description = note || null;
    data.providerOverride = withProviderOverride(cur?.providerOverride, ["description"]);
  }
  await prisma.premiumProduct.update({ where: { id: productId }, data });
  back(rt(fd), true, "Đã lưu thông tin game");
}

/** Lưu đầu sản phẩm GAME KEY: tên + ảnh + NỀN TẢNG + VÙNG + AppID. Platform
 *  và region là ô nhập tự do (chọn từ giá trị đang có hoặc gõ MỚI — bộ lọc
 *  phía khách lấy từ chính các giá trị đã lưu này); mọi giá trị admin đặt
 *  ở đây đều ghi dấu providerOverride để đồng bộ FZR không ghi đè. */
export async function famSaveGameKeyProduct(fd: FormData) {
  await requireAdmin();
  const productId = parseInt(String(fd.get("productId") || "0"));
  const name = String(fd.get("name") || "").trim();
  const imageUrl = String(fd.get("imageUrl") || "").trim();
  const platform = String(fd.get("platform") || "").trim().slice(0, 60);
  const region = String(fd.get("region") || "").trim().slice(0, 60);
  const appidRaw = String(fd.get("appid") || "").trim();
  if (!productId || !name) back(rt(fd), false, "Thiếu tên game hoặc game không hợp lệ");
  const appid = appidRaw === "" ? null : parseInt(appidRaw);
  if (appid !== null && (!Number.isInteger(appid) || appid <= 0)) back(rt(fd), false, "AppID phải là số nguyên dương hoặc để trống");
  const cur = await prisma.premiumProduct.findUnique({ where: { id: productId }, select: { providerOverride: true } });
  await prisma.premiumProduct.update({
    where: { id: productId },
    data: {
      name,
      imageUrl: imageUrl || null,
      providerPlatform: platform || null,
      providerRegion: region || null,
      providerAppId: appid,
      providerOverride: withProviderOverride(cur?.providerOverride, ["platform", "region", "appid"]),
    },
  });
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
  const minQ = qtyField(fd.get("minQty"));
  const maxQ = qtyField(fd.get("maxQty"));
  if (minQ === undefined || maxQ === undefined) back(rt(fd), false, "Số lượng tối thiểu/tối đa không hợp lệ");
  if (minQ !== null && maxQ !== null && minQ > maxQ) back(rt(fd), false, "Số lượng tối thiểu không được lớn hơn tối đa");
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
      ...(minQ !== null ? { minOrderQty: minQ } : {}),
      ...(maxQ !== null ? { maxOrderQty: maxQ } : {}),
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
  const appidRaw = String(fd.get("appid") || "").trim();
  const appid = appidRaw === "" ? null : parseInt(appidRaw);
  if (appid !== null && (!Number.isInteger(appid) || appid <= 0)) back(rt(fd), false, "AppID không hợp lệ");
  const minQ = qtyField(fd.get("minQty"));
  const maxQ = qtyField(fd.get("maxQty"));
  if (minQ === undefined || maxQ === undefined) back(rt(fd), false, "Số lượng tối thiểu/tối đa không hợp lệ");
  if (minQ !== null && maxQ !== null && minQ > maxQ) back(rt(fd), false, "Số lượng tối thiểu không được lớn hơn tối đa");
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
      providerAppId: appid,
      providerOverride: JSON.stringify(["platform", "region", "appid"]),
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
      ...(minQ !== null ? { minOrderQty: minQ } : {}),
      ...(maxQ !== null ? { maxOrderQty: maxQ } : {}),
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
  const minQ = qtyField(fd.get("minQty"));
  const maxQ = qtyField(fd.get("maxQty"));
  if (minQ === undefined || maxQ === undefined) back(rt(fd), false, "Số lượng tối thiểu/tối đa không hợp lệ");
  if (minQ !== null && maxQ !== null && minQ > maxQ) back(rt(fd), false, "Số lượng tối thiểu không được lớn hơn tối đa");
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
      ...(minQ !== null ? { minOrderQty: minQ } : {}),
      ...(maxQ !== null ? { maxOrderQty: maxQ } : {}),
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
  const minQ = qtyField(fd.get("minQty"));
  const maxQ = qtyField(fd.get("maxQty"));
  if (minQ === undefined || maxQ === undefined) back(rt(fd), false, "Số lượng tối thiểu/tối đa không hợp lệ");
  if (minQ !== null && maxQ !== null && minQ > maxQ) back(rt(fd), false, "Số lượng tối thiểu không được lớn hơn tối đa");
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
      ...(minQ !== null ? { minOrderQty: minQ } : {}),
      ...(maxQ !== null ? { maxOrderQty: maxQ } : {}),
    },
  });
  back(rt(fd), true, `Đã thêm danh mục ${name}`);
}

/* ================= Đồng bộ theo khu & picker ==========================
 * Mỗi trang sản phẩm của một khu FZR có nút đồng bộ RIÊNG chỉ chạm nhóm
 * của khu đó — và luồng THÊM sản phẩm chọn thẳng từ catalog thật của nhà
 * cung cấp (tìm kiếm hoặc dán mã để kiểm chứng) thay cho ô nhập mã tự do,
 * để không gói nào bị trói nhầm dịch vụ. Markup theo nhóm được cấu hình ở
 * form nhà cung cấp (xem adminSaveProvider), không còn lưu tại trang khu. */

/** Đồng bộ RIÊNG các nhóm của khu này từ nhà cung cấp FZR (markup hiệu lực
 *  đọc từ cấu hình nhà cung cấp). Nhóm khác trong catalog không bị đụng. */
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

const FZR_GROUPS_ALL = ["gamekeys", "giftcards", "topups", "manual", "telegram_stars", "telegram_premium", "steam_topup", "steam_gift"];

/** Đồng bộ RIÊNG 1 sản phẩm từ nguồn (nút "Đồng bộ từ nguồn" ở từng thẻ sản
 *  phẩm trên 6 trang khu FZR, lệnh chủ 2026-11-09): đi ĐÚNG đường
 *  syncFzrCatalog ở chế độ onlyProduct — chỉ fetch item đó của NCC, áp dụng
 *  y hệt đồng bộ cả khu cho sản phẩm đó (giá/tồn kho/thuộc tính của NCC được
 *  làm mới; thuộc tính admin đặt tay trong providerOverride + gói CUSTOM giữ
 *  nguyên; gói NCC không còn trả bị tắt trong phạm vi sản phẩm này). Sản
 *  phẩm không có gắn kết NCC (tạo tay thuần) thì báo lỗi rõ ràng. */
export async function famSyncProduct(fd: FormData) {
  await requireAdmin();
  const productId = parseInt(String(fd.get("productId") || "0"));
  const product = productId ? await prisma.premiumProduct.findUnique({ where: { id: productId } }) : null;
  let okFlag = true;
  let msg: string;
  if (!product || !product.providerId || !product.providerProductId) {
    okFlag = false;
    msg = "Sản phẩm chưa gắn với nhà cung cấp nên không đồng bộ từ nguồn được";
  } else {
    const provider = await prisma.provider.findUnique({ where: { id: product.providerId } });
    if (!provider || provider.driver !== "FZR") {
      okFlag = false;
      msg = "Nhà cung cấp của sản phẩm không phải FZR";
    } else {
      const variant = await prisma.premiumVariant.findFirst({
        where: { productId: product.id, providerGroup: { in: FZR_GROUPS_ALL } },
        select: { providerGroup: true },
      });
      const group = variant?.providerGroup || null;
      if (!group) {
        okFlag = false;
        msg = "Không xác định được nhóm nguồn của sản phẩm";
      } else {
        try {
          const markupFor = await fzrMarkupResolver(provider);
          const r = await syncFzrCatalog(provider, {
            groups: [group], markupFor,
            onlyProduct: { productId: product.id, group, productKey: product.providerProductId },
          });
          if (r.missing) {
            okFlag = false;
            msg = `Nhà cung cấp không còn trả "${product.name}" — đã tắt ${r.deactivated} gói của sản phẩm này`;
          } else {
            msg = `Đã đồng bộ "${product.name}" từ nguồn: cập nhật ${r.variants} gói, tắt ${r.deactivated} gói cũ`;
          }
        } catch (e: any) {
          okFlag = false;
          msg = `Đồng bộ lỗi: ${String(e?.message || e).slice(0, 160)}`;
        }
      }
    }
  }
  back(rt(fd), okFlag, msg!);
}

/* ================= THÊM HÀNG LOẠT TỪ NGUỒN (lệnh chủ 2026-11-09) ======
 * Panel "Thêm hàng loạt từ nguồn" trên trang sản phẩm từng khu có catalog
 * liệt kê được phía NCC (Game Key, Gift Card, Top-Up, Manual, Steam Gift,
 * Telegram Premium). Steam Top-Up (mệnh giá do web tự định) và Telegram
 * Stars (gói sao do web tự định) KHÔNG có catalog để thêm hàng loạt.
 * Tạo sản phẩm đi ĐÚNG đường syncFzrCatalog chế độ onlyProduct với markup
 * của LÔ (markupFor = % admin nhập cho đợt này) — hình dạng tạo y hệt đồng
 * bộ tạo, KHÔNG gắn dấu CUSTOM; các đợt đồng bộ khu sau đó tính lại giá
 * theo markup của khu như sản phẩm đồng bộ thường. Mục đã có (trùng mã
 * NCC) bị BỎ QUA, không tạo trùng, không ghi đè. */

/** Danh sách game Steam gift: endpoint NCC CHỈ có tham số limit (không
 *  page/search — đối chiếu OpenAPI 2026-11-09) và bị rate-limit 1 request /
 *  3 phút, nên MỌI nhu cầu picker/bulk/tra mã đều dùng ĐÚNG 1 call rồi
 *  lọc + phân trang tại chỗ. Item list chỉ { name, appid } — không có giá
 *  (giá nằm ở offers, báo tại thời điểm mua). */
async function steamGiftMatches(provider: any, query: string): Promise<PickItem[]> {
  const raw: any = await fzrSteamGiftGames(provider);
  const games = asArr(raw?.games || raw?.data?.games || raw?.data || raw?.items);
  const q = query.trim().toLowerCase();
  const matches: PickItem[] = [];
  for (const g of games) {
    const appid = g?.appid ?? g?.app_id ?? g?.id;
    if (appid === undefined || appid === null) continue;
    const name = String(g?.name || `App ${appid}`);
    if (q && !name.toLowerCase().includes(q)) continue;
    matches.push({ id: String(appid), name, priceUsd: null, extra: `AppID ${appid}` });
  }
  return matches;
}

type BulkItem = PickItem & { exists: boolean };
type BulkResult = { ok: boolean; items?: BulkItem[]; error?: string; hasMore?: boolean; page?: number; exchangeRate?: number; markup?: number };

export async function fzrBulkSearch(group: string, query: string, pageRaw?: number): Promise<BulkResult> {
  await requireAdmin();
  const provider = await pickerProvider(group);
  if (!provider) return { ok: false, error: "Chưa có nhà cung cấp FZR đang bật cho khu này" };
  const page = Math.max(1, Math.floor(pageRaw || 1));
  try {
    const markup = await fzrMarkupFor(provider, group);
    let items: PickItem[] = [];
    let hasMore = false;
    if (group === "steam_gift") {
      const matches = await steamGiftMatches(provider, query);
      items = matches.slice((page - 1) * PICK_PAGE_SIZE, page * PICK_PAGE_SIZE);
      hasMore = matches.length > page * PICK_PAGE_SIZE;
    } else {
      const r = await fzrPickSearch(group, query, page);
      if (!r.ok) return { ok: false, error: r.error || "Không tải được catalog" };
      items = r.items || [];
      hasMore = !!r.hasMore;
      // Giá ở tầng LIST của gamekeys/giftcards/topups/manual không có (giá
      // nằm ở edition/offer) -> bổ sung giá RẺ NHẤT trong các gói con qua
      // đúng endpoint chi tiết mà picker/sync dùng, để hàng trong panel có
      // giá nguồn + giá bán dự kiến. telegram_premium đã có giá ở tầng list.
      if (group !== "telegram_premium") {
        for (const it of items) {
          if (it.priceUsd != null) continue;
          try {
            const ed = await fzrPickEditions(group, it.id);
            const prices = (ed.items || []).map((e) => Number(e.priceUsd)).filter((n) => Number.isFinite(n) && n > 0);
            if (prices.length) it.priceUsd = String(Math.min(...prices));
          } catch { /* không lấy được giá gói con -> để trống, tạo vẫn chạy qua đường sync */ }
        }
      }
    }
    // Đánh dấu mục ĐÃ CÓ trong catalog của web (trùng mã NCC) để panel hiển
    // thị "Đã có" và bỏ qua khi xác nhận.
    let existsSet = new Set<string>();
    if (group === "telegram_premium") {
      const prod = await prisma.premiumProduct.findFirst({ where: { providerId: provider.id, providerProductId: "telegram-premium" }, select: { id: true } });
      if (prod) {
        const vs = await prisma.premiumVariant.findMany({ where: { productId: prod.id, providerGroup: "telegram_premium" }, select: { providerItemId: true } });
        existsSet = new Set(vs.map((v) => v.providerItemId || ""));
      }
    } else if (items.length) {
      const keys = items.map((it) => (group === "steam_gift" ? `app-${it.id}` : it.id));
      const prods = await prisma.premiumProduct.findMany({ where: { providerId: provider.id, providerProductId: { in: keys } }, select: { providerProductId: true } });
      existsSet = new Set(prods.map((p) => (group === "steam_gift" ? String(p.providerProductId).replace(/^app-/, "") : String(p.providerProductId))));
    }
    return {
      ok: true,
      items: items.map((it) => ({ ...it, exists: existsSet.has(it.id) })),
      hasMore, page, exchangeRate: provider.exchangeRate, markup,
    };
  } catch (e: any) {
    return { ok: false, error: `Không gọi được nhà cung cấp: ${String(e?.message || e).slice(0, 140)}` };
  }
}

/** Xác nhận thêm hàng loạt: tạo từng mục đã chọn qua đường sync đơn lẻ với
 *  markup của LÔ. Trả về trang kèm thông báo tổng kết: thêm N · bỏ qua M
 *  (đã có) · lỗi K kèm lý do. */
export async function famBulkAdd(fd: FormData) {
  await requireAdmin();
  const group = String(fd.get("group") || "");
  const ids = Array.from(new Set(String(fd.get("ids") || "").split(",").map((s) => s.trim()).filter(Boolean)));
  const pctRaw = parseInt(String(fd.get("percent") || ""));
  const provider = FZR_GROUPS_ALL.includes(group) ? await pickerProvider(group) : null;
  let okFlag = true;
  let msg: string;
  if (!provider || provider.driver !== "FZR") {
    okFlag = false;
    msg = "Chưa có nhà cung cấp FZR đang bật cho khu này";
  } else if (!ids.length) {
    okFlag = false;
    msg = "Chưa chọn mục nào để thêm";
  } else if (!Number.isInteger(pctRaw) || pctRaw < 0 || pctRaw > 1000) {
    okFlag = false;
    msg = "% giá bán của lô phải là số nguyên từ 0 đến 1000";
  } else {
    const pct = pctRaw;
    const markupFor = () => pct;
    let added = 0, skipped = 0;
    const fails: string[] = [];
    if (group === "steam_gift") {
      // Cả lô gift trong 1 lần gọi list (rate-limit 1 request/3 phút của
      // endpoint list) — lọc theo tập key đã chọn ở fzr-sync.
      const keys = ids.map((id) => `app-${id}`);
      const existing = await prisma.premiumProduct.findMany({ where: { providerId: provider.id, providerProductId: { in: keys } }, select: { providerProductId: true } });
      skipped += existing.length;
      const newKeys = keys.filter((k) => !existing.some((p) => p.providerProductId === k));
      if (newKeys.length) {
        try {
          const r = await syncFzrCatalog(provider, {
            groups: [group], markupFor,
            onlyProduct: { productId: 0, group, productKey: newKeys[0] },
            onlyProductKeys: newKeys,
          });
          added += r.created;
          for (const k of r.missingKeys) fails.push(`${k.replace(/^app-/, "App ")}: nhà cung cấp không còn trả game này`);
        } catch (e: any) {
          fails.push(`Lỗi gọi nhà cung cấp: ${String(e?.message || e).slice(0, 120)}`);
        }
      }
    } else if (group === "telegram_premium") {
      // Telegram Premium là MỘT sản phẩm với các gói theo tháng: đã có sản
      // phẩm thì mọi gói chọn đều tính là đã có; chưa có thì tạo sản phẩm
      // qua đường sync đơn lẻ rồi tắt các gói tháng KHÔNG được chọn.
      const existing = await prisma.premiumProduct.findFirst({ where: { providerId: provider.id, providerProductId: "telegram-premium" }, select: { id: true } });
      if (existing) {
        skipped += ids.length;
      } else {
        try {
          const r = await syncFzrCatalog(provider, {
            groups: [group], markupFor,
            onlyProduct: { productId: 0, group, productKey: "telegram-premium" },
          });
          if (r.created > 0) {
            const np = await prisma.premiumProduct.findFirst({ where: { providerId: provider.id, providerProductId: "telegram-premium" }, select: { id: true } });
            if (np) {
              await prisma.premiumVariant.updateMany({
                where: { productId: np.id, providerGroup: "telegram_premium", providerItemId: { notIn: ids } },
                data: { active: false },
              });
            }
            added += ids.length;
          } else {
            fails.push("Telegram Premium: nhà cung cấp không trả gói nào để tạo");
          }
        } catch (e: any) {
          fails.push(`Telegram Premium: ${String(e?.message || e).slice(0, 120)}`);
        }
      }
    } else {
      for (const id of ids) {
        const existing = await prisma.premiumProduct.findFirst({ where: { providerId: provider.id, providerProductId: id }, select: { id: true } });
        if (existing) { skipped++; continue; }
        try {
          const r = await syncFzrCatalog(provider, {
            groups: [group], markupFor,
            onlyProduct: { productId: 0, group, productKey: id },
          });
          if (r.missing) fails.push(`${id}: nhà cung cấp không còn trả mục này`);
          else if (r.created > 0) added++;
          else fails.push(`${id}: không tạo được sản phẩm từ nguồn`);
        } catch (e: any) {
          fails.push(`${id}: ${String(e?.message || e).slice(0, 100)}`);
        }
      }
    }
    msg = `Thêm hàng loạt xong: thêm mới ${added} · bỏ qua ${skipped} (đã có) · lỗi ${fails.length}` +
      (fails.length ? ` — ${fails.slice(0, 3).join("; ")}${fails.length > 3 ? `; … +${fails.length - 3} lỗi nữa` : ""}` : "");
    okFlag = fails.length === 0;
  }
  back(rt(fd), okFlag, msg!);
}

type PickItem = { id: string; name: string; priceUsd: string | null; extra: string; extra2?: string; minQty?: number | null; maxQty?: number | null; appid?: number | null };
type PickResult = { ok: boolean; items?: PickItem[]; item?: PickItem; error?: string; hasMore?: boolean; page?: number };

/** Số kết quả picker mỗi trang — picker lật trang THẬT qua catalog phía
 *  nhà cung cấp (cursor của gamekeys/giftcards, page của steam-gifts). */
const PICK_PAGE_SIZE = 20;

/** Nhà cung cấp dùng cho picker của một nhóm — cùng quy tắc chọn NCC như
 *  luồng thêm sản phẩm của khu đó. */
async function pickerProvider(group: string): Promise<Provider | null> {
  if (group === "gamekeys") return gameKeyAddProvider();
  if (group === "giftcards") return giftCardAddProvider();
  if (group === "topups") return topupAddProvider();
  if (group === "manual") return manualAddProvider();
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
          const appidNum = group === "gamekeys" ? Number(g?.appid) : NaN;
          matches.push({
            id: String(id), name, priceUsd: null,
            extra: group === "gamekeys" ? String(g?.platform || "") : "",
            extra2: group === "gamekeys" ? String(g?.region || "") : "",
            appid: Number.isInteger(appidNum) && appidNum > 0 ? appidNum : null,
          });
          if (matches.length >= need) break;
        }
        const next = raw?.meta?.next_cursor;
        if (!raw?.meta?.has_more || !next) break;
        cursor = String(next);
      }
      return slicePage(matches);
    }
    if (group === "topups") {
      // Danh sách category top-up của FZR cũng phân trang CURSOR như
      // gamekeys/giftcards, không có tham số tìm kiếm -> lọc tên tại đây.
      const matches: PickItem[] = [];
      let cursor: string | undefined;
      for (let p = 0; p < 30 && matches.length < need; p++) {
        const raw: any = await fzrTopups(provider, cursor);
        for (const c of asArr(raw?.items)) {
          const id = c?.category_id ?? c?.id;
          if (id === undefined || id === null) continue;
          const name = String(c?.name || id);
          if (q && !name.toLowerCase().includes(q)) continue;
          matches.push({ id: String(id), name, priceUsd: null, extra: String(c?.note || "").slice(0, 80) });
          if (matches.length >= need) break;
        }
        const next = raw?.meta?.next_cursor;
        if (!raw?.meta?.has_more || !next) break;
        cursor = String(next);
      }
      return slicePage(matches);
    }
    if (group === "manual") {
      // GET /manual-services trả items[] PHẲNG, không phân trang — kéo 1
      // lần rồi lọc theo tên tại đây. extra = kind của category (dữ liệu
      // thật phía NCC, hiển thị ở form thêm để admin biết loại giao).
      const raw: any = await fzrManualServices(provider);
      const matches: PickItem[] = [];
      for (const c of asArr(raw?.items)) {
        const id = c?.id;
        if (id === undefined || id === null) continue;
        const name = String(c?.name || id);
        if (q && !name.toLowerCase().includes(q)) continue;
        matches.push({ id: String(id), name, priceUsd: null, extra: String(c?.kind || "") });
      }
      return slicePage(matches);
    }
    if (group === "steam_gift") {
      const matches = await steamGiftMatches(provider, query);
      return slicePage(matches.slice(0, need));
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
          minQty: Number.isInteger(Number(k?.min_order_quantity)) && Number(k?.min_order_quantity) > 0 ? Number(k.min_order_quantity) : null,
          maxQty: Number.isInteger(Number(k?.max_order_quantity)) && Number(k?.max_order_quantity) > 0 ? Number(k.max_order_quantity) : null,
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
          minQty: Number.isInteger(Number(k?.min_order_quantity)) && Number(k?.min_order_quantity) > 0 ? Number(k.min_order_quantity) : null,
          maxQty: Number.isInteger(Number(k?.max_order_quantity)) && Number(k?.max_order_quantity) > 0 ? Number(k.max_order_quantity) : null,
        })),
      };
    }
    if (group === "topups") {
      const raw: any = await fzrTopupOffers(provider, parentId);
      return {
        ok: true,
        items: asArr(raw?.offers).map((k) => ({
          id: k?.offer_id != null && k?.offer_id !== "" ? String(k.offer_id) : `name:${String(k?.name || "Gói nạp")}`,
          name: String(k?.name || "Gói nạp"),
          priceUsd: k?.price_usd != null ? String(k.price_usd) : null,
          extra: "",
        })),
      };
    }
    if (group === "manual") {
      const raw: any = await fzrManualOffers(provider, parentId);
      return {
        ok: true,
        items: asArr(raw?.items).map((k) => ({
          id: String(k?.id ?? ""),
          name: String(k?.name || "Gói dịch vụ"),
          priceUsd: k?.price_usd != null ? String(k.price_usd) : null,
          extra: k?.delivery_minutes != null ? `Giao ~${k.delivery_minutes} phút` : "",
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
            const lkAppid = Number(g?.appid);
            return { ok: true, item: { id, name: String(g?.name || id), priceUsd: null, extra: String(g?.platform || ""), extra2: String(g?.region || ""), appid: Number.isInteger(lkAppid) && lkAppid > 0 ? lkAppid : null } };
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
    if (group === "topups") {
      const raw: any = await fzrTopupOffers(provider, id);
      if (raw && (raw.name || raw.offers)) return { ok: true, item: { id, name: String(raw.name || id), priceUsd: null, extra: "" } };
      return notFound;
    }
    if (group === "manual") {
      const raw: any = await fzrManualServices(provider);
      for (const c of asArr(raw?.items)) {
        if (String(c?.id) === id) {
          return { ok: true, item: { id, name: String(c?.name || id), priceUsd: null, extra: String(c?.kind || "") } };
        }
      }
      return notFound;
    }
    if (group === "steam_gift") {
      const matches = await steamGiftMatches(provider, "");
      const hit = matches.find((m) => m.id === id);
      if (hit) return { ok: true, item: hit };
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

/* ================= KHU TOP-UP (FZR topups, theo OpenAPI) =================
 * 1 category = 1 sản phẩm (providerProductId = category_id), gói nạp =
 * variant (providerItemId = offer_id). Luồng THÊM bằng picker: chọn
 * category -> fields[] của category tự nạp vào form (key khoá cứng, nhãn
 * admin sửa được) -> lưu vào customFields của sản phẩm. */

/** Nạp fields[] THẬT của một category top-up từ nhà cung cấp cho form thêm
 *  sản phẩm (fzr-picker TopupAddForm): key/type/options theo NCC, nhãn để
 *  admin sửa trước khi lưu. */
export async function fzrPickTopupFields(categoryIdRaw: string): Promise<{
  ok: boolean;
  fields?: { key: string; label: string; type: "text" | "select"; required: boolean; options?: string[] }[];
  name?: string;
  note?: string;
  imageUrl?: string;
  error?: string;
}> {
  await requireAdmin();
  const provider = await topupAddProvider();
  if (!provider) return { ok: false, error: "Chưa có nhà cung cấp FZR đang bật cho khu này" };
  const categoryId = categoryIdRaw.trim();
  if (!categoryId) return { ok: false, error: "Chưa chọn category" };
  try {
    const raw: any = await fzrTopupOffers(provider, categoryId);
    return {
      ok: true,
      fields: normalizeTopupFields(raw?.fields),
      ...(raw?.name ? { name: String(raw.name) } : {}),
      ...(raw?.note ? { note: String(raw.note) } : {}),
      ...(raw?.imageurl ? { imageUrl: String(raw.imageurl) } : {}),
    };
  } catch (e: any) {
    return { ok: false, error: `Không gọi được nhà cung cấp: ${String(e?.message || e).slice(0, 140)}` };
  }
}

/** Thêm CATEGORY Top-Up từ picker: tạo sản phẩm (providerProductId =
 *  category_id) + gói nạp đầu tiên (dấu CUSTOM) + customFields từ form
 *  (fieldsJson đã gồm key khoá cứng + nhãn admin đặt). */
export async function famAddTopupCategory(fd: FormData) {
  await requireAdmin();
  const categoryIdFzr = String(fd.get("categoryId") || "").trim();
  const name = String(fd.get("name") || "").trim();
  const imageUrl = String(fd.get("imageUrl") || "").trim();
  const offerId = String(fd.get("offerId") || "").trim();
  const offerName = String(fd.get("offerName") || "").trim() || name;
  const price = money(fd.get("price"));
  const fieldsRaw = String(fd.get("fieldsJson") || "").trim();
  const provider = await topupAddProvider();
  if (!provider) back(rt(fd), false, "Chưa có nhà cung cấp FZR đang bật");
  if (!categoryIdFzr || !name || !offerId) back(rt(fd), false, "Category ID, tên danh mục và gói nạp đầu tiên là bắt buộc");
  const dup = await prisma.premiumProduct.findFirst({
    where: { providerId: provider!.id, providerProductId: categoryIdFzr },
    select: { id: true },
  });
  if (dup) back(rt(fd), false, `Category ID ${categoryIdFzr} đã có trong danh sách`);
  const slugify = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "top-up";
  const product = await prisma.premiumProduct.create({
    data: {
      categoryId: await categoryId("Top-Up", provider!.id),
      name,
      slug: `fzr-${provider!.id}-topups-${slugify(categoryIdFzr)}`.slice(0, 150),
      imageUrl: imageUrl || null,
      fulfillment: "API",
      providerId: provider!.id,
      providerProductId: categoryIdFzr,
      customFields: fieldsRaw ? normalizePremiumFieldsJson(fieldsRaw) : null,
    },
  });
  await prisma.premiumVariant.create({
    data: {
      productId: product.id, name: offerName, price, cost: 0, warrantyDays: 0,
      providerId: provider!.id, providerGroup: "topups",
      providerItemId: offerId,
      deliveryType: ADMIN_VARIANT_MARK,
    },
  });
  back(rt(fd), true, `Đã thêm danh mục ${name}`);
}

/** Thêm gói nạp (offer) cho một category Top-Up đã có — gói admin tự thêm
 *  mang dấu CUSTOM như các khu khác. */
export async function famAddTopupOffer(fd: FormData) {
  await requireAdmin();
  const productId = parseInt(String(fd.get("productId") || "0"));
  const offerId = String(fd.get("offerId") || "").trim();
  const name = String(fd.get("name") || "").trim();
  const price = money(fd.get("price"));
  const product = productId ? await prisma.premiumProduct.findUnique({ where: { id: productId }, select: { id: true, providerId: true } }) : null;
  if (!product) back(rt(fd), false, "Danh mục không hợp lệ");
  if (!offerId || !name) back(rt(fd), false, "Offer ID và tên gói nạp là bắt buộc");
  const dup = await prisma.premiumVariant.findFirst({
    where: { productId: product!.id, providerGroup: "topups", providerItemId: offerId },
    select: { id: true },
  });
  if (dup) back(rt(fd), false, `Offer ID ${offerId} đã có trong danh mục này`);
  await prisma.premiumVariant.create({
    data: {
      productId: product!.id, name, price, cost: 0, warrantyDays: 0,
      providerId: product!.providerId, providerGroup: "topups",
      providerItemId: offerId,
      deliveryType: ADMIN_VARIANT_MARK,
    },
  });
  back(rt(fd), true, `Đã thêm gói nạp ${name}`);
}

/* ================= KHU MANUAL SERVICES (FZR manual-services, theo OpenAPI) =================
 * 1 category = 1 sản phẩm (providerProductId = manual_service_id), offer =
 * variant (providerItemId = offer id). kind của category lưu ở providerKind;
 * info của NCC lưu ở description (trang khách hiện trong thẻ NOTE + popover
 * của chip file); delivery_minutes + note_product của offer lưu ở variant.
 * fields[] CHỈ có khi kind = replenishment ({ code, name }) -> customFields
 * kèm key = code, nhãn admin sửa được như Top-Up. */

/** Nạp dữ liệu THẬT của một category manual từ nhà cung cấp cho form thêm
 *  sản phẩm (fzr-picker ManualAddForm): fields[] (chỉ replenishment) + kind
 *  + info + ảnh bìa. */
export async function fzrPickManualFields(serviceIdRaw: string): Promise<{
  ok: boolean;
  fields?: { key: string; label: string; type: "text" | "select"; required: boolean; options?: string[] }[];
  kind?: string;
  info?: string;
  name?: string;
  imageUrl?: string;
  error?: string;
}> {
  await requireAdmin();
  const provider = await manualAddProvider();
  if (!provider) return { ok: false, error: "Chưa có nhà cung cấp FZR đang bật cho khu này" };
  const serviceId = serviceIdRaw.trim();
  if (!serviceId) return { ok: false, error: "Chưa chọn dịch vụ" };
  try {
    const raw: any = await fzrManualOffers(provider, serviceId);
    return {
      ok: true,
      fields: normalizeManualFields(raw?.fields).map((f) => ({ key: f.key, label: f.label, type: "text" as const, required: true })),
      ...(raw?.category?.kind ? { kind: String(raw.category.kind) } : {}),
      ...(raw?.info ? { info: String(raw.info) } : {}),
      ...(raw?.category?.name ? { name: String(raw.category.name) } : {}),
      ...(raw?.imageurl ? { imageUrl: String(raw.imageurl) } : {}),
    };
  } catch (e: any) {
    return { ok: false, error: `Không gọi được nhà cung cấp: ${String(e?.message || e).slice(0, 140)}` };
  }
}

/** Thêm DỊCH VỤ Manual từ picker: tạo sản phẩm (providerProductId =
 *  manual_service_id, kind + info lấy từ nguồn) + offer đầu tiên (dấu
 *  CUSTOM, kèm delivery_minutes/note_product nạp lại từ nguồn ở máy chủ)
 *  + customFields từ form (key khoá cứng, nhãn admin đặt). */
export async function famAddManualService(fd: FormData) {
  await requireAdmin();
  const serviceId = String(fd.get("serviceId") || "").trim();
  const name = String(fd.get("name") || "").trim();
  const imageUrl = String(fd.get("imageUrl") || "").trim();
  const kind = String(fd.get("kind") || "").trim();
  const info = String(fd.get("info") || "").trim();
  const offerId = String(fd.get("offerId") || "").trim();
  const offerName = String(fd.get("offerName") || "").trim() || name;
  const price = money(fd.get("price"));
  const fieldsRaw = String(fd.get("fieldsJson") || "").trim();
  const provider = await manualAddProvider();
  if (!provider) back(rt(fd), false, "Chưa có nhà cung cấp FZR đang bật");
  if (!serviceId || !name || !offerId) back(rt(fd), false, "Service ID, tên dịch vụ và gói đầu tiên là bắt buộc");
  const dup = await prisma.premiumProduct.findFirst({
    where: { providerId: provider!.id, providerProductId: serviceId },
    select: { id: true },
  });
  if (dup) back(rt(fd), false, `Service ID ${serviceId} đã có trong danh sách`);
  // delivery_minutes + note_product của offer nạp lại từ NGUỒN ở máy chủ —
  // form không mang hai giá trị này (tránh bị sửa tay thành dữ liệu giả).
  let minutes: number | null = null;
  let note: string | null = null;
  try {
    const raw: any = await fzrManualOffers(provider!, serviceId);
    const offer = asArr(raw?.items).find((o) => String(o?.id) === offerId);
    if (offer) {
      minutes = typeof offer.delivery_minutes === "number" ? offer.delivery_minutes : null;
      note = offer.note_product ? String(offer.note_product) : null;
    }
  } catch { /* không gọi được nguồn: vẫn thêm gói, hai trường để trống */ }
  const slugify = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "manual";
  const product = await prisma.premiumProduct.create({
    data: {
      categoryId: await categoryId("Dịch vụ thủ công", provider!.id),
      name,
      slug: `fzr-${provider!.id}-manual-${slugify(serviceId)}`.slice(0, 150),
      description: info || null,
      imageUrl: imageUrl || null,
      fulfillment: "API",
      providerId: provider!.id,
      providerProductId: serviceId,
      providerKind: kind || null,
      customFields: fieldsRaw ? normalizePremiumFieldsJson(fieldsRaw) : null,
    },
  });
  await prisma.premiumVariant.create({
    data: {
      productId: product.id, name: offerName, price, cost: 0, warrantyDays: 0,
      providerId: provider!.id, providerGroup: "manual",
      providerItemId: offerId,
      deliveryType: ADMIN_VARIANT_MARK,
      deliveryMinutes: minutes,
      providerNote: note,
    },
  });
  back(rt(fd), true, `Đã thêm dịch vụ ${name}`);
}

/** Thêm offer cho một dịch vụ Manual đã có — gói admin tự thêm mang dấu
 *  CUSTOM; delivery_minutes/note_product nạp lại từ nguồn như trên. */
export async function famAddManualOffer(fd: FormData) {
  await requireAdmin();
  const productId = parseInt(String(fd.get("productId") || "0"));
  const offerId = String(fd.get("offerId") || "").trim();
  const name = String(fd.get("name") || "").trim();
  const price = money(fd.get("price"));
  const product = productId ? await prisma.premiumProduct.findUnique({ where: { id: productId }, select: { id: true, providerId: true, providerProductId: true } }) : null;
  if (!product) back(rt(fd), false, "Dịch vụ không hợp lệ");
  if (!offerId || !name) back(rt(fd), false, "Offer ID và tên gói là bắt buộc");
  const dup = await prisma.premiumVariant.findFirst({
    where: { productId: product!.id, providerGroup: "manual", providerItemId: offerId },
    select: { id: true },
  });
  if (dup) back(rt(fd), false, `Offer ID ${offerId} đã có trong dịch vụ này`);
  let minutes: number | null = null;
  let note: string | null = null;
  const provider = product!.providerId ? await prisma.provider.findUnique({ where: { id: product!.providerId } }) : null;
  if (provider && product!.providerProductId) {
    try {
      const raw: any = await fzrManualOffers(provider, product!.providerProductId);
      const offer = asArr(raw?.items).find((o) => String(o?.id) === offerId);
      if (offer) {
        minutes = typeof offer.delivery_minutes === "number" ? offer.delivery_minutes : null;
        note = offer.note_product ? String(offer.note_product) : null;
      }
    } catch { /* giữ trống khi không gọi được nguồn */ }
  }
  await prisma.premiumVariant.create({
    data: {
      productId: product!.id, name, price, cost: 0, warrantyDays: 0,
      providerId: product!.providerId, providerGroup: "manual",
      providerItemId: offerId,
      deliveryType: ADMIN_VARIANT_MARK,
      deliveryMinutes: minutes,
      providerNote: note,
    },
  });
  back(rt(fd), true, `Đã thêm gói ${name}`);
}

/** Lưu NHÃN của các trường tuỳ chỉnh phía nhà cung cấp trên một sản phẩm:
 *  form gửi fkey_<i> (chỉ để hiển thị, KHÔNG đọc lại) + flabel_<i>; action
 *  dựng lại danh sách từ customFields đã lưu theo đúng thứ tự, chỉ thay
 *  nhãn — key/type/options/required giữ nguyên phía máy chủ nên nhãn đổi
 *  không bao giờ phá được ánh xạ gửi đơn. Nhãn để trống = giữ nhãn cũ. */
export async function famSaveFieldLabels(fd: FormData) {
  await requireAdmin();
  const productId = parseInt(String(fd.get("productId") || "0"));
  const product = productId ? await prisma.premiumProduct.findUnique({ where: { id: productId }, select: { id: true, customFields: true } }) : null;
  if (!product) back(rt(fd), false, "Sản phẩm không hợp lệ");
  const fields = parsePremiumFields(product!.customFields);
  if (!fields.length) back(rt(fd), false, "Sản phẩm này không có trường tuỳ chỉnh");
  const next = fields.map((f, i) => {
    const label = String(fd.get(`flabel_${i}`) || "").trim().slice(0, 80);
    return label ? { ...f, label } : f;
  });
  await prisma.premiumProduct.update({ where: { id: product!.id }, data: { customFields: JSON.stringify(next) } });
  back(rt(fd), true, "Đã lưu nhãn trường tuỳ chỉnh");
}
