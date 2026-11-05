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
      body: JSON.stringify({ chat_id: bot.chatId, text }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    /* bỏ qua lỗi mạng */
  }
}

/** Báo tin cho CHỦ PANEL qua Telegram riêng của panel (nếu họ đã cấu hình trong Panel Admin → Cấu hình). */
export async function notifyPanelTelegram(panelId: number, text: string) {
  try {
    const { prisma } = await import("./db");
    const panel = await prisma.childPanel.findUnique({ where: { id: panelId }, select: { telegramBotToken: true, telegramChatId: true } });
    if (!panel?.telegramBotToken || !panel?.telegramChatId) return;
    await fetch(`https://api.telegram.org/bot${panel.telegramBotToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: panel.telegramChatId, text }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    /* bỏ qua lỗi mạng */
  }
}
