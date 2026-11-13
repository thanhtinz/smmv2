import { prisma } from "./db";
import type { TxType } from "@prisma/client";
import { randomKey } from "./format";
import { DEFAULT_SETTINGS } from "./settings";

/**
 * Mọi biến động số dư PHẢI đi qua hàm này (trong transaction) để:
 * - trừ/cộng nguyên tử ở tầng DB, tránh trừ trùng / âm số dư khi chạy song song
 * - ghi sổ Transaction đối soát được
 */
export async function applyBalance(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  userId: number,
  amount: number, // + cộng, - trừ
  type: TxType,
  ref?: string,
  note?: string
) {
  // Cập nhật NGUYÊN TỬ ở tầng DB (increment + điều kiện balance >= số trừ ngay
  // trong mệnh đề WHERE): hai transaction đồng thời không còn cùng đọc một số
  // dư cũ rồi ghi đè nhau — trừ tiền khi số dư thật không đủ sẽ không khớp dòng
  // nào và bị từ chối. (Bản cũ đọc-sửa-ghi cho phép mua vượt số dư khi chạy song song.)
  if (amount < 0) {
    const res = await tx.user.updateMany({
      where: { id: userId, balance: { gte: -amount } },
      data: { balance: { increment: amount }, totalSpent: { increment: -amount } },
    });
    if (res.count === 0) {
      const exists = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!exists) throw new Error("Không tìm thấy người dùng");
      throw new Error("Số dư không đủ");
    }
  } else if (amount > 0) {
    const res = await tx.user.updateMany({
      where: { id: userId },
      data: {
        balance: { increment: amount },
        ...(type === "DEPOSIT" ? { totalDeposited: { increment: amount } } : {}),
      },
    });
    if (res.count === 0) throw new Error("Không tìm thấy người dùng");
  } else {
    const exists = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!exists) throw new Error("Không tìm thấy người dùng");
  }
  const fresh = await tx.user.findUnique({ where: { id: userId }, select: { balance: true } });
  const after = fresh!.balance;
  await tx.transaction.create({
    data: { userId, type, amount, balanceAfter: after, ref, note },
  });
  return after;
}

/** Hoa hồng giới thiệu (trang Giới thiệu bạn bè, kiểu thatim): hoa hồng tính trên
 *  GIAO DỊCH MUA của người được giới thiệu — gọi trong transaction tạo đơn
 *  (SMM + Premium). Từ 2026-11-12 hoa hồng cộng vào SỐ DƯ HOA HỒNG RIÊNG
 *  (User.affiliateBalance + sổ AffiliateTxn), KHÔNG vào thẳng ví chính như
 *  trước; khách rút về ví khi đủ mức tối thiểu (affiliate_withdraw_min). */
export async function creditReferralCommission(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  buyerId: number,
  amount: number,
  ref?: string
) {
  if (amount <= 0) return 0;
  const buyer = await tx.user.findUnique({ where: { id: buyerId }, select: { referredById: true, username: true } });
  if (!buyer?.referredById) return 0;
  const moduleRow = await tx.setting.findUnique({ where: { key: "module_affiliate" } });
  if (moduleRow?.value === "0") return 0;
  const row = await tx.setting.findUnique({ where: { key: "affiliate_percent" } });
  const pct = parseFloat(row?.value || DEFAULT_SETTINGS.affiliate_percent) || 0;
  if (pct <= 0) return 0;
  const commission = Math.floor((amount * pct) / 100);
  if (commission <= 0) return 0;
  const { applyAffiliateBalance } = await import("./affiliate");
  await applyAffiliateBalance(tx, buyer.referredById, commission, "EARN", {
    ref,
    note: `Hoa hồng giới thiệu — ${buyer.username} mua hàng`,
    fromUserId: buyerId,
  });
  return commission;
}

/** Thu hồi hoa hồng giới thiệu theo tỉ lệ số tiền đơn bị hoàn — trừ từ SỐ DƯ
 *  HOA HỒNG (best-effort, không chặn hoàn tiền của khách) */
export async function clawbackReferralCommission(buyerId: number, refundAmount: number, ref?: string) {
  if (refundAmount <= 0) return;
  const buyer = await prisma.user.findUnique({ where: { id: buyerId }, select: { referredById: true } });
  if (!buyer?.referredById) return;
  const row = await prisma.setting.findUnique({ where: { key: "affiliate_percent" } });
  const pct = parseFloat(row?.value || DEFAULT_SETTINGS.affiliate_percent) || 0;
  let due = Math.floor((refundAmount * pct) / 100);
  if (due <= 0) return;
  // Chỉ thu hồi tối đa phần hoa hồng THẬT SỰ đã cộng cho đơn này (ròng sau các lần thu hồi trước,
  // tính trên sổ hoa hồng mới + sổ ví cũ cho các đơn từ trước đợt tách số dư) —
  // tránh trường hợp đơn được đặt khi mô-đun affiliate tắt (không cộng) nhưng lúc hoàn vẫn bị thu.
  if (ref) {
    const [affNet, legacyNet] = await Promise.all([
      prisma.affiliateTxn.aggregate({
        where: { userId: buyer.referredById, ref, kind: { in: ["EARN", "CLAWBACK"] } },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: { userId: buyer.referredById, type: "REFERRAL_COMMISSION", ref },
        _sum: { amount: true },
      }),
    ]);
    const affDue = Math.min(due, Math.max(0, affNet._sum.amount || 0));
    const legacyDue = Math.min(due - affDue, Math.max(0, legacyNet._sum.amount || 0));
    if (affDue <= 0 && legacyDue <= 0) return;
    try {
      const { applyAffiliateBalance } = await import("./affiliate");
      await prisma.$transaction(async (tx) => {
        if (affDue > 0) {
          await applyAffiliateBalance(tx, buyer.referredById!, -affDue, "CLAWBACK", {
            ref,
            note: `Thu hồi hoa hồng — đơn ${ref || ""} hoàn tiền`,
            fromUserId: buyerId,
          });
        }
        if (legacyDue > 0) {
          await applyBalance(tx, buyer.referredById!, -legacyDue, "REFERRAL_COMMISSION", ref, `Thu hồi hoa hồng — đơn ${ref || ""} hoàn tiền`);
        }
      });
    } catch (e: any) {
      await prisma.apiLog.create({ data: { kind: "referral_commission", ref, ok: false, detail: `clawback failed ${due}: ${String(e?.message || e)}` } });
    }
    return;
  }
  try {
    const { applyAffiliateBalance } = await import("./affiliate");
    await prisma.$transaction(async (tx) => {
      await applyAffiliateBalance(tx, buyer.referredById!, -due, "CLAWBACK", {
        ref,
        note: `Thu hồi hoa hồng — đơn ${ref || ""} hoàn tiền`,
        fromUserId: buyerId,
      });
    });
  } catch (e: any) {
    await prisma.apiLog.create({ data: { kind: "referral_commission", ref, ok: false, detail: `clawback failed ${due}: ${String(e?.message || e)}` } });
  }
}

/** Mỗi tài khoản có 1 mã giới thiệu riêng — sinh lười cho tài khoản cũ khi cần dùng */
export async function ensureRefCode(userId: number): Promise<string> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { refCode: true } });
  if (u?.refCode) return u.refCode;
  const code = randomKey(8).toUpperCase();
  await prisma.user.update({ where: { id: userId }, data: { refCode: code } });
  return code;
}
