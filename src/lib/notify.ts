import { prisma } from "./db";

/** Thông báo cho khách — mọi hàm đều best-effort: lỗi ghi thông báo KHÔNG
 *  bao giờ được làm hỏng luồng đơn hàng/chính sách tiền. (orderEvent /
 *  orderTransition của đơn SMM đã gỡ cùng đợt tách web 2026-11-12.) */
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
  if (link?.includes("don-premium")) return "order";
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
