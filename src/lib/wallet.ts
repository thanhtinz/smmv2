import { prisma } from "./db";
import type { TxType } from "@prisma/client";

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
