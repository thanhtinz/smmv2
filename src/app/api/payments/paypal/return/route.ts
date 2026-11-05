import { NextRequest, NextResponse } from "next/server";
import { paypalAccessToken, paypalCaptureFlow, creditExternalDeposit, resolveIntlConfigByExternalId } from "@/lib/payments";

export const dynamic = "force-dynamic";

/** Khách quay về từ PayPal: capture đơn đã duyệt rồi cộng tiền.
 *  Dùng key của đúng chủ tài khoản đã tạo order: web mẹ hoặc panel của khách. */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const dest = (ok: boolean, text: string) => NextResponse.redirect(new URL(`/dashboard/nap-tien?${ok ? "msg" : "err"}=${encodeURIComponent(text)}`, origin));
  const orderId = req.nextUrl.searchParams.get("token") || "";
  if (!orderId) return dest(false, "Phiên thanh toán PayPal không hợp lệ");
  const cfg = await resolveIntlConfigByExternalId(orderId).catch(() => null);
  if (!cfg?.paypal) return dest(false, "Phiên thanh toán PayPal không hợp lệ");
  try {
    const token = await paypalAccessToken(cfg.paypal.clientId, cfg.paypal.secret, cfg.paypal.mode);
    const cap = await paypalCaptureFlow(token, cfg.paypal.mode, orderId);
    if (cap.status === "COMPLETED" && cap.cents != null) {
      const r = await creditExternalDeposit(orderId, cap.cents);
      if (r.ok) return dest(true, "Nạp tiền thành công qua PayPal — số dư đã được cộng");
      return dest(false, "Thanh toán PayPal chưa khớp dữ liệu, vui lòng liên hệ hỗ trợ");
    }
    return dest(false, "Thanh toán PayPal chưa hoàn tất");
  } catch {
    return dest(false, "Không hoàn tất được thanh toán PayPal, vui lòng thử lại");
  }
}
