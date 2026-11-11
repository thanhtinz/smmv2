import { getSettings } from "./settings";
import { decryptSecret } from "./secret-box";

/** Báo tin cho admin qua Telegram khi có sự kiện quan trọng (nạp thành công, ticket mới...). Best-effort, không bao giờ chặn luồng chính.
 *  Text cắt ở 4096 ký tự — giới hạn cứng của Bot API sendMessage. */
export async function notifyTelegram(text: string) {
  try {
    const s = await getSettings();
    if (s.telegram_notify !== "1" || !s.telegram_bot_token || !s.telegram_chat_id) return;
    await fetch(`https://api.telegram.org/bot${s.telegram_bot_token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: s.telegram_chat_id, text: text.slice(0, 4096) }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    /* bỏ qua lỗi mạng */
  }
}

export type TelegramBot = { id: string; name: string; token: string; chatId: string };

/** Danh sách bot Telegram phụ (theo dịch vụ) lưu ở settings telegram_bots (JSON). */
export function parseTelegramBots(json: string | undefined): TelegramBot[] {
  try {
    const arr = JSON.parse(json || "[]");
    if (!Array.isArray(arr)) return [];
    return arr.filter((b) => b && b.id && b.name).map((b) => ({ id: String(b.id), name: String(b.name), token: String(b.token || ""), chatId: String(b.chatId || "") }));
  } catch {
    return [];
  }
}

/** Báo đơn mới tới bot Telegram RIÊNG của dịch vụ (nếu dịch vụ được gán bot ở form dịch vụ). */
export async function notifyServiceBot(botId: string | null | undefined, text: string) {
  if (!botId) return;
  try {
    const s = await getSettings();
    const bot = parseTelegramBots(s.telegram_bots).find((b) => b.id === botId);
    if (!bot?.token || !bot?.chatId) return;
    await fetch(`https://api.telegram.org/bot${bot.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: bot.chatId, text: text.slice(0, 4096) }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    /* bỏ qua lỗi mạng */
  }
}

