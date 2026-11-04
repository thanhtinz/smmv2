import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";
import { paypalAccessToken, paypalCaptureFlow, creditExternalDeposit } from "@/lib/payments";

export const dynamic = "force-dynamic";

/** Khách quay về từ PayPal: capture đơn đã duyệt rồi cộng tiền */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const dest = (ok: boolean, text: string) => NextResponse.redirect(new URL(`/dashboard/nap-tien?${ok ? "msg" : "err"}=${encodeURIComponent(text)}`, origin));
  const orderId = req.nextUrl.searchParams.get("token") || "";
  const s = await getSettings();
  if (!orderId || s.paypal_enabled !== "1" || !s.paypal_client_id || !s.paypal_client_secret) return dest(false, "Phiên thanh toán PayPal không hợp lệ");
  try {
    const token = await paypalAccessToken(s.paypal_client_id, s.paypal_client_secret, s.paypal_mode || "sandbox");
    const cap = await paypalCaptureFlow(token, s.paypal_mode || "sandbox", orderId);
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
