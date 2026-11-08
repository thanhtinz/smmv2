import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toolContext, toolOrderJson, TOOL_STATUS_IN } from "@/lib/tool";
import type { SmmOrderStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

/** GET /api/tool/orders?key=...[&status=&service_id=&search=]
 *  Danh sách đơn THỦ CÔNG đang chờ xử lý (mặc định: pending + processing + inprogress). */
export async function GET(req: Request) {
  const ctx = await toolContext(req);
  if (!ctx) {
    return NextResponse.json({ error: "invalid tool api key" }, { status: 401 });
  }
  const url = new URL(req.url);
  const statusParam = (url.searchParams.get("status") || "").toLowerCase();
  const serviceId = Number(url.searchParams.get("service_id") || 0) || undefined;
  const search = (url.searchParams.get("search") || "").trim();
  const mapped = statusParam ? TOOL_STATUS_IN[statusParam] : undefined;
  const statuses: SmmOrderStatus[] = mapped ? [mapped] : ["PENDING", "PROCESSING", "IN_PROGRESS"];
  const orders = await prisma.smmOrder.findMany({
    where: {
      service: { fulfillment: "MANUAL" },
      status: { in: statuses },
      ...(serviceId ? { serviceId } : {}),
      ...(search ? { OR: [{ link: { contains: search, mode: "insensitive" } }, { code: { contains: search, mode: "insensitive" } }] } : {}),
    },
    orderBy: { id: "asc" },
    take: 200,
  });
  return NextResponse.json(orders.map(toolOrderJson));
}
