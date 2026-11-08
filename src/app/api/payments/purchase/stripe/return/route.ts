import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveIntlConfig, stripeGetSession } from "@/lib/payments";
import { settlePurchasePayment } from "@/lib/purchase";

export const dynamic = "force-dynamic";

/** Khách quay về từ Stripe Checkout (thanh toán trực tiếp mua giỏ): kiểm tra
 *  phiên đã trả thì thực thi đơn ngay (webhook là đường chính, đây là dự
 *  phòng cho lúc webhook chậm) rồi đưa khách về giỏ kèm mã phiên. */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const sessionId = req.nextUrl.searchParams.get("session_id") || "";
  const back = (code: string, okFlag: boolean) =>
    NextResponse.redirect(new URL(`/gio-hang?purchase=${encodeURIComponent(code)}${okFlag ? "&paid=1" : ""}`, origin));
  if (!sessionId) return NextResponse.redirect(new URL("/gio-hang", origin));
  const pp = await prisma.purchasePayment.findUnique({ where: { providerRef: sessionId } });
  if (!pp) return NextResponse.redirect(new URL("/gio-hang", origin));
  try {
    const cfg = await resolveIntlConfig(pp.userId);
    if (cfg.stripe) {
      const sess = await stripeGetSession(cfg.stripe.secretKey, sessionId);
      if (sess.payment_status === "paid") await settlePurchasePayment(pp.id, {});
    }
  } catch { /* webhook sẽ đối soát sau */ }
  const cur = await prisma.purchasePayment.findUnique({ where: { id: pp.id }, select: { status: true } });
  return back(pp.code, cur?.status === "EXECUTED");
}
