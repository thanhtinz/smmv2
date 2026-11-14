import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { userByApiKey } from "@/lib/auth";
import { createPremiumOrder } from "@/lib/orders";
import { vnd, parsePremiumFields, effectivePremiumFields } from "@/lib/format";
import { applyFlashAmount, flashPercentForProduct } from "@/lib/flash";
import { variantSoldOut, isQtyTracked, resolveDeliveryType } from "@/lib/variant-stock";
import { FZR_LABELS } from "@/lib/fzr";
import { moduleOn } from "@/lib/modules";
import { rateLimitExceeded, clientIp } from "@/lib/rate-limit";
import { ipAllowed } from "@/lib/ip-match";

/**
 * API cho đại lý (reseller) — API SẢN PHẨM SỐ (Premium).
 * Endpoint: POST /api/v2  (key, action, ...)
 * action: products | category | buy | premium_status | history
 * Các action dịch vụ SMM (services/add/status/orders/cancel/refill/balance)
 * đã gỡ (lệnh Tín 2026-11-12 — web tách thành Digital Shop thuần, SMM làm
 * web riêng).
 */
export const dynamic = "force-dynamic";

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
          const variantFields = parsePremiumFields(v.customFields);
          gp.get(p.id).variants.push({
            variant: v.id,
            name: v.name,
            price: applyFlashAmount(v.price, flashPct),
            delivery: resolveDeliveryType(v.deliveryType, p.fulfillment),
            stock: soldOut ? "out_of_stock" : "in_stock",
            ...(qty !== null ? { stock_qty: qty } : {}),
            ...(v.minOrderQty != null ? { min_order_quantity: v.minOrderQty } : {}),
            ...(v.maxOrderQty != null ? { max_order_quantity: v.maxOrderQty } : {}),
            // Trường tuỳ chỉnh RIÊNG của gói (nếu gói có định nghĩa) — ghi đè
            // required_fields cấp sản phẩm khi đặt đơn gói này.
            ...(variantFields.length ? {
              required_fields: variantFields.map((f) => ({
                label: f.label, type: f.type, required: f.required,
                ...(f.key ? { key: f.key } : {}),
                ...(f.placeholder ? { placeholder: f.placeholder } : {}),
                ...(f.options ? { options: f.options } : {}),
              })),
            } : {}),
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
      const declared = effectivePremiumFields(variant.product.customFields, variant.customFields);
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
