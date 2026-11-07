import { redirect } from "next/navigation";
import { prisma } from "./db";
import { getCurrentUser } from "./auth";
import type { ChildPanel, User } from "@prisma/client";

/** Phân quyền Panel Admin 2 tầng (như web mẹ ADMIN/STAFF):
 *  - CHỦ PANEL (ChildPanel.ownerId): toàn quyền trong panel của mình.
 *  - NHÂN VIÊN (PanelStaff): vào được Panel Admin nhưng chỉ xử lý đơn,
 *    trả lời ticket, xem khách hàng + thống kê; giá/tiền/cấu hình/nhân sự bị khoá. */
export type PanelAccess = { panel: ChildPanel; isOwner: boolean };

export async function getPanelAccess(userId: number): Promise<PanelAccess | null> {
  const own = await prisma.childPanel.findUnique({ where: { ownerId: userId } });
  if (own) return { panel: own, isOwner: true };
  const staff = await prisma.panelStaff.findFirst({
    where: { userId },
    include: { panel: true },
    orderBy: { id: "asc" },
  });
  if (staff) return { panel: staff.panel, isOwner: staff.role === "ADMIN" };
  return null;
}

/** Dùng trong các TRANG chỉ dành cho chủ panel: nhân viên bị đưa về Tổng quan panel kèm lý do. */
export async function requirePanelOwnerPage(): Promise<{ user: User; panel: ChildPanel; isOwner: true }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const acc = await getPanelAccess(user!.id);
  if (!acc) redirect("/dashboard/panel-cua-toi/thiet-lap");
  if (!acc!.isOwner) redirect("/panel-admin?err=" + encodeURIComponent("Chỉ chủ panel mới vào được mục này — tài khoản của bạn là Nhân viên panel"));
  return { user: user!, panel: acc!.panel, isOwner: true };
}

/** Dùng trong các trang cả nhân viên cũng xem được: trả về panel + cờ chủ/nhân viên. */
export async function requirePanelAccessPage(): Promise<{ user: User; panel: ChildPanel; isOwner: boolean }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const acc = await getPanelAccess(user!.id);
  if (!acc) redirect("/dashboard/panel-cua-toi/thiet-lap");
  return { user: user!, panel: acc!.panel, isOwner: acc!.isOwner };
}
