import { NextRequest, NextResponse } from "next/server";
import { stripeGetSession, creditExternalDeposit, resolveIntlConfigByExternalId } from "@/lib/payments";

export const dynamic = "force-dynamic";

/** Khách quay về từ Stripe Checkout: kiểm tra phiên đã trả tiền thì cộng tiền (webhook cũng cộng — claim nguyên tử nên chỉ 1 lần).
 *  Dùng secret key của đúng chủ tài khoản đã tạo phiên: web mẹ hoặc panel của khách. */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const dest = (ok: boolean, text: string) => NextResponse.redirect(new URL(`/dashboard/nap-tien?${ok ? "msg" : "err"}=${encodeURIComponent(text)}`, origin));
  const sid = req.nextUrl.searchParams.get("session_id") || "";
  if (!sid) return dest(false, "Phiên thanh toán Stripe không hợp lệ");
  const cfg = await resolveIntlConfigByExternalId(sid).catch(() => null);
  if (!cfg?.stripe) return dest(false, "Phiên thanh toán Stripe không hợp lệ");
  try {
    const sess = await stripeGetSession(cfg.stripe.secretKey, sid);
    if (sess.payment_status === "paid") {
      const r = await creditExternalDeposit(sid, sess.amount_total);
      if (r.ok) return dest(true, "Nạp tiền thành công qua Stripe — số dư đã được cộng");
      return dest(false, "Thanh toán Stripe chưa khớp dữ liệu, vui lòng liên hệ hỗ trợ");
    }
    return dest(false, "Thanh toán Stripe chưa hoàn tất");
  } catch {
    return dest(false, "Không kiểm tra được phiên Stripe, vui lòng thử lại");
  }
}
