import crypto from "crypto";
import { headers } from "next/headers";
import { prisma } from "./db";
import { applyBalance } from "./wallet";
import { getSettings, calcBonus, bonusTiersFor, DEFAULT_SETTINGS } from "./settings";
import { genCode } from "./format";

/** Nạp tiền qua cổng quốc tế (PayPal / Stripe): khách trả USD, hệ thống cộng VND theo tỉ giá usd_rate.
 *  Mỗi phiên thanh toán = 1 Deposit (method PAYPAL/STRIPE) gắn externalId duy nhất phía cổng;
 *  cộng tiền qua creditExternalDeposit — claim nguyên tử PENDING -> APPROVED nên webhook và
 *  trang quay về gọi cùng lúc cũng chỉ cộng đúng 1 lần. */
export const MIN_USD = 5;

/** Cấu hình cổng quốc tế của web mẹ (PayPal/Stripe + tỉ giá + mức nạp tối thiểu).
 *  Dùng cho cả lúc tạo checkout, trang quay về và webhook. */
export type IntlConfig = {
  source: "mother";
  rate: number;
  minUsd: number;
  paypal: { clientId: string; secret: string; mode: string } | null;
  stripe: { secretKey: string; webhookSecret: string | null } | null;
};

export async function resolveIntlConfig(userId: number): Promise<IntlConfig> {
  const s = await getSettings();
  let rate = parseInt(s.usd_rate || DEFAULT_SETTINGS.usd_rate, 10) || Number(DEFAULT_SETTINGS.usd_rate);
  let paypal: IntlConfig["paypal"] =
    s.paypal_enabled === "1" && s.paypal_client_id && s.paypal_client_secret
      ? { clientId: s.paypal_client_id, secret: s.paypal_client_secret, mode: s.paypal_mode || "sandbox" }
      : null;
  let stripe: IntlConfig["stripe"] =
    s.stripe_enabled === "1" && s.stripe_secret_key
      ? { secretKey: s.stripe_secret_key, webhookSecret: s.stripe_webhook_secret || null }
      : null;
  const minUsd = parseInt(s.intl_min_usd) || MIN_USD;
  const source: IntlConfig["source"] = "mother";
  return { source, rate, paypal, stripe, minUsd };
}

/** Như resolveIntlConfig nhưng tra từ externalId của Deposit (trang quay về / capture). */
export async function resolveIntlConfigByExternalId(externalId: string): Promise<IntlConfig | null> {
  const dep = await prisma.deposit.findUnique({ where: { externalId }, select: { userId: true } });
  if (!dep) return null;
  return resolveIntlConfig(dep.userId);
}

/** Origin để dựng URL quay về sau thanh toán: CHỈ tin Host thuộc hệ thống
 *  (domain chính đã cấu hình) — không lấy thẳng header
 *  Host lạ (kẻ tấn công chèn Host để link quay về trỏ sang trang giả mạo). */
export async function siteOrigin(): Promise<string> {
  const h = headers();
  const rawHost = (h.get("x-forwarded-host") || h.get("host") || "").split(",")[0].trim();
  const host = rawHost.split(":")[0].toLowerCase();
  if (host === "localhost" || host.startsWith("127.")) return `http://${rawHost}`;
  const mainHost = (process.env.MAIN_HOST || "").toLowerCase();
  if (host && mainHost && host === mainHost) return `https://${host}`;
  const envUrl = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  return envUrl || "http://localhost:3000";
}

export async function createPendingDeposit(userId: number, method: "PAYPAL" | "STRIPE", amountVnd: number, usdCents: number) {
  const d = await prisma.deposit.create({ data: { code: "TMP", userId, method, amount: amountVnd, usdCents, status: "PENDING", auto: true } });
  const code = genCode("NAP", d.id);
  await prisma.deposit.update({ where: { id: d.id }, data: { code } });
  return { ...d, code };
}

export async function attachExternalId(depositId: number, externalId: string) {
  await prisma.deposit.update({ where: { id: depositId }, data: { externalId } });
}

export async function failDeposit(depositId: number, note: string) {
  await prisma.deposit.updateMany({ where: { id: depositId, status: "PENDING" }, data: { status: "REJECTED", adminNote: note.slice(0, 250) } });
}

export async function creditExternalDeposit(externalId: string, paidUsdCents?: number): Promise<{ ok: boolean; reason: string }> {
  const dep = await prisma.deposit.findUnique({ where: { externalId } });
  if (!dep) return { ok: false, reason: "not_found" };
  if (dep.status === "APPROVED") return { ok: true, reason: "already" };
  if (dep.status !== "PENDING") return { ok: false, reason: "not_pending" };
  if (paidUsdCents != null && dep.usdCents != null && paidUsdCents !== dep.usdCents) return { ok: false, reason: "amount_mismatch" };
  const settings = await getSettings();
  const bonus = calcBonus(dep.amount, bonusTiersFor(null, false, settings.deposit_bonus_tiers));
  const credited = await prisma.$transaction(async (tx) => {
    const claim = await tx.deposit.updateMany({ where: { id: dep.id, status: "PENDING" }, data: { status: "APPROVED", bonus } });
    if (claim.count !== 1) return false;
    await applyBalance(tx, dep.userId, dep.amount, "DEPOSIT", dep.code, dep.method === "STRIPE" ? "Nạp tiền qua Stripe" : "Nạp tiền qua PayPal");
    if (bonus > 0) await applyBalance(tx, dep.userId, bonus, "BONUS", dep.code, "Thưởng nạp tiền");
    return true;
  });
  if (credited) {
    const { alertMother } = await import("./alerts");
    await alertMother("deposit_success", "Nạp tiền quốc tế thành công", `+${dep.amount.toLocaleString("vi-VN")}đ qua ${dep.method} — mã ${dep.code}`);
  }
  return { ok: credited, reason: credited ? "credited" : "raced" };
}

/* ============================== STRIPE (REST, không cần SDK) ============================== */
export async function stripeCreateCheckout(secretKey: string, p: { amountCents: number; depositCode: string; successUrl: string; cancelUrl: string }) {
  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("success_url", p.successUrl);
  body.set("cancel_url", p.cancelUrl);
  body.set("client_reference_id", p.depositCode);
  body.set("metadata[deposit_code]", p.depositCode);
  body.set("line_items[0][quantity]", "1");
  body.set("line_items[0][price_data][currency]", "usd");
  body.set("line_items[0][price_data][unit_amount]", String(p.amountCents));
  body.set("line_items[0][price_data][product_data][name]", `Nạp tiền SMMv2 ${p.depositCode}`);
  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const j: any = await r.json().catch(() => null);
  if (!r.ok || !j?.id || !j?.url) throw new Error(j?.error?.message || `Stripe HTTP ${r.status}`);
  return j as { id: string; url: string; payment_status?: string; amount_total?: number };
}

export async function stripeGetSession(secretKey: string, id: string) {
  const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const j: any = await r.json().catch(() => null);
  if (!r.ok || !j?.id) throw new Error(j?.error?.message || `Stripe HTTP ${r.status}`);
  return j as { id: string; payment_status?: string; amount_total?: number; status?: string };
}

/** Kiểm chữ ký webhook Stripe: HMAC-SHA256(secret, "<t>.<rawBody>") so với v1, lệch giờ tối đa 5 phút */
export function stripeVerifySignature(rawBody: string, sigHeader: string, secret: string): boolean {
  try {
    const parts = sigHeader.split(",").map((x) => x.trim());
    const t = parts.find((x) => x.startsWith("t="))?.slice(2);
    const v1 = parts.find((x) => x.startsWith("v1="))?.slice(3);
    if (!t || !v1) return false;
    if (Math.abs(Math.floor(Date.now() / 1000) - parseInt(t, 10)) > 300) return false;
    const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(v1);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

/* ============================== PAYPAL (REST v2) ============================== */
const ppBase = (mode: string) => (mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com");

export async function paypalAccessToken(clientId: string, secret: string, mode: string): Promise<string> {
  const r = await fetch(`${ppBase(mode)}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const j: any = await r.json().catch(() => null);
  if (!r.ok || !j?.access_token) throw new Error(j?.error_description || `PayPal auth HTTP ${r.status}`);
  return j.access_token as string;
}

export async function paypalCreateOrder(token: string, mode: string, p: { amountUsd: string; depositCode: string; returnUrl: string; cancelUrl: string }) {
  const r = await fetch(`${ppBase(mode)}/v2/checkout/orders`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [{ reference_id: p.depositCode, custom_id: p.depositCode, amount: { currency_code: "USD", value: p.amountUsd } }],
      application_context: { return_url: p.returnUrl, cancel_url: p.cancelUrl, user_action: "PAY_NOW", brand_name: "SMMv2" },
    }),
  });
  const j: any = await r.json().catch(() => null);
  if (!r.ok || !j?.id) throw new Error(j?.message || `PayPal HTTP ${r.status}`);
  const approve = (j.links || []).find((l: any) => l.rel === "approve" || l.rel === "payer-action")?.href;
  if (!approve) throw new Error("PayPal không trả link duyệt thanh toán");
  return { id: j.id as string, approveUrl: approve as string };
}

export async function paypalGetOrder(token: string, mode: string, orderId: string) {
  const r = await fetch(`${ppBase(mode)}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j: any = await r.json().catch(() => null);
  if (!r.ok || !j?.id) throw new Error(j?.message || `PayPal HTTP ${r.status}`);
  return j;
}

function captureOf(order: any): { captureId: string; cents: number } | null {
  const cap = order?.purchase_units?.[0]?.payments?.captures?.[0];
  if (!cap?.id || !cap?.amount?.value) return null;
  return { captureId: cap.id, cents: Math.round(parseFloat(cap.amount.value) * 100) };
}

/** Khi khách quay về từ PayPal: đơn APPROVED -> capture; đã COMPLETED -> đọc capture sẵn có */
export async function paypalCaptureFlow(token: string, mode: string, orderId: string): Promise<{ status: string; cents: number | null }> {
  const order = await paypalGetOrder(token, mode, orderId);
  if (order.status === "COMPLETED") {
    const c = captureOf(order);
    return { status: "COMPLETED", cents: c?.cents ?? null };
  }
  if (order.status !== "APPROVED") return { status: String(order.status || "UNKNOWN"), cents: null };
  const r = await fetch(`${ppBase(mode)}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const j: any = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.message || `PayPal capture HTTP ${r.status}`);
  const c = captureOf(j);
  return { status: String(j.status || ""), cents: c?.cents ?? null };
}
