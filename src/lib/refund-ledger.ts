import { prisma } from "./db";
import { applyBalance } from "./wallet";
import type { PremiumOrder } from "@prisma/client";

/**
 * Sổ hoàn tiền theo đơn (full-audit 3d1309c P2-01).
 *
 * Trước bản này, một đơn FZR nhiều lượt (Telegram Premium) được hoàn một
 * phần ở bước thực thi rồi vẫn có thể bị hoàn TOÀN BỘ ở poll/admin huỷ —
 * khách nhận vượt số đã trả. Nay PremiumOrder mang refundedAmount +
 * refundedUnits; mọi đường hoàn đều qua creditOrderRefund để:
 *   - số cộng thật = min(mong muốn, total - refundedAmount);
 *   - sổ tăng nguyên tử trong CÙNG transaction với lần cộng ví;
 *   - trả kho cũng chỉ trả phần đơn vị chưa từng hoàn/trả.
 * Tính nguyên tử theo đơn được bảo đảm thêm bởi các claim trạng thái/CAS
 * vốn đã gác từng đường hoàn (claim thực thi FZR, claim chuyển REFUNDED
 * ở poll/admin/đồng bộ) — chỉ một lượt thắng claim mới tới được đây.
 */
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export function refundableOf(order: Pick<PremiumOrder, "total" | "refundedAmount">): number {
  return Math.max(0, order.total - (order.refundedAmount || 0));
}

export async function creditOrderRefund(
  tx: Tx,
  order: Pick<PremiumOrder, "id" | "userId" | "code" | "total" | "refundedAmount">,
  want: number,
  opts: { reason: string; units?: number }
): Promise<number> {
  const amount = Math.min(Math.max(0, want), refundableOf(order));
  if (amount <= 0) return 0;
  await tx.premiumOrder.update({
    where: { id: order.id },
    data: {
      refundedAmount: { increment: amount },
      ...(opts.units ? { refundedUnits: { increment: opts.units } } : {}),
    },
  });
  await applyBalance(tx, order.userId, amount, "REFUND", order.code, opts.reason);
  return amount;
}
