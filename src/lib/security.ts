import { prisma } from "./db";
import { getSettings } from "./settings";

/** Chính sách mật khẩu dùng chung: độ dài tối thiểu + tuỳ chọn bắt buộc chữ hoa / số / ký tự đặc biệt. */
export function passwordError(password: string, s: Record<string, string>): string | null {
  const min = parseInt(s.password_min_length || "6") || 6;
  if (password.length < min) return `Mật khẩu tối thiểu ${min} ký tự`;
  if (s.pw_require_upper === "1" && !/[A-ZÀ-Ỹ]/.test(password)) return "Mật khẩu phải có ít nhất 1 chữ hoa";
  if (s.pw_require_number === "1" && !/[0-9]/.test(password)) return "Mật khẩu phải có ít nhất 1 chữ số";
  if (s.pw_require_special === "1" && !/[^A-Za-z0-9À-ỹ]/.test(password)) return "Mật khẩu phải có ít nhất 1 ký tự đặc biệt";
  return null;
}

/* ---------- Chống brute-force đăng nhập ---------- */

function throttleKey(ip: string, username: string) {
  return `${ip || "?"}|${username.toLowerCase()}`;
}

/** Trả về số giây còn bị khoá (0 = không khoá). */
export async function loginLockSeconds(ip: string, username: string): Promise<number> {
  const s = await getSettings();
  if (s.bf_enabled !== "1") return 0;
  const row = await prisma.loginThrottle.findUnique({ where: { key: throttleKey(ip, username) } });
  if (row?.lockedUntil && row.lockedUntil.getTime() > Date.now()) return Math.ceil((row.lockedUntil.getTime() - Date.now()) / 1000);
  return 0;
}

export async function recordLoginFail(ip: string, username: string) {
  const s = await getSettings();
  if (s.bf_enabled !== "1") return;
  const max = Math.max(3, parseInt(s.bf_max_attempts || "10") || 10);
  const lockSec = Math.max(30, parseInt(s.bf_lock_seconds || "300") || 300);
  const key = throttleKey(ip, username);
  const row = await prisma.loginThrottle.upsert({
    where: { key },
    create: { key, fails: 1 },
    update: { fails: { increment: 1 } },
  });
  if (row.fails >= max) {
    await prisma.loginThrottle.update({ where: { key }, data: { fails: 0, lockedUntil: new Date(Date.now() + lockSec * 1000) } });
  }
}

export async function clearLoginFails(ip: string, username: string) {
  await prisma.loginThrottle.deleteMany({ where: { key: throttleKey(ip, username) } });
}

/* ---------- Bảo mật đăng ký ---------- */

const BUILTIN_DISPOSABLE = ["mailinator.com", "yopmail.com", "temp-mail.com", "tempmail.com", "throwawaymail.com", "guerrillamail.com", "10minutemail.com", "fakeinbox.com", "sharklasers.com", "getnada.com"];

/** Email dùng 1 lần: chặn khi admin bật reg_block_disposable (danh sách gốc + danh sách admin thêm). */
export function isDisposableEmail(email: string, s: Record<string, string>): boolean {
  if (s.reg_block_disposable !== "1") return false;
  const domain = email.split("@")[1]?.toLowerCase() || "";
  if (BUILTIN_DISPOSABLE.includes(domain)) return true;
  const extra = (s.reg_banned_domains || "").split(/[\n,]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  return extra.includes(domain);
}

/** Giới hạn số tài khoản đăng ký từ 1 IP trong 1 giờ (0 = không giới hạn). */
export async function regIpExceeded(ip: string): Promise<boolean> {
  const s = await getSettings();
  const max = parseInt(s.reg_max_per_ip_hour || "0") || 0;
  if (!ip || max <= 0) return false;
  const since = new Date(Date.now() - 3600 * 1000);
  const n = await prisma.regAttempt.count({ where: { ip, createdAt: { gt: since } } });
  return n >= max;
}

export async function recordRegAttempt(ip: string) {
  if (!ip) return;
  await prisma.regAttempt.create({ data: { ip } });
}

/* ---------- reCAPTCHA v2 ---------- */

/** Kiểm token reCAPTCHA với Google. Trả true khi: tắt/không áp dụng, hoặc Google xác nhận hợp lệ. */
export async function verifyRecaptcha(token: string | null, apply: boolean): Promise<boolean> {
  const s = await getSettings();
  if (s.recaptcha_enabled !== "1" || !apply || !s.recaptcha_secret || !s.recaptcha_site_key) return true;
  if (!token) return false;
  try {
    const r = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: s.recaptcha_secret, response: token }),
      signal: AbortSignal.timeout(6000),
    });
    const j: any = await r.json();
    return !!j.success;
  } catch {
    return false;
  }
}
