import { prisma } from "./db";
import { getSettings } from "./settings";
import { sendMail } from "./mailer";

/** Báo tin đa kênh cho admin web mẹ: Telegram / Discord / Email.
 *  Mỗi kênh bật/tắt riêng, chọn được sự kiện nào thì báo. Mọi hàm best-effort:
 *  lỗi gửi tin KHÔNG bao giờ làm hỏng luồng đơn hàng / tiền. */

export const ALERT_EVENTS: { key: string; label: string }[] = [
  { key: "premium_order", label: "Đơn Premium mới" },
  { key: "deposit_pending", label: "Yêu cầu nạp chờ duyệt" },
  { key: "deposit_success", label: "Nạp tiền thành công (tự động)" },
  { key: "ticket", label: "Ticket hỗ trợ mới" },
  { key: "new_user", label: "Khách đăng ký mới" },
  { key: "risk", label: "Đơn bị gắn cờ rủi ro" },
  { key: "low_balance", label: "Số dư nhà cung cấp sắp hết" },
];

export function eventEnabled(list: string | null | undefined, key: string) {
  if (!list || !list.trim()) return true; // trống = bật tất cả
  return list.split(",").map((x) => x.trim()).includes(key);
}

export async function sendDiscord(webhook: string, content: string) {
  const r = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: content.slice(0, 1900) }),
    signal: AbortSignal.timeout(6000),
  });
  if (!r.ok) throw new Error(`Discord trả lỗi ${r.status} — kiểm tra lại Webhook URL`);
}

export async function sendTelegramTo(botToken: string, chatId: string, text: string) {
  const r = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4000) }),
    signal: AbortSignal.timeout(6000),
  });
  if (!r.ok) throw new Error(`Telegram trả lỗi ${r.status} — kiểm tra lại Bot Token / Chat ID`);
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function alertEmailHtml(title: string, text: string) {
  const lines = text.split("\n").map((l) => `<p style="margin:4px 0;color:#334155;font-size:14px;line-height:1.55">${esc(l) || "&nbsp;"}</p>`).join("");
  return `<div style="font-family:Arial,sans-serif;background:#f1f5f9;padding:24px">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0">
      <div style="background:linear-gradient(90deg,#2563eb,#7c3aed);color:#fff;padding:16px 22px;font-size:17px;font-weight:700">${esc(title)}</div>
      <div style="padding:18px 22px">${lines}</div>
      <div style="padding:12px 22px;background:#f8fafc;color:#94a3b8;font-size:12px">Thông báo tự động từ hệ thống — không cần trả lời email này.</div>
    </div></div>`;
}

/** Báo tin cho ADMIN WEB MẸ qua các kênh đã bật (Telegram dùng cấu hình sẵn có). */
export async function alertMother(event: string, title: string, text: string) {
  try {
    const s = await getSettings();
    if (!eventEnabled(s.alert_events, event)) return;
    const jobs: Promise<any>[] = [];
    if (s.telegram_notify === "1" && s.telegram_bot_token && s.telegram_chat_id) {
      jobs.push(sendTelegramTo(s.telegram_bot_token, s.telegram_chat_id, `${title}\n${text}`).catch(() => {}));
    }
    if (s.alert_discord_enabled === "1" && s.alert_discord_webhook) {
      jobs.push(sendDiscord(s.alert_discord_webhook, `**${title}**\n${text}`).catch(() => {}));
    }
    if (s.alert_email_enabled === "1" && s.alert_email_to) {
      const to = s.alert_email_to.split(",").map((x) => x.trim()).filter(Boolean);
      if (to.length) jobs.push(sendMail(to, title, alertEmailHtml(title, text)).catch(() => {}));
    }
    await Promise.all(jobs);
  } catch {}
}

