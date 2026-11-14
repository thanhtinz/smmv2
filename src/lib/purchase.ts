import { prisma } from "@/lib/db";
import { getSettings, usdtRateOf, depositContent } from "@/lib/settings";
import { genCode } from "@/lib/format";
import { flashPercentForProduct, applyFlashAmount } from "@/lib/flash";
import { checkPromo } from "@/lib/promo";
import { createPremiumOrder } from "@/lib/orders";
import { applyBalance } from "@/lib/wallet";
import { notifyUser } from "@/lib/notify";
import { alertMother } from "@/lib/alerts";
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
 *  từng dòng (giá gói → flash → mã giảm giá → giảm thêm Pass) để số khách trả
 *  khớp số tiền các đơn sẽ ghi. share = phần tiền của từng dòng trong tổng đó.
 *  userId để tính giảm Pass của CHÍNH khách đó (chưa biết khách thì bỏ qua). */
export async function computeCartPayable(lines: { variantId: number; qty: number; custom: Record<string, string>; buyerInfo?: string | null }[], promoCode: string, userId?: number) {
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
    if (userId) {
      const { passDiscountFor } = await import("./pass");
      total -= await passDiscountFor(userId, "PREMIUM", total);
    }
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
  const { total, shares } = await computeCartPayable(input.lines, input.promoCode, input.userId);
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
      const order = await boltCreateOrder(cfg, { externalOrderId: code, amountUsd: usd, network, returnPath: "/gio-hang" });
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
      // Hạn phiên Stripe phải khớp hạn phiên nội bộ (expiresAt ở trên):
      // tài liệu Stripe chỉ nhận expires_at trong khoảng 30 phút – 24 giờ
      // kể từ lúc tạo, nên kẹp hạn nội bộ vào khoảng đó (+60 giây đệm cho
      // độ trễ đường truyền ở biên dưới). Hạn nội bộ vẫn là mốc đóng phiên
      // có hiệu lực phía web.
      const stripeExpiresAtSec = Math.min(
        Math.floor(Date.now() / 1000) + 24 * 3600,
        Math.max(Math.floor(expiresAt.getTime() / 1000), Math.floor(Date.now() / 1000) + 31 * 60),
      );
      const sess = await stripeCreateCheckout(cfg.stripe.secretKey, {
        amountCents: usdCents, depositCode: code,
        successUrl: `${origin}/api/payments/purchase/stripe/return?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${origin}/gio-hang`,
        expiresAtSec: stripeExpiresAtSec,
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

/** Thời gian coi một phiên PROCESSING là "chết giữa chừng" (luồng thực thi
 *  trước đã dừng) và cho phép luồng khác tiếp quản — P1-01 audit 2026-11-13.
 *  Nâng 3 -> 10 phút ở P1-03 (audit đợt 2): một dòng gọi nhà cung cấp có
 *  thể chạy nhiều lệnh tuần tự (timeout tới 30s/lệnh) nên lease 3 phút có
 *  thể hết khi luồng đầu vẫn đang chạy khoẻ; ý định từng dòng được ghi
 *  TRƯỚC khi tạo đơn (nhịp tim giữ lease) và đối soát khi tiếp quản. */
const PURCHASE_STALE_MS = 10 * 60 * 1000;

/** Thực thi giỏ sau khi cổng xác nhận đã trả. paidVnd = số VNĐ cổng xác nhận
 *  thực nhận (null = tin theo số của cổng quốc tế đã khớp ở tầng gọi).
 *  finalIfUnderpaid: "wait" (SePay — khách có thể chuyển thêm cho đủ) hoặc
 *  "wallet" (BoltUtil — phiên đã chốt, thiếu thì hoàn phần đã nhận vào ví).
 *
 *  PHỤC HỒI (P1-01 audit 2026-11-13): claim chuyển phiên sang PROCESSING
 *  (chưa phải EXECUTED), tiến độ TỪNG DÒNG được lưu ngay sau khi dòng đó xử
 *  lý xong. Tiến trình chết giữa chừng thì phiên kẹt ở PROCESSING quá hạn —
 *  lần gọi sau (webhook/poll/cron recoverStuckPurchases) tiếp quản và chỉ
 *  chạy các dòng CHƯA có kết quả, không tạo trùng đơn, không bồi hoàn hai
 *  lần. Mọi dòng xong mới chốt EXECUTED. */
export async function settlePurchasePayment(ppId: number, opts: { paidVnd?: number | null; finalIfUnderpaid?: "wait" | "wallet" } = {}): Promise<{ ok: boolean; reason: string }> {
  const pp = await prisma.purchasePayment.findUnique({ where: { id: ppId } });
  if (!pp) return { ok: false, reason: "not_found" };
  if (pp.status === "EXECUTED") return { ok: true, reason: "already" };
  const resuming = pp.status === "PROCESSING";
  if (resuming && Date.now() - pp.updatedAt.getTime() < PURCHASE_STALE_MS) return { ok: false, reason: "processing" };
  if (pp.status !== "PENDING" && pp.status !== "EXPIRED" && !resuming) return { ok: false, reason: `status_${pp.status.toLowerCase()}` };

  const data = parsePurchaseData(pp);
  let received = Number(data.receivedVnd || 0);
  // Tiếp quản phiên PROCESSING: số đã nhận lấy từ tiến độ đã lưu, KHÔNG cộng
  // lại paidVnd của cổng (tránh tính trùng số tiền cổng báo lại).
  if (!resuming && opts.paidVnd != null && opts.paidVnd > 0) received += opts.paidVnd;
  if (!resuming && received > 0 && received < pp.amount) {
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

  // Claim nguyên tử: chỉ một luồng (webhook / poll / return / cron) được
  // thực thi; luồng tiếp quản phải thắng được điều kiện updatedAt quá hạn.
  const claimed = await prisma.$transaction(async (tx) => {
    const claim = resuming
      ? await tx.purchasePayment.updateMany({ where: { id: pp.id, status: "PROCESSING", updatedAt: { lt: new Date(Date.now() - PURCHASE_STALE_MS) } }, data: { updatedAt: new Date() } })
      : await tx.purchasePayment.updateMany({ where: { id: pp.id, status: { in: ["PENDING", "EXPIRED"] } }, data: { status: "PROCESSING", paidAt: new Date() } });
    if (claim.count !== 1) return false;
    if (!resuming) {
      const excess = received - pp.amount;
      if (excess > 0) await applyBalance(tx, pp.userId, excess, "REFUND", pp.code, `Thanh toán trực tiếp ${pp.code} thừa tiền — hoàn phần thừa vào ví`);
    }
    return true;
  });
  if (!claimed) return { ok: true, reason: "raced" };
  // Lưu ngay số đã nhận để luồng tiếp quản (nếu có) đọc lại đúng.
  await savePurchaseData(pp.id, { receivedVnd: received });

  const user = await prisma.user.findUnique({ where: { id: pp.userId } });
  const snapshot = JSON.parse(pp.snapshot) as PurchaseSnapshot;
  type LineResult = { variantId: number; ok: boolean; code?: string; error?: string; credited?: number; pending?: boolean; startedAt?: number };
  const results: (LineResult | null)[] = Array.isArray(data.execution) ? data.execution : [];
  const okCodes: string[] = results.filter((r): r is LineResult => !!r && r.ok && !!r.code).map((r) => r.code as string);
  let creditedTotal = Number(data.creditedTotal || 0);
  const persistProgress = async () => {
    await prisma.purchasePayment.update({ where: { id: pp.id }, data: { orderCodes: JSON.stringify(okCodes) } });
    await savePurchaseData(pp.id, { receivedVnd: received, execution: results, creditedTotal });
  };
  for (let idx = 0; idx < snapshot.lines.length; idx++) {
    const line = snapshot.lines[idx];
    const prev = results[idx];
    if (prev && !prev.pending) continue; // dòng đã có kết quả ở lượt chạy trước
    if (prev?.pending) {
      // P1-03 (audit đợt 2): lượt chạy trước đã ghi Ý ĐỊNH nhưng chết trước
      // khi lưu kết quả — đơn CÓ THỂ đã được tạo rồi. Đối soát trước khi
      // chạy lại: createPremiumOrder tạo dòng đơn trong MỘT transaction
      // (cùng trừ kho/hoa hồng) và chỉ gọi nhà cung cấp SAU khi transaction
      // chốt, nên "có dòng đơn khớp khách + gói + số lượng sinh ra trong
      // cửa sổ quanh lúc bắt đầu dòng" = đơn đã chốt -> NHẬN LẠI đơn đó
      // thay vì tạo trùng; không có dòng nào = chưa từng gọi nhà cung cấp
      // -> chạy lại an toàn.
      // TÁI-AUDIT P2-01 (2026-11-14): nhận lại theo KHOÁ LIÊN KẾT trước —
      // đơn do chính phiên này tạo mang purchasePaymentId + purchaseLineNo
      // (duy nhất), không thể nhầm sang đơn của phiên khác dù trùng khách/
      // gói/số lượng/thời gian. Đường cửa sổ thời gian theo thuộc tính
      // chung chỉ còn làm DỰ PHÒNG cho đơn tạo TRƯỚC đợt vá này (chưa có
      // khoá — purchasePaymentId IS NULL; đơn của phiên khác LUÔN có khoá
      // nên không lọt vào dự phòng) và đơn nhận qua dự phòng được GHI NGAY
      // khoá của phiên này để từ đó về sau đi đường khoá.
      const keyed = await prisma.premiumOrder.findFirst({
        where: { purchasePaymentId: pp.id, purchaseLineNo: idx },
      });
      const startedAt = Number(prev.startedAt || 0);
      const candidates = keyed ? [keyed] : startedAt ? await prisma.premiumOrder.findMany({
        where: {
          userId: pp.userId, variantId: line.variantId, quantity: line.qty,
          purchasePaymentId: null,
          createdAt: { gte: new Date(startedAt - 5000), lte: new Date(startedAt + PURCHASE_STALE_MS + 60000) },
          ...(okCodes.length ? { code: { notIn: okCodes } } : {}),
        },
        orderBy: { createdAt: "asc" }, take: 1,
      }) : [];
      if (candidates.length) {
        const adopted: any = candidates[0];
        if (!keyed) {
          await prisma.premiumOrder.update({ where: { id: adopted.id }, data: { purchasePaymentId: pp.id, purchaseLineNo: idx } }).catch(() => {});
        }
        okCodes.push(adopted.code);
        const diff = line.share - Number(adopted.total || 0);
        if (diff > 0) {
          await prisma.$transaction(async (tx) => {
            await applyBalance(tx, pp.userId, diff, "REFUND", pp.code, `Hoàn chênh lệch giá đơn ${adopted.code} (thanh toán trực tiếp ${pp.code})`);
          }).catch(() => {});
          creditedTotal += diff;
        } else if (diff < 0) {
          await alertMother("purchase_price_up", "Đơn thanh toán trực tiếp lệch giá tăng", `Phiên ${pp.code}, đơn ${adopted.code}: tổng thực thi ${Number(adopted.total || 0).toLocaleString("vi-VN")}đ > phần đã thu ${line.share.toLocaleString("vi-VN")}đ. Cần đối soát thủ công.`).catch(() => {});
        }
        results[idx] = { variantId: line.variantId, ok: true, code: adopted.code };
        await persistProgress();
        continue;
      }
    }
    // Ghi Ý ĐỊNH trước khi gây tác dụng phụ (P1-03): tiến trình chết sau
    // bước này thì lượt tiếp quản đối soát theo nhánh pending ở trên thay
    // vì tạo đơn trùng. Ghi này cũng là nhịp tim giữ lease (updatedAt).
    results[idx] = { variantId: line.variantId, ok: false, pending: true, startedAt: Date.now() };
    await persistProgress();
    try {
      if (!user) throw new Error("Tài khoản không tồn tại");
      // P1-02 (audit đợt 2): giá có thể đã ĐỔI sau lúc khách trả tiền (giá
      // gói tăng / flash sale kết thúc). Tính lại tổng của dòng bằng ĐÚNG
      // công thức lúc chốt phiên — nếu cao hơn phần tiền dòng này đã thu
      // thì KHÔNG tạo đơn giao thiếu tiền; ném lỗi để nhánh catch bồi hoàn
      // toàn bộ phần tiền của dòng vào ví khách. Trước bản vá, chênh lệch
      // âm bị bỏ qua im lặng: shop giao theo giá mới nhưng chỉ thu giá cũ.
      const expected = (await computeCartPayable(
        [{ variantId: line.variantId, qty: line.qty, custom: line.custom, buyerInfo: line.buyerInfo }],
        snapshot.promo || "",
        pp.userId,
      )).shares[0];
      if (expected > line.share) {
        throw new Error(`Giá gói đã tăng sau khi thanh toán (${line.share.toLocaleString("vi-VN")}đ → ${expected.toLocaleString("vi-VN")}đ)`);
      }
      const order: any = await createPremiumOrder({
        user, variantId: line.variantId, quantity: line.qty,
        customData: line.custom && Object.keys(line.custom).length ? line.custom : undefined,
        buyerInfo: line.buyerInfo || undefined,
        promoCode: snapshot.promo || undefined,
        externalPaid: { method: pp.method, ref: pp.code },
        purchaseRef: { paymentId: pp.id, lineNo: idx },
        // TÁI-AUDIT P2-02: trần = phần đã thu của dòng — createPremiumOrder
        // tự chốt bên trong (kiểm tổng cuối + đọc lại giá trong transaction
        // tạo đơn), nên giá đổi ở BẤT KỲ điểm nào trước khi đơn chốt đều
        // bị chặn và dòng rơi vào nhánh bồi hoàn ví ở catch dưới.
        maxTotal: line.share,
      });
      okCodes.push(order.code);
      // Giá chốt lúc thực thi THẤP hơn phần đã trả của dòng -> hoàn chênh lệch vào ví
      const diff = line.share - Number(order.total || 0);
      if (diff < 0) {
        // TÁI-AUDIT P2-02: trần maxTotal trong createPremiumOrder khiến
        // tổng thực thi KHÔNG THỂ vượt phần đã thu ở đường này — nhánh này
        // chỉ còn là lưới an toàn cuối, vẫn báo admin đối soát, không im lặng.
        await alertMother("purchase_price_up", "Đơn thanh toán trực tiếp lệch giá tăng", `Phiên ${pp.code}, đơn ${order.code}: tổng thực thi ${Number(order.total || 0).toLocaleString("vi-VN")}đ > phần đã thu ${line.share.toLocaleString("vi-VN")}đ. Cần đối soát thủ công.`).catch(() => {});
      }
      if (diff > 0) {
        await prisma.$transaction(async (tx) => {
          await applyBalance(tx, pp.userId, diff, "REFUND", pp.code, `Hoàn chênh lệch giá đơn ${order.code} (thanh toán trực tiếp ${pp.code})`);
        }).catch(() => {});
        creditedTotal += diff;
      }
      results[idx] = { variantId: line.variantId, ok: true, code: order.code };
    } catch (e: any) {
      // Đã trả tiền mà không đặt được dòng này -> bồi hoàn phần tiền của dòng vào ví
      const msg = String(e?.message || "Đặt đơn thất bại").slice(0, 200);
      await prisma.$transaction(async (tx) => {
        await applyBalance(tx, pp.userId, line.share, "REFUND", pp.code, `Bồi hoàn dòng không đặt được — thanh toán trực tiếp ${pp.code}`);
      }).catch(() => {});
      creditedTotal += line.share;
      results[idx] = { variantId: line.variantId, ok: false, error: msg, credited: line.share };
    }
    await persistProgress();
  }
  // Mọi dòng đã có kết quả mới chốt EXECUTED.
  await prisma.purchasePayment.updateMany({ where: { id: pp.id, status: "PROCESSING" }, data: { status: "EXECUTED" } });
  if (creditedTotal > 0) {
    await notifyUser(pp.userId, "Một phần đơn được hoàn vào ví", `Thanh toán ${pp.code}: ${creditedTotal.toLocaleString("vi-VN")}đ đã cộng vào ví của bạn (dòng không đặt được hoặc chênh lệch giá).`, "/dashboard/don-premium");
  }
  return { ok: true, reason: resuming ? "executed_resumed" : "executed" };
}

/** Cron phục hồi: quét các phiên PROCESSING quá hạn (tiến trình thực thi
 *  trước đã chết giữa chừng) và chạy tiếp từ tiến độ đã lưu — P1-01. */
export async function recoverStuckPurchases(): Promise<number> {
  const stale = await prisma.purchasePayment.findMany({
    where: { status: "PROCESSING", updatedAt: { lt: new Date(Date.now() - PURCHASE_STALE_MS) } },
    select: { id: true }, take: 10, orderBy: { updatedAt: "asc" },
  });
  let n = 0;
  for (const row of stale) {
    const r = await settlePurchasePayment(row.id).catch(() => ({ ok: false, reason: "error" }));
    if (r.ok) n++;
  }
  return n;
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
  const actualUsd = [payload?.paidAmount, payload?.merchantNetAmount, payload?.actualReceivedAmount]
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
