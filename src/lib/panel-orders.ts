import { prisma } from "./db";

/** Mã đơn (SMM + Premium) của một panel — dùng để lọc nhật ký API theo phạm vi
 *  panel. Đặt ở lib (KHÔNG đặt trong file "use server"): hàm export trong file
 *  action sẽ thành endpoint gọi được từ client mà không qua kiểm tra đăng nhập. */
export async function panelOrderCodes(panelId: number): Promise<string[]> {
  const [a, b] = await Promise.all([
    prisma.smmOrder.findMany({ where: { panelId }, select: { code: true }, orderBy: { id: "desc" }, take: 2000 }),
    prisma.premiumOrder.findMany({ where: { panelId }, select: { code: true }, orderBy: { id: "desc" }, take: 2000 }),
  ]);
  return [...a.map((x) => x.code), ...b.map((x) => x.code)];
}
