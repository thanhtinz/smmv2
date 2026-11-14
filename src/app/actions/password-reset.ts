"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requestPasswordReset, resetPasswordByToken } from "@/lib/password-reset";
import { rateLimitExceeded, rateLimitExceededShared, clientIp } from "@/lib/rate-limit";
import { passwordError } from "@/lib/security";
import { getSettings } from "@/lib/settings";

function back(path: string, key: "msg" | "err", text: string): never {
  redirect(`${path}?${key}=${encodeURIComponent(text)}`);
}

const GENERIC_OK = "Nếu email này có trong hệ thống, chúng tôi đã gửi liên kết đặt lại mật khẩu. Hãy kiểm tra hộp thư của bạn.";

/** Yêu cầu đặt lại mật khẩu: LUÔN trả lời chung chung như nhau (email có hay
 *  không có tài khoản, bị chặn spam hay không) — không lộ thông tin tồn tại. */
export async function forgotPasswordAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const ip = clientIp((await headers()));
  // Giới hạn phát hành token bằng chính rate-limit.ts của hệ thống (theo IP +
  // theo email); vượt hạn thì bỏ qua lặng lẽ, câu trả lời không thay đổi.
  const overIp = rateLimitExceeded(`pwreset-ip|${ip}`, 10, 3600000) || (await rateLimitExceededShared(`pwreset-ip|${ip}`, 10, 3600000));
  const overMail = rateLimitExceeded(`pwreset-mail|${email}`, 3, 3600000) || (await rateLimitExceededShared(`pwreset-mail|${email}`, 3, 3600000));
  if (!overIp && !overMail && /^\S+@\S+\.\S+$/.test(email)) {
    await requestPasswordReset(email).catch(() => null);
  }
  back("/forgot-password", "msg", GENERIC_OK);
}

/** Đặt mật khẩu mới từ link email. Token sai/hết hạn/đã dùng -> quay lại trang
 *  đặt lại, trang tự render trạng thái lỗi trong thẻ (không 500, không lộ vết). */
export async function resetPasswordAction(formData: FormData) {
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirmPassword") || "");
  const ip = clientIp((await headers()));
  const self = (key: "msg" | "err", text: string): never =>
    redirect(`/reset-password?token=${encodeURIComponent(token)}&${key}=${encodeURIComponent(text)}`);
  if (rateLimitExceeded(`pwreset-confirm|${ip}`, 10, 5 * 60 * 1000) || (await rateLimitExceededShared(`pwreset-confirm|${ip}`, 10, 5 * 60 * 1000)))
    back("/login", "err", "Thao tác quá nhanh, vui lòng thử lại sau ít phút");
  if (confirm && confirm !== password) self("err", "Mật khẩu nhập lại không khớp, vui lòng kiểm tra lại.");
  const pwErr = passwordError(password, await getSettings());
  if (pwErr) self("err", pwErr);
  const r = await resetPasswordByToken(token, password, ip).catch(() => "invalid" as const);
  if (r !== "ok") redirect(`/reset-password?token=${encodeURIComponent(token)}`);
  back("/login", "msg", "Đã đặt lại mật khẩu thành công. Vui lòng đăng nhập bằng mật khẩu mới.");
}
