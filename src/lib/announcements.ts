import { prisma } from "./db";

/**
 * Thông báo dạng timeline theo ngày: web mẹ đăng ở Admin → Thông báo,
 * panel con đăng ở Panel Admin → Thông báo khách. Khách của panel thấy
 * thông báo của panel mình; panel chưa đăng gì thì thấy của web mẹ.
 */
export async function getAnnouncementsFor(panelId: number | null, limit = 30) {
  const orderBy = [{ createdAt: "desc" as const }, { id: "desc" as const }];
  if (panelId) {
    const own = await prisma.announcement.findMany({
      where: { panelId, active: true },
      orderBy,
      take: limit,
    });
    if (own.length > 0) return own;
  }
  return prisma.announcement.findMany({
    where: { panelId: null, active: true },
    orderBy,
    take: limit,
  });
}

export type AnnouncementItemDTO = { id: number; title: string; body: string; time: string };
export type AnnouncementGroupDTO = { label: string; items: AnnouncementItemDTO[] };

const TZ = "Asia/Ho_Chi_Minh";
const dayFmt = new Intl.DateTimeFormat("vi-VN", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("vi-VN", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });

/** Gom danh sách thông báo (đã xếp mới nhất trước) thành các nhóm theo ngày. */
export function groupAnnouncements(rows: { id: number; title: string; body: string; createdAt: Date }[]): AnnouncementGroupDTO[] {
  const now = new Date();
  const todayKey = dayFmt.format(now);
  const yKey = dayFmt.format(new Date(now.getTime() - 86400000));
  const groups: AnnouncementGroupDTO[] = [];
  for (const r of rows) {
    const d = dayFmt.format(r.createdAt);
    const label = d === todayKey ? `Hôm nay · ${d}` : d === yKey ? `Hôm qua · ${d}` : d;
    const item = { id: r.id, title: r.title, body: r.body, time: timeFmt.format(r.createdAt) };
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}
