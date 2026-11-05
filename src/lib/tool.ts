import { prisma } from "./db";
import { getSettings } from "./settings";
import type { SmmOrderStatus } from "@prisma/client";

/** SMM Tool API — cho tool ngoài (xử lý đơn thủ công) lấy đơn chờ + cập nhật trạng thái.
 *  Hai phạm vi key: key của WEB MẸ (setting tool_api_key) thấy mọi đơn thủ công;
 *  key RIÊNG của từng panel (ChildPanel.toolApiKey) chỉ thấy đơn của panel đó.
 *  Chấp nhận key qua query ?key=, header x-tool-key, hoặc field "key" trong body POST. */
export type ToolContext = { panelId: number | null };

export async function toolContext(req: Request, bodyKey?: unknown): Promise<ToolContext | null> {
  const url = new URL(req.url);
  const given = (url.searchParams.get("key") || req.headers.get("x-tool-key") || (typeof bodyKey === "string" ? bodyKey : "")).trim();
  if (!given) return null;
  const s = await getSettings();
  if ((s.tool_api_key || "").trim() && given === (s.tool_api_key || "").trim()) return { panelId: null };
  const panel = await prisma.childPanel.findFirst({ where: { toolApiKey: given }, select: { id: true } });
  if (panel) return { panelId: panel.id };
  return null;
}

export async function toolAuthorized(req: Request, bodyKey?: unknown): Promise<boolean> {
  return (await toolContext(req, bodyKey)) !== null;
}

export const TOOL_STATUS_OUT: Record<string, string> = {
  PENDING: "pending", PROCESSING: "processing", IN_PROGRESS: "inprogress",
  COMPLETED: "completed", PARTIAL: "partial", CANCELED: "canceled", REFUNDED: "refunded",
};
export const TOOL_STATUS_IN: Record<string, SmmOrderStatus> = {
  pending: "PENDING", processing: "PROCESSING", inprogress: "IN_PROGRESS",
  completed: "COMPLETED", partial: "PARTIAL", canceled: "CANCELED", refunded: "REFUNDED",
  error: "CANCELED",
};

export function toolOrderJson(o: {
  id: number; code: string; link: string; quantity: number; startCount: number | null;
  remains: number | null; providerOrderId: string | null; status: string; serviceId: number;
}) {
  return {
    id: o.id,
    code: o.code,
    link: o.link,
    quantity: o.quantity,
    start_count: o.startCount ?? 0,
    remains: o.remains ?? o.quantity,
    external_order_id: o.providerOrderId || "",
    status: TOOL_STATUS_OUT[o.status] || o.status.toLowerCase(),
    service_id: o.serviceId,
  };
}

/** Tool chỉ xử lý đơn của dịch vụ THỦ CÔNG (không đấu API). Phạm vi panel: đơn phải
 *  thuộc đúng panel của key (panelId null = key web mẹ, không giới hạn panel). */
export async function findToolOrder(id: number, panelId?: number | null) {
  const order = await prisma.smmOrder.findUnique({
    where: { id },
    include: { service: { select: { fulfillment: true, name: true } } },
  });
  if (!order || order.service.fulfillment !== "MANUAL") return null;
  if (panelId != null && order.panelId !== panelId) return null;
  return order;
}
