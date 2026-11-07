import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "./db";
import { getCurrentUser, adminIpBlocked } from "./auth";
import { getSettings } from "./settings";
import type { ChildPanel, User } from "@prisma/client";

/** Bảo mật Enterprise GĐ1 cho Panel Admin (đồng bộ web mẹ):
 *  - Whitelist IP: kiến trúc settings hiện tại là TOÀN CỤC (chưa có setting riêng
 *    theo panel) nên áp whitelist toàn cục cho cả /panel-admin.
 *  - Bắt buộc 2FA: áp cho CHỦ panel và nhân viên vai ADMIN của panel (isOwner)
 *    khi setting admin_2fa_required đang bật và tài khoản chưa bật 2FA. */
export async function enforcePanelSecurity(user: User, isOwner: boolean) {
  const wl = await adminIpBlocked();
  if (wl.blocked) redirect("/admin-blocked");
  if (isOwner && !user.totpEnabled) {
    const s = await getSettings().catch(() => null);
    if (s?.admin_2fa_required !== "0") redirect("/dashboard/ho-so?tab=security&bat2fa=1");
  }
}

/** Phân quyền Panel Admin 2 tầng (như web mẹ ADMIN/STAFF):
 *  - CHỦ PANEL (ChildPanel.ownerId): toàn quyền trong panel của mình.
 *  - NHÂN VIÊN (PanelStaff): vào được Panel Admin nhưng chỉ xử lý đơn,
 *    trả lời ticket, xem khách hàng + thống kê; giá/tiền/cấu hình/nhân sự bị khoá.
 *  Một tài khoản có thể sở hữu/làm việc cho NHIỀU panel: panel đang quản trị được
 *  chọn qua cookie "smmv2-panel" (đặt bởi /api/panels/select hoặc bộ chọn trong
 *  Panel Admin); chưa chọn thì lấy panel sở hữu đầu tiên, rồi tới panel nhân viên. */
export type PanelAccess = { panel: ChildPanel; isOwner: boolean };

export const PANEL_COOKIE = "smmv2-panel";

/** Mọi panel tài khoản có quyền quản trị: panel sở hữu (isOwner=true) + panel làm nhân viên. */
export async function listAccessiblePanels(userId: number): Promise<PanelAccess[]> {
  const owned = await prisma.childPanel.findMany({ where: { ownerId: userId }, orderBy: { id: "asc" } });
  const staffRows = await prisma.panelStaff.findMany({
    where: { userId },
    include: { panel: true },
    orderBy: { id: "asc" },
  });
  const out: PanelAccess[] = owned.map((panel) => ({ panel, isOwner: true }));
  for (const r of staffRows) {
    if (!out.some((x) => x.panel.id === r.panelId)) out.push({ panel: r.panel, isOwner: r.role === "ADMIN" });
  }
  return out;
}

export async function getPanelAccess(userId: number): Promise<PanelAccess | null> {
  const all = await listAccessiblePanels(userId);
  if (!all.length) return null;
  let sel: number | null = null;
  try {
    sel = parseInt(cookies().get(PANEL_COOKIE)?.value || "") || null;
  } catch { /* ngoài request context */ }
  if (sel) {
    const hit = all.find((x) => x.panel.id === sel);
    if (hit) return hit;
  }
  return all[0];
}

/** Dùng trong các TRANG chỉ dành cho chủ panel: nhân viên bị đưa về Tổng quan panel kèm lý do. */
export async function requirePanelOwnerPage(): Promise<{ user: User; panel: ChildPanel; isOwner: true }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const acc = await getPanelAccess(user!.id);
  if (!acc) redirect("/dashboard/panel-cua-toi/thiet-lap");
  if (!acc!.isOwner) redirect("/panel-admin?err=" + encodeURIComponent("Chỉ chủ panel mới vào được mục này — tài khoản của bạn là Nhân viên panel"));
  await enforcePanelSecurity(user!, true);
  return { user: user!, panel: acc!.panel, isOwner: true };
}

/** Dùng trong các trang cả nhân viên cũng xem được: trả về panel + cờ chủ/nhân viên. */
export async function requirePanelAccessPage(): Promise<{ user: User; panel: ChildPanel; isOwner: boolean }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const acc = await getPanelAccess(user!.id);
  if (!acc) redirect("/dashboard/panel-cua-toi/thiet-lap");
  await enforcePanelSecurity(user!, acc!.isOwner);
  return { user: user!, panel: acc!.panel, isOwner: acc!.isOwner };
}
