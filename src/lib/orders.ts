import { prisma } from "./db";
import { applyBalance, creditReferralCommission, clawbackReferralCommission } from "./wallet";
import { genCode, parsePremiumFields, effectivePremiumFields, vnd } from "./format";
import { checkPromo, consumePromo } from "./promo";
import { getSettings, DEFAULT_SETTINGS } from "./settings";
import { notifyUser } from "./notify";
import { flashPercentForProduct, applyFlashAmount } from "./flash";
import { awardPointsForPremiumOrder } from "./points";
import { alertMother } from "./alerts";
import { assertNotRiskRestricted, evaluateUserRisk } from "./risk";
import {
  providerBuyProduct, findPremiumOrderInHistory, extractDelivery,
} from "./provider";
import { executeFzrPremiumOrder, pollFzrPremiumOrder, refreshFzrQuotePrice, parseBuyerInfoLines } from "./fzr-orders";
import { claimVariantStock, restoreVariantStock, variantSoldOut, OUT_OF_STOCK_ERROR, notifyStockCrossing } from "./variant-stock";
import { passDiscountFor, creditPassCashback, clawbackPassCashback } from "./pass";
import { sendCustomerMail } from "./customer-mail";
import { moduleOn, moduleKeyForGroup, MODULE_LABEL } from "./modules";
import type { PremiumOrder, PremiumProduct, PremiumVariant, User } from "@prisma/client";

/**
 * Engine đơn Premium (mua sản phẩm số): tạo đơn + trừ ví/kho + giao tự động
 * (kho AUTO_STOCK / API FZR / API sản phẩm kiểu ThaTim) và đồng bộ trạng thái
 * đơn API từ nhà cung cấp. Phần đơn SMM đã gỡ khỏi web này (lệnh Tín
 * 2026-11-12 — web tách thành Digital Shop thuần, SMM làm web riêng); engine
 * SMM cũ còn trong git history.
 */
/** Mua premium: trừ tiền, nếu AUTO_STOCK đủ kho thì giao ngay */
export async function createPremiumOrder(input: {
  user: User;
  variantId: number;
  quantity: number;
  buyerInfo?: string;
  customData?: Record<string, string>; // giá trị các trường tuỳ chỉnh theo label (form web gửi)
  promoCode?: string;
  // Đã trả tiền NGOÀI ví (thanh toán trực tiếp ở giỏ — lib/purchase.ts):
  // transaction KHÔNG trừ số dư; mọi cơ chế còn lại (kho, flash, promo,
  // referral, giao API) giữ nguyên như mua bằng ví.
  externalPaid?: { method: string; ref: string };
  // Khoá liên kết phiên thanh toán trực tiếp (tái-audit P2-01): chỉ
  // lib/purchase.ts đặt — ghi thẳng vào dòng đơn trong cùng transaction
  // tạo đơn để recovery nhận lại đúng đơn của đúng phiên/dòng.
  purchaseRef?: { paymentId: number; lineNo: number };
  // Trần tổng tiền ĐÃ THU của dòng (tái-audit P2-02): chỉ lib/purchase.ts
  // đặt (= phần tiền dòng đã thu). createPremiumOrder tự chốt: tổng thực
  // thi cuối cùng mà VƯỢT trần thì ném lỗi TRƯỚC mọi tác dụng phụ — hết
  // cửa sổ race giữa bước kiểm giá riêng và bước tạo đơn.
  maxTotal?: number;
  // QUÀ THÁNG của Pass (lib/pass.ts): đơn 0đ — không trừ ví, không tính
  // giảm Pass / cashback / hoa hồng (tổng chốt 0đ), nhưng vẫn đi ĐÚNG đường
  // kho + giao hàng như đơn thường. Chỉ actions/pass.ts được đặt cờ này.
  gift?: boolean;
}) {
  const variant = await prisma.premiumVariant.findUnique({
    where: { id: input.variantId },
    include: { product: true },
  });
  if (!variant || !variant.active || !variant.product.active) throw new Error("Gói không tồn tại hoặc đã ngưng bán");
  // Cổng MODULE (luật module 2026-11-13, đợt 126): gói thuộc khu riêng FZR
  // thì khu đó gác bằng công tắc riêng của khu; gói Premium thường do
  // module_premium gác như trước. Đây là lớp chặn MÁY CHỦ ở engine dùng
  // chung — mọi đường tạo đơn (web từng khu, giỏ, API v2, quà Pass) đều
  // qua đây nên không đường nào lọt khi module tương ứng đang tắt.
  const areaKey = moduleKeyForGroup(variant.providerGroup);
  if (areaKey) {
    if (!(await moduleOn(areaKey))) throw new Error(`Khu ${MODULE_LABEL[areaKey] || "sản phẩm"} đang tạm tắt`);
  } else if ((await getSettings()).module_premium === "0") {
    throw new Error("Mảng Premium đang tạm tắt");
  }
  // GĐ3: tài khoản rủi ro cao (chưa được duyệt lại) bị chặn mua Premium mới
  await assertNotRiskRestricted(input.user.id);
  // FZR — báo giá tại thời điểm mua cho nhóm giá biến động (sao Telegram, gift Steam):
  // chốt giá tươi từ provider TRƯỚC khi tính tiền. Nhóm khác giữ giá đã đồng bộ.
  if (variant.product.fulfillment === "API" && variant.providerId && (variant.providerGroup === "telegram_stars" || variant.providerGroup === "steam_gift")) {
    const fzrProvider = await prisma.provider.findUnique({ where: { id: variant.providerId } });
    if (fzrProvider?.driver === "FZR") {
      const q = await refreshFzrQuotePrice(variant, fzrProvider);
      variant.price = q.price;
      variant.cost = q.cost;
    }
  }
  // Sản phẩm từng thuộc website con (tính năng đã gỡ): không bán trên web mẹ
  if (variant.product.panelId != null) throw new Error("Gói không tồn tại hoặc đã ngưng bán");
  let maxQty = parseInt((await getSettings()).premium_max_qty) || Number(DEFAULT_SETTINGS.premium_max_qty);
  // FZR Telegram Stars: số lượng = số sao (preset tới hàng chục nghìn) — trần theo
  // báo giá phía FZR (min/maxAmount), không theo trần gói Premium thông thường.
  if (variant.providerGroup === "telegram_stars" && variant.providerId) {
    const { fzrTelegramStarsQuote } = await import("./fzr");
    const prov = await prisma.provider.findUnique({ where: { id: variant.providerId } });
    if (prov?.driver === "FZR") {
      try {
        const q = await fzrTelegramStarsQuote(prov);
        if (q.minAmount && input.quantity < q.minAmount) throw new Error(`Số sao tối thiểu là ${q.minAmount}`);
        maxQty = q.maxAmount && q.maxAmount > 0 ? q.maxAmount : 1000000;
      } catch (e: any) {
        if (String(e?.message || "").startsWith("Số sao tối thiểu")) throw e;
        maxQty = 1000000; // không lấy được báo giá -> dùng trần cứng, giá vẫn chốt ở bước refresh phía trên
      }
    }
  }
  if (input.quantity < 1 || input.quantity > maxQty) throw new Error("Số lượng không hợp lệ");
  // Giới hạn số lượng mỗi đơn CỦA GÓI phía NCC (FZR gamekeys/giftcards:
  // min_order_quantity / max_order_quantity đã lưu ở gói) — chặn tại đây
  // để khách nhận lỗi rõ ràng thay vì lỗi NCC sau khi trừ tiền.
  if (variant.minOrderQty != null && input.quantity < variant.minOrderQty) throw new Error(`Số lượng tối thiểu cho gói này là ${variant.minOrderQty}`);
  if (variant.maxOrderQty != null && input.quantity > variant.maxOrderQty) throw new Error(`Số lượng tối đa cho gói này là ${variant.maxOrderQty}`);
  // Trường tuỳ chỉnh HIỆU LỰC của gói (trường riêng của gói thắng, không có
  // thì trường của sản phẩm): validate trường bắt buộc + gộp thông tin bàn giao
  const fields = effectivePremiumFields(variant.product.customFields, variant.customFields);
  let buyerInfo = input.buyerInfo;
  if (fields.length > 0 && input.customData !== undefined) {
    const lines: string[] = [];
    for (const f of fields) {
      // Giá trị tra theo NHÃN (form web + giỏ hàng gửi theo nhãn); trường có
      // KEY của nhà cung cấp (FZR topups/manual) còn tra thêm theo key để
      // API v2 gửi fields bằng đúng khoá NCC cũng khớp.
      const rawVal = input.customData[f.label] ?? (f.key ? input.customData[f.key] : undefined);
      const val = String(rawVal || "").trim();
      if (f.required && !val) throw new Error(`Thiếu thông tin: ${f.label}`);
      if (val) lines.push(`${f.label}: ${val}`);
    }
    buyerInfo = lines.join("\n") || undefined;
  }
  if ((variant.product.fulfillment === "MANUAL" || variant.product.fulfillment === "API") && !buyerInfo?.trim())
    throw new Error("Gói này cần thông tin tài khoản/email của bạn để bàn giao");

  // Kho theo gói (MANUAL/API): cờ chặn bán tay hoặc kho số lượng đã cạn ->
  // chốt chặn SỚM bằng lỗi hết hàng chuẩn, TRƯỚC mọi lần gọi provider. Phần
  // trừ kho nguyên tử nằm trong transaction tiền bên dưới (claimVariantStock).
  if (variantSoldOut(variant, variant.product.fulfillment)) throw new Error(OUT_OF_STOCK_ERROR);
  if (variant.product.fulfillment !== "AUTO_STOCK" && variant.stockQty != null && variant.stockQty < input.quantity) throw new Error(OUT_OF_STOCK_ERROR);

  let total = variant.price * input.quantity;
  // Flash sale (phạm vi có Premium): giảm thêm % trên tổng — đúng thứ tự phía SMM:
  // flash áp TRƯỚC mã giảm giá (mã giảm tính trên số tiền đã trừ flash).
  const flashPct = await flashPercentForProduct(variant.product.id);
  if (flashPct > 0) total = applyFlashAmount(total, flashPct);
  const commission = 0;
  const cost = variant.cost * input.quantity;

  // Mã giảm giá: tính trên tổng tiền sau flash sale (nếu có)
  let promo: Awaited<ReturnType<typeof checkPromo>> = null;
  if (input.promoCode?.trim()) {
    promo = await checkPromo(input.promoCode, "PREMIUM", total);
    if (promo) total -= promo.discount;
  }

  // Pass (lib/pass.ts): giảm THÊM % trên tổng SAU flash + mã giảm giá; đơn quà
  // tháng thì chốt thẳng 0đ và bỏ qua cả mã giảm giá lẫn giảm Pass/cashback.
  let passDiscount = 0;
  if (input.gift) {
    promo = null;
    total = 0;
  } else {
    passDiscount = await passDiscountFor(input.user.id, "PREMIUM", total);
    if (passDiscount > 0) total -= passDiscount;
  }

  // TÁI-AUDIT P2-02: chốt trần NGAY TẠI ĐÂY — sau khi `total` đã chốt
  // (giá gốc → flash → mã giảm → Pass) và TRƯỚC mọi tác dụng phụ. Đơn
  // thanh toán trực tiếp không bao giờ được thực thi vượt phần đã thu.
  if (input.maxTotal != null && total > input.maxTotal) {
    throw new Error(`Giá gói đã tăng sau khi thanh toán (${input.maxTotal.toLocaleString("vi-VN")}đ → ${total.toLocaleString("vi-VN")}đ)`);
  }

  // Đợt 111: ghi lại lần trừ kho của đơn này (before/after) để bắn cảnh báo
  // kho SAU khi transaction chốt — chỉ khi lần trừ vừa vượt mốc hết/sắp hết.
  let stockMove: { before: number; after: number } | null = null;
  const created = await prisma.$transaction(async (tx) => {
    // TÁI-AUDIT P2-02 (lớp trong transaction): đọc lại giá gốc của gói
    // BẰNG CHÍNH transaction sắp tạo đơn — giá đổi sau lần đọc đầu (kể cả
    // đổi đúng giữa chừng) thì huỷ toàn bộ transaction, không tạo đơn.
    if (input.maxTotal != null) {
      const fresh = await tx.premiumVariant.findUnique({ where: { id: variant.id }, select: { price: true, active: true } });
      if (!fresh || !fresh.active || fresh.price !== variant.price) {
        throw new Error("Giá gói đã thay đổi trong lúc đặt đơn");
      }
    }
    // Trừ kho số lượng NGUYÊN TỬ cùng transaction với tiền: thiếu kho -> ném
    // lỗi, cả tiền lẫn đơn rollback (không bán vượt, không trừ tiền oan).
    const move = await claimVariantStock(tx, variant, variant.product.fulfillment, input.quantity);
    if (move) stockMove = move;
    if (!input.externalPaid && !input.gift) {
      await applyBalance(tx, input.user.id, -total, "PREMIUM_ORDER", undefined, `Mua ${variant.product.name} — ${variant.name}`);
    }
    if (promo) await consumePromo(tx, promo.row.id);
    const o = await tx.premiumOrder.create({
      data: {
        code: "TMP",
        userId: input.user.id,
        variantId: variant.id,
        quantity: input.quantity,
        total,
        promoCode: promo?.row.code,
        promoDiscount: promo?.discount || 0,
        passDiscount,
        cost,
        status: "PENDING",
        providerId: variant.product.providerId,
        commission,
        buyerInfo,
        purchasePaymentId: input.purchaseRef?.paymentId,
        purchaseLineNo: input.purchaseRef?.lineNo,
        warrantyUntil: variant.warrantyDays
          ? new Date(Date.now() + variant.warrantyDays * 86400000)
          : null,
      },
    });
    const code = genCode("PRE", o.id);
    await tx.premiumOrder.update({ where: { id: o.id }, data: { code } });
    // Hoa hồng giới thiệu: tính trên giao dịch mua (kiểu thatim)
    await creditReferralCommission(tx, input.user.id, total, code);
    // Cashback Pass trên số tiền thực trả cuối cùng (đơn quà 0đ tự cho 0).
    await creditPassCashback(tx, input.user.id, "PREMIUM", total, code);

    // Giao tự động từ kho
    if (variant.product.fulfillment === "AUTO_STOCK") {
      const stocks = await tx.premiumStock.findMany({
        where: { variantId: variant.id, status: "AVAILABLE" },
        take: input.quantity,
        orderBy: { id: "asc" },
      });
      if (stocks.length >= input.quantity) {
        // Claim kèm điều kiện status AVAILABLE + đếm số dòng thật sự lấy được:
        // hai khách mua đồng thời cùng 1 tài khoản cuối cùng thì chỉ MỘT đơn
        // claim đủ — đơn còn lại trả kho về AVAILABLE và chờ giao tay.
        const claimed = await tx.premiumStock.updateMany({
          where: { id: { in: stocks.map((s) => s.id) }, status: "AVAILABLE" },
          data: { status: "SOLD", orderId: o.id },
        });
        if (claimed.count === stocks.length) {
          // Đợt 111: tồn AUTO_STOCK sau lần claim này = số dòng AVAILABLE còn
          // lại trong transaction; before = after + số vừa lấy.
          const remaining = await tx.premiumStock.count({ where: { variantId: variant.id, status: "AVAILABLE" } });
          stockMove = { before: remaining + stocks.length, after: remaining };
          const delivered = await tx.premiumOrder.update({
            where: { id: o.id },
            data: { status: "DELIVERED", deliveryData: stocks.map((s) => s.payload).join("\n---\n") },
          });
          return { ...delivered, code };
        }
        await tx.premiumStock.updateMany({
          where: { orderId: o.id, status: "SOLD" },
          data: { status: "AVAILABLE", orderId: null },
        });
      }
      // Thiếu kho -> để PENDING, admin giao tay (tiền vẫn giữ trong đơn, huỷ sẽ hoàn)
      await tx.premiumOrder.update({
        where: { id: o.id },
        data: { adminNote: "Kho tự động đang hết — cần giao tay" },
      });
    }
    return { ...o, code };
  });
  void alertMother("premium_order", `Đơn Premium mới ${created.code}`, `${input.user.username} mua ${variant.product.name} — ${variant.name} — ${created.total.toLocaleString("vi-VN")}đ`);
  // Đợt 119: email cho khách — đơn vừa tạo (và đã giao ngay nếu kho tự động
  // giao trong cùng transaction). Lõi mail tự nuốt lỗi, không chặn đơn.
  void sendCustomerMail(input.user.id, "order_created", {
    order_code: created.code, product_name: variant.product.name, variant_name: variant.name,
    quantity: input.quantity, total: vnd(created.total),
  });
  if (created.status === "DELIVERED") {
    void sendCustomerMail(input.user.id, "order_delivered", {
      order_code: created.code, product_name: variant.product.name, variant_name: variant.name,
      delivery_content: created.deliveryData || "",
    });
  }
  // Đợt 111: cảnh báo kho nếu lần trừ của đơn này vừa vượt mốc (hết/sắp hết).
  const finalStockMove = stockMove as { before: number; after: number } | null;
  if (finalStockMove) void notifyStockCrossing({ productName: variant.product.name, variantName: variant.name, before: finalStockMove.before, after: finalStockMove.after });
  await notifyUser(input.user.id, "Đặt hàng Premium thành công", `Đơn ${created.code}: ${variant.product.name} — ${variant.name} × ${input.quantity} — ${input.gift ? "quà tháng của Pass (0đ)" : input.externalPaid ? `đã thanh toán trực tiếp qua ${input.externalPaid.method}` : `đã trừ ${vnd(created.total)}`}${created.status === "DELIVERED" ? " — đã giao tự động, xem nội dung trong đơn" : ""}`, "/dashboard/don-premium");
  // GĐ3: tính lại điểm rủi ro nền sau khi mua Premium — lỗi tính điểm không ảnh hưởng đơn
  void evaluateUserRisk(input.user.id);
  if (created.status === "DELIVERED" || created.status === "COMPLETED") await awardPointsForPremiumOrder(created);

  // Đấu API mua sản phẩm (kiểu ThaTim/FZR): bước hậu-commit tách riêng
  // thành runPremiumApiFulfillment để recovery gọi lại khi cần (P2-A).
  if (variant.product.fulfillment === "API") {
    return runPremiumApiFulfillment({ order: created, variant, user: input.user, quantity: input.quantity, customData: input.customData, buyerInfo, total });
  }
  return created;
}

/**
 * Bước giao hàng API SAU khi transaction tạo đơn đã chốt — tách khỏi
 * createPremiumOrder để recovery của thanh toán trực tiếp gọi lại đúng
 * bước này khi tiến trình chết giữa commit đơn và lời gọi nhà cung cấp
 * (tái-audit 0e15517 P2-A). Mọi hoàn tiền trong này tính trên `total`
 * của đơn; đơn thanh toán trực tiếp (externalPaid) cũng hoàn vào ví như
 * đường tạo đơn thường.
 */
export async function runPremiumApiFulfillment(args: {
  order: PremiumOrder;
  variant: PremiumVariant & { product: PremiumProduct };
  user: User;
  quantity: number;
  customData?: Record<string, string>;
  buyerInfo?: string;
  total: number;
}): Promise<PremiumOrder> {
  const { order, variant, user, quantity, customData, buyerInfo, total } = args;
  const provider = variant.product.providerId
    ? await prisma.provider.findUnique({ where: { id: variant.product.providerId } })
    : null;
  // FazerCards (driver FZR): luồng riêng theo nhóm sản phẩm — xem lib/fzr-orders.
  // Đơn thiếu linkage FZR thì rơi xuống xử lý tay như stub API trước đây.
  if (provider?.driver === "FZR" && variant.providerGroup && variant.providerItemId) {
    const fzrOrder = await prisma.premiumOrder.findUnique({ where: { id: order.id } });
    if (fzrOrder) {
      return executeFzrPremiumOrder({
        order: fzrOrder,
        variant,
        provider,
        inputs: customData || parseBuyerInfoLines(buyerInfo),
      });
    }
  }
  if (!provider || !variant.product.providerProductId || !variant.providerCycle) {
    // Chưa cấu hình đủ mapping -> giữ đơn PENDING cho admin xử lý tay thay vì mất đơn
    await prisma.premiumOrder.update({
      where: { id: order.id },
      data: { adminNote: "Sản phẩm API chưa cấu hình đủ provider/chu kỳ — cần xử lý tay" },
    });
    return order;
  }
  // Claim nguyên tử TRƯỚC vòng mua (cùng khuôn claim của FZR): hai tiến
  // trình không bao giờ cùng mua cho một đơn. Dấu stdClaimAt + mã lưu tăng
  // dần theo từng đơn vị cho phép recovery (ensurePremiumOrderFulfillment)
  // phân biệt "chưa hề gửi" (không dấu, không mã — chạy lại an toàn) với
  // "đang bay dở" (có dấu, thiếu mã — KHÔNG mua lại vì ThaTim không có
  // khoá idempotency; gắn cờ đối soát tay).
  const claim = await prisma.premiumOrder.updateMany({
    where: { id: order.id, status: "PENDING", providerOrderId: null, providerRaw: null },
    data: { providerRaw: JSON.stringify({ stdClaimAt: new Date().toISOString() }) },
  });
  if (claim.count === 0) return (await prisma.premiumOrder.findUnique({ where: { id: order.id } })) || order;
  const codes: string[] = [];
  const deliveries: string[] = [];
  let failed = 0;
  for (let i = 0; i < quantity; i++) {
    try {
      const r = await providerBuyProduct(provider, variant.product.providerProductId, variant.providerCycle, buyerInfo || "");
      codes.push(r.orderCode);
      const d = extractDelivery(r.raw?.data || r.raw).delivery;
      if (d) deliveries.push(d);
      await prisma.apiLog.create({ data: { kind: "provider_out", ref: order.code, detail: `buy product=${variant.product.providerProductId} cycle=${variant.providerCycle} -> ${r.orderCode}` } });
      // Lưu mã NGAY theo từng đơn vị: tiến trình chết giữa vòng thì
      // recovery đếm được phần đã mua qua providerOrderId, không mua lại.
      // Nuốt lỗi ghi ở đây — lần ghi chốt cuối vòng vẫn ghi đủ toàn bộ mã;
      // một lần ghi phụ lỗi không được biến đơn vị ĐÃ mua thành "thất bại".
      await prisma.premiumOrder.update({
        where: { id: order.id },
        data: { providerOrderId: codes.join(","), ...(deliveries.length ? { deliveryData: deliveries.join("\n---\n") } : {}) },
      }).catch(() => {});
    } catch (e: any) {
      failed++;
      await prisma.apiLog.create({ data: { kind: "provider_out", ref: order.code, ok: false, detail: `buy failed: ${String(e?.message || e)}` } });
    }
  }
  if (codes.length === 0) {
    // Provider từ chối toàn bộ -> hoàn tiền đủ + trả kho số lượng đã trừ
    await prisma.$transaction(async (tx) => {
      await restoreVariantStock(tx, variant.id, quantity);
      await applyBalance(tx, user.id, total, "REFUND", order.code, "Nhà cung cấp từ chối đơn premium — hoàn tiền");
      await tx.premiumOrder.update({ where: { id: order.id }, data: { status: "REFUNDED" } });
    });
    await clawbackReferralCommission(user.id, total, order.code);
    await clawbackPassCashback(user.id, total, order.code);
    void sendCustomerMail(user.id, "order_refunded", {
      order_code: order.code, product_name: variant.product.name,
      refund_amount: vnd(total), balance: await balanceText(user.id),
    });
    return { ...order, status: "REFUNDED" as const };
  }
  if (failed > 0) {
    const refundAmt = Math.floor((total * failed) / quantity);
    await prisma.$transaction(async (tx) => {
      await restoreVariantStock(tx, variant.id, failed);
      await applyBalance(tx, user.id, refundAmt, "REFUND", order.code, `Hoàn ${failed} đơn vị provider không nhận`);
    });
    await clawbackReferralCommission(user.id, refundAmt, order.code);
    await clawbackPassCashback(user.id, refundAmt, order.code);
    void sendCustomerMail(user.id, "order_refunded", {
      order_code: order.code, product_name: variant.product.name,
      refund_amount: vnd(refundAmt), balance: await balanceText(user.id),
    });
  }
  const updated = await prisma.premiumOrder.update({
    where: { id: order.id },
    data: {
      providerOrderId: codes.join(","),
      ...(deliveries.length === quantity
        ? { status: "DELIVERED", deliveryData: deliveries.join("\n---\n") }
        : {}),
      ...(failed > 0 ? { adminNote: `${failed}/${quantity} đơn vị bị provider từ chối — đã hoàn tiền phần đó` } : {}),
    },
  });
  if (updated.status === "DELIVERED") {
    void sendCustomerMail(user.id, "order_delivered", {
      order_code: order.code, product_name: variant.product.name, variant_name: variant.name,
      delivery_content: updated.deliveryData || "",
    });
  }
  return updated;
}


/* ===== TÁI-AUDIT 0e15517 P2-A: đối soát/tiếp tục giao hàng cho đơn API =====
 * createPremiumOrder chốt transaction tạo đơn TRƯỚC rồi mới gọi nhà cung
 * cấp. Tiến trình chết đúng cửa sổ đó để lại đơn PENDING chưa hề được gửi
 * đi. Recovery của thanh toán trực tiếp (lib/purchase.ts) nhận lại đơn
 * theo khoá và gọi hàm này để đưa bước giao hàng về trạng thái rõ ràng:
 *   - đã có mã NCC (providerOrderId)  -> chỉ ĐỐI SOÁT trạng thái (poll/sync);
 *   - có dấu claim nhưng chưa có mã    -> lượt thực thi trước chết giữa
 *     chừng: FZR có Idempotency-Key = id đơn nên claim hết hạn lease thì
 *     gỡ claim (CAS) và thực thi lại an toàn; NCC chuẩn không có khoá
 *     idempotency nên KHÔNG mua lại — gắn cờ + cảnh báo admin đối soát;
 *   - chưa dấu claim, chưa mã          -> chưa hề gửi: chạy đúng bước
 *     hậu-commit còn thiếu (runPremiumApiFulfillment).
 * Đơn không phải API hoặc không còn PENDING thì giữ nguyên. */
const FULFILL_CLAIM_STALE_MS = 10 * 60000; // cùng lease với PURCHASE_STALE_MS

function parseProviderRaw(raw: string | null): Record<string, any> | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    return j && typeof j === "object" ? j : null;
  } catch { return null; }
}

async function flagFulfillmentAmbiguous(order: PremiumOrder, why: string): Promise<PremiumOrder> {
  const note = `Giao hàng API chưa rõ trạng thái — ${why}; kiểm tra phía nhà cung cấp trước khi giao/hoàn tay`;
  if ((order.adminNote || "").includes("Giao hàng API chưa rõ trạng thái")) return order;
  const updated = await prisma.premiumOrder.update({
    where: { id: order.id },
    data: { adminNote: [order.adminNote, note].filter(Boolean).join(" · ").slice(0, 900) },
  });
  void alertMother("purchase_fulfill_ambiguous", `Đơn ${order.code} cần đối soát giao hàng`, note);
  return updated;
}

export async function ensurePremiumOrderFulfillment(orderId: number): Promise<PremiumOrder | null> {
  const order = await prisma.premiumOrder.findUnique({ where: { id: orderId } });
  if (!order || order.status !== "PENDING") return order;
  const variant = await prisma.premiumVariant.findUnique({
    where: { id: order.variantId },
    include: { product: true },
  });
  if (!variant || variant.product.fulfillment !== "API") return order;
  const provider = variant.product.providerId
    ? await prisma.provider.findUnique({ where: { id: variant.product.providerId } })
    : null;

  // Đã có mã phía NCC = đã gửi thành công ít nhất một phần: chỉ đối soát.
  if (order.providerOrderId) {
    try {
      if (provider?.driver === "FZR") return await pollFzrPremiumOrder(order);
      if (provider) {
        const synced = await syncPremiumOrderStatus(order);
        if (synced) return synced;
      }
    } catch { /* lỗi đối soát không chặn nhận đơn — cron đồng bộ thử lại sau */ }
    return prisma.premiumOrder.findUnique({ where: { id: order.id } });
  }

  const raw = parseProviderRaw(order.providerRaw);
  const claimIso = raw?.fzrClaimAt || raw?.stdClaimAt;
  if (claimIso) {
    const claimAt = new Date(claimIso).getTime();
    if (Number.isFinite(claimAt) && Date.now() - claimAt < FULFILL_CLAIM_STALE_MS) {
      return order; // claim còn tươi: một lượt thực thi khác có thể đang chạy
    }
    if (provider?.driver === "FZR" && variant.providerGroup && variant.providerItemId) {
      // FZR: Idempotency-Key = id đơn (tài liệu reseller, lib/fzr.ts) nên
      // thực thi lại sau khi claim hết hạn là an toàn — phía FZR deduplicate
      // theo id đơn. Gỡ claim bằng CAS trên đúng giá trị providerRaw cũ:
      // giá trị đã đổi nghĩa là một lượt khác vừa đụng vào, không giành.
      const reset = await prisma.premiumOrder.updateMany({
        where: { id: order.id, status: "PENDING", providerOrderId: null, providerRaw: order.providerRaw },
        data: { providerRaw: null },
      });
      if (reset.count === 0) return prisma.premiumOrder.findUnique({ where: { id: order.id } });
      await prisma.apiLog.create({ data: { kind: "provider_out", ref: order.code, detail: "FZR: thực thi lại sau claim hết hạn (recovery thanh toán trực tiếp)" } }).catch(() => {});
      const user = await prisma.user.findUnique({ where: { id: order.userId } });
      if (!user) return order;
      const fresh = (await prisma.premiumOrder.findUnique({ where: { id: order.id } })) || order;
      return runPremiumApiFulfillment({ order: fresh, variant, user, quantity: order.quantity, buyerInfo: order.buyerInfo || undefined, total: order.total });
    }
    // NCC chuẩn (ThaTim) KHÔNG có khoá idempotency: đơn vị đang bay lúc
    // tiến trình chết có thể đã được NCC nhận mà chưa kịp lưu mã — mua lại
    // là mua trùng. Giữ PENDING, gắn cờ đối soát tay thay vì im lặng.
    return flagFulfillmentAmbiguous(order, "tiến trình trước chết giữa vòng mua phía NCC");
  }

  // Chưa dấu claim, chưa mã = chưa hề gửi NCC: chạy bước còn thiếu.
  const user = await prisma.user.findUnique({ where: { id: order.userId } });
  if (!user) return order;
  return runPremiumApiFulfillment({ order, variant, user, quantity: order.quantity, buyerInfo: order.buyerInfo || undefined, total: order.total });
}

/** Số dư ví hiện tại của khách dạng chữ cho biến thư ({{balance}}). */
async function balanceText(userId: number): Promise<string> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { balance: true } }).catch(() => null);
  return vnd(u?.balance ?? 0);
}

/** Đồng bộ đơn premium API từ provider (action=history) — cron + nút bấm admin.
 *  Bàn giao nằm ở trường "data" của mục history khi status = completed. */
export async function syncPremiumOrderStatus(order: PremiumOrder) {
  if (!order.providerId || !order.providerOrderId) return order;
  const provider = await prisma.provider.findUnique({ where: { id: order.providerId } });
  if (!provider) return order;
  const variant = await prisma.premiumVariant.findUnique({
    where: { id: order.variantId },
    include: { product: { select: { providerProductId: true, name: true } } },
  });
  const codes = order.providerOrderId.split(",").map((x) => x.trim()).filter(Boolean);
  const deliveries: string[] = [];
  let canceled = 0;
  let completedNoData = 0;
  let seen = 0;
  for (const code of codes) {
    const entry = await findPremiumOrderInHistory(provider, variant?.product.providerProductId || undefined, code);
    if (!entry) continue;
    seen++;
    const { delivery, status } = extractDelivery(entry);
    const st = (status || "").toLowerCase();
    if (delivery) deliveries.push(delivery);
    else if (st === "completed") completedNoData++;
    if (/cancel|refund|fail/.test(st)) canceled++;
  }
  if (deliveries.length) {
    await prisma.premiumOrder.update({
      where: { id: order.id },
      data: { status: "DELIVERED", deliveryData: deliveries.join("\n---\n") },
    });
    await awardPointsForPremiumOrder(order);
    // Mail chỉ bắn khi đơn THẬT SỰ chuyển sang đã giao ở lần đồng bộ này —
    // admin bấm đồng bộ lại trên đơn đã giao thì không gửi trùng.
    if (order.status !== "DELIVERED" && order.status !== "COMPLETED") {
      void sendCustomerMail(order.userId, "order_delivered", {
        order_code: order.code, product_name: variant?.product.name || "", variant_name: variant?.name || "",
        delivery_content: deliveries.join("\n---\n"),
      });
    }
  } else if (completedNoData > 0 && seen === codes.length && canceled === 0) {
    // Provider báo hoàn thành nhưng chưa trả dữ liệu bàn giao -> đánh dấu hoàn thành, admin đối soát
    await prisma.premiumOrder.update({
      where: { id: order.id },
      data: { status: "COMPLETED", adminNote: [order.adminNote, "Provider báo completed nhưng chưa có dữ liệu bàn giao"].filter(Boolean).join(" · ") },
    });
    await awardPointsForPremiumOrder(order);
    if (order.status !== "DELIVERED" && order.status !== "COMPLETED") {
      void sendCustomerMail(order.userId, "order_delivered", {
        order_code: order.code, product_name: variant?.product.name || "", variant_name: variant?.name || "",
        delivery_content: "",
      });
    }
  } else if (canceled === codes.length && codes.length > 0 && order.status !== "REFUNDED") {
    // Claim REFUNDED trong transaction trước khi cộng tiền — đồng bộ chạy trùng
    // với admin bấm huỷ tay thì chỉ một đường hoàn được tiền.
    let claimed = false;
    await prisma.$transaction(async (tx) => {
      const claim = await tx.premiumOrder.updateMany({
        where: { id: order.id, status: { in: ["PENDING", "PARTIAL", "DELIVERED", "COMPLETED", "WARRANTY"] } },
        data: { status: "REFUNDED" },
      });
      if (claim.count === 0) return;
      claimed = true;
      // Đơn chưa giao (PENDING) bị huỷ -> trả kho số lượng đã trừ khi đặt
      if (order.status === "PENDING") await restoreVariantStock(tx, order.variantId, order.quantity);
      await applyBalance(tx, order.userId, order.total, "REFUND", order.code, "Nhà cung cấp huỷ đơn premium — hoàn tiền");
    });
    if (claimed) {
      await clawbackReferralCommission(order.userId, order.total, order.code);
      await clawbackPassCashback(order.userId, order.total, order.code);
      void sendCustomerMail(order.userId, "order_refunded", {
        order_code: order.code, product_name: variant?.product.name || "",
        refund_amount: vnd(order.total), balance: await balanceText(order.userId),
      });
    }
  }
  return prisma.premiumOrder.findUnique({ where: { id: order.id } });
}
