import { prisma } from "./db";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export type AffiliateTxnKind = "EARN" | "CLAWBACK" | "WITHDRAW";

/**
 * Mọi biến động SỐ DƯ HOA HỒNG phải đi qua hàm này (trong transaction):
 * cộng/trừ nguyên tử ở tầng DB (increment + điều kiện balance >= số trừ
 * trong WHERE, giống applyBalance của ví chính) và ghi sổ AffiliateTxn
 * đối soát được. Số dư hoa hồng là số dư RIÊNG — chỉ về ví chính khi
 * khách rút (withdrawAffiliate).
 */
export async function applyAffiliateBalance(
  tx: Tx,
  userId: number,
  amount: number, // + cộng, - trừ
  kind: AffiliateTxnKind,
  opts?: { ref?: string; note?: string; fromUserId?: number }
) {
  if (amount < 0) {
    const res = await tx.user.updateMany({
      where: { id: userId, affiliateBalance: { gte: -amount } },
      data: { affiliateBalance: { increment: amount } },
    });
    if (res.count === 0) {
      const exists = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!exists) throw new Error("Không tìm thấy người dùng");
      throw new Error("Số dư hoa hồng không đủ");
    }
  } else if (amount > 0) {
    const res = await tx.user.updateMany({
      where: { id: userId },
      data: { affiliateBalance: { increment: amount } },
    });
    if (res.count === 0) throw new Error("Không tìm thấy người dùng");
  } else {
    const exists = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!exists) throw new Error("Không tìm thấy người dùng");
  }
  const fresh = await tx.user.findUnique({ where: { id: userId }, select: { affiliateBalance: true } });
  const after = fresh!.affiliateBalance;
  await tx.affiliateTxn.create({
    data: { userId, kind, amount, balanceAfter: after, ref: opts?.ref, note: opts?.note, fromUserId: opts?.fromUserId },
  });
  return after;
}

/** Mức rút tối thiểu (VND) từ cấu hình admin; mặc định 10.000đ. */
export function affiliateWithdrawMin(settings: Record<string, string>): number {
  const n = parseInt(settings.affiliate_withdraw_min || "10000");
  return Number.isFinite(n) && n > 0 ? n : 10000;
}

export const AFF_COOKIE_REF = "aff_ref"; // mã giới thiệu chờ (first-touch, 30 ngày)
export const AFF_COOKIE_VID = "aff_vid"; // định danh khách thăm để chống đếm trùng click (1 năm)

/** Khoá ngày giờ Việt Nam (YYYY-MM-DD) cho chống trùng click theo ngày. */
export function affDayKey(d = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
}
