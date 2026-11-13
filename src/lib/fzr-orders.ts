import { prisma } from "./db";
import { applyBalance, clawbackReferralCommission } from "./wallet";
import { clawbackPassCashback } from "./pass";
import { notifyUser } from "./notify";
import { alertMother } from "./alerts";
import { awardPointsForPremiumOrder } from "./points";
import { restoreVariantStock } from "./variant-stock";
import {
  FzrError, FZR_LABELS,
  fzrUsdToVnd, fzrUsdCostVnd, fzrOrderStatus, fzrOrderIdOf, extractFzrDelivery, fzrDeliveryOrRaw,
  fzrCreateGameKeyOrder, fzrCreateGiftCardOrder, fzrCreateTopupOrder, fzrValidateTopupId, fzrTopupValidations,
  fzrCreateManualOrder, fzrBuyTelegramStars, fzrBuyTelegramPremium,
  fzrCreateSteamTopupOrder, fzrCreateSteamGiftOrder, fzrGetOrder, fzrCheckSteamLogin,
  fzrTelegramStarsQuote, fzrSteamGiftOffers, cheapestSteamGiftOffer,
} from "./fzr";
import { parsePremiumFields } from "./format";
import { fzrMarkupFor } from "./fzr-markup";
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
 *    tạo đơn (Telegram buy không có idempotency trong tài liệu, retry = mua
 *    trùng), không tự hoàn (provider có thể đã nhận đơn và trừ số dư FZR).
 *
 * Đối chiếu tài liệu 2026-11-09: hai endpoint mua Telegram chỉ nhận
 * { telegram_username, ... } — KHÔNG có biến thể theo user ID số; đơn Steam
 * gift phải gửi { invite_url, sub_id, app_id, region } lấy từ offers; Steam
 * top-up kiểm tra login qua /steam-topup/check-login trước khi đặt.
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
    await clawbackPassCashback(order.userId, order.total, order.code);
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

function telegramUsernameOf(inputs: Record<string, string>): string {
  const v = inputs["Tên người dùng Telegram"] || Object.entries(inputs).find(([k]) => /username|người dùng/i.test(k))?.[1] || "";
  return v.trim().replace(/^@/, "");
}

/** Object fields gửi cho nhà cung cấp từ thông tin khách đã điền: chỉ các
 *  trường CÓ KEY trong customFields của sản phẩm (trường phía NCC — topups /
 *  manual replenishment), ánh xạ NHÃN admin đang dùng -> KEY của NCC. Giá trị
 *  lấy từ inputs theo đúng nhãn (buyerInfo được createPremiumOrder gộp theo
 *  nhãn) — không đoán mò theo tên trường. */
function keyedFieldsOf(customFieldsJson: string | null | undefined, inputs: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of parsePremiumFields(customFieldsJson)) {
    if (!f.key) continue;
    const v = (inputs[f.label] || "").trim();
    if (v) out[f.key] = v;
  }
  return out;
}


/** Gọi endpoint tạo đơn đúng nhóm sản phẩm. Trả {orderId, raw} của TỪNG đơn vị đã tạo. */
async function createOne(
  provider: Provider,
  variant: PremiumVariant,
  order: PremiumOrder,
  inputs: Record<string, string>
): Promise<{ orderId: string | null; raw: any; note?: string }> {
  const group = variant.providerGroup || "";
  const item = variant.providerItemId || "";
  const idem = String(order.id); // Idempotency-Key = id đơn của mình (gửi cho MỌI nhóm kể cả Telegram — lệnh chủ 2026-11-08; riêng Telegram không retry)
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
      // Theo OpenAPI FZR: order cần CẢ category_id (id category = provider
      // ProductId của sản phẩm) và card_id (offer/mệnh giá = providerItemId).
      const prod = await prisma.premiumProduct.findUnique({ where: { id: variant.productId }, select: { providerProductId: true } });
      const categoryId = prod?.providerProductId || "";
      if (!categoryId || !item) throw new LocalDefinitiveError("Gói Gift Card thiếu category_id/card_id phía FZR");
      const raw = await fzrCreateGiftCardOrder(provider, categoryId, item, order.quantity, idem);
      return { orderId: fzrOrderIdOf(raw), raw };
    }
    case "topups": {
      // Theo OpenAPI FZR: order cần category_id (= providerProductId của sản
      // phẩm), offer_id (= providerItemId của gói) và fields — object theo
      // ĐÚNG khoá fields[].key của category, dựng từ customFields đã lưu.
      const prod = await prisma.premiumProduct.findUnique({ where: { id: variant.productId }, select: { providerProductId: true, customFields: true } });
      const categoryId = prod?.providerProductId || "";
      if (!categoryId || !item) throw new LocalDefinitiveError("Gói top-up thiếu category_id/offer_id phía FZR");
      const fields = keyedFieldsOf(prod?.customFields, inputs);
      // Category có hỗ trợ kiểm tra ID (nằm trong danh sách GET validate-id)
      // thì kiểm tra TRƯỚC khi đặt: ID không hợp lệ (valid=false hoặc NCC trả
      // lỗi dứt khoát như 422) = từ chối đơn + hoàn tiền, không gọi order.
      // Lỗi mơ hồ (mạng/5xx) khi kiểm tra thì bỏ qua và đặt như thường.
      try {
        const supported = await fzrTopupValidations(provider);
        const cats = Array.isArray(supported?.items) ? supported.items : [];
        if (cats.some((c: any) => String(c?.category_id) === categoryId) && Object.keys(fields).length) {
          const v = await fzrValidateTopupId(provider, categoryId, fields);
          if (!v.valid) throw new LocalDefinitiveError("ID người chơi không hợp lệ phía nhà cung cấp — khách kiểm tra lại thông tin đã điền");
        }
      } catch (e) {
        if (e instanceof LocalDefinitiveError) throw e;
        if (e instanceof FzrError && e.definitive) throw new LocalDefinitiveError(`Nhà cung cấp không xác nhận được ID người chơi: ${e.message}`);
      }
      const raw = await fzrCreateTopupOrder(provider, { categoryId, offerId: item, fields }, idem);
      return { orderId: fzrOrderIdOf(raw), raw };
    }
    case "manual": {
      // Theo OpenAPI FZR: body { manual_service_id, product_id, fields? } —
      // manual_service_id = providerProductId của sản phẩm, product_id =
      // offer id ở providerItemId; fields chỉ cho category replenishment
      // (dựng theo field code đã lưu trong customFields), category thường
      // đặt KHÔNG kèm fields.
      const prod = await prisma.premiumProduct.findUnique({ where: { id: variant.productId }, select: { providerProductId: true, customFields: true } });
      const serviceId = prod?.providerProductId || "";
      if (!serviceId || !item) throw new LocalDefinitiveError("Gói dịch vụ thủ công thiếu manual_service_id/product_id phía FZR");
      const fields = keyedFieldsOf(prod?.customFields, inputs);
      const raw = await fzrCreateManualOrder(provider, { manualServiceId: serviceId, productId: item, fields }, idem);
      return { orderId: fzrOrderIdOf(raw), raw };
    }
    case "telegram_stars": {
      // Theo OpenAPI: endpoint mua Stars CHỈ nhận { telegram_username,
      // quantity } — không có đường mua theo user ID số. Username là trường
      // bắt buộc của form; thiếu = lỗi dứt khoát phía mình -> hoàn tiền.
      const username = telegramUsernameOf(inputs);
      if (!username) throw new LocalDefinitiveError("Thiếu username Telegram của khách");
      // Báo giá tươi ngay trước khi mua: kiểm tra quantity theo min/max tài
      // liệu hoá (buy yêu cầu 50..100000; quote có min_amount/max_amount
      // riêng) — ngoài khoảng = NCC chắc chắn từ chối nên chặn dứt khoát
      // tại đây. Cờ balanceEnough (KHÔNG có trong tài liệu — đọc phòng thủ
      // theo lệnh chủ 2026-11-08): nếu NCC trả kèm = false thì ghi chú
      // admin đối soát, KHÔNG chặn đơn. Lỗi đọc báo giá thì bỏ qua.
      let note: string | undefined;
      try {
        const q = await fzrTelegramStarsQuote(provider);
        const min = q.minAmount && q.minAmount > 0 ? q.minAmount : 50;
        const max = q.maxAmount && q.maxAmount > 0 ? q.maxAmount : 100000;
        if (order.quantity < min || order.quantity > max) {
          throw new LocalDefinitiveError(`Số sao ${order.quantity} ngoài khoảng nhà cung cấp cho phép (${min}–${max})`);
        }
        if (q.balanceEnough === false) note = "FZR: báo giá Stars báo balanceEnough=false (số dư tài khoản nhà cung cấp có thể không đủ) — cần đối soát đơn này";
      } catch (e) {
        if (e instanceof LocalDefinitiveError) throw e;
        /* đọc báo giá là phụ */
      }
      // ĐÚNG 1 LẦN gọi — kèm Idempotency-Key, không retry kể cả khi timeout.
      const raw = await fzrBuyTelegramStars(provider, { username, quantity: order.quantity }, idem);
      return { orderId: fzrOrderIdOf(raw), raw, note };
    }
    case "telegram_premium": {
      const months = parseInt(item);
      // Không còn lọc cứng [3,6,12] (lệnh chủ 2026-11-08): chấp nhận MỌI số
      // tháng NCC trả về khi đồng bộ + gói admin tự thêm — chỉ chặn giá trị
      // vô nghĩa; số tháng NCC không hỗ trợ sẽ bị chính NCC từ chối dứt
      // khoát -> đường hoàn tiền như thường.
      if (!Number.isInteger(months) || months <= 0) throw new LocalDefinitiveError("Gói Telegram Premium sai số tháng phía FZR");
      // Body theo OpenAPI: { telegram_username, months } — mua theo username.
      const username = telegramUsernameOf(inputs);
      if (!username) throw new LocalDefinitiveError("Thiếu username Telegram của khách");
      const raw = await fzrBuyTelegramPremium(provider, { username, months }, idem);
      return { orderId: fzrOrderIdOf(raw), raw };
    }
    case "steam_topup": {
      const login = pickInput(inputs, FZR_LABELS.steamLogin, "steam");
      if (!login) throw new LocalDefinitiveError("Thiếu Steam login của khách");
      const amount = item; // mệnh giá USD đã chốt theo gói (vd "10")
      if (!amount || isNaN(Number(amount))) throw new LocalDefinitiveError("Gói nạp Steam thiếu mệnh giá USD");
      // Kiểm tra login TRƯỚC khi đặt (POST /steam-topup/check-login theo tài
      // liệu): can_refill=false = login không nạp được -> từ chối dứt khoát
      // + hoàn tiền, không gọi order; unverified=true = vẫn nạp được nhưng
      // ghi chú admin; lỗi dứt khoát của chính bước kiểm tra (400/422...)
      // cũng là dứt khoát; lỗi mơ hồ (mạng/5xx) thì bỏ qua kiểm tra.
      let note: string | undefined;
      try {
        const chk = await fzrCheckSteamLogin(provider, login);
        if (!chk.canRefill) throw new LocalDefinitiveError("Steam login này không nạp được phía nhà cung cấp — khách kiểm tra lại login");
        if (chk.unverified) note = "FZR: Steam login chưa từng được xác minh phía nhà cung cấp (unverified) — đơn vẫn được đặt, admin lưu ý đối soát";
      } catch (e) {
        if (e instanceof LocalDefinitiveError) throw e;
        if (e instanceof FzrError && e.definitive) throw new LocalDefinitiveError(`Nhà cung cấp không kiểm tra được Steam login: ${e.message}`);
      }
      const raw = await fzrCreateSteamTopupOrder(provider, { steamLogin: login, currency: "USD", amount }, idem);
      return { orderId: fzrOrderIdOf(raw), raw, note };
    }
    case "steam_gift": {
      // Trường khách điền là LINK MỜI kết bạn Steam (invite_url theo tài
      // liệu) — nhãn trường giữ nguyên theo ảnh mẫu của chủ site.
      const receiver = pickInput(inputs, FZR_LABELS.giftReceiver, "steam");
      if (!receiver) throw new LocalDefinitiveError("Thiếu link mời Steam nhận gift của khách");
      const appid = parseInt(item);
      if (!appid) throw new LocalDefinitiveError("Gói gift Steam thiếu appid");
      // Body theo OpenAPI: { invite_url, sub_id, app_id, region } — sub_id +
      // region PHẢI lấy từ offers tại thời điểm đặt; chọn cặp rẻ nhất (khớp
      // giá đã báo cho khách ở refreshFzrQuotePrice). Hết offer = dứt khoát.
      const offers = await fzrSteamGiftOffers(provider, appid);
      const best = cheapestSteamGiftOffer(offers);
      if (!best) throw new LocalDefinitiveError("Game này tạm thời chưa có offer bán phía nhà cung cấp");
      const raw = await fzrCreateSteamGiftOrder(provider, { inviteUrl: receiver, subId: best.subId, appId: appid, region: best.region }, idem);
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
  const notes: string[] = [];
  let firstError: any = null;
  let succeeded = 0;
  for (let i = 0; i < units; i++) {
    try {
      const r = await createOne(provider, variant, order, inputs);
      raws.push(r.raw);
      if (r.orderId) ids.push(r.orderId);
      if (r.note) notes.push(r.note);
      succeeded++;
    } catch (e: any) {
      firstError = e;
      break; // dừng ở lỗi đầu tiên — không gọi tiếp khi chưa rõ trạng thái phía provider
    }
  }

  if (succeeded === 0 && firstError) {
    const msg = String(firstError?.message || firstError);
    await prisma.apiLog.create({ data: { kind: "provider_out", ref: order.code, ok: false, detail: `FZR ${variant.providerGroup} create failed: ${msg}`.slice(0, 900) } }).catch(() => {});
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
    await clawbackPassCashback(order.userId, refundAmt, order.code);
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
      ...(notes.length || (firstError && succeeded < units)
        ? { adminNote: [order.adminNote, ...notes, ...(firstError && succeeded < units ? [`FZR: ${succeeded}/${units} lượt đã thực thi, phần còn lại đã hoàn tiền`] : [])].filter(Boolean).join(" · ").slice(0, 900) }
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
  opts: { fromWebhook?: boolean; allowRawDelivery?: boolean } = {}
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
        // allowRawDelivery=false (webhook không lấy được chi tiết đơn): KHÔNG
        // đổ JSON thô của envelope webhook vào nội dung giao cho khách.
        deliveryData: delivery || (opts.allowRawDelivery === false ? current.deliveryData : fzrDeliveryOrRaw(raws[0])) || current.deliveryData,
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
      const price = fzrUsdToVnd(q.pricePerStar, provider.exchangeRate, await fzrMarkupFor(provider, "telegram_stars"));
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
    // Giá theo tài liệu nằm ở offers[].regions[].price — lấy cặp rẻ nhất.
    const bestOffer = cheapestSteamGiftOffer(offers);
    if (!bestOffer) throw new Error("Game này tạm thời chưa có offer bán phía nhà cung cấp");
    const best = bestOffer.price;
    const price = fzrUsdToVnd(best, provider.exchangeRate, await fzrMarkupFor(provider, "steam_gift"));
    const cost = fzrUsdCostVnd(best, provider.exchangeRate);
    if (price > 0 && (price !== variant.price || cost !== variant.cost)) {
      await prisma.premiumVariant.update({ where: { id: variant.id }, data: { price, cost } });
    }
    return { price, cost };
  }
  return { price: variant.price, cost: variant.cost };
}
