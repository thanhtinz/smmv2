// KIT cho BNT Shop — chép vào src/app/api/ai/order-status/route.ts.
// Tra đơn Premium theo mã đơn (code dạng PRE100001). deliveryData là nội
// dung đã giao (key/tài khoản) — TUYỆT ĐỐI không trả qua kênh này.
import { NextResponse } from "next/server";
import { aiAuthorized } from "@/lib/ai-knowledge";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!aiAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const ref = new URL(req.url).searchParams.get("ref") ?? "";
  if (!ref) return NextResponse.json({ error: "Thiếu ref" }, { status: 400 });
  const order = await prisma.premiumOrder.findUnique({
    where: { code: ref },
    include: { variant: { include: { product: { select: { name: true } } } } },
  });
  if (!order) return NextResponse.json({ found: false, ref });
  return NextResponse.json({
    found: true,
    ref,
    product: order.variant?.product?.name,
    variant: order.variant?.name,
    status: order.status,
    delivered: Boolean(order.deliveryData),
    warrantyUntil: order.warrantyUntil?.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  });
}
