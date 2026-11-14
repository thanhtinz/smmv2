import { prisma } from "./db";
import { applyBalance, clawbackReferralCommission } from "./wallet";
import { clawbackPassCashback } from "./pass";
import { notifyUser } from "./notify";
import { alertMother } from "./alerts";
import { awardPointsForPremiumOrder } from "./points";
import { restoreVariantStock } from "./variant-stock";
import { creditOrderRefund, refundableOf } from "./refund-ledger";
import {
  FzrError, FZR_LABELS,
  fzrUsdToVnd, fzrUsdCostVnd, fzrOrderStatus, fzrOrderIdOf, extractFzrDelivery, fzrDeliveryOrRaw,
  fzrCreateGameKeyOrder, fzrCreateGiftCardOrder, fzrCreateTopupOrder, fzrValidateTopupId, fzrTopupValidations,
  fzrCreateManualOrder, fzrBuyTelegramStars, fzrBuyTelegramPremium,
  fzrCreateSteamTopupOrder, fzrCreateSteamGiftOrder, fzrGetOrder, fzrCheckSteamLogin,
  fzrTelegramStarsQuote, fzrSteamGiftOffers, cheapestSteamGiftOffer,
} from "./fzr";
import { parsePremiumFields, vnd } from "./format";
import { sendCustomerMail } from "./customer-mail";
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
  let credited = 0;
  await prisma.$transaction(async (tx) => {
    const claim = await tx.premiumOrder.updateMany({
      where: { id: order.id, status: { in: ["PENDING", "PARTIAL", "DELIVERED", "COMPLETED", "WARRANTY"] } },
      data: { status: target, adminNote: [order.adminNote, reason].filter(Boolean).join(" · ").slice(0, 900) },
    });
    if (claim.count === 0) return;
    claimed = true;
    // Sổ hoàn (P2-01): đọc lại TRONG transaction rồi chỉ hoàn phần NET
    // chưa hoàn — đơn từng hoàn một phần ở bước thực thi chỉ nhận nốt
    // phần còn lại, tổng REFUND không bao giờ vượt total. Trả kho cũng
    // chỉ trả số đơn vị chưa từng hoàn/trả trước đó.
    const cur = await tx.premiumOrder.findUnique({ where: { id: order.id } });
    if (!cur) return;
    const remainingUnits = order.status === "PENDING"
      ? Math.max(0, cur.quantity - (cur.refundedUnits || 0))
      : 0;
    if (remainingUnits > 0) await restoreVariantStock(tx, cur.variantId, remainingUnits);
    credited = await creditOrderRefund(tx, cur, refundableOf(cur), {
      reason,
      units: remainingUnits,
    });
  });
  if (claimed && credited > 0) {
    await clawbackReferralCommission(order.userId, credited, order.code);
    await clawbackPassCashback(order.userId, credited, order.code);
    await notifyUser(order.userId, "Đơn Premium đã được hoàn tiền", `Đơn ${order.code}: ${reason}`, "/dashboard/don-premium");
    void mailOrderRefunded(order, credited);
  }
  return claimed;
}

/** Tên sản phẩm/gói của 1 đơn cho biến thư ({{product_name}} / {{variant_name}}). */
async function orderMailNames(order: PremiumOrder): Promise<{ product_name: string; variant_name: string }> {
  const v = await prisma.premiumVariant.findUnique({
    where: { id: order.variantId },
    select: { name: true, product: { select: { name: true } } },
  }).catch(() => null);
  return { product_name: v?.product.name || "", variant_name: v?.name || "" };
}

/** Đợt 119: gửi mail order_refunded cho 1 đơn đã hoàn tiền (dùng chung các đường hoàn FZR). */
async function mailOrderRefunded(order: PremiumOrder, refundAmount: number) {
  const names = await orderMailNames(order);
  const u = await prisma.user.findUnique({ where: { id: order.userId }, select: { balance: true } }).catch(() => null);
  await sendCustomerMail(order.userId, "order_refunded", {
    order_code: order.code, product_name: names.product_name,
    refund_amount: vnd(refundAmount), balance: vnd(u?.balance ?? 0),
  });
}

/** Đợt 119: gửi mail order_delivered cho 1 đơn vừa chuyển Đã giao. */
async function mailOrderDelivered(order: PremiumOrder, deliveryContent: string) {
  const names = await orderMailNames(order);
  await sendCustomerMail(order.userId, "order_delivered", {
    order_code: order.code, product_name: names.product_name, variant_name: names.variant_name,
    delivery_content: deliveryContent || "",
  });
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
      if (r.orderId) {
        ids.push(r.orderId);
        // Lưu mã đơn con NGAY sau mỗi lượt (full-audit 6750109 P2-03):
        // tiến trình chết giữa vòng hoặc lần ghi chốt cuối vòng lỗi thì
        // các mã đã tạo vẫn còn dấu vết cho cron/webhook đối soát. Lỗi
        // ghi phụ bị nuốt — ghi chốt cuối vòng vẫn ghi đủ toàn bộ mã.
        await prisma.premiumOrder.update({
          where: { id: order.id },
          data: { providerOrderId: ids.join(",") },
        }).catch(() => {});
      }
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
    // Qua sổ hoàn (P2-01): ghi refundedAmount/refundedUnits cùng
    // transaction cộng ví — các đường hoàn sau chỉ hoàn phần còn lại.
    let credited = 0;
    await prisma.$transaction(async (tx) => {
      await restoreVariantStock(tx, order.variantId, failedUnits);
      credited = await creditOrderRefund(tx, order, refundAmt, {
        reason: `Hoàn ${failedUnits} lượt FZR không thực thi được`,
        units: failedUnits,
      });
    });
    if (credited > 0) {
      await clawbackReferralCommission(order.userId, credited, order.code);
      await clawbackPassCashback(order.userId, credited, order.code);
      void mailOrderRefunded(order, credited);
    }
  }

  const rawStored = units === 1 ? raws[0] : raws;
  const st = units === 1 ? fzrOrderStatus(raws[0]) : "processing";
  const delivery = units === 1 ? extractFzrDelivery(raws[0]) : null;
  const updated = await prisma.premiumOrder.update({
    where: { id: order.id },
    data: {
      providerOrderId: ids.length ? ids.join(",") : order.providerOrderId,
      providerRaw: JSON.stringify(rawStored),
      // P2-07: phản hồi tạo đơn đã báo "partial" -> PARTIAL ngay từ đầu
      // (không DELIVERED + điểm như trước); nội dung giao một phần vẫn lưu.
      ...(st === "partial"
        ? { status: "PARTIAL" as const, deliveryData: fzrDeliveryOrRaw(raws[0]) }
        : st === "completed" || delivery
          ? { status: "DELIVERED" as const, deliveryData: fzrDeliveryOrRaw(raws[0]) }
          : {}),
      ...(notes.length || (firstError && succeeded < units) || st === "partial"
        ? { adminNote: [order.adminNote, ...notes, ...(firstError && succeeded < units ? [`FZR: ${succeeded}/${units} lượt đã thực thi, phần còn lại đã hoàn tiền`] : []), ...(st === "partial" ? ["FZR: đơn giao MỘT PHẦN (partial) ngay ở phản hồi tạo đơn — đối soát phần còn lại bằng tay"] : [])].filter(Boolean).join(" · ").slice(0, 900) }
        : {}),
    },
  });
  await prisma.apiLog.create({ data: { kind: "provider_out", ref: order.code, detail: `FZR ${variant.providerGroup} order -> ${ids.join(",") || "?"} status=${st}` } }).catch(() => {});
  if (updated.status === "DELIVERED") {
    await awardPointsForPremiumOrder(updated);
    await notifyUser(order.userId, "Đơn Premium đã được giao", `Đơn ${order.code} đã giao — xem nội dung trong chi tiết đơn`, "/dashboard/don-premium");
    void mailOrderDelivered(updated, updated.deliveryData || "");
  }
  if (updated.status === "PARTIAL") {
    await alertMother("fzr_partial", `Đơn FZR giao một phần: ${order.code}`, `Đơn ${order.code} được FazerCards báo giao một phần (partial) ngay khi tạo đơn. Nội dung đã giao nằm trong chi tiết đơn; phần còn lại xử lý tay.`).catch(() => {});
  }
  return updated;
}

/**
 * Áp một tập trạng thái FZR (mỗi phần tử ứng với 1 providerOrderId của đơn) vào
 * đơn của mình — HÀM DÙNG CHUNG cho cron poll và webhook, để hai đường không bao
 * giờ lệch nhau:
 *  - mọi phần refunded/cancelled -> hoàn tiền qua claim nguyên tử (REFUNDED/CANCELED);
 *  - có phần "partial" mà CHƯA đủ completed -> PARTIAL (trạng thái riêng từ
 *    P2-07 audit 2026-11-13, Tín chốt): lưu phần nội dung đã giao, kèm ghi
 *    chú + cảnh báo admin để đối soát phần còn lại bằng tay (không tự hoàn
 *    theo tỉ lệ — toán payload không có tài liệu); CHƯA cộng điểm, CHƯA gửi
 *    thông báo/mail "đã giao" — các thứ đó chỉ chạy khi đơn sang DELIVERED;
 *  - mọi phần completed, hoặc trích được nội dung giao (và không partial)
 *    -> DELIVERED (+ điểm + thông báo);
 *  - còn lại -> chỉ cập nhật providerRaw.
 * Chuyển trạng thái chỉ đi tới: đơn đã REFUNDED/CANCELED/DELIVERED/COMPLETED
 * không bao giờ bị đổi lùi; webhook (fromWebhook) chỉ áp cho đơn PENDING
 * hoặc PARTIAL (đơn giao một phần vẫn phải nhận được lượt hoàn tất sau đó).
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
  if (current.status === "DELIVERED" || current.status === "COMPLETED") return saveRawOnly();
  if (opts.fromWebhook && current.status !== "PENDING" && current.status !== "PARTIAL") return saveRawOnly();
  // Full-audit 6750109 P2-01 (lớp 2): bộ trạng thái phải ĐỦ số đơn con
  // của đơn. Một mảng thiếu (vd chỉ trạng thái của 1 event đơn con)
  // không bao giờ được dùng để chốt tổng — trả đơn nguyên trạng, chờ
  // lượt đối soát đủ (poll/webhook lấy đủ chi tiết mọi đơn con).
  const childCount = (current.providerOrderId || "").split(",").map((x) => x.trim()).filter(Boolean).length;
  if (childCount > 0 && statuses.length < childCount) return current;
  // P2-02 (audit đợt 2): CAS — mọi chuyển trạng thái bên dưới đi qua
  // updateMany CÓ ĐIỀU KIỆN trạng thái hiện tại. Cron poll và webhook có
  // thể áp trạng thái cho cùng một đơn cùng lúc; chỉ MỘT lượt thắng
  // claim, lượt thua (count=0) đọc lại rồi dừng. Trước bản vá, hai lượt
  // cùng qua guard đọc-trước rồi cùng ghi: điểm cộng 2 lần, thông báo
  // và mail giao hàng gửi 2 lần.
  // PremiumOrderStatus không có PROCESSING — đơn FZR nằm ở PENDING cho
  // tới khi được áp trạng thái, nên cả hai đường đều claim từ 2 trạng
  // thái này (khớp đúng guard phía trên).
  const fromStatuses = ["PENDING", "PARTIAL"] as const;

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
  const allCompleted = n > 0 && completedCount === n;
  // allowRawDelivery=false (webhook không lấy được chi tiết đơn): KHÔNG đổ
  // JSON thô của envelope webhook vào nội dung giao cho khách.
  const nextDelivery = delivery || (opts.allowRawDelivery === false ? current.deliveryData : fzrDeliveryOrRaw(raws[0])) || current.deliveryData;

  // P2-07: giao MỘT PHẦN — trạng thái riêng PARTIAL. Lưu phần đã giao cho
  // khách xem, báo admin đối soát phần còn lại; điểm + thông báo/mail "đã
  // giao" CHỈ chạy khi đơn hoàn tất sang DELIVERED ở lượt áp sau.
  if (partial && !allCompleted) {
    const PARTIAL_NOTE = "FZR: đơn giao MỘT PHẦN (partial) — đối soát phần còn lại bằng tay theo dữ liệu thô phía nhà cung cấp";
    // Claim CHUYỂN TRẠNG THÁI chỉ từ PENDING: chỉ lượt thắng mới chạy
    // thông báo/cảnh báo. Đơn đã PARTIAL từ trước (poll lặp) chỉ làm
    // mới nội dung đã giao, không hiệu ứng — gộp chung một claim từ
    // [PENDING, PARTIAL] sẽ cho cả hai lượt đua cùng "thắng".
    const claim = await prisma.premiumOrder.updateMany({
      where: { id: order.id, status: "PENDING" },
      data: {
        status: "PARTIAL",
        deliveryData: nextDelivery,
        providerRaw: JSON.stringify(rawStored),
        // Cron poll lặp lại trạng thái partial nhiều lần — ghi chú chỉ
        // thêm MỘT lần, tránh phình tới giới hạn 900 ký tự.
        ...((current.adminNote || "").includes(PARTIAL_NOTE)
          ? {}
          : { adminNote: [current.adminNote, PARTIAL_NOTE].filter(Boolean).join(" · ").slice(0, 900) }),
      },
    });
    if (claim.count === 0) {
      if (current.status !== "PARTIAL") return (await prisma.premiumOrder.findUnique({ where: { id: order.id } })) || order;
      await prisma.premiumOrder.updateMany({
        where: { id: order.id, status: "PARTIAL" },
        data: { deliveryData: nextDelivery, providerRaw: JSON.stringify(rawStored) },
      });
      return (await prisma.premiumOrder.findUnique({ where: { id: order.id } })) || order;
    }
    const updated = (await prisma.premiumOrder.findUnique({ where: { id: order.id } })) || order;
    if (current.status !== "PARTIAL") {
      await notifyUser(order.userId, "Đơn đang được giao một phần", `Đơn ${order.code}: một phần nội dung đã giao — xem trong chi tiết đơn, phần còn lại đang được xử lý tiếp`, "/dashboard/don-premium");
      await alertMother("fzr_partial", `Đơn FZR giao một phần: ${order.code}`, `Đơn ${order.code} được FazerCards báo giao một phần (partial). Nội dung đã giao nằm trong chi tiết đơn; phần còn lại xử lý tay.`).catch(() => {});
    }
    return updated;
  }

  // Full-audit 3d1309c P2-02: trạng thái TRỘN ở mức lượt — trước bản này
  // [completed, cancelled] rơi xuống nhánh DELIVERED chỉ vì trích được
  // nội dung của lượt completed: đơn hiện "giao đủ", phần bị huỷ không
  // được hoàn. Nay xử lý theo từng lượt:
  //  - Trộn ĐÃ KẾT THÚC (completed + refunded/cancelled, không còn lượt
  //    đang chạy): PARTIAL + giữ nội dung phần completed + hoàn phần
  //    lượt bị huỷ theo CÔNG THỨC QUYỀN LỢI LUỸ KẾ trên sổ hoàn — số
  //    được hoàn của mọi lượt chết (gồm lượt lỗi ngay từ bước thực thi,
  //    vốn không có trạng thái phía provider) là floor(total x
  //    entitledUnits / quantity); mỗi lượt poll chỉ cộng PHẦN CHÊNH so
  //    với refundedAmount đã ghi, và ghi sổ bằng CAS trên chính giá trị
  //    refundedAmount nên poll lặp/đua nhau không cộng hai lần.
  if (badTerminal > 0 && completedCount > 0 && completedCount + badTerminal === n) {
    const MIXED_NOTE = "FZR: đơn có lượt bị nhà cung cấp huỷ/hoàn — phần đã giao giữ nguyên, phần huỷ đã hoàn theo tỉ lệ, đối soát phần còn lại bằng tay";
    const claim = await prisma.premiumOrder.updateMany({
      where: { id: order.id, status: "PENDING" },
      data: {
        status: "PARTIAL",
        deliveryData: nextDelivery,
        providerRaw: JSON.stringify(rawStored),
        ...((current.adminNote || "").includes(MIXED_NOTE)
          ? {}
          : { adminNote: [current.adminNote, MIXED_NOTE].filter(Boolean).join(" · ").slice(0, 900) }),
      },
    });
    if (claim.count === 0 && current.status === "PARTIAL") {
      await prisma.premiumOrder.updateMany({
        where: { id: order.id, status: "PARTIAL" },
        data: { deliveryData: nextDelivery, providerRaw: JSON.stringify(rawStored) },
      });
    }
    if (claim.count > 0) {
      await notifyUser(order.userId, "Đơn đang được giao một phần", `Đơn ${order.code}: một phần nội dung đã giao — xem trong chi tiết đơn, phần còn lại đang được xử lý tiếp`, "/dashboard/don-premium");
      await alertMother("fzr_partial", `Đơn FZR trộn completed + huỷ: ${order.code}`, `Đơn ${order.code} có ${badTerminal}/${n} lượt bị FazerCards huỷ/hoàn. Phần completed đã giao ở trạng thái PARTIAL; phần huỷ được hoàn theo tỉ lệ qua sổ hoàn.`).catch(() => {});
    }
    const entitledUnits = (order.quantity - n) + badTerminal;
    const entitledAmt = Math.floor((order.total * entitledUnits) / Math.max(1, order.quantity));
    let credited = 0;
    await prisma.$transaction(async (tx) => {
      const fresh = await tx.premiumOrder.findUnique({ where: { id: order.id } });
      if (!fresh) return;
      const add = entitledAmt - (fresh.refundedAmount || 0);
      if (add <= 0) return;
      const cas = await tx.premiumOrder.updateMany({
        where: { id: order.id, refundedAmount: fresh.refundedAmount },
        data: { refundedAmount: entitledAmt, refundedUnits: Math.max(entitledUnits, fresh.refundedUnits || 0) },
      });
      if (cas.count === 0) return;
      const addUnits = entitledUnits - (fresh.refundedUnits || 0);
      if (addUnits > 0) await restoreVariantStock(tx, fresh.variantId, addUnits);
      await applyBalance(tx, fresh.userId, add, "REFUND", fresh.code, `Hoàn ${badTerminal} lượt FZR bị huỷ/hoàn`);
      credited = add;
    });
    if (credited > 0) {
      await clawbackReferralCommission(order.userId, credited, order.code);
      await clawbackPassCashback(order.userId, credited, order.code);
      void mailOrderRefunded(order, credited);
    }
    return (await prisma.premiumOrder.findUnique({ where: { id: order.id } })) || order;
  }

  //  - Trộn CÒN ĐANG CHẠY (completed + processing, chưa lượt nào chết):
  //    PARTIAL với nội dung phần đã xong — KHÔNG chốt DELIVERED, KHÔNG
  //    hoàn; lượt poll sau sẽ chốt (đủ completed -> DELIVERED, có lượt
  //    chết -> nhánh trộn kết thúc ở trên).
  if (badTerminal === 0 && completedCount > 0 && completedCount < n) {
    const INFLIGHT_NOTE = "FZR: một số lượt còn đang xử lý phía nhà cung cấp — đã ghi phần giao được, chờ chốt ở lượt đồng bộ sau";
    const claim = await prisma.premiumOrder.updateMany({
      where: { id: order.id, status: "PENDING" },
      data: {
        status: "PARTIAL",
        deliveryData: nextDelivery,
        providerRaw: JSON.stringify(rawStored),
        ...((current.adminNote || "").includes(INFLIGHT_NOTE)
          ? {}
          : { adminNote: [current.adminNote, INFLIGHT_NOTE].filter(Boolean).join(" · ").slice(0, 900) }),
      },
    });
    if (claim.count === 0) {
      if (current.status !== "PARTIAL") return (await prisma.premiumOrder.findUnique({ where: { id: order.id } })) || order;
      await prisma.premiumOrder.updateMany({
        where: { id: order.id, status: "PARTIAL" },
        data: { deliveryData: nextDelivery, providerRaw: JSON.stringify(rawStored) },
      });
      return (await prisma.premiumOrder.findUnique({ where: { id: order.id } })) || order;
    }
    await notifyUser(order.userId, "Đơn đang được giao một phần", `Đơn ${order.code}: một phần nội dung đã giao — xem trong chi tiết đơn, phần còn lại đang được xử lý tiếp`, "/dashboard/don-premium");
    return (await prisma.premiumOrder.findUnique({ where: { id: order.id } })) || order;
  }

  if (allCompleted || (delivery && badTerminal === 0)) {
    const claim = await prisma.premiumOrder.updateMany({
      where: { id: order.id, status: { in: [...fromStatuses] } },
      data: {
        status: "DELIVERED",
        deliveryData: nextDelivery,
        providerRaw: JSON.stringify(rawStored),
      },
    });
    // Thua claim = lượt song song đã chuyển trạng thái và chạy hiệu ứng
    // (điểm/thông báo/mail) rồi — dừng tại đây, không chạy lần hai.
    if (claim.count === 0) return (await prisma.premiumOrder.findUnique({ where: { id: order.id } })) || order;
    const updated = (await prisma.premiumOrder.findUnique({ where: { id: order.id } })) || order;
    await awardPointsForPremiumOrder(updated);
    await notifyUser(order.userId, "Đơn Premium đã được giao", `Đơn ${order.code} đã giao — xem nội dung trong chi tiết đơn`, "/dashboard/don-premium");
    // Đơn đã DELIVERED/COMPLETED đã bị chặn ở guard đầu hàm nên tới được
    // đây luôn là lần CHUYỂN sang đã giao thật — gửi mail giao hàng 1 lần.
    void mailOrderDelivered(updated, updated.deliveryData || "");
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
