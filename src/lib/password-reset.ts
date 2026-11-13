import crypto from "crypto";
import { prisma } from "./db";
import { getSettings, intSetting, siteUrlFromSettings } from "./settings";
import { sendMail, smtpConfigured } from "./mailer";
import { siteBaseUrl } from "./email-verify";
import { hashPassword } from "./password";
import { writeAudit } from "./audit";
import { notifyUser } from "./notify";

/** Quên mật khẩu (fix5): cùng khuôn với xác thực email (lib/email-verify.ts) —
 *  token ngẫu nhiên chỉ lưu HASH sha256 trong DB, link sống theo setting
 *  password_reset_ttl_minutes (mặc định 60 phút), dùng 1 lần.
 *  Yêu cầu mới GHI ĐÈ token cũ (token cũ tự mất hiệu lực). Chưa cấu hình SMTP thì
 *  KHÔNG gửi và KHÔNG báo lỗi — token vẫn được phát hành, trang vẫn trả lời chung
 *  chung như nhau để không lộ email nào có tài khoản. */

function sha256Hex(v: string): string {
  return crypto.createHash("sha256").update(v).digest("hex");
}

/** Phát hành token đặt lại cho email này. Trả link (plaintext chỉ ở đây + email);
 *  email không tồn tại hoặc tài khoản bị BANNED -> null (nơi gọi vẫn trả lời chung). */
export async function requestPasswordReset(email: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.status === "BANNED") return null;
  const s = await getSettings();
  const ttlMin = intSetting(s, "password_reset_ttl_minutes", 1, 10080);
  const token = crypto.randomBytes(32).toString("hex");
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordResetToken: sha256Hex(token), passwordResetExpiry: new Date(Date.now() + ttlMin * 60 * 1000) },
  });
  const link = `${siteUrlFromSettings(s) || siteBaseUrl()}/reset-password?token=${token}`;
  try {
    if (await smtpConfigured()) {
      await sendMail(
        [user.email],
        `Đặt lại mật khẩu tài khoản ${user.username} — ${s.site_name || "BNT Shop"}`,
        `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
          <h2 style="color:#0f172a">Đặt lại mật khẩu</h2>
          <p>Chào ${user.username}, bấm nút bên dưới để đặt mật khẩu mới cho tài khoản của bạn. Liên kết có hiệu lực ${ttlMin} phút và chỉ dùng được một lần.</p>
          <p><a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600">Đặt lại mật khẩu</a></p>
          <p style="color:#64748b;font-size:13px">Nếu không bấm được, mở liên kết: ${link}</p>
          <p style="color:#64748b;font-size:13px">Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này — mật khẩu của bạn vẫn không thay đổi.</p>
        </div>`
      );
    }
  } catch {}
  return link;
}

export type ResetTokenState =
  | { state: "ok"; userId: number; username: string }
  | { state: "invalid" | "expired" };

/** Kiểm tra token (CHỈ ĐỌC — không tiêu thụ): dùng khi render trang đặt lại. */
export async function checkPasswordResetToken(token: string): Promise<ResetTokenState> {
  if (!token || token.length < 20) return { state: "invalid" };
  const user = await prisma.user.findFirst({
    where: { passwordResetToken: sha256Hex(token) },
    select: { id: true, username: true, passwordResetExpiry: true },
  });
  if (!user) return { state: "invalid" };
  if (!user.passwordResetExpiry || user.passwordResetExpiry.getTime() < Date.now()) return { state: "expired" };
  return { state: "ok", userId: user.id, username: user.username };
}

/** Tiêu thụ token + đặt mật khẩu mới (Argon2id qua hashPassword). Kèm theo:
 *  tăng sessionVersion + thu hồi mọi UserSession (đăng xuất mọi thiết bị — đúng
 *  như changePasswordAction), ghi AuditLog và chuông cảnh báo bảo mật cho khách. */
export async function resetPasswordByToken(
  token: string,
  newPassword: string,
  ip: string
): Promise<"ok" | "invalid" | "expired"> {
  const chk = await checkPasswordResetToken(token);
  if (chk.state !== "ok") return chk.state;
  const newHash = await hashPassword(newPassword);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: chk.userId },
      data: { passwordHash: newHash, passwordResetToken: null, passwordResetExpiry: null, sessionVersion: { increment: 1 } },
    });
    await tx.userSession.updateMany({ where: { userId: chk.userId, revokedAt: null }, data: { revokedAt: new Date() } });
  });
  const u = await prisma.user.findUnique({ where: { id: chk.userId }, select: { username: true, role: true } }).catch(() => null);
  await writeAudit({
    actorId: chk.userId,
    actorName: u?.username || chk.username,
    role: u?.role || "USER",
    action: "user.password_reset",
    targetType: "user",
    targetId: chk.userId,
    detail: "Đặt lại mật khẩu qua email (quên mật khẩu) — mọi phiên đăng nhập đã bị thu hồi",
    ip,
  }).catch(() => {});
  await notifyUser(
    chk.userId,
    "Mật khẩu đã được đặt lại",
    "Mật khẩu tài khoản của bạn vừa được đặt lại qua liên kết email và mọi phiên đăng nhập trước đó đã bị đăng xuất. Nếu không phải bạn, hãy liên hệ hỗ trợ ngay.",
    "/dashboard/ho-so?tab=security",
    "security"
  );
  return "ok";
}
