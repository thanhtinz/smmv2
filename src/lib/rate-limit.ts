/** Giới hạn tần suất theo khoá (IP / tài khoản / API key) bằng bộ nhớ trong
 *  tiến trình — đủ cho mô hình chạy 1 tiến trình trên VPS. Trả về true khi
 *  yêu cầu này VƯỢT giới hạn và phải bị chặn.
 *  LƯU Ý (P3-02 audit 2026-11-13): bộ đếm KHÔNG chia sẻ giữa các tiến trình —
 *  nếu sau này chạy nhiều instance sau load balancer thì giới hạn thực tế
 *  nhân lên theo số instance; khi đó phải chuyển sang store dùng chung
 *  (Redis/DB) trước khi scale out. */

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

/** IP thật của khách sau reverse proxy của hệ thống: ưu tiên x-real-ip (Caddy
 *  ghi đè bằng IP kết nối thật, khách không giả mạo được); x-forwarded-for chỉ
 *  tin PHẦN TỬ CUỐI do proxy cuối thêm vào — phần tử đầu là khách tự chèn được. */
export function clientIp(h: Headers): string {
  const real = (h.get("x-real-ip") || "").trim();
  if (real) return real;
  const parts = (h.get("x-forwarded-for") || "").split(",").map((x) => x.trim()).filter(Boolean);
  return parts[parts.length - 1] || "?";
}
