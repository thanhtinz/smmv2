import { prisma } from "@/lib/db";
import { getSettings, usdtRateOf, depositContent } from "@/lib/settings";
import { genCode } from "@/lib/format";
import { flashPercentForProduct, applyFlashAmount } from "@/lib/flash";
import { checkPromo } from "@/lib/promo";
import { createPremiumOrder } from "@/lib/orders";
import { applyBalance } from "@/lib/wallet";
import { notifyUser } from "@/lib/notify";
import { vietqrUrl } from "@/lib/vietqr";

/** ================================================================
 *  THANH TOÁN TRỰC TIẾP KHI MUA GIỎ HÀNG (lệnh Tín 2026-11-08)
 *  Bên cạnh trả bằng ví: khách chọn 1 cổng (SePay QR / BoltUtil /
 *  Stripe / PayPal — chỉ cổng admin đã BẬT + tick "thanh toán trực
 *  tiếp"), trả tiền ở bước Thanh toán, đơn Premium CHỈ được tạo sau
 *  khi cổng xác nhận đã trả — chạy qua createPremiumOrder với cờ
 *  externalPaid (không trừ ví, giữ nguyên kho/flash/promo/API).
 *  Dòng nào không đặt được SAU khi đã trả: tiền của dòng đó được
 *  cộng vào VÍ của khách (bồi hoàn) + thông báo rõ.
 *  Bản ghi bền = PurchasePayment (model riêng, không mượn Deposit).
 *  ================================================================ */

export type DirectMethodId = "SEPAY" | "BOLTUTIL" | "STRIPE" | "PAYPAL";
export const DIRECT_METHODS: { id: DirectMethodId; name: string }[] = [
  { id: "SEPAY", name: "QR ngân hàng (SePay)" },
  { id: "BOLTUTIL", name: "USDT (BoltUtil)" },
  { id: "STRIPE", name: "Stripe" },
  { id: "PAYPAL", name: "PayPal" },
];

export type PurchaseLine = { variantId: number; qty: number; custom: Record<string, string>; buyerInfo?: string | null; share: number };
export type PurchaseSnapshot = { lines: PurchaseLine[]; promo: string | null };

export const parsePurchaseData = (pp: { providerData: string | null }): any => {
  try { return pp.providerData ? JSON.parse(pp.providerData) : {}; } catch { return {}; }
};
const savePurchaseData = async (id: number, patch: Record<string, any>) => {
  const pp = await prisma.purchasePayment.findUnique({ where: { id }, select: { providerData: true } });
  if (!pp) return;
  await prisma.purchasePayment.update({ where: { id }, data: { providerData: JSON.stringify({ ...parsePurchaseData(pp), ...patch }) } });
};

/** Cổng nào được phép thanh toán trực tiếp lúc này: có tick "Thanh toán trực
 *  tiếp" + đủ cấu hình. Hai tick mục đích ĐỘC LẬP — cổng chỉ mở trực tiếp
 *  (tắt nạp ví) vẫn hiện ở giỏ, và ngược lại. */
export async function availableDirectMethods(): Promise<{ id: DirectMethodId; name: string }[]> {
  const s = await getSettings();
  const out: { id: DirectMethodId; name: string }[] = [];
  if (s.direct_sepay_enabled === "1" && s.sepay_secret) {
    const bank = await prisma.bankAccount.findFirst({ where: { active: true }, select: { id: true } });
    if (bank) out.push(DIRECT_METHODS[0]);
  }
  if (s.direct_boltutil_enabled === "1" && s.boltutil_api_key && s.boltutil_webhook_secret) out.push(DIRECT_METHODS[1]);
  if (s.direct_stripe_enabled === "1" && s.stripe_secret_key) out.push(DIRECT_METHODS[2]);
  if (s.direct_paypal_enabled === "1" && s.paypal_client_id && s.paypal_client_secret) out.push(DIRECT_METHODS[3]);
  return out;
}

/** Tổng phải trả của giỏ — tính BẰNG ĐÚNG công thức createPremiumOrder cho
 *  từng dòng (giá gói → flash → mã giảm giá) để số khách trả khớp số tiền
 *  các đơn sẽ ghi. share = phần tiền của từng dòng trong tổng đó. */
export async function computeCartPayable(lines: { variantId: number; qty: number; custom: Record<string, string>; buyerInfo?: string | null }[], promoCode: string) {
  const shares: number[] = [];
  for (const line of lines.slice(0, 50)) {
    const variant = await prisma.premiumVariant.findUnique({ where: { id: line.variantId }, select: { price: true, providerGroup: true, product: { select: { id: true } } } });
    if (!variant) throw new Error("Gói không tồn tại hoặc đã ngưng bán");
    if ((variant.providerGroup || "").startsWith("telegram_")) throw new Error("Sản phẩm Telegram đặt riêng ở mục Telegram Premium");
    let total = variant.price * Math.max(1, Math.floor(line.qty) || 1);
    const flashPct = await flashPercentForProduct(variant.product.id);
    if (flashPct > 0) total = applyFlashAmount(total, flashPct);
    const promo = promoCode?.trim() ? await checkPromo(promoCode.trim().toUpperCase(), "PREMIUM", total) : null;
    if (promo) total -= promo.discount;
    shares.push(total);
  }
  return { total: shares.reduce((a, b) => a + b, 0), shares };
}

/** Tạo bản ghi thanh toán + payable của cổng. Ném Error (message cho khách)
 *  khi cổng chưa sẵn sàng / số tiền không đạt tối thiểu của cổng. */
export async function createPurchasePayment(input: {
  userId: number;
  method: DirectMethodId;
  lines: { variantId: number; qty: number; custom: Record<string, string>; buyerInfo?: string | null }[];
  promoCode: string;
}) {
  const available = await availableDirectMethods();
  if (!available.some((x) => x.id === input.method)) throw new Error("Phương thức thanh toán này chưa được bật");
  const { total, shares } = await computeCartPayable(input.lines, input.promoCode);
  if (total <= 0) throw new Error("Giỏ hàng trống hoặc tổng tiền không hợp lệ");
  const s = await getSettings();
  const snapshot: PurchaseSnapshot = {
    lines: input.lines.slice(0, 50).map((l, i) => ({ variantId: l.variantId, qty: Math.max(1, Math.floor(l.qty) || 1), custom: l.custom || {}, buyerInfo: l.buyerInfo || null, share: shares[i] })),
    promo: input.promoCode?.trim() ? input.promoCode.trim().toUpperCase() : null,
  };
  const expiryMinutes = Math.min(120, Math.max(5, parseInt(s.purchase_payment_expires_minutes || "30") || 30));
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);
  const pp = await prisma.purchasePayment.create({
    data: { code: "TMP", userId: input.userId, method: input.method, amount: total, status: "PENDING", snapshot: JSON.stringify(snapshot), expiresAt },
  });
  const code = genCode("MUA", pp.id);
  await prisma.purchasePayment.update({ where: { id: pp.id }, data: { code } });

  try {
    if (input.method === "SEPAY") {
      const bank = await prisma.bankAccount.findFirst({ where: { active: true }, orderBy: { sort: "asc" } });
      if (!bank) throw new Error("Chưa có tài khoản ngân hàng nhận tiền");
      const content = depositContent(code);
      await savePurchaseData(pp.id, {
        bankName: bank.bankName, accountNumber: bank.accountNumber, holder: bank.holder,
        content, qr: vietqrUrl(bank.bankName, bank.accountNumber, bank.holder, content),
      });
    } else if (input.method === "BOLTUTIL") {
      const { getBoltConfig, boltCreateOrder } = await import("@/lib/boltutil");
      const cfg = await getBoltConfig();
      if (!cfg.configured) throw new Error("Cổng USDT chưa cấu hình đủ API key / webhook secret");
      const rate = usdtRateOf(s);
      const usd = Math.round((total / rate) * 100) / 100;
      const minUsd = parseFloat(s.usdt_min || "") || 5;
      if (usd < minUsd) throw new Error(`Tổng đơn chưa đạt tối thiểu ${minUsd} USD của cổng USDT`);
      const network = cfg.defaultNetwork;
      const order = await boltCreateOrder(cfg, { externalOrderId: code, amountUsd: usd, network });
      // Hạn phiên = hạn cấu hình của web, hoặc hạn cổng trả về nếu sớm hơn.
      const boltExpiry = order.expiresAt ? new Date(order.expiresAt) : null;
      await prisma.purchasePayment.update({ where: { id: pp.id }, data: { providerRef: `bolt:${code}`, expiresAt: boltExpiry && boltExpiry < expiresAt ? boltExpiry : expiresAt } });
      await savePurchaseData(pp.id, {
        rateVndPerUsd: rate, network, currency: "USDT", boltOrderId: order.orderId || null,
        checkoutUrl: order.checkoutUrl || order.paymentUrl || null,
        paymentAddress: order.paymentAddress || null,
        cryptoAmount: order.cryptoAmount != null ? String(order.cryptoAmount) : null,
        boltStatus: order.status || "PENDING",
      });
    } else if (input.method === "STRIPE") {
      const { resolveIntlConfig, stripeCreateCheckout, siteOrigin } = await import("@/lib/payments");
      const cfg = await resolveIntlConfig(input.userId);
      if (!cfg.stripe) throw new Error("Stripe chưa được cấu hình");
      const usdCents = Math.round((total / cfg.rate) * 100);
      if (usdCents < Math.round(cfg.minUsd * 100)) throw new Error(`Tổng đơn chưa đạt tối thiểu ${cfg.minUsd} USD của Stripe`);
      const origin = await siteOrigin();
      const sess = await stripeCreateCheckout(cfg.stripe.secretKey, {
        amountCents: usdCents, depositCode: code,
        successUrl: `${origin}/api/payments/purchase/stripe/return?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${origin}/gio-hang`,
      });
      await prisma.purchasePayment.update({ where: { id: pp.id }, data: { providerRef: sess.id } });
      await savePurchaseData(pp.id, { checkoutUrl: sess.url, usdCents });
    } else if (input.method === "PAYPAL") {
      const { resolveIntlConfig, paypalAccessToken, paypalCreateOrder, siteOrigin } = await import("@/lib/payments");
      const cfg = await resolveIntlConfig(input.userId);
      if (!cfg.paypal) throw new Error("PayPal chưa được cấu hình");
      const usd = total / cfg.rate;
      if (usd < cfg.minUsd) throw new Error(`Tổng đơn chưa đạt tối thiểu ${cfg.minUsd} USD của PayPal`);
      const origin = await siteOrigin();
      const token = await paypalAccessToken(cfg.paypal.clientId, cfg.paypal.secret, cfg.paypal.mode);
      const order = await paypalCreateOrder(token, cfg.paypal.mode, {
        amountUsd: usd.toFixed(2), depositCode: code,
        returnUrl: `${origin}/api/payments/purchase/paypal/return`,
        cancelUrl: `${origin}/gio-hang`,
      });
      await prisma.purchasePayment.update({ where: { id: pp.id }, data: { providerRef: order.id } });
      await savePurchaseData(pp.id, { checkoutUrl: order.approveUrl, usd: usd.toFixed(2) });
    }
  } catch (e) {
    await prisma.purchasePayment.update({ where: { id: pp.id }, data: { status: "FAILED" } });
    throw e;
  }
  return prisma.purchasePayment.findUnique({ where: { id: pp.id } });
}

/** Thực thi giỏ sau khi cổng xác nhận đã trả. paidVnd = số VNĐ cổng xác nhận
 *  thực nhận (null = tin theo số của cổng quốc tế đã khớp ở tầng gọi).
 *  finalIfUnderpaid: "wait" (SePay — khách có thể chuyển thêm cho đủ) hoặc
 *  "wallet" (BoltUtil — phiên đã chốt, thiếu thì hoàn phần đã nhận vào ví). */
export async function settlePurchasePayment(ppId: number, opts: { paidVnd?: number | null; finalIfUnderpaid?: "wait" | "wallet" } = {}): Promise<{ ok: boolean; reason: string }> {
  const pp = await prisma.purchasePayment.findUnique({ where: { id: ppId } });
  if (!pp) return { ok: false, reason: "not_found" };
  if (pp.status === "EXECUTED") return { ok: true, reason: "already" };
  if (pp.status !== "PENDING" && pp.status !== "EXPIRED") return { ok: false, reason: `status_${pp.status.toLowerCase()}` };

  const data = parsePurchaseData(pp);
  let received = Number(data.receivedVnd || 0);
  if (opts.paidVnd != null && opts.paidVnd > 0) received += opts.paidVnd;
  if (received > 0 && received < pp.amount) {
    if (opts.finalIfUnderpaid === "wallet") {
      await prisma.$transaction(async (tx) => {
        const claim = await tx.purchasePayment.updateMany({ where: { id: pp.id, status: { in: ["PENDING", "EXPIRED"] } }, data: { status: "FAILED", paidAt: new Date() } });
        if (claim.count !== 1) return;
        await applyBalance(tx, pp.userId, received, "REFUND", pp.code, `Thanh toán trực tiếp ${pp.code} thiếu tiền — hoàn vào ví`);
      });
      await savePurchaseData(pp.id, { receivedVnd: received, underpaid: true });
      await notifyUser(pp.userId, "Thanh toán chưa đủ", `Phiên ${pp.code} nhận ${received.toLocaleString("vi-VN")}đ, thiếu so với tổng đơn — số tiền đã nhận được cộng vào ví của bạn.`, "/gio-hang");
      return { ok: false, reason: "underpaid_credited" };
    }
    await savePurchaseData(pp.id, { receivedVnd: received });
    return { ok: false, reason: "underpaid" };
  }

  // Claim nguyên tử: chỉ một luồng (webhook / poll / return) được thực thi.
  const claimed = await prisma.$transaction(async (tx) => {
    const claim = await tx.purchasePayment.updateMany({ where: { id: pp.id, status: { in: ["PENDING", "EXPIRED"] } }, data: { status: "EXECUTED", paidAt: new Date() } });
    if (claim.count !== 1) return false;
    const excess = received - pp.amount;
    if (excess > 0) await applyBalance(tx, pp.userId, excess, "REFUND", pp.code, `Thanh toán trực tiếp ${pp.code} thừa tiền — hoàn phần thừa vào ví`);
    return true;
  });
  if (!claimed) return { ok: true, reason: "raced" };

  const user = await prisma.user.findUnique({ where: { id: pp.userId } });
  const snapshot = JSON.parse(pp.snapshot) as PurchaseSnapshot;
  const okCodes: string[] = [];
  const results: { variantId: number; ok: boolean; code?: string; error?: string; credited?: number }[] = [];
  let creditedTotal = 0;
  for (const line of snapshot.lines) {
    try {
      if (!user) throw new Error("Tài khoản không tồn tại");
      const order: any = await createPremiumOrder({
        user, variantId: line.variantId, quantity: line.qty,
        customData: line.custom && Object.keys(line.custom).length ? line.custom : undefined,
        buyerInfo: line.buyerInfo || undefined,
        promoCode: snapshot.promo || undefined,
        externalPaid: { method: pp.method, ref: pp.code },
      });
      okCodes.push(order.code);
      // Giá chốt lúc thực thi THẤP hơn phần đã trả của dòng -> hoàn chênh lệch vào ví
      const diff = line.share - Number(order.total || 0);
      if (diff > 0) {
        await prisma.$transaction(async (tx) => {
          await applyBalance(tx, pp.userId, diff, "REFUND", pp.code, `Hoàn chênh lệch giá đơn ${order.code} (thanh toán trực tiếp ${pp.code})`);
        }).catch(() => {});
        creditedTotal += diff;
      }
      results.push({ variantId: line.variantId, ok: true, code: order.code });
    } catch (e: any) {
      // Đã trả tiền mà không đặt được dòng này -> bồi hoàn phần tiền của dòng vào ví
      const msg = String(e?.message || "Đặt đơn thất bại").slice(0, 200);
      await prisma.$transaction(async (tx) => {
        await applyBalance(tx, pp.userId, line.share, "REFUND", pp.code, `Bồi hoàn dòng không đặt được — thanh toán trực tiếp ${pp.code}`);
      }).catch(() => {});
      creditedTotal += line.share;
      results.push({ variantId: line.variantId, ok: false, error: msg, credited: line.share });
    }
  }
  await prisma.purchasePayment.update({ where: { id: pp.id }, data: { orderCodes: JSON.stringify(okCodes) } });
  await savePurchaseData(pp.id, { receivedVnd: received, execution: results });
  if (creditedTotal > 0) {
    await notifyUser(pp.userId, "Một phần đơn được hoàn vào ví", `Thanh toán ${pp.code}: ${creditedTotal.toLocaleString("vi-VN")}đ đã cộng vào ví của bạn (dòng không đặt được hoặc chênh lệch giá).`, "/dashboard/don-premium");
  }
  return { ok: true, reason: "executed" };
}

/** Phiên BOLTUTIL chốt trạng thái: đối soát như settleBoltutilDeposit nhưng
 *  đích là thực thi giỏ thay vì cộng ví nạp. */
export async function settleBoltPurchase(ppId: number, payload: any): Promise<{ ok: boolean; reason: string }> {
  const pp = await prisma.purchasePayment.findUnique({ where: { id: ppId } });
  if (!pp || pp.method !== "BOLTUTIL") return { ok: false, reason: "not_found" };
  const data = parsePurchaseData(pp);
  const status = String(payload?.status || "").toUpperCase();
  if (status === "EXPIRED" || status === "FAILED") {
    await prisma.purchasePayment.updateMany({ where: { id: pp.id, status: "PENDING" }, data: { status: "EXPIRED" } });
    await savePurchaseData(pp.id, { boltStatus: status });
    return { ok: true, reason: status.toLowerCase() };
  }
  if (status !== "CONFIRMED" && status !== "COMPLETED") {
    await savePurchaseData(pp.id, { boltStatus: status || data.boltStatus });
    return { ok: false, reason: "not_final" };
  }
  const rate = Number(data.rateVndPerUsd) || 0;
  const actualUsd = [payload?.actualReceivedAmount, payload?.merchantNetAmount, payload?.paidAmount]
    .map((x: any) => (x === undefined || x === null || x === "" ? NaN : Number(x)))
    .find((x: number) => Number.isFinite(x) && x > 0);
  const paidVnd = actualUsd !== undefined && rate > 0 ? Math.round(actualUsd * rate) : pp.amount;
  return settlePurchasePayment(pp.id, { paidVnd, finalIfUnderpaid: "wallet" });
}

/** Quét phiên quá hạn (cron + gọi lười từ poll trạng thái). */
export async function expireStalePurchases(): Promise<number> {
  const r = await prisma.purchasePayment.updateMany({
    where: { status: "PENDING", expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });
  return r.count;
}
