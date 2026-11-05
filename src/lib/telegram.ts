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
