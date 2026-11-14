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
import { executeFzrPremiumOrder, refreshFzrQuotePrice, parseBuyerInfoLines } from "./fzr-orders";
import { claimVariantStock, restoreVariantStock, variantSoldOut, OUT_OF_STOCK_ERROR, notifyStockCrossing } from "./variant-stock";
import { passDiscountFor, creditPassCashback, clawbackPassCashback } from "./pass";
import { sendCustomerMail } from "./customer-mail";
import { moduleOn, moduleKeyForGroup, MODULE_LABEL } from "./modules";
import type { PremiumOrder, User } from "@prisma/client";

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

  // Đợt 111: ghi lại lần trừ kho của đơn này (before/after) để bắn cảnh báo
  // kho SAU khi transaction chốt — chỉ khi lần trừ vừa vượt mốc hết/sắp hết.
  let stockMove: { before: number; after: number } | null = null;
  const created = await prisma.$transaction(async (tx) => {
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

  // Đấu API mua sản phẩm (kiểu ThaTim): gọi action=buy cho từng đơn vị
  if (variant.product.fulfillment === "API") {
    const provider = variant.product.providerId
      ? await prisma.provider.findUnique({ where: { id: variant.product.providerId } })
      : null;
    // FazerCards (driver FZR): luồng riêng theo nhóm sản phẩm — xem lib/fzr-orders.
    // Đơn thiếu linkage FZR thì rơi xuống xử lý tay như stub API trước đây.
    if (provider?.driver === "FZR" && variant.providerGroup && variant.providerItemId) {
      const fzrOrder = await prisma.premiumOrder.findUnique({ where: { id: created.id } });
      if (fzrOrder) {
        return executeFzrPremiumOrder({
          order: fzrOrder,
          variant,
          provider,
          inputs: input.customData || parseBuyerInfoLines(buyerInfo),
        });
      }
    }
    if (!provider || !variant.product.providerProductId || !variant.providerCycle) {
      // Chưa cấu hình đủ mapping -> giữ đơn PENDING cho admin xử lý tay thay vì mất đơn
      await prisma.premiumOrder.update({
        where: { id: created.id },
        data: { adminNote: "Sản phẩm API chưa cấu hình đủ provider/chu kỳ — cần xử lý tay" },
      });
      return created;
    }
    const codes: string[] = [];
    const deliveries: string[] = [];
    let failed = 0;
    for (let i = 0; i < input.quantity; i++) {
      try {
        const r = await providerBuyProduct(provider, variant.product.providerProductId, variant.providerCycle, buyerInfo || "");
        codes.push(r.orderCode);
        const d = extractDelivery(r.raw?.data || r.raw).delivery;
        if (d) deliveries.push(d);
        await prisma.apiLog.create({ data: { kind: "provider_out", ref: created.code, detail: `buy product=${variant.product.providerProductId} cycle=${variant.providerCycle} -> ${r.orderCode}` } });
      } catch (e: any) {
        failed++;
        await prisma.apiLog.create({ data: { kind: "provider_out", ref: created.code, ok: false, detail: `buy failed: ${String(e?.message || e)}` } });
      }
    }
    if (codes.length === 0) {
      // Provider từ chối toàn bộ -> hoàn tiền đủ + trả kho số lượng đã trừ
      await prisma.$transaction(async (tx) => {
        await restoreVariantStock(tx, variant.id, input.quantity);
        await applyBalance(tx, input.user.id, total, "REFUND", created.code, "Nhà cung cấp từ chối đơn premium — hoàn tiền");
        await tx.premiumOrder.update({ where: { id: created.id }, data: { status: "REFUNDED" } });
      });
      await clawbackReferralCommission(input.user.id, total, created.code);
      await clawbackPassCashback(input.user.id, total, created.code);
      void sendCustomerMail(input.user.id, "order_refunded", {
        order_code: created.code, product_name: variant.product.name,
        refund_amount: vnd(total), balance: await balanceText(input.user.id),
      });
      return { ...created, status: "REFUNDED" as const };
    }
    if (failed > 0) {
      const refundAmt = Math.floor((total * failed) / input.quantity);
      await prisma.$transaction(async (tx) => {
        await restoreVariantStock(tx, variant.id, failed);
        await applyBalance(tx, input.user.id, refundAmt, "REFUND", created.code, `Hoàn ${failed} đơn vị provider không nhận`);
      });
      await clawbackReferralCommission(input.user.id, refundAmt, created.code);
      await clawbackPassCashback(input.user.id, refundAmt, created.code);
      void sendCustomerMail(input.user.id, "order_refunded", {
        order_code: created.code, product_name: variant.product.name,
        refund_amount: vnd(refundAmt), balance: await balanceText(input.user.id),
      });
    }
    const updated = await prisma.premiumOrder.update({
      where: { id: created.id },
      data: {
        providerOrderId: codes.join(","),
        ...(deliveries.length === input.quantity
          ? { status: "DELIVERED", deliveryData: deliveries.join("\n---\n") }
          : {}),
        ...(failed > 0 ? { adminNote: `${failed}/${input.quantity} đơn vị bị provider từ chối — đã hoàn tiền phần đó` } : {}),
      },
    });
    if (updated.status === "DELIVERED") {
      void sendCustomerMail(input.user.id, "order_delivered", {
        order_code: created.code, product_name: variant.product.name, variant_name: variant.name,
        delivery_content: updated.deliveryData || "",
      });
    }
    return updated;
  }
  return created;
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
