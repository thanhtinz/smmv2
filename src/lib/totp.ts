/** TOTP RFC 6238 tự cài bằng node crypto — không thêm dependency.
 *  HMAC-SHA1, chu kỳ 30 giây, 6 chữ số, cửa sổ chấp nhận ±1 chu kỳ (lệch giờ nhẹ).
 *  Secret lưu dạng base32 (chuẩn các app Authenticator: Google/Microsoft/Authy). */
import { createHmac, randomBytes } from "crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (let i = 0; i < buf.length; i++) {
    const byte = buf[i];
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, "").replace(/[\s-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Secret mới: 20 byte ngẫu nhiên -> 32 ký tự base32 */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(code % 1_000_000).padStart(6, "0");
}

/** Mã TOTP hiện tại của secret (dùng cho test/kiểm chứng) */
export function totpNow(secretBase32: string, atMs = Date.now()): string {
  return hotp(base32Decode(secretBase32), Math.floor(atMs / 30000));
}

/** Kiểm mã: đúng trong cửa sổ ±1 chu kỳ quanh thời điểm hiện tại */
export function verifyTotp(secretBase32: string, code: string, atMs = Date.now()): boolean {
  const clean = String(code || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  let secret: Buffer;
  try {
    secret = base32Decode(secretBase32);
  } catch {
    return false;
  }
  if (!secret.length) return false;
  const counter = Math.floor(atMs / 30000);
  for (const d of [-1, 0, 1]) {
    if (hotp(secret, counter + d) === clean) return true;
  }
  return false;
}

/** otpauth:// URI để app Authenticator quét/nhập — issuer = tên site, label = username */
export function otpauthUri(secretBase32: string, username: string, issuer: string): string {
  const iss = encodeURIComponent(issuer || "SMMv2");
  const label = encodeURIComponent(`${issuer || "SMMv2"}:${username}`);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${iss}&algorithm=SHA1&digits=6&period=30`;
}

/** 8 mã dự phòng dạng XXXX-XXXX (chữ + số, bỏ ký tự dễ nhầm) */
export function generateBackupCodes(count = 8): string[] {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = randomBytes(8);
    let s = "";
    for (let j = 0; j < bytes.length; j++) s += alphabet[bytes[j] % alphabet.length];
    codes.push(`${s.slice(0, 4)}-${s.slice(4)}`);
  }
  return codes;
}

export function normalizeBackupCode(code: string): string {
  return String(code || "").toUpperCase().replace(/[\s-]/g, "");
}
