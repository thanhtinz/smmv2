import { prisma } from "./db";
import { getSettings } from "./settings";

/** Tích điểm (đợt bổ sung): cộng điểm khi đơn HOÀN THÀNH theo setting
 *  points_per_100k (điểm mỗi 100.000đ chi tiêu). Chống cộng trùng bằng
 *  claim PointsAwardClaim (ref unique ở DB) trong cùng transaction. */

async function award(userId: number, total: number, ref: string, label: string) {
  try {
    if (!userId || total <= 0) return;
    const s = await getSettings();
    const per = parseInt(s.points_per_100k || "1") || 0;
    if (per <= 0) return;
    const pts = Math.floor(total / 100000) * per;
    if (pts <= 0) return;
    // Claim nguyên tử ở DB TRƯỚC khi cộng (P3-03): insert
    // PointsAwardClaim (ref unique) + cộng điểm trong CÙNG
    // transaction — lượt song song thua unique-violation sẽ rollback
    // toàn bộ (kể cả điểm), lượt thắng commit cả hai. ApiLog giữ làm
    // dấu vết hiển thị như cũ.
    await prisma.$transaction(async (tx) => {
      await tx.pointsAwardClaim.create({ data: { ref, userId, points: pts } });
      await tx.user.update({ where: { id: userId }, data: { points: { increment: pts } } });
      await tx.apiLog.create({ data: { kind: "points_earn", ref, detail: `+${pts} điểm cho user ${userId} (${label})`, ok: true } });
    });
  } catch {}
}

export async function awardPointsForPremiumOrder(order: { id: number; userId: number; total: number; code: string }) {
  await award(order.userId, order.total, `premium-${order.id}`, `đơn Premium ${order.code}`);
}
