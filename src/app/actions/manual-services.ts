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
  // Lỗi phía nhà cung cấp: khách chỉ thấy thông báo sạch như các khu FZR khác.
  if (/FZR|provider|nhà cung cấp|402|403/i.test(msg)) back(path, "err", "Dịch vụ tạm gián đoạn, vui lòng thử lại sau");
  back(path, "err", msg || "Đặt đơn thất bại");
}

/** Đặt dịch vụ Manual Services: gói = offer (variant providerGroup
 *  "manual", providerItemId = offer id phía FZR) của category đã chọn —
 *  chạy qua createPremiumOrder như mọi đơn Premium (trừ ví, flash/promo,
 *  thực thi FZR manual theo tài liệu: order { manual_service_id,
 *  product_id, fields? } — fields CHỈ có với category replenishment, dựng
 *  theo key của NCC từ customData theo nhãn). Đơn manual KHÔNG có số
 *  lượng — mỗi đơn đúng 1 gói. Sản phẩm không có trường nào thì buyerInfo
 *  là danh tính tài khoản mua (như Gift Card). */
export async function placeManualAction(formData: FormData) {
  const user = await requireUser();
  if (!(await moduleOn("manual"))) redirect("/");
  const variantId = parseInt(String(formData.get("variantId") || "0")) || 0;
  const variant = await prisma.premiumVariant.findUnique({
    where: { id: variantId },
    select: {
      id: true, productId: true, providerGroup: true, active: true,
      product: { select: { customFields: true } },
    },
  });
  const path = variant ? `/dashboard/manual-services/${variant.productId}` : "/dashboard/manual-services";
  if (!variant || variant.providerGroup !== "manual" || !variant.active) back(path, "err", "Gói dịch vụ không khả dụng");
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
  back("/dashboard/manual-services/don-hang", "msg", "Đặt đơn thành công — dịch vụ được xử lý thủ công, theo dõi tiến độ trong Đơn hàng Manual Services");
}
