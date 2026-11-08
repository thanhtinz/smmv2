import { prisma } from "./db";
import { applyBalance, clawbackReferralCommission } from "./wallet";
import { notifyUser } from "./notify";
import { alertMother } from "./alerts";
import { getSettings } from "./settings";
import { awardPointsForPremiumOrder } from "./points";
import { restoreVariantStock } from "./variant-stock";
import {
  FzrError, FZR_LABELS,
  fzrUsdToVnd, fzrUsdCostVnd, fzrOrderStatus, fzrOrderIdOf, extractFzrDelivery, fzrDeliveryOrRaw,
  fzrCreateGameKeyOrder, fzrCreateGiftCardOrder, fzrCreateTopupOrder, fzrValidateTopupId,
  fzrCreateManualOrder, fzrBuyTelegramStars, fzrBuyTelegramPremium,
  fzrCreateSteamTopupOrder, fzrCreateSteamGiftOrder, fzrGetOrder,
  fzrTelegramStarsQuote, fzrTelegramPremiumPlans, fzrSteamGiftOffers, parseDecimalScaled,
} from "./fzr";
import type { PremiumOrder, PremiumVariant, Provider } from "@prisma/client";

/**
 * Thực thi + đồng bộ đơn Premium đấu FazerCards (driver FZR).
 *
 * Nguyên tắc tiền (khớp nhánh API ThaTim trong orders.ts):
 *  - Khách đã bị trừ tiền bởi createPremiumOrder trước khi tới đây; hàm này chỉ
 *    gọi provider và cập nhật trạng thái/nội dung giao.
 *  - Lỗi DỨT KHOÁT (provider trả 400/401/402/403/404/422, hoặc thiếu dữ kiện đầu
 *    vào phía mình): đơn chắc chắn không được tạo -> huỷ + hoàn đủ qua claim
 *    nguyên tử (chỉ một đường hoàn được tiền).
 *  - Lỗi MƠ HỒ (timeout/mạng/5xx): GIỮ PENDING chờ admin xử lý tay — không retry
 *    tạo đơn (Telegram không có idempotency, retry = mua trùng), không tự hoàn
 *    (provider có thể đã nhận đơn và trừ số dư FZR của mình).
 */

/** Hoàn tiền toàn bộ cho khách qua claim trạng thái nguyên tử — dùng chung cho
 *  đường thực thi (lỗi dứt khoát) và đường poll (provider báo refund/huỷ). */
export async function refundFzrPremiumOrder(
  order: PremiumOrder,
  target: "REFUNDED" | "CANCELED",
  reason: string
): Promise<boolean> {
  let claimed = false;
  await prisma.$transaction(async (tx) => {
    const claim = await tx.premiumOrder.updateMany({
      where: { id: order.id, status: { in: ["PENDING", "DELIVERED", "COMPLETED", "WARRANTY"] } },
      data: { status: target, adminNote: [order.adminNote, reason].filter(Boolean).join(" · ").slice(0, 900) },
    });
    if (claim.count === 0) return;
    claimed = true;
    // Đơn chưa giao (PENDING) bị hoàn/huỷ -> trả kho số lượng đã trừ khi đặt
    if (order.status === "PENDING") await restoreVariantStock(tx, order.variantId, order.quantity);
    await applyBalance(tx, order.userId, order.total, "REFUND", order.code, reason);
  });
  if (claimed) {
    await clawbackReferralCommission(order.userId, order.total, order.code);
    await notifyUser(order.userId, "Đơn Premium đã được hoàn tiền", `Đơn ${order.code}: ${reason}`, "/dashboard/don-premium");
  }
  return claimed;
}

/** Parse buyerInfo dạng "Nhãn: giá trị" (createPremiumOrder gộp từ customData) thành map. */
export function parseBuyerInfoLines(buyerInfo?: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of String(buyerInfo || "").split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

function pickInput(inputs: Record<string, string>, label: string, loose?: string): string {
  if (inputs[label]) return inputs[label];
  if (loose) {
    const hit = Object.entries(inputs).find(([k]) => k.toLowerCase().includes(loose));
    if (hit) return hit[1];
  }
  return "";
}

class LocalDefinitiveError extends Error {}

/** Giữ đơn PENDING chờ admin xử lý tay — KHÔNG hoàn, KHÔNG gọi provider thêm:
 *  dùng khi không có đường giao tự động khả thi (vd đơn Telegram chỉ có username
 *  mà catalog không có offer top-up Telegram). Khác lỗi mơ hồ ở chỗ: chắc chắn
 *  CHƯA có khoản chi nào phía provider. */
class HoldForManualError extends Error {}


/** Telegram user ID số từ inputs (chỉ nhận khoá nhãn ID, tránh nhầm username). */
function telegramUidOf(inputs: Record<string, string>): number {
  const direct = inputs[FZR_LABELS.telegramId];
  if (direct && /^\d+$/.test(direct.trim())) return parseInt(direct.trim());
  const hit = Object.entries(inputs).find(([k, v]) => /telegram/i.test(k) && /id/i.test(k) && /^\d+$/.test(String(v).trim()));
  return hit ? parseInt(String(hit[1]).trim()) : 0;
}

function telegramUsernameOf(inputs: Record<string, string>): string {
  const v = inputs["Tên người dùng Telegram"] || Object.entries(inputs).find(([k]) => /username|người dùng/i.test(k))?.[1] || "";
  return v.trim().replace(/^@/, "");
}

/** BigInt scaled x10^7 -> chuỗi thập phân gọn cho tham số amount của top-up. */
function scaledToDecimalString(scaled: bigint): string {
  const neg = scaled < BigInt(0);
  const abs = neg ? -scaled : scaled;
  const int = abs / BigInt(10000000);
  const frac = (abs % BigInt(10000000)).toString().padStart(7, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${int}${frac ? "." + frac : ""}`;
}

/**
 * Đường (b)/(c) cho đơn Telegram KHÔNG có user ID số (docs reseller: giao theo
 * username qua danh mục top-up "Telegram (V2)"):
 *  (b) sync đã tìm thấy offer top-up Telegram có trường username của CHÍNH
 *      provider này -> đặt qua luồng top-up chung, username vào đúng trường đó.
 *  (c) không có -> HoldForManualError: giữ PENDING + ghi chú admin xử lý tay,
 *      tuyệt đối không đoán mò đường giao (rủi ro tiền).
 */
async function telegramViaTopupOrHold(
  provider: Provider,
  order: PremiumOrder,
  inputs: Record<string, string>,
  kind: "stars" | "premium",
  months: number
): Promise<{ orderId: string | null; raw: any }> {
  const username = telegramUsernameOf(inputs);
  if (!username) throw new LocalDefinitiveError("Thiếu username Telegram của khách");
  const st = await getSettings();
  const offerId = (st.telegram_topup_offer_id || "").trim();
  const field = (st.telegram_topup_field || "").trim();
  const sameProvider = String(st.telegram_topup_provider_id || "") === String(provider.id);
  if (offerId && field && sameProvider) {
    let amountUsd: string | null = null;
    try {
      if (kind === "stars") {
        const q = await fzrTelegramStarsQuote(provider);
        amountUsd = scaledToDecimalString(parseDecimalScaled(q.pricePerStar) * BigInt(order.quantity));
      } else {
        const plans = await fzrTelegramPremiumPlans(provider);
        const plan = plans.find((x) => x.durationMonths === months);
        amountUsd = plan ? String(plan.finalPrice || plan.price) : null;
      }
    } catch { amountUsd = null; }
    if (amountUsd) {
      const raw = await fzrCreateTopupOrder(provider, { offerId, amount: amountUsd, quantity: 1, orderParams: { [field]: username } }, String(order.id));
      return { orderId: fzrOrderIdOf(raw), raw };
    }
  }
  throw new HoldForManualError(`Đơn Telegram cho @${username} chỉ có username: chưa có đường giao tự động (khách không cấp Telegram ID số và catalog chưa có offer top-up Telegram) — xử lý tay`);
}

/** Gọi endpoint tạo đơn đúng nhóm sản phẩm. Trả {orderId, raw} của TỪNG đơn vị đã tạo. */
async function createOne(
  provider: Provider,
  variant: PremiumVariant,
  order: PremiumOrder,
  inputs: Record<string, string>
): Promise<{ orderId: string | null; raw: any }> {
  const group = variant.providerGroup || "";
  const item = variant.providerItemId || "";
  const idem = String(order.id); // Idempotency-Key = id đơn của mình (Telegram không hỗ trợ -> không gửi)
  switch (group) {
    case "gamekeys": {
      // Theo OpenAPI FZR: order cần CẢ game_id (id game = providerProductId
      // của sản phẩm) và key_id (edition = providerItemId của gói).
      const prod = await prisma.premiumProduct.findUnique({ where: { id: variant.productId }, select: { providerProductId: true } });
      const gameId = prod?.providerProductId || "";
      if (!gameId || !item) throw new LocalDefinitiveError("Gói Game Key thiếu game_id/key_id phía FZR");
      const raw = await fzrCreateGameKeyOrder(provider, gameId, item, order.quantity, idem);
      return { orderId: fzrOrderIdOf(raw), raw };
    }
    case "giftcards": {
      const raw = await fzrCreateGiftCardOrder(provider, item, order.quantity, idem);
      return { orderId: fzrOrderIdOf(raw), raw };
    }
    case "topups": {
      const [offerId, amount] = item.split("|");
      if (!offerId || !amount) throw new LocalDefinitiveError("Gói top-up thiếu offerId/số tiền phía FZR");
      const player = pickInput(inputs, FZR_LABELS.playerId, "id");
      if (player) {
        // Kiểm tra ID người chơi trước khi đặt: ID sai là lỗi dứt khoát, hoàn tiền ngay.
        // Lỗi mạng khi validate thì bỏ qua kiểm tra và đặt đơn như thường (không chặn oan).
        try {
          const v = await fzrValidateTopupId(provider, offerId, player);
          if (!v.valid) throw new LocalDefinitiveError(`ID người chơi không hợp lệ phía nhà cung cấp: ${player}`);
        } catch (e) {
          if (e instanceof LocalDefinitiveError) throw e;
        }
      }
      const raw = await fzrCreateTopupOrder(provider, { offerId, amount, quantity: order.quantity, orderParams: player ? { value: player } : {} }, idem);
      return { orderId: fzrOrderIdOf(raw), raw };
    }
    case "manual": {
      const [serviceId, offerId] = item.split(":");
      if (!serviceId || !offerId) throw new LocalDefinitiveError("Gói dịch vụ thủ công thiếu serviceId/offerId phía FZR");
      const additionalData: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(inputs)) if (v) additionalData[k] = v;
      const raw = await fzrCreateManualOrder(provider, { manualServiceId: serviceId, offerId, quantity: order.quantity, additionalData }, idem);
      return { orderId: fzrOrderIdOf(raw), raw };
    }
    case "telegram_stars": {
      const uid = telegramUidOf(inputs);
      if (!uid) return telegramViaTopupOrHold(provider, order, inputs, "stars", 0);
      // ĐÚNG 1 LẦN gọi — không idempotency, không retry kể cả khi timeout.
      const raw = await fzrBuyTelegramStars(provider, order.quantity, uid);
      return { orderId: fzrOrderIdOf(raw), raw };
    }
    case "telegram_premium": {
      const months = parseInt(item);
      if (![3, 6, 12].includes(months)) throw new LocalDefinitiveError("Gói Telegram Premium sai số tháng phía FZR");
      const uid = telegramUidOf(inputs);
      if (!uid) return telegramViaTopupOrHold(provider, order, inputs, "premium", months);
      const raw = await fzrBuyTelegramPremium(provider, uid, months);
      return { orderId: fzrOrderIdOf(raw), raw };
    }
    case "steam_topup": {
      const login = pickInput(inputs, FZR_LABELS.steamLogin, "steam");
      if (!login) throw new LocalDefinitiveError("Thiếu Steam login của khách");
      const amount = item; // mệnh giá USD đã chốt theo gói (vd "10")
      if (!amount || isNaN(Number(amount))) throw new LocalDefinitiveError("Gói nạp Steam thiếu mệnh giá USD");
      const raw = await fzrCreateSteamTopupOrder(provider, { login, currency: "USD", amount }, idem);
      return { orderId: fzrOrderIdOf(raw), raw };
    }
    case "steam_gift": {
      const receiver = pickInput(inputs, FZR_LABELS.giftReceiver, "steam");
      if (!receiver) throw new LocalDefinitiveError("Thiếu tài khoản Steam nhận gift của khách");
      const appid = parseInt(item);
      if (!appid) throw new LocalDefinitiveError("Gói gift Steam thiếu appid");
      const raw = await fzrCreateSteamGiftOrder(provider, { appid, receiver }, idem);
      return { orderId: fzrOrderIdOf(raw), raw };
    }
    default:
      throw new LocalDefinitiveError(`Nhóm FZR chưa hỗ trợ: ${group || "(trống)"}`);
  }
}

/**
 * Thực thi đơn FZR ngay sau khi khách đã thanh toán (gọi từ createPremiumOrder).
 * Nhận đơn PENDING vừa tạo; claim nguyên tử bằng providerRaw marker để một đơn
 * chỉ thực thi đúng một lần kể cả khi có hai tiến trình chạy song song.
 */
export async function executeFzrPremiumOrder(args: {
  order: PremiumOrder;
  variant: PremiumVariant;
  provider: Provider;
  inputs: Record<string, string>;
}): Promise<PremiumOrder> {
  const { order, variant, provider, inputs } = args;
  const claim = await prisma.premiumOrder.updateMany({
    where: { id: order.id, status: "PENDING", providerOrderId: null, providerRaw: null },
    data: { providerRaw: JSON.stringify({ fzrClaimAt: new Date().toISOString() }) },
  });
  if (claim.count === 0) return (await prisma.premiumOrder.findUnique({ where: { id: order.id } })) || order;

  // Telegram Premium là mua-theo-lượt (mỗi call = 1 lần tặng theo tháng): số lượng
  // > 1 nghĩa là nhiều lượt tặng riêng cho cùng tài khoản. Các nhóm khác gộp 1 call.
  const units = variant.providerGroup === "telegram_premium" ? order.quantity : 1;
  const raws: any[] = [];
  const ids: string[] = [];
  let firstError: any = null;
  let succeeded = 0;
  for (let i = 0; i < units; i++) {
    try {
      const r = await createOne(provider, variant, order, inputs);
      raws.push(r.raw);
      if (r.orderId) ids.push(r.orderId);
      succeeded++;
    } catch (e: any) {
      firstError = e;
      break; // dừng ở lỗi đầu tiên — không gọi tiếp khi chưa rõ trạng thái phía provider
    }
  }

  if (succeeded === 0 && firstError) {
    const msg = String(firstError?.message || firstError);
    await prisma.apiLog.create({ data: { kind: "provider_out", ref: order.code, ok: false, detail: `FZR ${variant.providerGroup} create failed: ${msg}`.slice(0, 900) } }).catch(() => {});
    if (firstError instanceof HoldForManualError) {
      // Chưa chi đồng nào phía provider: giữ PENDING + ghi chú rõ cho admin xử lý tay.
      await prisma.premiumOrder.update({
        where: { id: order.id },
        data: {
          providerRaw: JSON.stringify({ fzrClaimAt: new Date().toISOString(), fzrHold: msg.slice(0, 500) }),
          adminNote: [order.adminNote, `FZR: ${msg.slice(0, 300)}`].filter(Boolean).join(" · ").slice(0, 900),
        },
      });
      await alertMother("fzr_hold", `Đơn Telegram chờ xử lý tay: ${order.code}`, msg).catch(() => {});
      return (await prisma.premiumOrder.findUnique({ where: { id: order.id } })) || order;
    }
    const definitive = firstError instanceof LocalDefinitiveError || (firstError instanceof FzrError && firstError.definitive);
    if (definitive) {
      const fresh = (await prisma.premiumOrder.findUnique({ where: { id: order.id } })) || order;
      await refundFzrPremiumOrder(fresh, "REFUNDED", `Nhà cung cấp từ chối đơn — hoàn tiền (${msg.slice(0, 120)})`);
      return (await prisma.premiumOrder.findUnique({ where: { id: order.id } })) || order;
    }
    // Mơ hồ: giữ PENDING + ghi dấu vết cho admin xử lý tay (có thể provider đã nhận đơn)
    await prisma.premiumOrder.update({
      where: { id: order.id },
      data: {
        providerRaw: JSON.stringify({ fzrClaimAt: new Date().toISOString(), fzrError: msg.slice(0, 500) }),
        adminNote: [order.adminNote, `FZR: lỗi mơ hồ khi tạo đơn (${msg.slice(0, 120)}) — kiểm tra phía FazerCards trước khi hoàn/giao tay`].filter(Boolean).join(" · ").slice(0, 900),
      },
    });
    return (await prisma.premiumOrder.findUnique({ where: { id: order.id } })) || order;
  }

  // Có ít nhất 1 lượt thành công mà vẫn còn lượt lỗi (telegram_premium qty > 1):
  // hoàn phần chưa thực thi, phần đã tặng giữ nguyên ở trạng thái chờ đối soát.
  if (firstError && succeeded < units) {
    const failedUnits = units - succeeded;
    const refundAmt = Math.floor((order.total * failedUnits) / units);
    await prisma.$transaction(async (tx) => {
      await restoreVariantStock(tx, order.variantId, failedUnits);
      await applyBalance(tx, order.userId, refundAmt, "REFUND", order.code, `Hoàn ${failedUnits} lượt FZR không thực thi được`);
    });
    await clawbackReferralCommission(order.userId, refundAmt, order.code);
  }

  const rawStored = units === 1 ? raws[0] : raws;
  const st = units === 1 ? fzrOrderStatus(raws[0]) : "processing";
  const delivery = units === 1 ? extractFzrDelivery(raws[0]) : null;
  const updated = await prisma.premiumOrder.update({
    where: { id: order.id },
    data: {
      providerOrderId: ids.length ? ids.join(",") : order.providerOrderId,
      providerRaw: JSON.stringify(rawStored),
      ...(st === "completed" || delivery
        ? { status: "DELIVERED" as const, deliveryData: fzrDeliveryOrRaw(raws[0]) }
        : {}),
      ...(firstError && succeeded < units
        ? { adminNote: [order.adminNote, `FZR: ${succeeded}/${units} lượt đã thực thi, phần còn lại đã hoàn tiền`].filter(Boolean).join(" · ").slice(0, 900) }
        : {}),
    },
  });
  await prisma.apiLog.create({ data: { kind: "provider_out", ref: order.code, detail: `FZR ${variant.providerGroup} order -> ${ids.join(",") || "?"} status=${st}` } }).catch(() => {});
  if (updated.status === "DELIVERED") {
    await awardPointsForPremiumOrder(updated);
    await notifyUser(order.userId, "Đơn Premium đã được giao", `Đơn ${order.code} đã giao — xem nội dung trong chi tiết đơn`, "/dashboard/don-premium");
  }
  return updated;
}

/**
 * Áp một tập trạng thái FZR (mỗi phần tử ứng với 1 providerOrderId của đơn) vào
 * đơn của mình — HÀM DÙNG CHUNG cho cron poll và webhook, để hai đường không bao
 * giờ lệch nhau:
 *  - mọi phần refunded/cancelled -> hoàn tiền qua claim nguyên tử (REFUNDED/CANCELED);
 *  - mọi phần completed, hoặc trích được nội dung giao, hoặc có phần "partial"
 *    -> DELIVERED (+ điểm + thông báo); partial kèm ghi chú + cảnh báo admin để
 *    đối soát phần còn lại bằng tay (không tự hoàn theo tỉ lệ — toán payload
 *    không có tài liệu);
 *  - còn lại -> chỉ cập nhật providerRaw.
 * Chuyển trạng thái chỉ đi tới: đơn đã REFUNDED/CANCELED không bao giờ bị đổi;
 * webhook (fromWebhook) đến sau khi đơn đã giao/kết thúc cũng chỉ ghi raw.
 */
export async function applyFzrOrderStatus(
  order: PremiumOrder,
  statuses: string[],
  raws: any[],
  opts: { fromWebhook?: boolean } = {}
): Promise<PremiumOrder> {
  const rawStored = raws.length === 1 ? raws[0] : raws;
  const current = (await prisma.premiumOrder.findUnique({ where: { id: order.id } })) || order;
  const saveRawOnly = async () => {
    await prisma.premiumOrder.update({ where: { id: order.id }, data: { providerRaw: JSON.stringify(rawStored) } });
    return (await prisma.premiumOrder.findUnique({ where: { id: order.id } })) || order;
  };
  if (current.status === "REFUNDED" || current.status === "CANCELED") return saveRawOnly();
  if (opts.fromWebhook && current.status !== "PENDING") return saveRawOnly();

  const n = statuses.length;
  const badTerminal = statuses.filter((st) => st === "refunded" || st === "cancelled").length;
  if (n > 0 && badTerminal === n) {
    const target = statuses[statuses.length - 1] === "cancelled" ? "CANCELED" : "REFUNDED";
    await prisma.premiumOrder.update({ where: { id: order.id }, data: { providerRaw: JSON.stringify(rawStored) } });
    const fresh = (await prisma.premiumOrder.findUnique({ where: { id: order.id } })) || order;
    await refundFzrPremiumOrder(fresh, target as "REFUNDED" | "CANCELED", "Nhà cung cấp báo huỷ/hoàn đơn — hoàn tiền cho khách");
    return (await prisma.premiumOrder.findUnique({ where: { id: order.id } })) || order;
  }

  const deliveries = raws.map((r) => extractFzrDelivery(r)).filter(Boolean) as string[];
  const delivery = deliveries.length ? deliveries.join("\n---\n") : null;
  const completedCount = statuses.filter((st) => st === "completed").length;
  const partial = statuses.includes("partial");
  if ((n > 0 && completedCount === n) || delivery || partial) {
    const updated = await prisma.premiumOrder.update({
      where: { id: order.id },
      data: {
        status: "DELIVERED",
        deliveryData: delivery || fzrDeliveryOrRaw(raws[0]) || current.deliveryData,
        providerRaw: JSON.stringify(rawStored),
        ...(partial
          ? { adminNote: [current.adminNote, "FZR: đơn giao MỘT PHẦN (partial) — đối soát phần còn lại bằng tay theo dữ liệu thô phía nhà cung cấp"].filter(Boolean).join(" · ").slice(0, 900) }
          : {}),
      },
    });
    await awardPointsForPremiumOrder(updated);
    await notifyUser(order.userId, "Đơn Premium đã được giao", `Đơn ${order.code} đã giao — xem nội dung trong chi tiết đơn`, "/dashboard/don-premium");
    if (partial) {
      await alertMother("fzr_partial", `Đơn FZR giao một phần: ${order.code}`, `Đơn ${order.code} được FazerCards báo giao một phần (partial). Nội dung đã giao nằm trong chi tiết đơn; phần còn lại xử lý tay.`).catch(() => {});
    }
    return updated;
  }
  return saveRawOnly();
}

/**
 * Poll 1 đơn FZR đang PENDING (cron + nút đồng bộ tay của admin): lấy trạng thái
 * từng providerOrderId rồi áp qua applyFzrOrderStatus (dùng chung với webhook).
 * Bỏ qua đơn mới tạo < 1 phút khi chạy cron.
 */
export async function pollFzrPremiumOrder(order: PremiumOrder, opts: { skipYoung?: boolean } = {}): Promise<PremiumOrder> {
  if (!order.providerId || !order.providerOrderId) return order;
  if (opts.skipYoung && Date.now() - order.createdAt.getTime() < 60000) return order;
  const provider = await prisma.provider.findUnique({ where: { id: order.providerId } });
  if (!provider || provider.driver !== "FZR") return order;
  const ids = order.providerOrderId.split(",").map((x) => x.trim()).filter(Boolean);
  const raws: any[] = [];
  const statuses: string[] = [];
  for (const pid of ids) {
    const raw = await fzrGetOrder(provider, pid);
    raws.push(raw);
    statuses.push(fzrOrderStatus(raw));
  }
  if (!ids.length) return order;
  return applyFzrOrderStatus(order, statuses, raws);
}

/**
 * Báo giá tại thời điểm mua cho các nhóm giá biến động (chỉ FZR):
 *  - telegram_stars: giá mỗi sao lấy tươi từ /telegram/stars mỗi lần mua.
 *  - steam_gift: giá = offer rẻ nhất của game tại thời điểm mua (danh sách game
 *    không kèm giá đáng tin cậy và bị rate-limit nên không lấy giá lúc đồng bộ hàng loạt).
 * Cập nhật variant.price/cost rồi trả giá hiệu lực để createPremiumOrder tính tiền.
 * Lỗi mạng -> giữ giá đã lưu (trừ steam_gift chưa từng có giá > 0 thì chặn mua).
 */
export async function refreshFzrQuotePrice(variant: PremiumVariant, provider: Provider): Promise<{ price: number; cost: number }> {
  if (variant.providerGroup === "telegram_stars") {
    try {
      const q = await fzrTelegramStarsQuote(provider);
      const price = fzrUsdToVnd(q.pricePerStar, provider.exchangeRate, provider.markupPercent);
      const cost = fzrUsdCostVnd(q.pricePerStar, provider.exchangeRate);
      if (price > 0 && (price !== variant.price || cost !== variant.cost)) {
        await prisma.premiumVariant.update({ where: { id: variant.id }, data: { price, cost } });
      }
      return { price: price > 0 ? price : variant.price, cost: price > 0 ? cost : variant.cost };
    } catch {
      return { price: variant.price, cost: variant.cost };
    }
  }
  if (variant.providerGroup === "steam_gift") {
    const appid = variant.providerItemId || "";
    const offers = await fzrSteamGiftOffers(provider, appid);
    let best: string | null = null;
    for (const o of offers) {
      if (best === null || Number(o.price) < Number(best)) best = o.price;
    }
    if (best === null) throw new Error("Game này tạm thời chưa có offer bán phía nhà cung cấp");
    const price = fzrUsdToVnd(best, provider.exchangeRate, provider.markupPercent);
    const cost = fzrUsdCostVnd(best, provider.exchangeRate);
    if (price > 0 && (price !== variant.price || cost !== variant.cost)) {
      await prisma.premiumVariant.update({ where: { id: variant.id }, data: { price, cost } });
    }
    return { price, cost };
  }
  return { price: variant.price, cost: variant.cost };
}
