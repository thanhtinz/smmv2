import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveIntlConfig, paypalAccessToken, paypalCaptureFlow } from "@/lib/payments";
import { settlePurchasePayment } from "@/lib/purchase";

export const dynamic = "force-dynamic";

/** Khách quay về từ PayPal (thanh toán trực tiếp mua giỏ): capture đơn đã
 *  duyệt rồi thực thi giỏ — cùng khuôn với luồng nạp PayPal hiện có. */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const orderId = req.nextUrl.searchParams.get("token") || "";
  if (!orderId) return NextResponse.redirect(new URL("/gio-hang", origin));
  const pp = await prisma.purchasePayment.findUnique({ where: { providerRef: orderId } });
  if (!pp) return NextResponse.redirect(new URL("/gio-hang", origin));
  try {
    const cfg = await resolveIntlConfig(pp.userId);
    if (cfg.paypal) {
      const token = await paypalAccessToken(cfg.paypal.clientId, cfg.paypal.secret, cfg.paypal.mode);
      const cap = await paypalCaptureFlow(token, cfg.paypal.mode, orderId);
      if (cap.status === "COMPLETED") await settlePurchasePayment(pp.id, {});
    }
  } catch { /* chưa capture được — phiên vẫn chờ, khách có thể thử lại */ }
  const cur = await prisma.purchasePayment.findUnique({ where: { id: pp.id }, select: { status: true } });
  return NextResponse.redirect(new URL(`/gio-hang?purchase=${encodeURIComponent(pp.code)}${cur?.status === "EXECUTED" ? "&paid=1" : ""}`, origin));
}
