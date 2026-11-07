import crypto from "crypto";
import { prisma } from "./db";
import { getSettings } from "./settings";
import { sendMail, smtpConfigured } from "./mailer";

/** Xác thực email (đợt bổ sung): token ngẫu nhiên chỉ lưu HASH sha256 trong DB,
 *  link sống 24 giờ. Không khoá tính năng của user chưa xác thực — chỉ gắn cờ + nhắc. */

export function siteBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export async function issueEmailVerification(user: { id: number; email: string; username: string }) {
  const token = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerifyToken: hash, emailVerifyExpiry: new Date(Date.now() + 24 * 3600 * 1000) },
  });
  const link = `${siteBaseUrl()}/verify-email?token=${token}`;
  try {
    if (await smtpConfigured()) {
      const s = await getSettings();
      await sendMail(
        [user.email],
        `Xác thực email tài khoản ${user.username} — ${s.site_name || "SMMv2"}`,
        `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
          <h2 style="color:#0f172a">Xác thực địa chỉ email</h2>
          <p>Chào ${user.username}, bấm nút bên dưới để xác thực email cho tài khoản của bạn. Liên kết có hiệu lực 24 giờ.</p>
          <p><a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600">Xác thực email</a></p>
          <p style="color:#64748b;font-size:13px">Nếu không bấm được, mở liên kết: ${link}</p>
        </div>`
      );
    }
  } catch {}
  return link;
}

export async function verifyEmailByToken(token: string): Promise<"ok" | "invalid" | "expired"> {
  if (!token || token.length < 20) return "invalid";
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const user = await prisma.user.findFirst({ where: { emailVerifyToken: hash } });
  if (!user) return "invalid";
  if (!user.emailVerifyExpiry || user.emailVerifyExpiry.getTime() < Date.now()) return "expired";
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true, emailVerifyToken: null, emailVerifyExpiry: null },
  });
  return "ok";
}
