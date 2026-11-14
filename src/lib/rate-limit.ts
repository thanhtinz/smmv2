/** Giới hạn tần suất theo khoá (IP / tài khoản / API key) bằng bộ nhớ trong
 *  tiến trình — đủ cho mô hình chạy 1 tiến trình trên VPS. Trả về true khi
 *  yêu cầu này VƯỢT giới hạn và phải bị chặn.
 *  LƯU Ý (P3-02 audit 2026-11-13): bộ đếm này KHÔNG chia sẻ giữa các
 *  tiến trình — các giới hạn BẢO MẬT (reset mật khẩu, 2FA, API v2,
 *  step-up) đã có thêm lớp DB dùng chung rateLimitExceededShared bên
 *  dưới (full-audit a75d260 P3-02); các giới hạn thao tác theo người
 *  dùng ở actions/user.ts giữ lớp bộ nhớ này là đủ. */

type Store = Map<string, number[]>;
const g = globalThis as unknown as { __smmRateLimit?: Store };
if (!g.__smmRateLimit) g.__smmRateLimit = new Map();
const store: Store = g.__smmRateLimit;

export function rateLimitExceeded(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (store.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  store.set(key, arr);
  if (store.size > 5000) {
    store.forEach((v, k) => {
      if (!v.length || now - v[v.length - 1] > windowMs) store.delete(k);
    });
  }
  return arr.length > limit;
}

let lastPruneAt = 0;

/**
 * Lớp rate-limit DÙNG CHUNG ở DB (full-audit a75d260 P3-02): cửa sổ cố
 * định theo (key, mốc cửa sổ), cộng nguyên tử bằng một câu
 * INSERT ... ON CONFLICT DO UPDATE ... RETURNING — hai instance khác
 * nhau cùng trừ vào MỘT quota. Dùng cho các giới hạn bảo mật (reset
 * mật khẩu, 2FA, API v2, step-up, quản lý 2FA); lớp in-memory ở trên
 * vẫn chạy trước làm lớp phụ bắt burst trong tiến trình. Lỗi DB ->
 * trả false (không khoá nhầm người dùng; lớp bộ nhớ vẫn bảo vệ).
 */
export async function rateLimitExceededShared(key: string, limit: number, windowMs: number): Promise<boolean> {
  try {
    const { prisma } = await import("./db");
    const now = Date.now();
    const bucketStart = new Date(Math.floor(now / windowMs) * windowMs);
    const rows = await prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "RateLimitBucket" ("key", "bucketStart", "count")
      VALUES (${key.slice(0, 160)}, ${bucketStart}, 1)
      ON CONFLICT ("key", "bucketStart")
      DO UPDATE SET "count" = "RateLimitBucket"."count" + 1
      RETURNING "count"`;
    if (now - lastPruneAt > 60 * 1000) {
      lastPruneAt = now;
      // Dọn bucket cũ bằng RAW SQL cùng đường tham số Date như INSERT:
      // trộn deleteMany của Prisma (serialize UTC) với INSERT raw
      // (serialize theo giờ địa phương của driver) trên cột timestamp
      // không múi giờ sẽ lệch nhau vài giờ và xoá nhầm bucket hiện tại.
      void prisma
        .$executeRaw`DELETE FROM "RateLimitBucket" WHERE "bucketStart" < ${new Date(now - windowMs * 2)}`
        .catch(() => {});
    }
    return (rows[0]?.count ?? 0) > limit;
  } catch {
    return false;
  }
}

/** IP thật của khách sau reverse proxy của hệ thống: ưu tiên x-real-ip (Caddy
 *  ghi đè bằng IP kết nối thật, khách không giả mạo được); x-forwarded-for chỉ
 *  tin PHẦN TỬ CUỐI do proxy cuối thêm vào — phần tử đầu là khách tự chèn được. */
export function clientIp(h: Headers): string {
  const real = (h.get("x-real-ip") || "").trim();
  if (real) return real;
  const parts = (h.get("x-forwarded-for") || "").split(",").map((x) => x.trim()).filter(Boolean);
  return parts[parts.length - 1] || "?";
}
