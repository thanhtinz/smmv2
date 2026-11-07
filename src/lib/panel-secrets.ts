import { encryptSecret, decryptSecret } from "./secret-box";

/* Mã hoá secret dạng CỘT của ChildPanel (bảo mật Enterprise GĐ2).
   Trước GĐ2 các khoá này lưu dạng rõ trong DB — lộ DB là lộ toàn bộ khoá
   thanh toán/thư/báo tin của mọi website con.
   - Ghi: encryptPanelSecrets(data) bọc các trường secret bằng encryptSecret (tiền tố enc:).
   - Đọc: decryptPanelSecrets(panel) trả bản sao đã giải mã — áp ở các điểm lấy panel
     dùng cho vận hành (panel-access, panel-host, payments, webhook, mailer, ai...).
   - Tương thích ngược: giá trị KHÔNG có tiền tố enc: được coi là bản rõ cũ, đọc bình
     thường; lần lưu cấu hình kế tiếp sẽ tự thành bản mã hoá. Khi chưa đặt APP_ENC_KEY,
     encryptSecret giữ nguyên dạng rõ (hành vi cũ, không gãy). */

export const PANEL_SECRET_FIELDS = [
  "aiApiKey",
  "smtpPass",
  "telegramBotToken",
  "discordWebhook",
  "paypalSecret",
  "stripeSecretKey",
  "stripeWebhookSecret",
  "sepaySecret",
  "toolApiKey",
  "googleClientSecret",
] as const;

export type PanelSecretField = (typeof PANEL_SECRET_FIELDS)[number];

/** Bọc mã hoá các trường secret có mặt trong object data sắp ghi xuống DB */
export function encryptPanelSecrets<T extends Record<string, unknown>>(data: T): T {
  const out: Record<string, unknown> = { ...data };
  for (const f of PANEL_SECRET_FIELDS) {
    const v = out[f];
    if (typeof v === "string" && v) out[f] = encryptSecret(v);
  }
  return out as T;
}

/** Giải mã các trường secret trên bản ghi panel đọc từ DB (không sửa object gốc) */
export function decryptPanelSecrets<T extends Record<string, unknown>>(panel: T | null): T | null {
  if (!panel) return panel;
  const out: Record<string, unknown> = { ...panel };
  for (const f of PANEL_SECRET_FIELDS) {
    const v = out[f];
    if (typeof v === "string" && v) out[f] = decryptSecret(v);
  }
  return out as T;
}

/** Panel còn secret dạng rõ chưa mã hoá không (để admin biết cần bấm "mã hoá toàn bộ") */
export function panelHasPlaintextSecrets(panel: Record<string, unknown>): boolean {
  return PANEL_SECRET_FIELDS.some((f) => {
    const v = panel[f];
    return typeof v === "string" && v.length > 0 && !v.startsWith("enc:");
  });
}
