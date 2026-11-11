import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";
import { stripeVerifySignature, creditExternalDeposit } from "@/lib/payments";

export const dynamic = "force-dynamic";

/** Webhook Stripe (ký số HMAC) — cộng tiền khi checkout.session.completed đã trả, kể cả khi khách đóng tab trước khi quay về.
 *  Webhook secret của web mẹ cấu hình ở Admin — chữ ký khớp thì xử lý. */
export async function POST(req: NextRequest) {
  const s = await getSettings();
  const raw = await req.text();
  const sig = req.headers.get("stripe-signature") || "";
  const secrets: string[] = [];
  if (s.stripe_webhook_secret) secrets.push(s.stripe_webhook_secret);
  const ok = secrets.some((sec) => stripeVerifySignature(raw, sig, sec));
  if (!ok) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  const ev: any = JSON.parse(raw || "{}");
  // Tài liệu Stripe: khi phiên hết hạn, status chuyển "expired" và sự kiện
  // checkout.session.expired được gửi — đóng phiên PENDING tương ứng ở phía
  // web (nạp ví: REJECTED; mua giỏ: EXPIRED) thay vì treo chờ vô hạn.
  if (ev?.type === "checkout.session.expired") {
    const sess = ev.data?.object;
    if (sess?.id) {
      const { prisma } = await import("@/lib/db");
      const dep = await prisma.deposit.findUnique({ where: { externalId: sess.id } });
      if (dep && dep.status === "PENDING") {
        const { failDeposit } = await import("@/lib/payments");
        await failDeposit(dep.id, "Stripe: phiên thanh toán đã hết hạn");
      } else if (!dep) {
        await prisma.purchasePayment.updateMany({ where: { providerRef: sess.id, status: "PENDING" }, data: { status: "EXPIRED" } });
      }
    }
    return NextResponse.json({ received: true });
  }
  if (ev?.type === "checkout.session.completed" || ev?.type === "checkout.session.async_payment_succeeded") {
    const sess = ev.data?.object;
    if (sess?.id && sess.payment_status === "paid") {
      const r = await creditExternalDeposit(sess.id, sess.amount_total);
      if (!r.ok && r.reason === "not_found") {
        // Không phải phiên nạp -> có thể là thanh toán trực tiếp mua giỏ hàng
        const { prisma } = await import("@/lib/db");
        const pp = await prisma.purchasePayment.findUnique({ where: { providerRef: sess.id } });
        if (pp) {
          const { settlePurchasePayment } = await import("@/lib/purchase");
          await settlePurchasePayment(pp.id, {});
        }
      }
    }
  }
  return NextResponse.json({ received: true });
}
