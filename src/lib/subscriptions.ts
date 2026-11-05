import { prisma } from "./db";
import { createSmmOrder } from "./orders";
import { notifyUser } from "./notify";
import { vnd } from "./format";

/**
 * Chạy các gói đăng ký định kỳ đã đến hạn (cron gọi):
 * - Đặt 1 đơn theo cấu hình của gói, tôn trọng trần ngân sách ngày và mục tiêu tổng —
 *   đạt mục tiêu thì tự tạm dừng; hết tiền / lỗi thì tạm dừng + báo khách.
 */
export async function processSubscriptions(limit = 20) {
  const now = new Date();
  const due = await prisma.subscription.findMany({
    where: { active: true, nextRunAt: { lte: now } },
    orderBy: { nextRunAt: "asc" },
    take: limit,
    include: { user: true, service: true },
  });
  const result = { checked: due.length, placed: 0, paused: 0, skippedBudget: 0, errors: 0 };
  const startDay = new Date(now); startDay.setHours(0, 0, 0, 0);

  for (const sub of due) {
    try {
      // Đủ số lượt (gói Schedule/Loop): đã chạy hết → tự dừng
      if (sub.totalRuns > 0 && sub.runs >= sub.totalRuns) {
        await prisma.subscription.update({ where: { id: sub.id }, data: { active: false, lastError: "Đã chạy đủ số lượt — tự tạm dừng" } });
        result.paused++;
        continue;
      }
      // Mục tiêu tổng: đã đạt → tự dừng
      if (sub.targetTotal > 0 && sub.deliveredQty >= sub.targetTotal) {
        await prisma.subscription.update({ where: { id: sub.id }, data: { active: false, lastError: "Đã đạt mục tiêu tổng — tự tạm dừng" } });
        await notifyUser(sub.userId, "Gói định kỳ đã đạt mục tiêu", `Gói ${sub.service.name} đã đặt đủ ${sub.targetTotal.toLocaleString("vi-VN")} và tự tạm dừng.`, "/dashboard/dinh-ky");
        result.paused++;
        continue;
      }
      // Số lượng lượt này: không vượt phần còn lại của mục tiêu
      let qty = sub.quantity;
      if (sub.targetTotal > 0) qty = Math.min(qty, sub.targetTotal - sub.deliveredQty);
      qty = Math.max(sub.service.min, Math.min(qty, sub.service.max));

      // Trần ngân sách ngày: cộng các đơn định kỳ hôm nay (của mọi gói của khách)
      if (sub.dailyBudget > 0) {
        const spent = await prisma.smmOrder.aggregate({
          where: { userId: sub.userId, subscriptionId: { not: null }, createdAt: { gte: startDay }, status: { notIn: ["REFUNDED", "CANCELED"] } },
          _sum: { charge: true },
        });
        const estimate = Math.round((sub.service.rate * qty) / 1000);
        if ((spent._sum.charge || 0) + estimate > sub.dailyBudget) {
          const tomorrow = new Date(startDay.getTime() + 86400000 + 3600000);
          await prisma.subscription.update({ where: { id: sub.id }, data: { nextRunAt: tomorrow, lastError: "Đã chạm trần ngân sách ngày — lùi sang mai" } });
          result.skippedBudget++;
          continue;
        }
      }

      const order = await createSmmOrder({
        user: sub.user as any,
        serviceId: sub.serviceId,
        link: sub.link,
        quantity: qty,
        subscriptionId: sub.id,
        note: "Đơn tự động từ gói định kỳ",
      });
      const reachedTarget = sub.targetTotal > 0 && sub.deliveredQty + qty >= sub.targetTotal;
      const reachedRuns = sub.totalRuns > 0 && sub.runs + 1 >= sub.totalRuns;
      const stepMs = sub.intervalMinutes > 0 ? sub.intervalMinutes * 60000 : sub.intervalDays * 86400000;
      await prisma.subscription.update({
        where: { id: sub.id },
        data: {
          runs: { increment: 1 },
          deliveredQty: { increment: qty },
          lastRunAt: now,
          lastError: null,
          active: !(reachedTarget || reachedRuns),
          nextRunAt: new Date(now.getTime() + stepMs),
        },
      });
      await notifyUser(sub.userId, "Gói định kỳ đã đặt đơn", `Đơn ${order.code} (${qty.toLocaleString("vi-VN")} × ${sub.service.name}) vừa được đặt tự động, trừ ${vnd(order.charge)}.`, `/dashboard/don-hang/${order.id}`);
      result.placed++;
    } catch (e: any) {
      result.errors++;
      const msg = String(e?.message || "Lỗi không rõ").slice(0, 240);
      // Thiếu số dư / dịch vụ bị tắt → tạm dừng để khách xử lý; lỗi khác → lùi 1 giờ thử lại
      const hard = /số dư|không đủ|tạm ngưng|không tồn tại/i.test(msg);
      await prisma.subscription.update({
        where: { id: sub.id },
        data: hard ? { active: false, lastError: msg } : { nextRunAt: new Date(Date.now() + 3600000), lastError: msg },
      });
      if (hard) {
        result.paused++;
        await notifyUser(sub.userId, "Gói định kỳ bị tạm dừng", `Gói ${sub.service.name} tạm dừng vì: ${msg}. Nạp tiền / kiểm tra lại rồi bật lại gói trong mục Đăng ký định kỳ.`, "/dashboard/dinh-ky");
      }
    }
  }
  return result;
}
