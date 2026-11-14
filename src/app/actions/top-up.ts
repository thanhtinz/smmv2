"use server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { createPremiumOrder } from "@/lib/orders";
import { moduleOn } from "@/lib/modules";
import { parsePremiumFields } from "@/lib/format";

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

/** Đặt nạp Top-Up: gói = offer (variant providerGroup "topups",
 *  providerItemId = offer_id phía FZR) của game đã chọn — chạy qua
 *  createPremiumOrder như mọi đơn Premium (trừ ví, flash/promo, thực thi
 *  FZR topups theo tài liệu: validate-id trước bằng {category_id, fields}
 *  rồi order {category_id, offer_id, fields}). Đơn topups KHÔNG có số
 *  lượng — mỗi đơn đúng 1 gói. Giá trị các trường tuỳ chỉnh của sản phẩm
 *  đi vào customData theo NHÃN hiển thị (admin đã đặt); máy nền đối chiếu
 *  nhãn -> key của NCC để gửi object fields đúng key. Sản phẩm không có
 *  trường nào thì buyerInfo là danh tính tài khoản mua (như Gift Card). */
export async function placeTopupAction(formData: FormData) {
  const user = await requireUser();
  if (!(await moduleOn("topup"))) redirect("/");
  const variantId = parseInt(String(formData.get("variantId") || "0")) || 0;
  const variant = await prisma.premiumVariant.findUnique({
    where: { id: variantId },
    select: {
      id: true, productId: true, providerGroup: true, active: true,
      product: { select: { customFields: true } },
    },
  });
  const path = variant ? `/dashboard/top-up/${variant.productId}` : "/dashboard/top-up";
  if (!variant || variant.providerGroup !== "topups" || !variant.active) back(path, "err", "Gói nạp không khả dụng");
  const fields = parsePremiumFields(variant!.product.customFields);
  const customData: Record<string, string> = {};
  fields.forEach((f, i) => { customData[f.label] = String(formData.get(`cf_${i}`) || ""); });
  try {
    await createPremiumOrder({
      user, variantId, quantity: 1,
      customData: fields.length ? customData : undefined,
      buyerInfo: user.email || user.username,
    });
  } catch (e: any) {
    cleanError(e, path);
  }
  back("/dashboard/top-up/don-hang", "msg", "Đặt đơn thành công — thông tin nạp sẽ hiện trong lịch sử Top-Up khi xử lý xong");
}
