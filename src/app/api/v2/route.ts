import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { userByApiKey } from "@/lib/auth";
import { createSmmOrder, createPremiumOrder, refundSmmOrder } from "@/lib/orders";
import { LEVEL_DISCOUNT, smmCharge, vnd } from "@/lib/format";
import { getSettings, levelDiscountFromSettings } from "@/lib/settings";
import { moduleOn } from "@/lib/modules";
import { providerCancel, providerRefill } from "@/lib/provider";

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
  const user = await userByApiKey(key);
  if (!user) return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  if (!(await moduleOn("api", user.panelId))) {
    return NextResponse.json({ error: "API module is disabled" }, { status: 403 });
  }

  try {
    if (action === "balance") {
      return NextResponse.json({ balance: String(user.balance), currency: "VND" });
    }

    if (action === "services") {
      const services = await prisma.smmService.findMany({
        where: { active: true },
        include: { category: true },
        orderBy: [{ categoryId: "asc" }, { sort: "asc" }, { id: "asc" }],
      });
      const discount = levelDiscountFromSettings(await getSettings(), user.level);
      return NextResponse.json(
        services.map((s) => ({
          service: s.id,
          name: s.name,
          type: "Default",
          category: s.category.name,
          rate: String(Math.round(s.rate * (1 - discount / 100))),
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
        .filter(Boolean);
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

    /* ===== API MUA SẢN PHẨM (Premium) — cùng chuẩn kiểu ThaTim ===== */
    if (action === "category") {
      const cats = await prisma.premiumCategory.findMany({
        where: { active: true },
        orderBy: { sort: "asc" },
        include: { products: { where: { active: true }, include: { variants: { where: { active: true }, orderBy: { price: "asc" } } } } },
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
          where: { productId: productParam, active: true, OR: [{ providerCycle: cycleParam }, { name: { contains: `${cycleParam} tháng` } }] },
          include: { product: true },
        });
      }
      if (!variant) return NextResponse.json({ error: "Product/cycle not found" });
      const fresh = await prisma.user.findUnique({ where: { id: user.id } });
      const order = await createPremiumOrder({ user: fresh!, variantId: variant.id, quantity: 1, buyerInfo: note || fresh!.email, promoCode: get("promo_code") || get("promo") || undefined });
      return NextResponse.json({
        order_code: order.code,
        status: order.status,
        ...(order.deliveryData ? { delivery: order.deliveryData } : {}),
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
    return NextResponse.json({ error: String(e?.message || "Server error") }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  return handle(req);
}
export async function GET(req: NextRequest) {
  return handle(req);
}
