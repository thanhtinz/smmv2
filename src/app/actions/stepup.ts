"use server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser, createStepUp } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { verifyLoginCode } from "@/lib/twofa";
import { headers } from "next/headers";
import { clientIp, rateLimitExceeded } from "@/lib/rate-limit";

function back(next: string, text: string): never {
  redirect(`/step-up?next=${encodeURIComponent(next)}&err=${encodeURIComponent(text)}`);
}

function safeNext(raw: string): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw.slice(0, 300);
}

/** Xác thực lại (step-up, GĐ2): mật khẩu hiện tại + mã 2FA nếu tài khoản đã bật.
 *  Qua được -> cookie ký hạn 10 phút, quay về trang đích để người dùng làm lại thao tác. */
export async function verifyStepUpAction(formData: FormData) {
  const user0 = await getCurrentUser();
  if (!user0) redirect("/login");
  const next = safeNext(String(formData.get("next") || "/dashboard"));
  const ip = clientIp(headers());
  if (rateLimitExceeded(`stepup|${user0.id}|${ip}`, 10, 5 * 60 * 1000)) back(next, "Thử lại quá nhiều lần, vui lòng đợi ít phút");
  const user = await prisma.user.findUnique({ where: { id: user0.id } });
  if (!user) redirect("/login");
  const password = String(formData.get("password") || "");
  if (!(await verifyPassword(user.passwordHash, password))) back(next, "Mật khẩu hiện tại không đúng");
  if (user.totpEnabled) {
    const code = String(formData.get("code") || "").trim();
    if (!code) back(next, "Tài khoản đã bật 2FA — cần nhập thêm mã xác thực");
    const kind = await verifyLoginCode(user, code).catch(() => null);
    if (!kind) back(next, "Mã xác thực 2FA không đúng");
  }
  await createStepUp(user.id);
  redirect(next);
}
