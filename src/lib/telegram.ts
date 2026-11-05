import { getSettings } from "./settings";

/** Báo tin cho admin qua Telegram khi có sự kiện quan trọng (nạp thành công, ticket mới...). Best-effort, không bao giờ chặn luồng chính. */
export async function notifyTelegram(text: string) {
  try {
    const s = await getSettings();
    if (s.telegram_notify !== "1" || !s.telegram_bot_token || !s.telegram_chat_id) return;
    await fetch(`https://api.telegram.org/bot${s.telegram_bot_token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: s.telegram_chat_id, text }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    /* bỏ qua lỗi mạng */
  }
}
