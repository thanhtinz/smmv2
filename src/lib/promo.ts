import { prisma } from "./db";
import { moduleOn } from "./modules";

/** Kiểm tra mã giảm giá cho một đơn có tổng tiền `amount`. Trả số tiền được giảm hoặc ném lỗi hiển thị cho khách. */
export async function checkPromo(rawCode: string, scope: "SMM" | "PREMIUM", amount: number, panelId?: number | null) {
  const code = rawCode.trim().toUpperCase();
  if (!code) return null;
  // Mô-đun mã giảm giá đang tắt (web mẹ hoặc panel của người mua) -> không áp dụng mã nào
  if (!(await moduleOn("promo", panelId ?? null))) throw new Error("Tính năng mã giảm giá đang tạm tắt");
  const row = await prisma.discountCode.findUnique({ where: { code } });
  if (!row || !row.active) throw new Error(`Mã giảm giá "${code}" không hợp lệ`);
  // Mã riêng của panel con chỉ áp dụng cho đơn mua qua đúng panel đó
  if (row.panelId !== null && row.panelId !== (panelId ?? null)) throw new Error(`Mã giảm giá "${code}" không hợp lệ`);
  if (row.scope !== "ALL" && row.scope !== scope) throw new Error(`Mã "${code}" không áp dụng cho loại đơn này`);
  const now = new Date();
  if (row.startsAt && row.startsAt > now) throw new Error(`Mã "${code}" chưa đến thời gian áp dụng`);
  if (row.endsAt && row.endsAt < now) throw new Error(`Mã "${code}" đã hết hạn`);
  if (row.usageLimit > 0 && row.usedCount >= row.usageLimit) throw new Error(`Mã "${code}" đã hết lượt sử dụng`);
  if (amount < row.minOrder) throw new Error(`Mã "${code}" chỉ áp dụng cho đơn từ ${row.minOrder.toLocaleString("vi-VN")}đ`);
  let discount = row.type === "PERCENT" ? Math.floor((amount * row.value) / 100) : row.value;
  if (row.type === "PERCENT" && row.maxDiscount > 0) discount = Math.min(discount, row.maxDiscount);
  discount = Math.max(0, Math.min(discount, amount - 1));
  return { row, discount };
}

/** Ghi nhận 1 lượt dùng mã bên trong transaction của đơn: tăng lượt bằng
 *  update có điều kiện (usedCount < usageLimit) — hai đơn đồng thời ở lượt
 *  cuối cùng thì chỉ một đơn tăng được, đơn còn lại bị từ chối ngay. */
export async function consumePromo(tx: any, id: number) {
  const row = await tx.discountCode.findUnique({ where: { id } });
  if (!row) throw new Error("Mã giảm giá không còn tồn tại");
  if (row.usageLimit > 0) {
    const res = await tx.discountCode.updateMany({
      where: { id, usedCount: { lt: row.usageLimit } },
      data: { usedCount: { increment: 1 } },
    });
    if (res.count === 0) throw new Error("Mã giảm giá vừa hết lượt sử dụng — vui lòng thử lại");
  } else {
    await tx.discountCode.update({ where: { id }, data: { usedCount: { increment: 1 } } });
  }
}
