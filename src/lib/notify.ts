import { prisma } from "./db";

/** Thông báo cho khách + lịch sử trạng thái đơn — mọi hàm đều best-effort:
 *  lỗi ghi thông báo KHÔNG bao giờ được làm hỏng luồng đơn hàng/chính sách tiền. */
export type NotifyCategory = "order" | "deposit" | "refund" | "promo" | "system" | "ticket" | "security";

export const NOTIFY_CATEGORIES: { key: NotifyCategory; label: string }[] = [
  { key: "order", label: "Thông báo đơn hàng" },
  { key: "deposit", label: "Thông báo nạp tiền" },
  { key: "refund", label: "Thông báo hoàn tiền" },
  { key: "promo", label: "Thông báo khuyến mãi" },
  { key: "ticket", label: "Thông báo hỗ trợ (ticket)" },
  { key: "system", label: "Thông báo hệ thống" },
];

export function parseNotifyPrefs(raw: string | null | undefined): Record<string, boolean> {
  const base: Record<string, boolean> = { order: true, deposit: true, refund: true, promo: true, system: true, ticket: true };
  try {
    if (raw) Object.assign(base, JSON.parse(raw));
  } catch {}
  return base;
}

function inferCategory(title: string, link?: string): NotifyCategory {
  const t = title.toLowerCase();
  if (t.includes("thiết bị mới") || t.includes("bảo mật") || t.includes("đăng nhập")) return "security";
  if (t.includes("hoàn tiền")) return "refund";
  if (link?.includes("nap-tien")) return "deposit";
  if (link?.includes("ticket") || link?.includes("ho-tro")) return "ticket";
  if (link?.includes("don-hang") || link?.includes("don-premium") || link?.includes("dat-hang")) return "order";
  return "system";
}

export async function notifyUser(userId: number, title: string, body: string, link?: string, category?: NotifyCategory) {
  try {
    const cat = category || inferCategory(title, link);
    if (cat !== "security") {
      const u = await prisma.user.findUnique({ where: { id: userId }, select: { notifyPrefs: true } });
      const prefs = parseNotifyPrefs(u?.notifyPrefs);
      if (prefs[cat] === false) return; // khách đã tắt loại thông báo này
    }
    await prisma.notification.create({ data: { userId, title: title.slice(0, 150), body: body.slice(0, 500), link } });
  } catch {}
}

export async function orderEvent(orderId: number, status: string, note?: string) {
  try {
    await prisma.orderEvent.create({ data: { orderId, status, note: note?.slice(0, 255) } });
  } catch {}
}

const NOTIFY_TITLES: Record<string, string> = {
  PROCESSING: "Đơn đang chạy",
  IN_PROGRESS: "Đơn đang chạy",
  COMPLETED: "Đơn hàng đã hoàn thành",
  PARTIAL: "Đơn hàng hoàn một phần",
  CANCELED: "Đơn hàng đã bị huỷ",
  REFUNDED: "Đơn hàng đã hoàn tiền",
};

/** Ghi sự kiện + (nếu là trạng thái đáng chú ý) gửi thông báo cho chủ đơn + bắn Webhook ra hệ thống ngoài của khách (nếu khách đã cấu hình webhookUrl) */
export async function orderTransition(order: { id: number; userId: number; code: string }, newStatus: string, note?: string) {
  await orderEvent(order.id, newStatus, note);
  if (newStatus === "COMPLETED") {
    try {
      const full = await prisma.smmOrder.findUnique({ where: { id: order.id }, select: { charge: true } });
      if (full) {
        const { awardPointsForSmmOrder } = await import("./points");
        await awardPointsForSmmOrder({ id: order.id, userId: order.userId, charge: full.charge, code: order.code });
      }
    } catch {}
  }
  const title = NOTIFY_TITLES[newStatus];
  if (title) {
    await notifyUser(order.userId, title, `Đơn ${order.code}: ${note || title}`, `/dashboard/don-hang/${order.id}`);
  }
  try {
    const u = await prisma.user.findUnique({ where: { id: order.userId }, select: { webhookUrl: true } });
    if (u?.webhookUrl) {
      await fetch(u.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "order.status_changed", code: order.code, status: newStatus, note: note || null, at: new Date().toISOString() }),
        signal: AbortSignal.timeout(5000),
      });
    }
  } catch {}
}
