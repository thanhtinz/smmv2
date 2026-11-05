import nodemailer from "nodemailer";
import { getSettings } from "./settings";

export async function smtpConfigured() {
  const s = await getSettings();
  return !!(s.smtp_host && s.smtp_user && s.smtp_from);
}

export async function sendMail(to: string[], subject: string, html: string) {
  const s = await getSettings();
  if (!s.smtp_host || !s.smtp_user || !s.smtp_from) throw new Error("Chưa cấu hình SMTP — vào Admin → Cấu hình → tab Email để điền");
  const port = parseInt(s.smtp_port || "587");
  const transporter = nodemailer.createTransport({
    host: s.smtp_host,
    port,
    secure: s.smtp_secure === "1" || port === 465,
    auth: { user: s.smtp_user, pass: s.smtp_pass },
  });
  // Gửi theo lô BCC để không lộ danh sách người nhận
  for (let i = 0; i < to.length; i += 50) {
    const batch = to.slice(i, i + 50);
    await transporter.sendMail({ from: s.smtp_from, to: s.smtp_from, bcc: batch, subject, html });
  }
  return to.length;
}
