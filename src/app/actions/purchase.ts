"use server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { CartLineInput } from "@/app/actions/cart";
import {
  availableDirectMethods, createPurchasePayment, settlePurchasePayment, settleBoltPurchase,
  expireStalePurchases, parsePurchaseData, type DirectMethodId,
} from "@/lib/purchase";

/** Tạo phiên thanh toán trực tiếp cho giỏ (bước Xác nhận → bước Thanh toán).
 *  Chỉ tạo payable phía cổng + bản ghi PurchasePayment; đơn Premium CHƯA tạo —
 *  đơn chạy sau khi cổng xác nhận đã trả (settlePurchasePayment). */
export async function createDirectPurchaseAction(lines: CartLineInput[], promoCode: string, method: string) {
  const user = await getCurrentUser();
  if (!user) return { needLogin: true as const };
  const m = String(method || "").toUpperCase() as DirectMethodId;
  if (!["SEPAY", "BOLTUTIL", "STRIPE", "PAYPAL"].includes(m)) return { error: "Phương thức thanh toán không hợp lệ" };
  try {
    const pp = await createPurchasePayment({
      userId: user.id, method: m,
      lines: (lines || []).map((l) => ({ variantId: l.variantId, qty: l.qty, custom: l.custom || {}, buyerInfo: l.buyerInfo || null })),
      promoCode: promoCode || "",
    });
    if (!pp) return { error: "Không tạo được phiên thanh toán" };
    const data = parsePurchaseData(pp);
    return {
      code: pp.code, method: pp.method, amount: pp.amount,
      expiresAt: pp.expiresAt ? pp.expiresAt.toISOString() : null,
      data: {
        bankName: data.bankName || null, accountNumber: data.accountNumber || null, holder: data.holder || null,
        content: data.content || null, qr: data.qr || null,
        checkoutUrl: data.checkoutUrl || null, paymentAddress: data.paymentAddress || null,
        cryptoAmount: data.cryptoAmount || null, currency: data.currency || null, network: data.network || null,
      },
    };
  } catch (e: any) {
    return { error: String(e?.message || "Không tạo được phiên thanh toán").slice(0, 200) };
  }
}

export type PurchaseStatusResult = {
  status: string;
  method?: string;
  amount?: number;
  expiresAt?: string | null;
  data?: Record<string, any>;
  results?: { variantId: number; ok: boolean; code?: string; error?: string; credited?: number }[];
  orderCodes?: string[];
  lines?: { variantId: number; custom: Record<string, string>; buyerInfo: string | null }[];
};

/** Poll trạng thái phiên (trang giỏ gọi mỗi vài giây ở bước Thanh toán):
 *  tự hết hạn phiên SePay quá giờ, tự hỏi lại BoltUtil/Stripe khi webhook
 *  chưa về — đối soát dự phòng như các luồng nạp hiện có. */
export async function getPurchaseStatusAction(code: string): Promise<PurchaseStatusResult | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const pp = await prisma.purchasePayment.findUnique({ where: { code: String(code || "") } });
  if (!pp || pp.userId !== user.id) return null;
  await expireStalePurchases().catch(() => {});
  let cur = await prisma.purchasePayment.findUnique({ where: { id: pp.id } });
  if (!cur) return null;

  if (cur.status === "PENDING") {
    try {
      if (cur.method === "BOLTUTIL") {
        const { getBoltConfig, boltGetStatus } = await import("@/lib/boltutil");
        const cfg = await getBoltConfig();
        if (cfg.enabled) {
          const st = await boltGetStatus(cfg, cur.code).catch(() => null);
          if (st) await settleBoltPurchase(cur.id, st);
        }
      } else if (cur.method === "STRIPE" && cur.providerRef) {
        const { resolveIntlConfig, stripeGetSession } = await import("@/lib/payments");
        const cfg = await resolveIntlConfig(user.id);
        if (cfg.stripe) {
          const sess = await stripeGetSession(cfg.stripe.secretKey, cur.providerRef).catch(() => null);
          if (sess && sess.payment_status === "paid") await settlePurchasePayment(cur.id, {});
          else if (sess && sess.status === "expired") await prisma.purchasePayment.updateMany({ where: { id: cur.id, status: "PENDING" }, data: { status: "EXPIRED" } });
        }
      }
    } catch { /* lỗi hỏi cổng không chặn poll */ }
    cur = (await prisma.purchasePayment.findUnique({ where: { id: pp.id } })) || cur;
  }

  const data = parsePurchaseData(cur);
  const snapshot = (() => { try { return JSON.parse(cur.snapshot); } catch { return { lines: [] }; } })();
  return {
    status: cur.status,
    method: cur.method,
    amount: cur.amount,
    expiresAt: cur.expiresAt ? cur.expiresAt.toISOString() : null,
    data: {
      bankName: data.bankName || null, accountNumber: data.accountNumber || null, holder: data.holder || null,
      content: data.content || null, qr: data.qr || null,
      checkoutUrl: data.checkoutUrl || null, paymentAddress: data.paymentAddress || null,
      cryptoAmount: data.cryptoAmount || null, currency: data.currency || null, network: data.network || null,
    },
    results: Array.isArray(data.execution) ? data.execution : undefined,
    orderCodes: (() => { try { return cur.orderCodes ? JSON.parse(cur.orderCodes) : []; } catch { return []; } })(),
    lines: (snapshot.lines || []).map((l: any) => ({ variantId: l.variantId, custom: l.custom || {}, buyerInfo: l.buyerInfo || null })),
  };
}

/** Khách huỷ phiên đang chờ (chưa trả): đóng phiên, giỏ giữ nguyên. */
export async function cancelPurchaseAction(code: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const pp = await prisma.purchasePayment.findUnique({ where: { code: String(code || "") }, select: { id: true, userId: true } });
  if (!pp || pp.userId !== user.id) return { ok: false };
  await prisma.purchasePayment.updateMany({ where: { id: pp.id, status: "PENDING" }, data: { status: "CANCELED" } });
  return { ok: true };
}

/** Danh sách cổng trực tiếp đang khả dụng (trang giỏ cũng nhận qua props —
 *  action này để client làm mới khi cần). */
export async function directMethodsAction() {
  return availableDirectMethods();
}
