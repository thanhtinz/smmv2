import { getSettings } from "./settings";

/* Khoá khẩn cấp toàn hệ thống (bảo mật Enterprise GĐ2 — Emergency Lockdown).
   Khi bật (setting emergency_lockdown = "1"):
   - Khách thường KHÔNG đăng nhập mới được, KHÔNG đặt đơn / nạp tiền / mua Premium.
   - Người đã đăng nhập vẫn xem được dữ liệu của mình.
   - ADMIN/STAFF vẫn đăng nhập/quản trị bình thường để xử lý và tắt khoá. */

export async function lockdownState(): Promise<{ on: boolean; reason: string }> {
  const s = await getSettings().catch(() => null);
  return { on: s?.emergency_lockdown === "1", reason: (s?.lockdown_reason || "").trim() };
}

export function lockdownMessage(reason: string): string {
  return "Hệ thống đang tạm khoá khẩn cấp" + (reason ? `: ${reason}` : "") + ". Vui lòng quay lại sau.";
}

/** Ai được miễn khoá: quản trị web mẹ */
export async function userCanBypassLockdown(user: { id: number; role: string }): Promise<boolean> {
  return user.role === "ADMIN" || user.role === "STAFF";
}

/** Chốt chặn cho các action tiền/đơn khi lockdown: khách thường bị chặn, quản trị được miễn */
export async function assertActionAllowed(user: { id: number; role: string }): Promise<void> {
  const ld = await lockdownState();
  if (!ld.on) return;
  if (await userCanBypassLockdown(user)) return;
  throw new Error(lockdownMessage(ld.reason));
}
