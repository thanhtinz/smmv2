import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toolContext, findToolOrder, TOOL_STATUS_IN } from "@/lib/tool";
import { refundSmmOrder } from "@/lib/orders";
import { orderTransition } from "@/lib/notify";

export const dynamic = "force-dynamic";

/** POST /api/tool/update — body JSON: { key, id, external_order_id, start_count, remains, status }
 *  status hợp lệ: processing, inprogress, completed, partial, canceled, refunded, error.
 *  Huỷ/hoàn/một phần: hệ thống tự hoàn tiền theo phần chưa chạy (remains) qua refundSmmOrder. */
export async function POST(req: Request) {
  const body: any = await req.json().catch(() => ({}));
  const ctx = await toolContext(req, body?.key);
  if (!ctx) {
    return NextResponse.json({ error: "invalid tool api key" }, { status: 401 });
  }
  const id = Number(body?.id || 0);
  const order = id ? await findToolOrder(id, ctx.panelId) : null;
  if (!order) return NextResponse.json({ error: "order not found" }, { status: 404 });
  if (["COMPLETED", "CANCELED", "REFUNDED"].includes(order.status)) {
    return NextResponse.json({ error: "order already finished" }, { status: 409 });
  }
  const newStatus = TOOL_STATUS_IN[String(body?.status || "").toLowerCase()];
  if (!newStatus) return NextResponse.json({ error: "invalid status" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (body?.start_count != null) data.startCount = Math.max(0, Number(body.start_count) || 0);
  if (body?.remains != null) data.remains = Math.max(0, Number(body.remains) || 0);
  if (body?.external_order_id != null) data.providerOrderId = String(body.external_order_id).slice(0, 50);

  const effRemains = body?.remains != null ? Math.max(0, Number(body.remains) || 0) : (order.remains ?? order.quantity);
  const refundAmt = Math.floor((order.charge * effRemains) / Math.max(1, order.quantity));

  if (newStatus === "CANCELED" || newStatus === "REFUNDED" || (newStatus === "PARTIAL" && refundAmt > 0)) {
    if (Object.keys(data).length) await prisma.smmOrder.update({ where: { id: order.id }, data });
    await refundSmmOrder(order.id, refundAmt, `Tool API cập nhật trạng thái: ${newStatus}`, newStatus as "REFUNDED" | "CANCELED" | "PARTIAL");
    return NextResponse.json({ data: true });
  }
  data.status = newStatus;
  await prisma.smmOrder.update({ where: { id: order.id }, data });
  const fresh = await prisma.smmOrder.findUnique({ where: { id: order.id } });
  if (fresh) await orderTransition(fresh, newStatus, "Cập nhật qua Tool API");
  return NextResponse.json({ data: true });
}
