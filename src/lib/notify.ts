import { prisma } from "./db";

/** Thông báo cho khách + lịch sử trạng thái đơn — mọi hàm đều best-effort:
 *  lỗi ghi thông báo KHÔNG bao giờ được làm hỏng luồng đơn hàng/chính sách tiền. */
export async function notifyUser(userId: number, title: string, body: string, link?: string) {
  try {
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
