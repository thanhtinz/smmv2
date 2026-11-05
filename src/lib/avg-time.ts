import { prisma } from "@/lib/db";

/** Định dạng số phút trung bình thành chuỗi gọn: "35 phút", "2 giờ 15 phút", "1 ngày 3 giờ" */
export function formatAvgMinutes(total: number): string {
  const m = Math.max(1, Math.round(total));
  if (m < 60) return `${m} phút`;
  if (m < 1440) {
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r ? `${h} giờ ${r} phút` : `${h} giờ`;
  }
  const d = Math.floor(m / 1440);
  const h = Math.round((m % 1440) / 60);
  return h ? `${d} ngày ${h} giờ` : `${d} ngày`;
}

/**
 * Thời gian hoàn thành trung bình của từng dịch vụ, tính từ 10 đơn hoàn thành gần nhất
 * (mốc hoàn thành = sự kiện COMPLETED đầu tiên của đơn, trừ thời điểm tạo đơn).
 * Dịch vụ chưa có đơn hoàn thành nào thì không có trong Map — nơi gọi tự dùng giá trị dự phòng.
 */
export async function avgTimesFromRecentOrders(serviceIds: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (!serviceIds.length) return out;
  const events = await prisma.orderEvent.findMany({
    where: { status: "COMPLETED", order: { serviceId: { in: serviceIds } } },
    orderBy: { createdAt: "desc" },
    take: 3000,
    select: { orderId: true, createdAt: true, order: { select: { serviceId: true, createdAt: true } } },
  });
  const seenOrders = new Set<number>();
  const byService = new Map<number, number[]>();
  for (const e of events) {
    if (seenOrders.has(e.orderId)) continue;
    seenOrders.add(e.orderId);
    const sid = e.order.serviceId;
    const arr = byService.get(sid) || [];
    if (arr.length >= 10) continue;
    const mins = (e.createdAt.getTime() - e.order.createdAt.getTime()) / 60000;
    if (mins > 0) arr.push(mins);
    byService.set(sid, arr);
  }
  byService.forEach((arr, sid) => {
    if (arr.length) out.set(sid, formatAvgMinutes(arr.reduce((a, b) => a + b, 0) / arr.length));
  });
  return out;
}
