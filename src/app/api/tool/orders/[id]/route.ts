import { NextResponse } from "next/server";
import { toolContext, toolOrderJson, findToolOrder } from "@/lib/tool";

export const dynamic = "force-dynamic";

/** GET /api/tool/orders/{id}?key=... — chi tiết một đơn thủ công. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const ctx = await toolContext(req);
  if (!ctx) {
    return NextResponse.json({ error: "invalid tool api key" }, { status: 401 });
  }
  const id = Number(params.id || 0);
  const order = id ? await findToolOrder(id) : null;
  if (!order) return NextResponse.json({ error: "order not found" }, { status: 404 });
  return NextResponse.json({
    ...toolOrderJson(order),
    admin_note: order.adminNote || "",
    service: { id: order.serviceId, name: order.service.name },
  });
}
