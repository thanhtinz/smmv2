/** Mã hoá các khoá bí mật lưu trong bảng Setting (secret cổng thanh toán, token
 *  bot, khoá API...) bằng AES-256-GCM với khoá APP_ENC_KEY trong .env.
 *  - P3-01 (audit 2026-11-13): môi trường production mà CHƯA đặt APP_ENC_KEY
 *    thì encryptSecret NÉM LỖI — thà lưu khoá bí mật lỗi công khai còn hơn âm
 *    thầm lưu dạng rõ vào DB. Ngoài production (dev/test) vẫn giữ fallback
 *    dạng rõ cho tiện phát triển.
 *  - Giá trị cũ dạng rõ vẫn đọc được (chỉ giá trị có tiền tố "enc:" mới giải mã).
 *  - Từ nay mọi lần lưu qua setSetting() đều tự mã hoá. */

function loadKey(): Buffer | null {
  const raw = process.env.APP_ENC_KEY || "";
  if (!raw) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require("crypto") as typeof import("crypto");
    const buf = Buffer.from(raw, "base64");
    return buf.length === 32 ? buf : crypto.createHash("sha256").update(raw).digest();
  } catch {
    return null;
  }
}
const KEY = loadKey();

export function isSecretSettingKey(key: string): boolean {
  return /(secret|token|api_key|apikey|_pass|passwd)/i.test(key) || key === "telegram_bots";
}

export function encryptSecret(value: string): string {
  if (!KEY) {
    if (value && !value.startsWith("enc:") && process.env.NODE_ENV === "production") {
      throw new Error("Thiếu APP_ENC_KEY trong .env — không lưu khoá bí mật dạng rõ ở production. Hãy đặt APP_ENC_KEY (base64 của 32 byte) rồi thử lại.");
    }
    return value;
  }
  if (!value || value.startsWith("enc:")) return value;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require("crypto") as typeof import("crypto");
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
    const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return "enc:" + Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
  } catch {
    return value;
  }
}

export function decryptSecret(value: string): string {
  if (!KEY || !value || !value.startsWith("enc:")) return value;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require("crypto") as typeof import("crypto");
    const buf = Buffer.from(value.slice(4), "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return value;
  }
}
