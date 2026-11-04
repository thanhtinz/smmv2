import { prisma } from "./db";
import { applyBalance } from "./wallet";
import { LEVEL_DISCOUNT, smmCharge, genCode } from "./format";
import {
  providerAddOrder, providerOrderStatus, mapProviderStatus,
  providerBuyProduct, providerProductHistory, findHistoryEntry, extractDelivery,
  type SmmExtraParams,
} from "./provider";
import type { PremiumOrder, SmmOrder, User } from "@prisma/client";

/** Tạo đơn SMM (dùng chung cho web, API reseller). Ném Error với message hiển thị cho khách. */
export async function createSmmOrder(input: {
  user: User;
  serviceId: number;
  link: string;
  quantity: number;
  note?: string;
  viaApi?: boolean;
  extra?: SmmExtraParams;
}) {
  const service = await prisma.smmService.findUnique({
    where: { id: input.serviceId },
    include: { provider: true },
  });
  if (!service || !service.active) throw new Error("Dịch vụ không tồn tại hoặc đang tạm ngưng");
  if (!input.link.trim()) throw new Error("Thiếu link");
  if (input.quantity < service.min) throw new Error(`Số lượng tối thiểu là ${service.min}`);
  if (input.quantity > service.max) throw new Error(`Số lượng tối đa là ${service.max}`);

  const discount = LEVEL_DISCOUNT[input.user.level] || 0;
  const charge = Math.max(1, Math.round(smmCharge(service.rate, input.quantity) * (1 - discount / 100)));
  const cost = smmCharge(service.costRate, input.quantity);

  const order = await prisma.$transaction(async (tx) => {
    await applyBalance(tx, input.user.id, -charge, "SMM_ORDER", undefined, `Đặt đơn ${service.name}`);
    const o = await tx.smmOrder.create({
      data: {
        code: "TMP",
        userId: input.user.id,
        serviceId: service.id,
        link: input.link.trim(),
        quantity: input.quantity,
        charge,
        cost,
        status: "PENDING",
        fulfillment: service.fulfillment,
        providerId: service.providerId,
        viaApi: !!input.viaApi,
        note: input.note,
        params: input.extra && Object.keys(input.extra).length ? JSON.stringify(input.extra) : null,
        remains: input.quantity,
      },
    });
    const code = genCode("SMM", o.id);
    await tx.smmOrder.update({ where: { id: o.id }, data: { code } });
    return { ...o, code };
  });

  // Đẩy qua provider nếu là đơn API — lỗi thì giữ PENDING để admin xử lý / cron thử lại, KHÔNG mất tiền khách vô ích:
  // nếu provider từ chối dứt khoát, hoàn tiền ngay.
  if (service.fulfillment === "API" && service.provider && service.providerServiceId) {
    try {
      const pid = await providerAddOrder(service.provider, service.providerServiceId, order.link, order.quantity, input.extra);
      await prisma.smmOrder.update({
        where: { id: order.id },
        data: { providerOrderId: pid, status: "PROCESSING" },
      });
      await prisma.apiLog.create({
        data: { kind: "provider_out", ref: order.code, detail: `providerOrder=${pid} provider=${service.provider.name}` },
      });
      return { ...order, providerOrderId: pid, status: "PROCESSING" as const };
    } catch (e: any) {
      await prisma.apiLog.create({
        data: { kind: "provider_out", ref: order.code, ok: false, detail: String(e?.message || e) },
      });
      await refundSmmOrder(order.id, order.charge, "Provider từ chối đơn — hoàn tiền tự động");
      return { ...order, status: "REFUNDED" as const };
    }
  }
  return order;
}

/** Hoàn tiền (toàn bộ hoặc một phần) cho đơn SMM + cập nhật trạng thái */
export async function refundSmmOrder(orderId: number, amount: number, note: string, status: "REFUNDED" | "CANCELED" | "PARTIAL" = "REFUNDED") {
  const order = await prisma.smmOrder.findUnique({ where: { id: orderId } });
  if (!order) return;
  const refundable = order.charge - order.refundedAmount;
  const amt = Math.min(amount, refundable);
  await prisma.$transaction(async (tx) => {
    if (amt > 0) await applyBalance(tx, order.userId, amt, "REFUND", order.code, note);
    await tx.smmOrder.update({
      where: { id: orderId },
      data: { status, refundedAmount: { increment: amt } },
    });
  });
}

/** Đồng bộ trạng thái 1 đơn API từ provider (cron + nút bấm tay của admin) */
export async function syncSmmOrderStatus(order: SmmOrder) {
  if (order.fulfillment !== "API" || !order.providerOrderId || !order.providerId) return order;
  const provider = await prisma.provider.findUnique({ where: { id: order.providerId } });
  if (!provider) return order;
  const st = await providerOrderStatus(provider, order.providerOrderId);
  const mapped = mapProviderStatus(st.status);
  const remains = st.remains !== undefined ? parseInt(st.remains) : order.remains;
  const startCount = st.start_count !== undefined ? parseInt(st.start_count) : order.startCount;

  if (mapped === "CANCELED" && order.status !== "CANCELED" && order.status !== "REFUNDED") {
    await refundSmmOrder(order.id, order.charge - order.refundedAmount, "Provider huỷ đơn — hoàn tiền");
  } else if (mapped === "PARTIAL" && remains !== null && remains !== undefined && order.quantity > 0) {
    // Hoàn theo phần chưa chạy
    const unit = order.charge / order.quantity;
    const shouldRefund = Math.floor(unit * (remains || 0));
    const extra = shouldRefund - order.refundedAmount;
    if (extra > 0) {
      await prisma.$transaction(async (tx) => {
        await applyBalance(tx, order.userId, extra, "REFUND", order.code, "Hoàn phần chưa chạy");
        await tx.smmOrder.update({
          where: { id: order.id },
          data: { status: "PARTIAL", remains, startCount, refundedAmount: { increment: extra } },
        });
      });
      return prisma.smmOrder.findUnique({ where: { id: order.id } });
    }
    await prisma.smmOrder.update({ where: { id: order.id }, data: { status: "PARTIAL", remains, startCount } });
  } else {
    await prisma.smmOrder.update({
      where: { id: order.id },
      data: { status: mapped, remains, startCount },
    });
  }
  return prisma.smmOrder.findUnique({ where: { id: order.id } });
}

/** Mua premium: trừ tiền, nếu AUTO_STOCK đủ kho thì giao ngay */
export async function createPremiumOrder(input: {
  user: User;
  variantId: number;
  quantity: number;
  buyerInfo?: string;
}) {
  const variant = await prisma.premiumVariant.findUnique({
    where: { id: input.variantId },
    include: { product: true },
  });
  if (!variant || !variant.active || !variant.product.active) throw new Error("Gói không tồn tại hoặc đã ngưng bán");
  if (input.quantity < 1 || input.quantity > 50) throw new Error("Số lượng không hợp lệ");
  if ((variant.product.fulfillment === "MANUAL" || variant.product.fulfillment === "API") && !input.buyerInfo?.trim())
    throw new Error("Gói này cần thông tin tài khoản/email của bạn để bàn giao");

  const total = variant.price * input.quantity;
  const cost = variant.cost * input.quantity;

  const created = await prisma.$transaction(async (tx) => {
    await applyBalance(tx, input.user.id, -total, "PREMIUM_ORDER", undefined, `Mua ${variant.product.name} — ${variant.name}`);
    const o = await tx.premiumOrder.create({
      data: {
        code: "TMP",
        userId: input.user.id,
        variantId: variant.id,
        quantity: input.quantity,
        total,
        cost,
        status: "PENDING",
        providerId: variant.product.providerId,
        buyerInfo: input.buyerInfo,
        warrantyUntil: variant.warrantyDays
          ? new Date(Date.now() + variant.warrantyDays * 86400000)
          : null,
      },
    });
    const code = genCode("PRE", o.id);
    await tx.premiumOrder.update({ where: { id: o.id }, data: { code } });

    // Giao tự động từ kho
    if (variant.product.fulfillment === "AUTO_STOCK") {
      const stocks = await tx.premiumStock.findMany({
        where: { variantId: variant.id, status: "AVAILABLE" },
        take: input.quantity,
        orderBy: { id: "asc" },
      });
      if (stocks.length >= input.quantity) {
        await tx.premiumStock.updateMany({
          where: { id: { in: stocks.map((s) => s.id) } },
          data: { status: "SOLD", orderId: o.id },
        });
        const delivered = await tx.premiumOrder.update({
          where: { id: o.id },
          data: { status: "DELIVERED", deliveryData: stocks.map((s) => s.payload).join("\n---\n") },
        });
        return { ...delivered, code };
      }
      // Thiếu kho -> để PENDING, admin giao tay (tiền vẫn giữ trong đơn, huỷ sẽ hoàn)
      await tx.premiumOrder.update({
        where: { id: o.id },
        data: { adminNote: "Kho tự động đang hết — cần giao tay" },
      });
    }
    return { ...o, code };
  });

  // Đấu API mua sản phẩm (kiểu ThaTim): gọi action=buy cho từng đơn vị
  if (variant.product.fulfillment === "API") {
    const provider = variant.product.providerId
      ? await prisma.provider.findUnique({ where: { id: variant.product.providerId } })
      : null;
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
        const r = await providerBuyProduct(provider, variant.product.providerProductId, variant.providerCycle, input.buyerInfo || "");
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
      // Provider từ chối toàn bộ -> hoàn tiền đủ
      await prisma.$transaction(async (tx) => {
        await applyBalance(tx, input.user.id, total, "REFUND", created.code, "Nhà cung cấp từ chối đơn premium — hoàn tiền");
        await tx.premiumOrder.update({ where: { id: created.id }, data: { status: "REFUNDED" } });
      });
      return { ...created, status: "REFUNDED" as const };
    }
    if (failed > 0) {
      const refundAmt = variant.price * failed;
      await prisma.$transaction(async (tx) => {
        await applyBalance(tx, input.user.id, refundAmt, "REFUND", created.code, `Hoàn ${failed} đơn vị provider không nhận`);
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
    return updated;
  }
  return created;
}

/** Đồng bộ đơn premium API từ provider (action=history) — cron + nút bấm admin */
export async function syncPremiumOrderStatus(order: PremiumOrder) {
  if (!order.providerId || !order.providerOrderId) return order;
  const provider = await prisma.provider.findUnique({ where: { id: order.providerId } });
  if (!provider) return order;
  const codes = order.providerOrderId.split(",").map((x) => x.trim()).filter(Boolean);
  const raw = await providerProductHistory(provider, codes);
  const deliveries: string[] = [];
  let canceled = 0;
  for (const code of codes) {
    const entry = findHistoryEntry(raw, code);
    if (!entry) continue;
    const { delivery, status } = extractDelivery(entry);
    if (delivery) deliveries.push(delivery);
    if (status && /cancel|refund|fail/i.test(status)) canceled++;
  }
  if (deliveries.length) {
    await prisma.premiumOrder.update({
      where: { id: order.id },
      data: { status: "DELIVERED", deliveryData: deliveries.join("\n---\n") },
    });
  } else if (canceled === codes.length && codes.length > 0 && order.status !== "REFUNDED") {
    await prisma.$transaction(async (tx) => {
      await applyBalance(tx, order.userId, order.total, "REFUND", order.code, "Nhà cung cấp huỷ đơn premium — hoàn tiền");
      await tx.premiumOrder.update({ where: { id: order.id }, data: { status: "REFUNDED" } });
    });
  }
  return prisma.premiumOrder.findUnique({ where: { id: order.id } });
}
