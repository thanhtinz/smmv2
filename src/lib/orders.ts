import { prisma } from "./db";
import { applyBalance, creditReferralCommission, clawbackReferralCommission } from "./wallet";
import { LEVEL_DISCOUNT, smmCharge, genCode, parsePremiumFields, vnd } from "./format";
import { checkPromo, consumePromo } from "./promo";
import { levelDiscountFromSettings } from "./settings";
import { getSettings } from "./settings";
import { orderEvent, orderTransition, notifyUser } from "./notify";
import {
  providerAddOrder, providerOrderStatus, providerRefill, mapProviderStatus,
  providerBuyProduct, findPremiumOrderInHistory, extractDelivery,
  type SmmExtraParams,
} from "./provider";
import type { PremiumOrder, SmmOrder, User } from "@prisma/client";

/** Trạng thái drip-feed lưu trong params của đơn (JSON) */
export type DripfeedState = {
  runs: number;
  intervalMinutes: number;
  perRun: number;
  remainder: number; // cộng dồn vào lượt đầu
  doneRuns: number;
  placedQty: number;
  nextRunAt: string; // ISO
  failCount: number;
  cancelled?: boolean;
  children: { pid: string; qty: number; at: string }[];
};

export function parseDripfeed(params: string | null | undefined): DripfeedState | null {
  if (!params) return null;
  try {
    const p = JSON.parse(params);
    return p && p.dripfeed ? (p.dripfeed as DripfeedState) : null;
  } catch {
    return null;
  }
}

/** % giảm theo cấp bậc của khách panel — mỗi panel tự đặt riêng từng bậc */
export function panelTierDiscount(
  panel: { discountMember: number; discountReseller: number; discountAgency: number; discountVip: number },
  level: string
) {
  switch (level) {
    case "RESELLER": return panel.discountReseller;
    case "AGENCY": return panel.discountAgency;
    case "VIP": return panel.discountVip;
    default: return panel.discountMember;
  }
}

/** Tạo đơn SMM (dùng chung cho web, API reseller). Ném Error với message hiển thị cho khách. */
export async function createSmmOrder(input: {
  user: User;
  serviceId: number;
  link: string;
  quantity: number;
  note?: string;
  viaApi?: boolean;
  extra?: SmmExtraParams;
  dripfeed?: { runs: number; intervalMinutes: number };
  promoCode?: string;
}) {
  const service = await prisma.smmService.findUnique({
    where: { id: input.serviceId },
    include: { provider: true },
  });
  if (!service || !service.active) throw new Error("Dịch vụ không tồn tại hoặc đang tạm ngưng");
  if (!input.link.trim()) throw new Error("Thiếu link");
  if (input.quantity < service.min) throw new Error(`Số lượng tối thiểu là ${service.min}`);
  if (input.quantity > service.max) throw new Error(`Số lượng tối đa là ${service.max}`);

  // Drip-feed: chia tổng số lượng thành nhiều lượt thả cách nhau theo phút (kiểu slike/panel chuẩn)
  let drip: DripfeedState | null = null;
  if (input.dripfeed) {
    if (!service.dripfeed) throw new Error("Dịch vụ này không hỗ trợ drip-feed");
    const runs = Math.floor(input.dripfeed.runs);
    const intervalMinutes = Math.floor(input.dripfeed.intervalMinutes);
    if (runs < 2 || runs > 100) throw new Error("Số lượt drip-feed phải từ 2 đến 100");
    if (intervalMinutes < 5 || intervalMinutes > 1440) throw new Error("Khoảng cách giữa các lượt phải từ 5 đến 1440 phút");
    const perRun = Math.floor(input.quantity / runs);
    if (perRun < service.min) throw new Error(`Mỗi lượt thả ${perRun} < tối thiểu ${service.min} của dịch vụ — giảm số lượt hoặc tăng tổng số lượng`);
    if (perRun > service.max) throw new Error(`Mỗi lượt thả ${perRun} > tối đa ${service.max} của dịch vụ — tăng số lượt`);
    drip = {
      runs, intervalMinutes, perRun,
      remainder: input.quantity - perRun * runs,
      doneRuns: 0, placedQty: 0,
      nextRunAt: new Date().toISOString(),
      failCount: 0,
      children: [],
    };
  }

  // Panel con: khách thuộc panel trả giá đã cộng markup của chủ panel, được giảm thêm theo
  // cấp bậc mà panel quy định riêng từng bậc; phần chênh lệch còn lại so với giá gốc là hoa hồng của chủ panel.
  let panel: { id: number; ownerId: number; markup: number; name: string; discountMember: number; discountReseller: number; discountAgency: number; discountVip: number } | null = null;
  if (input.user.panelId) {
    const p = await prisma.childPanel.findUnique({ where: { id: input.user.panelId } });
    if (p && p.status === "ACTIVE") panel = p;
  }
  const settings = await getSettings();
  const panelRate = panel ? Math.round(service.rate * (1 + panel.markup / 100)) : service.rate;
  let effectiveRate = panelRate;
  let discount = panel ? panelTierDiscount(panel, input.user.level) : levelDiscountFromSettings(settings, input.user.level);
  if (panel) {
    // Giá riêng từng dịch vụ theo từng bậc (kiểu thatim: bảng giá có một cột giá cho mỗi cấp):
    // chủ panel đặt giá riêng cho đúng dịch vụ + bậc của khách thì giá đó là GIÁ CUỐI, không giảm thêm %.
    const ov = await prisma.panelServicePrice.findUnique({
      where: { panelId_serviceId_level: { panelId: panel.id, serviceId: service.id, level: input.user.level } },
    });
    if (ov) {
      effectiveRate = ov.price;
      discount = 0;
    }
  }
  const charge = Math.max(1, Math.round(smmCharge(effectiveRate, input.quantity) * (1 - discount / 100)));
  const commission = panel ? Math.max(0, charge - smmCharge(service.rate, input.quantity)) : 0;
  const cost = smmCharge(service.costRate, input.quantity);

  // Profit Protection: không cho đặt đơn nếu giá bán (sau chiết khấu cấp bậc) thấp hơn giá vốn
  if (settings.profit_protection !== "0" && service.costRate > 0 && charge < cost) {
    throw new Error("Dịch vụ tạm dừng nhận đơn do biến động giá vốn — vui lòng chọn dịch vụ khác hoặc liên hệ hỗ trợ");
  }

  // Mã giảm giá (nếu khách nhập): tính trên tiền đơn sau chiết khấu cấp bậc, sàn chịu phần giảm này
  let finalCharge = charge;
  let promo: Awaited<ReturnType<typeof checkPromo>> = null;
  if (input.promoCode?.trim()) {
    promo = await checkPromo(input.promoCode, "SMM", charge);
    if (promo) finalCharge = charge - promo.discount;
  }

  // Duplicate Detection + Order Risk Detection: gắn cờ để admin chú ý (vẫn cho đặt)
  const flags: string[] = [];
  const dup = await prisma.smmOrder.findFirst({
    where: { userId: input.user.id, serviceId: service.id, link: input.link.trim(), status: { in: ["PENDING", "PROCESSING", "IN_PROGRESS"] } },
    orderBy: { id: "desc" }, select: { code: true },
  });
  if (dup) flags.push(`Nghi trùng đơn ${dup.code} (cùng dịch vụ + link đang chạy)`);
  const hourAgo = new Date(Date.now() - 3600_000);
  const repeats = await prisma.smmOrder.count({ where: { userId: input.user.id, link: input.link.trim(), createdAt: { gte: hourAgo } } });
  if (repeats >= 3) flags.push(`Đặt lặp link này ${repeats} lần trong 1 giờ`);
  if (input.quantity >= 100000) flags.push("Số lượng rất lớn (>= 100.000)");
  const flagNote = flags.length ? flags.join("; ").slice(0, 255) : null;

  const order = await prisma.$transaction(async (tx) => {
    await applyBalance(tx, input.user.id, -finalCharge, "SMM_ORDER", undefined, `Đặt đơn ${service.name}`);
    if (promo) await consumePromo(tx, promo.row.id);
    const o = await tx.smmOrder.create({
      data: {
        code: "TMP",
        userId: input.user.id,
        serviceId: service.id,
        link: input.link.trim(),
        quantity: input.quantity,
        charge: finalCharge,
        promoCode: promo?.row.code,
        promoDiscount: promo?.discount || 0,
        cost,
        status: "PENDING",
        fulfillment: service.fulfillment,
        providerId: service.providerId,
        viaApi: !!input.viaApi,
        panelId: panel?.id,
        commission,
        note: input.note,
        flagNote,
        params: (() => {
          const obj: Record<string, any> = { ...(input.extra || {}) };
          if (drip) obj.dripfeed = drip;
          return Object.keys(obj).length ? JSON.stringify(obj) : null;
        })(),
        remains: input.quantity,
      },
    });
    const code = genCode("SMM", o.id);
    await tx.smmOrder.update({ where: { id: o.id }, data: { code } });
    // Trả hoa hồng cho chủ panel ngay khi đơn được tạo (hoàn tiền sẽ thu hồi theo tỉ lệ)
    if (panel && commission > 0) {
      await applyBalance(tx, panel.ownerId, commission, "PANEL_COMMISSION", code, `Hoa hồng đơn ${code} — panel ${panel.name}`);
    }
    // Hoa hồng giới thiệu: tính trên giao dịch mua của người được giới thiệu (kiểu thatim)
    await creditReferralCommission(tx, input.user.id, finalCharge, code);
    return { ...o, code, charge: finalCharge };
  });
  await orderEvent(order.id, "PENDING", flagNote ? `Đã tạo đơn · Cờ: ${flagNote}` : "Đã tạo đơn");

  // Đẩy qua provider nếu là đơn API — lỗi thì giữ PENDING để admin xử lý / cron thử lại, KHÔNG mất tiền khách vô ích:
  // nếu provider từ chối dứt khoát, hoàn tiền ngay.
  // Đơn drip-feed KHÔNG đẩy ngay: cron thả từng lượt theo lịch (xem processDripfeedOrders).
  if (!drip && service.fulfillment === "API" && service.provider && service.providerServiceId) {
    // Smart Provider Routing + Failover: thử lần lượt các đích — chính trước, dự phòng sau
    // (hoặc ngược lại khi dự phòng rẻ hơn hẳn / chính sắp hết tiền); tất cả đều lỗi mới hoàn tiền.
    type Target = { provider: NonNullable<typeof service.provider>; psid: string; costRate: number; isBackup: boolean };
    const primary: Target = { provider: service.provider, psid: service.providerServiceId, costRate: service.costRate, isBackup: false };
    let backup: Target | null = null;
    if (service.backupProviderId && service.backupProviderServiceId) {
      const bp = await prisma.provider.findUnique({ where: { id: service.backupProviderId } });
      if (bp && bp.active) backup = { provider: bp, psid: service.backupProviderServiceId, costRate: service.backupCostRate, isBackup: true };
    }
    let targets: Target[] = backup ? [primary, backup] : [primary];
    if (backup && ((backup.costRate > 0 && backup.costRate < primary.costRate) || (primary.provider.balanceCache > 0 && primary.provider.balanceCache < cost))) {
      targets = [backup, primary];
    }
    let lastErr: any = null;
    for (const t of targets) {
      try {
        const pid = await providerAddOrder(t.provider, t.psid, order.link, order.quantity, input.extra);
        const newCost = t.costRate > 0 ? smmCharge(t.costRate, order.quantity) : order.cost;
        await prisma.smmOrder.update({
          where: { id: order.id },
          data: { providerOrderId: pid, status: "PROCESSING", providerId: t.provider.id, cost: newCost },
        });
        await prisma.apiLog.create({
          data: { kind: "provider_out", ref: order.code, detail: `providerOrder=${pid} provider=${t.provider.name}${t.isBackup ? " (backup)" : ""}` },
        });
        await orderEvent(order.id, "PROCESSING",
          `Đã đẩy sang nhà cung cấp ${t.provider.name} (mã ${pid})` +
          (lastErr ? " — chuyển dự phòng vì nhà cung cấp trước lỗi" : t.isBackup ? " — định tuyến sang nguồn giá tốt hơn" : ""));
        return { ...order, providerOrderId: pid, status: "PROCESSING" as const, providerId: t.provider.id, cost: newCost };
      } catch (e: any) {
        lastErr = e;
        await prisma.apiLog.create({
          data: { kind: "provider_out", ref: order.code, ok: false, detail: `${t.provider.name}: ${String(e?.message || e)}` },
        });
      }
    }
    await refundSmmOrder(order.id, order.charge, "Nhà cung cấp từ chối đơn — hoàn tiền tự động");
    return { ...order, status: "REFUNDED" as const };
  }
  if (drip && service.fulfillment === "API") {
    await prisma.smmOrder.update({ where: { id: order.id }, data: { status: "PROCESSING" } });
    return { ...order, status: "PROCESSING" as const };
  }
  return order;
}

/** Hoàn tiền (toàn bộ hoặc một phần) cho đơn SMM + cập nhật trạng thái.
 *  Đơn drip-feed: chỉ hoàn phần CHƯA thả (phần đã thả là giá trị đã giao) và dừng lịch thả. */
export async function refundSmmOrder(orderId: number, amount: number, note: string, status: "REFUNDED" | "CANCELED" | "PARTIAL" = "REFUNDED") {
  const order = await prisma.smmOrder.findUnique({ where: { id: orderId } });
  if (!order) return;
  const drip = parseDripfeed(order.params);
  let cap = order.charge - order.refundedAmount;
  if (drip && drip.placedQty > 0) {
    const placedValue = Math.floor((order.charge * drip.placedQty) / Math.max(1, order.quantity));
    cap = Math.min(cap, Math.max(0, order.charge - placedValue - order.refundedAmount));
  }
  const amt = Math.min(amount, cap);
  await prisma.$transaction(async (tx) => {
    if (amt > 0) await applyBalance(tx, order.userId, amt, "REFUND", order.code, note);
    const data: any = { status, refundedAmount: { increment: amt } };
    if (drip && !drip.cancelled) {
      try {
        const p = JSON.parse(order.params || "{}");
        p.dripfeed = { ...drip, cancelled: true };
        data.params = JSON.stringify(p);
      } catch {}
    }
    await tx.smmOrder.update({ where: { id: orderId }, data });
  });
  await orderTransition(order, status, amt > 0 ? `${note} — hoàn ${vnd(amt)}` : note);
  // Thu hồi hoa hồng panel theo đúng tỉ lệ số tiền vừa hoàn (best-effort: chủ panel đã tiêu thì ghi log, không chặn hoàn tiền của khách)
  if (order.panelId && order.commission > 0 && amt > 0 && order.charge > 0) {
    const claw = Math.floor((order.commission * amt) / order.charge);
    if (claw > 0) {
      try {
        const panel = await prisma.childPanel.findUnique({ where: { id: order.panelId } });
        if (panel) {
          await prisma.$transaction(async (tx) => {
            await applyBalance(tx, panel.ownerId, -claw, "PANEL_COMMISSION", order.code, `Thu hồi hoa hồng — đơn ${order.code} hoàn tiền`);
          });
        }
      } catch (e: any) {
        await prisma.apiLog.create({ data: { kind: "panel_commission", ref: order.code, ok: false, detail: `clawback failed ${claw}: ${String(e?.message || e)}` } });
      }
    }
  }
  // Thu hồi hoa hồng giới thiệu theo tỉ lệ số tiền vừa hoàn
  await clawbackReferralCommission(order.userId, amt, order.code);
}

/**
 * Động cơ drip-feed (cron gọi mỗi lượt): thả lượt tiếp theo cho các đơn đến hạn.
 * Mỗi lượt là một đơn con thật ở provider; hết lượt thì gắn providerOrderId của lượt cuối
 * để bộ đồng bộ trạng thái thường tiếp quản. Lượt lỗi 3 lần liên tiếp -> huỷ phần còn lại + hoàn tiền.
 */
export async function processDripfeedOrders(limit = 10) {
  const now = new Date();
  const candidates = await prisma.smmOrder.findMany({
    where: { fulfillment: "API", status: { in: ["PENDING", "PROCESSING"] }, params: { contains: "dripfeed" } },
    take: 100,
    orderBy: { createdAt: "asc" },
  });
  let placed = 0, finished = 0, failed = 0;
  for (const order of candidates) {
    if (placed + failed >= limit) break;
    const drip = parseDripfeed(order.params);
    if (!drip || drip.cancelled || drip.doneRuns >= drip.runs) continue;
    if (new Date(drip.nextRunAt) > now) continue;
    const service = await prisma.smmService.findUnique({ where: { id: order.serviceId }, include: { provider: true } });
    if (!service?.provider || !service.providerServiceId) continue;
    const runQty = drip.perRun + (drip.doneRuns === 0 ? drip.remainder : 0);
    let extra: SmmExtraParams | undefined;
    try {
      const p = JSON.parse(order.params || "{}");
      const { dripfeed, ...rest } = p;
      extra = rest as SmmExtraParams;
    } catch {}
    try {
      const pid = await providerAddOrder(service.provider, service.providerServiceId, order.link, runQty, extra);
      drip.children.push({ pid, qty: runQty, at: now.toISOString() });
      drip.doneRuns += 1;
      drip.placedQty += runQty;
      drip.failCount = 0;
      drip.nextRunAt = new Date(now.getTime() + drip.intervalMinutes * 60000).toISOString();
      const done = drip.doneRuns >= drip.runs;
      const p = JSON.parse(order.params || "{}");
      p.dripfeed = drip;
      await prisma.smmOrder.update({
        where: { id: order.id },
        data: {
          params: JSON.stringify(p),
          status: "PROCESSING",
          remains: Math.max(0, order.quantity - drip.placedQty),
          ...(done ? { providerOrderId: pid } : {}),
        },
      });
      await prisma.apiLog.create({ data: { kind: "provider_out", ref: order.code, detail: `dripfeed run ${drip.doneRuns}/${drip.runs} qty=${runQty} -> ${pid}` } });
      placed++;
      if (done) finished++;
    } catch (e: any) {
      drip.failCount += 1;
      drip.nextRunAt = new Date(now.getTime() + 60000).toISOString();
      const p = JSON.parse(order.params || "{}");
      p.dripfeed = drip;
      await prisma.smmOrder.update({ where: { id: order.id }, data: { params: JSON.stringify(p) } });
      await prisma.apiLog.create({ data: { kind: "provider_out", ref: order.code, ok: false, detail: `dripfeed run failed (${drip.failCount}): ${String(e?.message || e)}` } });
      failed++;
      if (drip.failCount >= 3) {
        await refundSmmOrder(order.id, order.charge, "Drip-feed: provider lỗi 3 lượt liên tiếp — hoàn phần chưa thả", "CANCELED");
      }
    }
  }
  return { placed, finished, failed };
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
      await orderTransition(order, "PARTIAL", `Hoàn phần chưa chạy ${vnd(extra)}`);
      return prisma.smmOrder.findUnique({ where: { id: order.id } });
    }
    await prisma.smmOrder.update({ where: { id: order.id }, data: { status: "PARTIAL", remains, startCount } });
    if (order.status !== "PARTIAL") await orderTransition(order, "PARTIAL", "Đơn hoàn một phần");
  } else {
    await prisma.smmOrder.update({
      where: { id: order.id },
      data: { status: mapped, remains, startCount },
    });
    if (mapped !== order.status) await orderTransition(order, mapped, mapped === "COMPLETED" ? "Đơn đã hoàn thành" : undefined);
  }
  return prisma.smmOrder.findUnique({ where: { id: order.id } });
}

/** Mua premium: trừ tiền, nếu AUTO_STOCK đủ kho thì giao ngay */
export async function createPremiumOrder(input: {
  user: User;
  variantId: number;
  quantity: number;
  buyerInfo?: string;
  customData?: Record<string, string>; // giá trị các trường tuỳ chỉnh theo label (form web gửi)
  promoCode?: string;
}) {
  const variant = await prisma.premiumVariant.findUnique({
    where: { id: input.variantId },
    include: { product: true },
  });
  if (!variant || !variant.active || !variant.product.active) throw new Error("Gói không tồn tại hoặc đã ngưng bán");
  if (input.quantity < 1 || input.quantity > 50) throw new Error("Số lượng không hợp lệ");
  // Trường tuỳ chỉnh của sản phẩm: validate trường bắt buộc và gộp thành thông tin bàn giao
  const fields = parsePremiumFields(variant.product.customFields);
  let buyerInfo = input.buyerInfo;
  if (fields.length > 0 && input.customData !== undefined) {
    const lines: string[] = [];
    for (const f of fields) {
      const val = String(input.customData[f.label] || "").trim();
      if (f.required && !val) throw new Error(`Thiếu thông tin: ${f.label}`);
      if (val) lines.push(`${f.label}: ${val}`);
    }
    buyerInfo = lines.join("\n") || undefined;
  }
  if ((variant.product.fulfillment === "MANUAL" || variant.product.fulfillment === "API") && !buyerInfo?.trim())
    throw new Error("Gói này cần thông tin tài khoản/email của bạn để bàn giao");

  // Panel con: khách thuộc panel trả giá panel (cộng markup, giảm theo cấp bậc của panel),
  // chênh lệch so với giá web mẹ là hoa hồng của chủ panel — cùng nguyên tắc với đơn SMM.
  const panelRow = input.user.panelId ? await prisma.childPanel.findUnique({ where: { id: input.user.panelId } }) : null;
  const panel = panelRow && panelRow.status === "ACTIVE" ? panelRow : null;
  let total = variant.price * input.quantity;
  let commission = 0;
  if (panel) {
    const unit = Math.round(variant.price * (1 + panel.markup / 100));
    const disc = panelTierDiscount(panel, input.user.level);
    total = Math.max(1, Math.round(unit * input.quantity * (1 - disc / 100)));
    commission = Math.max(0, total - variant.price * input.quantity);
  }
  const cost = variant.cost * input.quantity;

  // Mã giảm giá: tính trên tổng tiền sau giá panel (nếu có)
  let promo: Awaited<ReturnType<typeof checkPromo>> = null;
  if (input.promoCode?.trim()) {
    promo = await checkPromo(input.promoCode, "PREMIUM", total);
    if (promo) total -= promo.discount;
  }

  const created = await prisma.$transaction(async (tx) => {
    await applyBalance(tx, input.user.id, -total, "PREMIUM_ORDER", undefined, `Mua ${variant.product.name} — ${variant.name}`);
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
        cost,
        status: "PENDING",
        providerId: variant.product.providerId,
        panelId: panel?.id,
        commission,
        buyerInfo,
        warrantyUntil: variant.warrantyDays
          ? new Date(Date.now() + variant.warrantyDays * 86400000)
          : null,
      },
    });
    const code = genCode("PRE", o.id);
    await tx.premiumOrder.update({ where: { id: o.id }, data: { code } });
    if (panel && commission > 0) {
      await applyBalance(tx, panel.ownerId, commission, "PANEL_COMMISSION", code, `Hoa hồng đơn ${code} — panel ${panel.name}`);
    }
    // Hoa hồng giới thiệu: tính trên giao dịch mua (kiểu thatim)
    await creditReferralCommission(tx, input.user.id, total, code);

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
      // Provider từ chối toàn bộ -> hoàn tiền đủ + thu hồi toàn bộ hoa hồng panel
      await prisma.$transaction(async (tx) => {
        await applyBalance(tx, input.user.id, total, "REFUND", created.code, "Nhà cung cấp từ chối đơn premium — hoàn tiền");
        if (panel && commission > 0) {
          await applyBalance(tx, panel.ownerId, -commission, "PANEL_COMMISSION", created.code, "Thu hồi hoa hồng — đơn premium bị hoàn toàn bộ");
        }
        await tx.premiumOrder.update({ where: { id: created.id }, data: { status: "REFUNDED" } });
      });
      await clawbackReferralCommission(input.user.id, total, created.code);
      return { ...created, status: "REFUNDED" as const };
    }
    if (failed > 0) {
      const refundAmt = Math.floor((total * failed) / input.quantity);
      const clawback = panel ? Math.floor((commission * failed) / input.quantity) : 0;
      await prisma.$transaction(async (tx) => {
        await applyBalance(tx, input.user.id, refundAmt, "REFUND", created.code, `Hoàn ${failed} đơn vị provider không nhận`);
        if (panel && clawback > 0) {
          await applyBalance(tx, panel.ownerId, -clawback, "PANEL_COMMISSION", created.code, "Thu hồi hoa hồng phần đơn premium bị hoàn");
        }
      });
      await clawbackReferralCommission(input.user.id, refundAmt, created.code);
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

/** Đồng bộ đơn premium API từ provider (action=history) — cron + nút bấm admin.
 *  Bàn giao nằm ở trường "data" của mục history khi status = completed. */
export async function syncPremiumOrderStatus(order: PremiumOrder) {
  if (!order.providerId || !order.providerOrderId) return order;
  const provider = await prisma.provider.findUnique({ where: { id: order.providerId } });
  if (!provider) return order;
  const variant = await prisma.premiumVariant.findUnique({
    where: { id: order.variantId },
    include: { product: { select: { providerProductId: true } } },
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
  } else if (completedNoData > 0 && seen === codes.length && canceled === 0) {
    // Provider báo hoàn thành nhưng chưa trả dữ liệu bàn giao -> đánh dấu hoàn thành, admin đối soát
    await prisma.premiumOrder.update({
      where: { id: order.id },
      data: { status: "COMPLETED", adminNote: [order.adminNote, "Provider báo completed nhưng chưa có dữ liệu bàn giao"].filter(Boolean).join(" · ") },
    });
  } else if (canceled === codes.length && codes.length > 0 && order.status !== "REFUNDED") {
    const panelOwner = order.panelId ? await prisma.childPanel.findUnique({ where: { id: order.panelId }, select: { ownerId: true } }) : null;
    await prisma.$transaction(async (tx) => {
      await applyBalance(tx, order.userId, order.total, "REFUND", order.code, "Nhà cung cấp huỷ đơn premium — hoàn tiền");
      if (panelOwner && order.commission > 0) {
        await applyBalance(tx, panelOwner.ownerId, -order.commission, "PANEL_COMMISSION", order.code, "Thu hồi hoa hồng — đơn premium bị hoàn");
      }
      await tx.premiumOrder.update({ where: { id: order.id }, data: { status: "REFUNDED" } });
    });
    await clawbackReferralCommission(order.userId, order.total, order.code);
  }
  return prisma.premiumOrder.findUnique({ where: { id: order.id } });
}

/**
 * Auto Refill: với dịch vụ bật autoRefill (+ provider hỗ trợ refill), hệ thống TỰ gửi yêu cầu
 * bảo hành 1 lần cho mỗi đơn API đã hoàn thành (sau 30 phút, trong cửa sổ 7 ngày) thay vì chờ
 * khách bấm. Provider tự kiểm chứng tụt số thật khi xử lý refill. Cron gọi định kỳ.
 */
export async function processAutoRefills(limit = 20) {
  const since = new Date(Date.now() - 7 * 86400000);
  const settleBefore = new Date(Date.now() - 30 * 60000);
  const orders = await prisma.smmOrder.findMany({
    where: {
      fulfillment: "API", status: "COMPLETED", providerOrderId: { not: null }, providerId: { not: null },
      createdAt: { gte: since }, updatedAt: { lte: settleBefore },
    },
    include: { service: { select: { autoRefill: true, refill: true } } },
    take: 100,
    orderBy: { updatedAt: "asc" },
  });
  let refilled = 0, checked = 0;
  for (const o of orders) {
    if (refilled >= limit) break;
    if (!o.service.autoRefill || !o.service.refill) continue;
    let p: any = {};
    try { p = JSON.parse(o.params || "{}"); } catch {}
    if ((p.autoRefillCount || 0) >= 1) continue;
    const provider = await prisma.provider.findUnique({ where: { id: o.providerId! } });
    if (!provider) continue;
    checked++;
    try {
      const rid = await providerRefill(provider, o.providerOrderId!);
      p.autoRefillCount = 1;
      p.lastRefillId = rid;
      await prisma.smmOrder.update({ where: { id: o.id }, data: { params: JSON.stringify(p) } });
      await orderEvent(o.id, "COMPLETED", `Tự động bảo hành: đã gửi refill #${rid} tới ${provider.name}`);
      await notifyUser(o.userId, "Đơn đã được tự động bảo hành", `Đơn ${o.code}: hệ thống đã tự gửi yêu cầu refill #${rid} tới nhà cung cấp`, `/dashboard/don-hang/${o.id}`);
      await prisma.apiLog.create({ data: { kind: "auto_refill", ref: o.code, detail: `refill=${rid} provider=${provider.name}` } });
      refilled++;
    } catch (e: any) {
      p.autoRefillCount = 1; // lỗi dứt khoát (provider không nhận refill) thì không thử lại vô hạn
      p.autoRefillError = String(e?.message || e).slice(0, 150);
      await prisma.smmOrder.update({ where: { id: o.id }, data: { params: JSON.stringify(p) } });
      await prisma.apiLog.create({ data: { kind: "auto_refill", ref: o.code, ok: false, detail: p.autoRefillError } });
    }
  }
  return { checked, refilled };
}
