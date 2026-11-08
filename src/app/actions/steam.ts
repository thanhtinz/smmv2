"use server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { createPremiumOrder } from "@/lib/orders";
import { FZR_LABELS } from "@/lib/fzr";

function back(path: string, key: "msg" | "err", text: string): never {
  redirect(`${path}?${key}=${encodeURIComponent(text)}`);
}

function cleanError(e: any, path: string): never {
  const msg = String(e?.message || "");
  // Lỗi phía nhà cung cấp: khách chỉ thấy thông báo sạch (máy nền đã lo hoàn
  // tiền nếu lỗi dứt khoát), không lộ mã/lỗi thô của provider — như Telegram.
  if (/FZR|provider|nhà cung cấp|402|403/i.test(msg)) back(path, "err", "Dịch vụ tạm gián đoạn, vui lòng thử lại sau");
  back(path, "err", msg || "Đặt đơn thất bại");
}

/** Đặt đơn nạp Steam Wallet (Top-Up CIS): chạy qua createPremiumOrder trên
 *  đúng gói mệnh giá đã đồng bộ (providerGroup steam_topup, providerItemId =
 *  mệnh giá USD) — ví/kho/hoàn tiền/thực thi FZR dùng chung một máy. Steam
 *  login đi vào customData đúng nhãn FZR_LABELS.steamLogin mà luồng thực thi
 *  đọc lại. Mệnh giá là gói CỐ ĐỊNH phía provider (không có nạp số tự do). */
export async function placeSteamTopupAction(formData: FormData) {
  const user = await requireUser();
  const path = "/dashboard/steam/top-up";
  const variantId = parseInt(String(formData.get("variantId") || "0")) || 0;
  const login = String(formData.get("login") || "").trim().slice(0, 64);
  if (!login) back(path, "err", "Nhập Steam login của tài khoản nhận nạp");
  const variant = await prisma.premiumVariant.findUnique({ where: { id: variantId }, select: { id: true, providerGroup: true, active: true } });
  if (!variant || variant.providerGroup !== "steam_topup" || !variant.active) back(path, "err", "Gói nạp Steam không khả dụng");
  try {
    await createPremiumOrder({ user, variantId, quantity: 1, customData: { [FZR_LABELS.steamLogin]: login } });
  } catch (e: any) {
    cleanError(e, path);
  }
  back("/dashboard/steam/lich-su", "msg", "Đặt đơn thành công — tiền đang được nạp vào tài khoản Steam của bạn");
}

/** Đặt đơn Steam Gift Games: gói = variant của game đã đồng bộ (providerGroup
 *  steam_gift, providerItemId = appid; giá chốt tươi theo offer rẻ nhất tại
 *  thời điểm mua trong createPremiumOrder). Link mời Steam chính là thông
 *  tin nhận gift — đi vào customData đúng nhãn FZR_LABELS.giftReceiver. */
export async function placeSteamGiftAction(formData: FormData) {
  const user = await requireUser();
  const path = "/dashboard/steam/gift-games";
  const variantId = parseInt(String(formData.get("variantId") || "0")) || 0;
  const invite = String(formData.get("invite") || "").trim().slice(0, 300);
  if (!invite) back(path, "err", "Dán link mời Steam của tài khoản nhận gift");
  const variant = await prisma.premiumVariant.findUnique({ where: { id: variantId }, select: { id: true, providerGroup: true, active: true } });
  if (!variant || variant.providerGroup !== "steam_gift" || !variant.active) back(path, "err", "Game Steam không khả dụng");
  try {
    await createPremiumOrder({ user, variantId, quantity: 1, customData: { [FZR_LABELS.giftReceiver]: invite } });
  } catch (e: any) {
    cleanError(e, path);
  }
  back("/dashboard/steam/lich-su", "msg", "Đặt đơn thành công — gift đang được gửi tới tài khoản Steam nhận");
}
