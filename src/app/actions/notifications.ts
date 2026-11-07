"use server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export type BellItem = {
  id: number;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  at: string;
};

/** Dữ liệu cho chuông thông báo ở header: số chưa đọc + 12 thông báo mới nhất */
export async function getMyNotifications(): Promise<{ unread: number; items: BellItem[] }> {
  const user = await getCurrentUser();
  if (!user) return { unread: 0, items: [] };
  const [unread, rows] = await Promise.all([
    prisma.notification.count({ where: { userId: user.id, read: false } }),
    prisma.notification.findMany({ where: { userId: user.id }, orderBy: { id: "desc" }, take: 12 }),
  ]);
  return {
    unread,
    items: rows.map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, read: n.read, at: n.createdAt.toISOString() })),
  };
}

/** Mở chuông là đánh dấu tất cả đã đọc (giống trang Thông báo) */
export async function markAllMyNotificationsRead(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await prisma.notification.updateMany({ where: { userId: user.id, read: false }, data: { read: true } });
}
