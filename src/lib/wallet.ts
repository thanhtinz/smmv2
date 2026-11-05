import { prisma } from "./db";
import type { TxType } from "@prisma/client";
import { randomKey } from "./format";

/**
 * Mọi biến động số dư PHẢI đi qua hàm này (trong transaction) để:
 * - khoá dòng user, tránh trừ trùng / âm số dư
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
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("Không tìm thấy người dùng");
  const after = user.balance + amount;
  if (after < 0) throw new Error("Số dư không đủ");
  await tx.user.update({
    where: { id: userId },
    data: {
      balance: after,
      ...(amount > 0 && type === "DEPOSIT" ? { totalDeposited: { increment: amount } } : {}),
      ...(amount < 0 ? { totalSpent: { increment: -amount } } : {}),
    },
  });
  await tx.transaction.create({
    data: { userId, type, amount, balanceAfter: after, ref, note },
  });
  return after;
}

/** Hoa hồng giới thiệu (trang Kiếm tiền, kiểu thatim): hoa hồng tính trên GIAO DỊCH MUA
 *  của người được giới thiệu — gọi trong transaction tạo đơn (SMM + Premium). */
export async function creditReferralCommission(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  buyerId: number,
  amount: number,
  ref?: string
) {
  if (amount <= 0) return 0;
  const buyer = await tx.user.findUnique({ where: { id: buyerId }, select: { referredById: true, username: true, panelId: true } });
  if (!buyer?.referredById) return 0;
  const moduleRow = await tx.setting.findUnique({ where: { key: "module_affiliate" } });
  if (moduleRow?.value === "0") return 0;
  // Panel của người mua đã tắt mô-đun Kiếm tiền → không tính hoa hồng giới thiệu trong panel đó;
  // panel có % hoa hồng giới thiệu RIÊNG thì dùng % của panel.
  let panelAffPct: number | null = null;
  if (buyer.panelId) {
    const p = await tx.childPanel.findUnique({ where: { id: buyer.panelId }, select: { moduleAffiliate: true, affiliatePercent: true } });
    if (p && !p.moduleAffiliate) return 0;
    if (p?.affiliatePercent != null) panelAffPct = p.affiliatePercent;
  }
  const row = await tx.setting.findUnique({ where: { key: "affiliate_percent" } });
  const pct = panelAffPct != null ? panelAffPct : parseFloat(row?.value || "6") || 0;
  if (pct <= 0) return 0;
  const commission = Math.floor((amount * pct) / 100);
  if (commission <= 0) return 0;
  await applyBalance(tx, buyer.referredById, commission, "REFERRAL_COMMISSION", ref, `Hoa hồng giới thiệu — ${buyer.username} mua hàng`);
  return commission;
}

/** Thu hồi hoa hồng giới thiệu theo tỉ lệ số tiền đơn bị hoàn (best-effort, không chặn hoàn tiền của khách) */
export async function clawbackReferralCommission(buyerId: number, refundAmount: number, ref?: string) {
  if (refundAmount <= 0) return;
  const buyer = await prisma.user.findUnique({ where: { id: buyerId }, select: { referredById: true, panelId: true } });
  if (!buyer?.referredById) return;
  const row = await prisma.setting.findUnique({ where: { key: "affiliate_percent" } });
  let pct = parseFloat(row?.value || "6") || 0;
  if (buyer.panelId) {
    const p = await prisma.childPanel.findUnique({ where: { id: buyer.panelId }, select: { affiliatePercent: true } });
    if (p?.affiliatePercent != null) pct = p.affiliatePercent;
  }
  let due = Math.floor((refundAmount * pct) / 100);
  if (due <= 0) return;
  // Chỉ thu hồi tối đa phần hoa hồng THẬT SỰ đã cộng cho đơn này (ròng sau các lần thu hồi trước) —
  // tránh trường hợp đơn được đặt khi mô-đun affiliate tắt (không cộng) nhưng lúc hoàn vẫn bị thu.
  if (ref) {
    const net = await prisma.transaction.aggregate({
      where: { userId: buyer.referredById, type: "REFERRAL_COMMISSION", ref },
      _sum: { amount: true },
    });
    due = Math.min(due, Math.max(0, net._sum.amount || 0));
    if (due <= 0) return;
  }
  try {
    await prisma.$transaction(async (tx) => {
      await applyBalance(tx, buyer.referredById!, -due, "REFERRAL_COMMISSION", ref, `Thu hồi hoa hồng — đơn ${ref || ""} hoàn tiền`);
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
