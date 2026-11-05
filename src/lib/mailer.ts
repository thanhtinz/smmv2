import nodemailer from "nodemailer";
import { getSettings } from "./settings";

export async function smtpConfigured() {
  const s = await getSettings();
  return !!(s.smtp_host && s.smtp_user && s.smtp_from);
}

export type SmtpOverride = { host: string; port?: string | null; user: string; pass?: string | null; from: string; secure?: boolean };

export async function sendMail(to: string[], subject: string, html: string, override?: SmtpOverride | null) {
  const s = await getSettings();
  const cfg = override
    ? { host: override.host, user: override.user, from: override.from, pass: override.pass || "", port: override.port || "587", secure: !!override.secure }
    : { host: s.smtp_host, user: s.smtp_user, from: s.smtp_from, pass: s.smtp_pass, port: s.smtp_port || "587", secure: s.smtp_secure === "1" };
  if (!cfg.host || !cfg.user || !cfg.from) throw new Error("Chưa cấu hình SMTP — vào Admin → Cấu hình → tab Email để điền");
  const port = parseInt(cfg.port || "587");
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port,
    secure: cfg.secure || port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
  });
  // Gửi theo lô BCC để không lộ danh sách người nhận
  for (let i = 0; i < to.length; i += 50) {
    const batch = to.slice(i, i + 50);
    await transporter.sendMail({ from: cfg.from, to: cfg.from, bcc: batch, subject, html });
  }
  return to.length;
}
