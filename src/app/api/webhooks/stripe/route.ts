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
  if (ev?.type === "checkout.session.completed" || ev?.type === "checkout.session.async_payment_succeeded") {
    const sess = ev.data?.object;
    if (sess?.id && sess.payment_status === "paid") await creditExternalDeposit(sess.id, sess.amount_total);
  }
  return NextResponse.json({ received: true });
}
