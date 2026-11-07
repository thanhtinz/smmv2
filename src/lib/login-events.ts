import { createHash } from "crypto";
import { prisma } from "./db";
import { notifyUser } from "./notify";

/** Ghi 1 sự kiện đăng nhập + phát hiện thiết bị mới.
 *  deviceHash = sha256(ip + userAgent). isNewDevice chỉ tính cho lần đăng nhập
 *  THÀNH CÔNG khi tài khoản chưa từng thành công từ thiết bị này trước đó.
 *  Thiết bị mới (và đã từng có lần đăng nhập thành công trước) -> chuông thông báo
 *  cảnh báo cho chính khách. Mọi lỗi ghi log đều nuốt — không làm hỏng luồng login. */
export function deviceHashOf(ip: string, userAgent: string): string {
  return createHash("sha256").update(`${ip}|${userAgent}`).digest("hex");
}

export async function recordLoginEvent(input: {
  userId?: number | null;
  username: string;
  success: boolean;
  reason?: string | null;
  ip: string;
  userAgent?: string | null;
  panelId?: number | null;
}): Promise<void> {
  try {
    const ua = (input.userAgent || "").slice(0, 400);
    const deviceHash = deviceHashOf(input.ip || "?", ua);
    let isNewDevice = false;
    if (input.success && input.userId) {
      const prior = await prisma.loginEvent.findFirst({
        where: { userId: input.userId, success: true },
        select: { id: true, deviceHash: true },
        orderBy: { id: "asc" },
      }).catch(() => null);
      if (!prior) {
        isNewDevice = true; // lần đăng nhập thành công đầu tiên được ghi nhận
      } else {
        const seen = await prisma.loginEvent.findFirst({
          where: { userId: input.userId, success: true, deviceHash },
          select: { id: true },
        }).catch(() => null);
        isNewDevice = !seen;
        if (isNewDevice) {
          await notifyUser(
            input.userId,
            "Cảnh báo bảo mật: đăng nhập từ thiết bị mới",
            `Tài khoản của bạn vừa đăng nhập từ thiết bị/IP mới (${input.ip}). Nếu không phải bạn, hãy đổi mật khẩu ngay và bật xác thực hai lớp (2FA).`,
            "/dashboard/ho-so?tab=security"
          );
        }
      }
    }
    await prisma.loginEvent.create({
      data: {
        userId: input.userId ?? null,
        username: input.username.slice(0, 80),
        success: input.success,
        reason: input.reason ? input.reason.slice(0, 255) : null,
        ip: (input.ip || "?").slice(0, 64),
        userAgent: ua || null,
        deviceHash,
        isNewDevice,
        panelId: input.panelId ?? null,
      },
    });
  } catch {
    /* best-effort */
  }
}
