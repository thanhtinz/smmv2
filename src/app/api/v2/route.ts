import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { userByApiKey } from "@/lib/auth";
import { createSmmOrder, createPremiumOrder, refundSmmOrder } from "@/lib/orders";
import { smmCharge, vnd, parsePremiumFields } from "@/lib/format";
import { getSettings, levelDiscountFromSettings } from "@/lib/settings";
import { getActiveFlashSale, flashAppliesTo, applyFlashAmount, flashPercentForProduct } from "@/lib/flash";
import { variantSoldOut, isQtyTracked, resolveDeliveryType } from "@/lib/variant-stock";
import { FZR_LABELS } from "@/lib/fzr";
import { moduleOn } from "@/lib/modules";
import { providerCancel, providerRefill } from "@/lib/provider";
import { rateLimitExceeded, clientIp } from "@/lib/rate-limit";
import { ipAllowed } from "@/lib/ip-match";

/**
 * API cho đại lý (reseller) — chuẩn SMM API v2 tương thích Perfect Panel & hầu hết panel VN.
 * Endpoint: POST /api/v2  (key, action, ...)
 * action: services | balance | add | status | orders | cancel | refill
 */
export const dynamic = "force-dynamic";

const STATUS_OUT: Record<string, string> = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  PARTIAL: "Partial",
  CANCELED: "Canceled",
  REFUNDED: "Canceled",
};

async function handle(req: NextRequest) {
  const params = new URLSearchParams(await req.text().catch(() => ""));
  const q = req.nextUrl.searchParams;
  const get = (k: string) => params.get(k) || q.get(k) || "";
  const key = get("key");
  const action = get("action");
  // Giới hạn tần suất: theo IP và theo API key (chống spam/khuếch đại tải)
  if (rateLimitExceeded(`v2ip|${clientIp(req.headers)}`, 600, 60000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  if (key && rateLimitExceeded(`v2key|${key}`, 300, 60000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const user = await userByApiKey(key);
  if (!user) {
    // GĐ3: ghi log gọi API lỗi (nguồn tín hiệu lạm dụng API cho điểm rủi ro)
    if (key) await prisma.apiLog.create({ data: { kind: "reseller_in", ref: "unknown", ok: false, detail: `Invalid API key từ IP ${clientIp(req.headers)}` } }).catch(() => {});
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }
  // GĐ3: whitelist IP cho từng API key — chủ key đặt ở Hồ sơ → Kết nối API;
  // danh sách trống = không giới hạn.
  {
    const ip = clientIp(req.headers);
    if (!ipAllowed(ip, user.apiKeyIps)) {
      await prisma.apiLog.create({ data: { kind: "reseller_in", ref: `user:${user.id}`, ok: false, detail: `API key bị chặn: IP ${ip} không nằm trong whitelist` } }).catch(() => {});
      // RiskEvent nhẹ, tối đa 1 dòng/giờ cho mỗi tài khoản để không spam nhật ký
      const recent = await prisma.riskEvent.count({ where: { userId: user.id, kind: "api_ip_blocked", createdAt: { gte: new Date(Date.now() - 3600 * 1000) } } }).catch(() => 1);
      if (!recent) {
        await prisma.riskEvent.create({ data: { userId: user.id, kind: "api_ip_blocked", points: 0, score: user.riskScore, detail: `API key bị chặn vì IP ${ip} không nằm trong whitelist` } }).catch(() => {});
      }
      return NextResponse.json({ error: "IP not whitelisted" }, { status: 403 });
    }
  }
  if (!(await moduleOn("api"))) {
    return NextResponse.json({ error: "API module is disabled" }, { status: 403 });
  }

  try {
    if (action === "balance") {
      return NextResponse.json({ balance: String(user.balance), currency: "VND" });
    }

    if (action === "services") {
      // Chỉ dịch vụ của web mẹ.
      const services = await prisma.smmService.findMany({
        where: { active: true, panelId: null },
        include: { category: true },
        orderBy: [{ categoryId: "asc" }, { sort: "asc" }, { id: "asc" }],
      });
      // Giá hiển thị phải KHỚP giá thực thu trong createSmmOrder: giảm theo
      // bậc khách hàng trong Cấu hình.
      const settings = await getSettings();
      const discount = levelDiscountFromSettings(settings, user.level);
      const flashSale = await getActiveFlashSale("SMM");
      const withFlash = (svc: (typeof services)[number], v: number) => applyFlashAmount(v, flashAppliesTo(flashSale, svc.id) ? flashSale!.percent : 0);
      const rateFor = (svc: (typeof services)[number]) => withFlash(svc, Math.round(svc.rate * (1 - discount / 100)));
      return NextResponse.json(
        services.map((s) => ({
          service: s.id,
          name: s.name,
          type: "Default",
          category: s.category.name,
          rate: String(rateFor(s)),
          min: s.min,
          max: s.max,
          refill: s.refill,
          cancel: s.cancelable,
          dripfeed: s.dripfeed,
        }))
      );
    }

    if (action === "add") {
      const serviceId = parseInt(get("service"));
      const quantity = parseInt(get("quantity"));
      const link = get("link");
      if (!serviceId || !quantity || !link) return NextResponse.json({ error: "Missing service, link or quantity" });
      // Tham số phụ kiểu ThaTim cho dịch vụ đặc thù
      const extra: Record<string, any> = {};
      if (get("comments")) extra.comments = get("comments");
      if (get("reaction")) extra.reaction = get("reaction");
      if (get("minutes")) extra.minutes = parseInt(get("minutes"));
      if (get("duration")) extra.duration = parseInt(get("duration"));
      if (get("posts")) extra.posts = parseInt(get("posts"));
      const fresh = await prisma.user.findUnique({ where: { id: user.id } });
      // Drip-feed kiểu panel chuẩn: dripfeed=1&runs=10&interval=60 (phút)
      const dripfeed = get("dripfeed") && parseInt(get("runs")) > 0 && parseInt(get("interval")) > 0
        ? { runs: parseInt(get("runs")), intervalMinutes: parseInt(get("interval")) }
        : undefined;
      const order = await createSmmOrder({ user: fresh!, serviceId, link, quantity, viaApi: true, extra, dripfeed, promoCode: get("promo_code") || get("promo") || undefined });
      return NextResponse.json({ order: order.id });
    }

    if (action === "status") {
      const id = parseInt(get("order"));
      const o = await prisma.smmOrder.findFirst({ where: { id, userId: user.id } });
      if (!o) return NextResponse.json({ error: "Order not found" });
      return NextResponse.json({
        charge: (o.charge / 1).toFixed(0),
        start_count: o.startCount ?? 0,
        status: STATUS_OUT[o.status],
        remains: o.remains ?? 0,
        currency: "VND",
      });
    }

    if (action === "orders") {
      const ids = get("orders")
        .split(",")
        .map((x) => parseInt(x.trim()))
        .filter(Boolean)
        .slice(0, 100);
      const list = await prisma.smmOrder.findMany({ where: { id: { in: ids }, userId: user.id } });
      const out: Record<string, any> = {};
      for (const o of list)
        out[o.id] = {
          charge: String(o.charge),
          start_count: o.startCount ?? 0,
          status: STATUS_OUT[o.status],
          remains: o.remains ?? 0,
          currency: "VND",
        };
      for (const id of ids) if (!out[id]) out[id] = { error: "Order not found" };
      return NextResponse.json(out);
    }

    if (action === "cancel") {
      const ids = get("orders")
        .split(",")
        .map((x) => parseInt(x.trim()))
        .filter(Boolean)
        .slice(0, 100); // cắt tối đa 100 id/lần như nhánh orders — chống khuếch đại tải
      const out: any[] = [];
      for (const id of ids) {
        const o = await prisma.smmOrder.findFirst({
          where: { id, userId: user.id },
          include: { service: true, provider: true },
        });
        if (!o) {
          out.push({ order: id, error: "Order not found" });
          continue;
        }
        if (!o.service.cancelable || !["PENDING", "PROCESSING"].includes(o.status)) {
          out.push({ order: id, error: "Cannot cancel this order" });
          continue;
        }
        if (o.providerOrderId && o.provider) await providerCancel(o.provider, o.providerOrderId);
        await refundSmmOrder(o.id, o.charge - o.refundedAmount, "Khách huỷ qua API", "CANCELED");
        out.push({ order: id, cancel: true });
      }
      return NextResponse.json(out);
    }

    if (action === "refill") {
      const id = parseInt(get("order"));
      const o = await prisma.smmOrder.findFirst({ where: { id, userId: user.id }, include: { service: true, provider: true } });
      if (!o) return NextResponse.json({ error: "Order not found" });
      if (!o.service.refill) return NextResponse.json({ error: "Service does not support refill" });
      // Chỉ đơn đã hoàn thành/một phần mới được refill — refill đơn đã huỷ/đã
      // hoàn tiền là bắt nhà cung cấp giao lại phần giá trị đã trả lại khách.
      if (!["COMPLETED", "PARTIAL"].includes(o.status)) return NextResponse.json({ error: "Only completed or partial orders can be refilled" });
      if (rateLimitExceeded(`v2refill|${user.id}`, 60, 60000)) return NextResponse.json({ error: "Too many refill requests" }, { status: 429 });
      // Đơn API: đẩy refill thật sang provider
      if (o.fulfillment === "API" && o.provider && o.providerOrderId) {
        try {
          const refillId = await providerRefill(o.provider, o.providerOrderId);
          await prisma.apiLog.create({ data: { kind: "reseller_in", ref: o.code, detail: `Refill provider=${o.provider.name} refillId=${refillId}` } });
          return NextResponse.json({ refill: refillId });
        } catch (e: any) {
          return NextResponse.json({ error: String(e?.message || "Refill failed") });
        }
      }
      await prisma.apiLog.create({ data: { kind: "reseller_in", ref: o.code, detail: "Yêu cầu refill từ API (đơn thủ công)" } });
      await prisma.smmOrder.update({ where: { id: o.id }, data: { adminNote: `[Refill] Khách yêu cầu bù lúc ${new Date().toISOString()}` } });
      return NextResponse.json({ refill: o.id });
    }

    /* ===== API SẢN PHẨM SỐ THEO NHÓM (fix6 task 6) — game key, gift card,
       top-up, dịch vụ thủ công, Telegram (Stars/Premium), Steam =====
       Nhóm của một gói = providerGroup phía FZR; gói không thuộc FZR xếp
       theo hình thức giao: AUTO_STOCK (giao mã/key ngay từ kho) vào nhóm
       gamekeys, còn lại vào nhóm manual (dịch vụ thủ công). */
    if (action === "products") {
      const GROUP_NAMES: Record<string, string> = {
        gamekeys: "Game Keys",
        giftcards: "Gift Cards",
        topups: "Top-ups",
        manual: "Dịch vụ thủ công",
        telegram_stars: "Telegram Stars",
        telegram_premium: "Telegram Premium",
        steam_topup: "Steam Top-up",
        steam_gift: "Steam Gifts",
      };
      const groupFilter = get("group");
      if (groupFilter && !GROUP_NAMES[groupFilter]) return NextResponse.json({ error: "Unknown group" });
      const products = await prisma.premiumProduct.findMany({
        where: { active: true, panelId: null },
        orderBy: [{ categoryId: "asc" }, { id: "asc" }],
        include: { category: true, variants: { where: { active: true }, orderBy: { price: "asc" } } },
      });
      // Kho AUTO_STOCK = số dòng kho còn AVAILABLE của từng gói
      const autoIds = products.flatMap((p) => (p.fulfillment === "AUTO_STOCK" ? p.variants.map((v) => v.id) : []));
      const stockCounts = new Map<number, number>();
      if (autoIds.length) {
        const grouped = await prisma.premiumStock.groupBy({ by: ["variantId"], where: { variantId: { in: autoIds }, status: "AVAILABLE" }, _count: { _all: true } });
        for (const g of grouped) stockCounts.set(g.variantId, g._count._all);
      }
      const byGroup = new Map<string, Map<number, any>>();
      for (const p of products) {
        if (!p.variants.length) continue;
        const flashPct = await flashPercentForProduct(p.id);
        const requiredFields = parsePremiumFields(p.customFields).map((f) => ({
          label: f.label, type: f.type, required: f.required,
          // Trường của nhà cung cấp (FZR) kèm thêm `key`: khi đặt đơn qua
          // API, gửi `fields` theo đúng key này (hoặc theo nhãn đều khớp).
          ...(f.key ? { key: f.key } : {}),
          ...(f.placeholder ? { placeholder: f.placeholder } : {}),
          ...(f.options ? { options: f.options } : {}),
        }));
        for (const v of p.variants) {
          // Gói sao Telegram theo số lượng (itemId là số sao) là preset hiển
          // thị của web, KHÔNG phải SKU API — API bán sao qua gói đơn vị
          // (itemId "stars") với quantity = số sao.
          if (v.providerGroup === "telegram_stars" && v.providerItemId !== "stars") continue;
          const g = v.providerGroup || (p.fulfillment === "AUTO_STOCK" ? "gamekeys" : "manual");
          if (groupFilter && g !== groupFilter) continue;
          if (!byGroup.has(g)) byGroup.set(g, new Map());
          const gp = byGroup.get(g)!;
          if (!gp.has(p.id)) {
            gp.set(p.id, {
              id: p.id, name: p.name, category: p.category.name, fulfillment: p.fulfillment,
              required_fields: requiredFields, variants: [],
            });
          }
          let qty: number | null = null;
          if (p.fulfillment === "AUTO_STOCK") qty = stockCounts.get(v.id) ?? 0;
          else if (isQtyTracked(p.fulfillment, v.stockQty)) qty = v.stockQty;
          const soldOut = variantSoldOut(v, p.fulfillment) || qty === 0;
          gp.get(p.id).variants.push({
            variant: v.id,
            name: v.name,
            price: applyFlashAmount(v.price, flashPct),
            delivery: resolveDeliveryType(v.deliveryType, p.fulfillment),
            stock: soldOut ? "out_of_stock" : "in_stock",
            ...(qty !== null ? { stock_qty: qty } : {}),
          });
        }
      }
      return NextResponse.json(
        Array.from(byGroup.entries()).map(([g, gp]) => ({ group: g, name: GROUP_NAMES[g] || g, products: Array.from(gp.values()) }))
      );
    }

    /* ===== API MUA SẢN PHẨM (Premium) — cùng chuẩn kiểu ThaTim ===== */
    if (action === "category") {
      const cats = await prisma.premiumCategory.findMany({
        where: { active: true },
        orderBy: { sort: "asc" },
        include: {
          products: {
            // Chỉ sản phẩm của web mẹ
            where: { active: true, panelId: null },
            include: { variants: { where: { active: true }, orderBy: { price: "asc" } } },
          },
        },
      });
      return NextResponse.json(
        cats.map((c) => ({
          id: c.id,
          name: c.name,
          products: c.products.map((p) => ({
            id: p.id,
            name: p.name,
            cycles: p.variants.map((v) => ({ variant: v.id, cycle: v.providerCycle ?? null, name: v.name, price: v.price })),
          })),
        }))
      );
    }

    if (action === "buy") {
      // Chấp nhận: product=<variantId> | product=<productId>&cycle=<số tháng> (kiểu ThaTim)
      const productParam = parseInt(get("product"));
      const cycleParam = parseInt(get("cycle") || "0");
      const note = get("note");
      if (!productParam) return NextResponse.json({ error: "Missing product" });
      let variant = await prisma.premiumVariant.findFirst({ where: { id: productParam, active: true }, include: { product: true } });
      if (!variant && cycleParam) {
        variant = await prisma.premiumVariant.findFirst({
          where: { productId: productParam, active: true, OR: [{ providerCycle: cycleParam }, { name: { contains: `${cycleParam} tháng`, mode: "insensitive" } }] },
          include: { product: true },
        });
      }
      if (!variant) return NextResponse.json({ error: "Product/cycle not found" });
      let quantity = Math.max(1, parseInt(get("quantity") || "1") || 1);
      // Gói sao Telegram theo số lượng mua qua API -> dịch sang gói đơn vị
      // với quantity = số sao x số lượng gói (đúng máy tính tiền theo báo giá).
      if (variant.providerGroup === "telegram_stars" && variant.providerItemId !== "stars") {
        const amount = parseInt(variant.providerItemId || "0");
        const unit = await prisma.premiumVariant.findFirst({
          where: { productId: variant.productId, providerGroup: "telegram_stars", providerItemId: "stars", active: true },
          include: { product: true },
        });
        if (!amount || !unit) return NextResponse.json({ error: "Telegram Stars package unavailable" });
        quantity = quantity * amount;
        variant = unit;
      }
      // Thông tin bàn giao theo nhóm (fix6 task 6): tham số tiện ích theo nhóm
      // + `fields` JSON theo đúng nhãn trường của sản phẩm — tất cả chạy qua
      // createPremiumOrder như đơn web (trừ kho WS9, thực thi FZR, hoàn tiền).
      const record: Record<string, string> = {};
      if (get("username")) record["Tên người dùng Telegram"] = get("username");
      if (get("telegram_id")) record[FZR_LABELS.telegramId] = get("telegram_id");
      if (get("player_id")) record[FZR_LABELS.playerId] = get("player_id");
      if (get("steam_login")) record[FZR_LABELS.steamLogin] = get("steam_login");
      if (get("receiver")) record[FZR_LABELS.giftReceiver] = get("receiver");
      if (get("fields")) {
        try {
          const fj = JSON.parse(get("fields"));
          for (const [k, v] of Object.entries(fj)) if (String(v).trim()) record[k] = String(v);
        } catch {
          return NextResponse.json({ error: "Invalid fields JSON" });
        }
      }
      if (note && !record[FZR_LABELS.extraInfo]) record[FZR_LABELS.extraInfo] = note;
      const fresh = await prisma.user.findUnique({ where: { id: user.id } });
      const declared = parsePremiumFields(variant.product.customFields);
      // player_id tiện ích: sản phẩm top-up của FZR khai trường theo KEY của
      // NCC (nhãn do admin đặt) — gắn giá trị vào đúng trường khai báo có key
      // kiểu player/id thay vì chỉ nhãn generic cũ.
      if (get("player_id")) {
        const pf = declared.find((f) => f.key && /player|user_?id|^id$/i.test(f.key)) || declared.find((f) => f.label === FZR_LABELS.playerId);
        if (pf && !record[pf.label]) record[pf.label] = get("player_id");
      }
      try {
        const order = await createPremiumOrder({
          user: fresh!,
          variantId: variant.id,
          quantity,
          ...(declared.length
            ? { customData: record }
            : Object.keys(record).length
              ? { buyerInfo: Object.entries(record).map(([k, v]) => `${k}: ${v}`).join("\n") }
              : { buyerInfo: note || fresh!.email }),
          promoCode: get("promo_code") || get("promo") || undefined,
        });
        await prisma.apiLog.create({ data: { kind: "reseller_in", ref: order.code, ok: true, detail: `Mua Premium qua API: ${variant.product.name} (${variant.name}) x${quantity}` } }).catch(() => {});
        return NextResponse.json({
          order_code: order.code,
          status: order.status,
          ...(order.deliveryData ? { delivery: order.deliveryData } : {}),
        });
      } catch (e: any) {
        // Lỗi nghiệp vụ (hết hàng, thiếu trường bắt buộc, số dư...) trả về
        // dạng {error} như các lỗi tham số của API này thay vì 500.
        return NextResponse.json({ error: String(e?.message || "Order failed") });
      }
    }

    if (action === "premium_status") {
      // Trạng thái 1 đơn sản phẩm số theo mã đơn — kèm nội dung đã giao khi
      // đơn đã giao (use case đại lý: lấy key/tài khoản giao cho khách).
      const code = get("order_code") || get("order");
      if (!code) return NextResponse.json({ error: "Missing order_code" });
      const o = await prisma.premiumOrder.findFirst({
        where: { code, userId: user.id },
        include: { variant: { include: { product: true } } },
      });
      if (!o) return NextResponse.json({ error: "Order not found" });
      const delivered = ["DELIVERED", "COMPLETED", "WARRANTY"].includes(o.status);
      return NextResponse.json({
        order_code: o.code,
        status: o.status,
        product: o.variant.product.name,
        variant: o.variant.name,
        quantity: o.quantity,
        price: o.total,
        ...(delivered && o.deliveryData ? { delivery: o.deliveryData } : {}),
        ...(o.warrantyUntil ? { warranty_until: o.warrantyUntil.toISOString() } : {}),
        created_at: o.createdAt.toISOString(),
      });
    }

    if (action === "history") {
      const ids = get("ids")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      const list = await prisma.premiumOrder.findMany({
        where: { userId: user.id, ...(ids.length ? { code: { in: ids } } : {}) },
        orderBy: { id: "desc" },
        take: 100,
        include: { variant: { include: { product: true } } },
      });
      return NextResponse.json(
        list.map((o) => ({
          order_code: o.code,
          product: o.variant.product.name,
          variant: o.variant.name,
          price: o.total,
          price_vnd: vnd(o.total),
          status: o.status,
          delivery: o.deliveryData || null,
          created_at: o.createdAt.toISOString(),
        }))
      );
    }

    // tránh unused warning khi tính giá hiển thị
    void smmCharge;
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e: any) {
    console.error("[/api/v2]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return handle(req);
}
export async function GET(req: NextRequest) {
  return handle(req);
}
