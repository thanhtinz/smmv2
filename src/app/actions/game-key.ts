"use server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { createPremiumOrder } from "@/lib/orders";

function back(path: string, key: "msg" | "err", text: string): never {
  redirect(`${path}?${key}=${encodeURIComponent(text)}`);
}

function cleanError(e: any, path: string): never {
  const msg = String(e?.message || "");
  // Lỗi phía nhà cung cấp: khách chỉ thấy thông báo sạch (máy nền đã lo hoàn
  // tiền nếu lỗi dứt khoát), không lộ mã/lỗi thô của provider — như Telegram/Steam.
  if (/FZR|provider|nhà cung cấp|402|403/i.test(msg)) back(path, "err", "Dịch vụ tạm gián đoạn, vui lòng thử lại sau");
  back(path, "err", msg || "Đặt đơn thất bại");
}

/** Đặt mua Game Key: gói = edition (variant providerGroup "gamekeys",
 *  providerItemId = key_id phía FZR) của game đã chọn — chạy qua
 *  createPremiumOrder như mọi đơn Premium (trừ ví, kho, flash/promo,
 *  thực thi FZR gamekeys với {game_id, key_id} theo tài liệu).
 *  providerStock là tồn kho PHÍA FZR tại lần đồng bộ gần nhất: bằng 0 thì
 *  chặn sớm ở đây cho khách khỏi chờ; số còn lại để FZR tự thực thi khi gọi
 *  order (lỗi dứt khoát phía họ vẫn hoàn tiền qua máy chung). */
export async function placeGameKeyAction(formData: FormData) {
  const user = await requireUser();
  const variantId = parseInt(String(formData.get("variantId") || "0")) || 0;
  const quantity = Math.min(100, Math.max(1, parseInt(String(formData.get("quantity") || "1")) || 1));
  const variant = await prisma.premiumVariant.findUnique({
    where: { id: variantId },
    select: { id: true, productId: true, providerGroup: true, active: true, providerStock: true },
  });
  const path = variant ? `/dashboard/game-key/${variant.productId}` : "/dashboard/game-key";
  if (!variant || variant.providerGroup !== "gamekeys" || !variant.active) back(path, "err", "Phiên bản game không khả dụng");
  if (variant!.providerStock === 0) back(path, "err", "Phiên bản này đã hết key phía nhà cung cấp");
  try {
    // Key được giao THẲNG vào đơn của chính tài khoản mua (hiện ở lịch sử
    // Game Key) — không có người nhận ngoài như gift/login Steam; buyerInfo
    // là danh tính tài khoản nhận key để máy chung ghi nhận bàn giao.
    await createPremiumOrder({ user, variantId, quantity, buyerInfo: user.email || user.username });
  } catch (e: any) {
    cleanError(e, path);
  }
  back("/dashboard/game-key/don-hang", "msg", "Đặt đơn thành công — key game sẽ hiện trong chi tiết đơn khi giao xong");
}
