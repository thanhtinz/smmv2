import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { getSettings } from "./settings";
import { clientIp } from "./rate-limit";

/* Khoá ký phiên: production KHÔNG dùng khoá dự phòng công khai (ai đọc code cũng
   giả mạo được phiên admin) — thiếu AUTH_SECRET thì sinh khoá ngẫu nhiên theo
   tiến trình (phiên không bền qua khởi động lại, nhưng không giả mạo được). */
const authSecretRaw = (() => {
  if (process.env.AUTH_SECRET && (process.env.NODE_ENV !== "production" || process.env.AUTH_SECRET.length >= 32)) return process.env.AUTH_SECRET;
  console.error("[auth] AUTH_SECRET thiếu hoặc quá ngắn — đang dùng khoá tạm ngẫu nhiên theo tiến trình, hãy đặt AUTH_SECRET (>= 32 ký tự) trong .env!");
  const { randomBytes } = require("crypto") as typeof import("crypto");
  return randomBytes(48).toString("hex");
})();
const secret = new TextEncoder().encode(authSecretRaw);
export const SESSION_COOKIE = "smmv2_session";

/** Miền cookie CHUNG cho các subdomain (chuẩn tên miền con 2026-11-13,
 *  đợt 127): suy từ Host của request — bỏ tiền tố subdomain đã biết để
 *  lấy miền gốc, cookie phiên/step-up/2FA đặt trên ".<miền gốc>" nên
 *  đăng nhập ở miền gốc là dùng được ở admin.<gốc> và ngược lại.
 *  Trả undefined (cookie theo host như cũ) cho localhost / IP / host
 *  một nhãn — các môi trường đó không có subdomain để chia sẻ. Trên
 *  host demo dạng <tên>.vercel.app, miền suy ra chính là host đó nên
 *  hành vi tương đương cookie theo host như trước. */
const COOKIE_SUB_PREFIXES = ["api", "admin", "webhook", "dashboard", "doc", "www"];
export function sharedCookieDomain(): string | undefined {
  try {
    const host = (headers().get("host") || "").split(":")[0].toLowerCase();
    if (!host || host === "localhost" || /^[\d.]+$/.test(host)) return undefined;
    const parts = host.split(".");
    if (parts.length < 2) return undefined;
    const root = COOKIE_SUB_PREFIXES.includes(parts[0]) && parts.length > 2 ? parts.slice(1).join(".") : host;
    if (root.split(".").length < 2) return undefined;
    return `.${root}`;
  } catch {
    return undefined;
  }
}

/* ---------- GĐ3: xoay vòng khoá phiên (secret rotation) ----------
   Khoá ký JWT PHIÊN lấy từ DB (settings session_secret, đã giải mã qua secret-box)
   nếu admin đã xoay vòng; chưa xoay thì dùng AUTH_SECRET ở env như trước.
   Khoá cũ (session_secret_prev) vẫn được chấp nhận khi verify trong 7 ngày kể từ
   lúc xoay — người đang đăng nhập không bị văng, phiên mới ký bằng khoá mới.
   Step-up + cookie chờ 2FA vẫn ký bằng khoá env (ngắn hạn 5-10 phút, không cần xoay). */
let secCache: { cur: string; prev: string | null; exp: number } | null = null;
export function invalidateSessionSecretsCache() { secCache = null; }

export async function getSessionSecrets(): Promise<{ current: Uint8Array; prev: Uint8Array | null }> {
  if (!secCache || Date.now() > secCache.exp) {
    let cur = authSecretRaw;
    let prev: string | null = null;
    try {
      const s = await getSettings();
      if ((s.session_secret || "").trim()) cur = s.session_secret.trim();
      const p = (s.session_secret_prev || "").trim();
      const rotatedAt = parseInt(s.session_secret_rotated_at || "") || 0;
      if (p && rotatedAt && Date.now() - rotatedAt < 7 * 24 * 3600 * 1000) prev = p;
    } catch { /* DB lỗi thì dùng khoá env — không khoá người dùng ngoài hệ thống */ }
    secCache = { cur, prev, exp: Date.now() + 5000 };
  }
  const enc = new TextEncoder();
  return { current: enc.encode(secCache.cur), prev: secCache.prev ? enc.encode(secCache.prev) : null };
}

export type SessionUser = { id: number; role: string; username: string; sv?: number; sid?: string; authMethod?: string; amr?: string };

export async function createSession(user: SessionUser) {
  const days = Math.min(90, Math.max(1, parseInt((await getSettings()).session_days) || 7));
  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { sessionVersion: true } }).catch(() => null);
  // GĐ2: tạo dòng UserSession để quản lý thiết bị + đăng xuất từ xa; JWT mang sid trỏ về dòng này.
  let sid: string | undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { randomBytes, createHash } = require("crypto") as typeof import("crypto");
    sid = randomBytes(24).toString("hex");
    let ip = "?";
    let ua = "";
    try {
      ip = clientIp(headers());
      ua = headers().get("user-agent") || "";
    } catch { /* ngoài request context */ }
    await prisma.userSession.create({
      data: {
        userId: user.id,
        sid,
        deviceHash: createHash("sha256").update(`${ip}|${ua}`).digest("hex"),
        ip: ip.slice(0, 64),
        userAgent: ua.slice(0, 400) || null,
      },
    });
  } catch (e) {
    console.error("[auth] không tạo được UserSession:", e);
    sid = undefined;
  }
  const token = await new SignJWT({ uid: user.id, role: user.role, username: user.username, sv: dbUser?.sessionVersion ?? 0, ...(sid ? { sid } : {}), ...(user.authMethod === "passkey" ? { amr: "passkey" } : {}) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${days}d`)
    .sign((await getSessionSecrets()).current);
  const sessionDomain = sharedCookieDomain();
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * days,
    secure: process.env.NODE_ENV === "production",
    ...(sessionDomain ? { domain: sessionDomain } : {}),
  });
}

export async function destroySession() {
  // GĐ2: thu hồi dòng phiên hiện tại (đăng xuất thường = revoke session của chính thiết bị này)
  try {
    const s = await getSession();
    if (s?.sid) await prisma.userSession.updateMany({ where: { sid: s.sid, revokedAt: null }, data: { revokedAt: new Date() } });
  } catch { /* bỏ qua lỗi thu hồi khi đăng xuất */ }
  // Xoá cookie phải kèm ĐÚNG miền đã đặt (đợt 127): cookie đặt trên
  // ".<miền gốc>" mà xoá không kèm miền thì trình duyệt không gỡ.
  const domain = sharedCookieDomain();
  if (domain) {
    cookies().delete({ name: SESSION_COOKIE, path: "/", domain });
    cookies().delete({ name: PENDING_2FA_COOKIE, path: "/", domain });
    cookies().delete({ name: STEPUP_COOKIE, path: "/", domain });
  } else {
    cookies().delete(SESSION_COOKIE);
    cookies().delete(PENDING_2FA_COOKIE);
    cookies().delete(STEPUP_COOKIE);
  }
}

/* ---------- Step-up (GĐ2): xác thực lại cho thao tác nhạy cảm, cookie ký hạn 10 phút ---------- */
export const STEPUP_COOKIE = "smmv2_stepup";

export async function createStepUp(userId: number) {
  const token = await new SignJWT({ uid: userId, purpose: "stepup" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secret);
  const stepupDomain = sharedCookieDomain();
  cookies().set(STEPUP_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
    secure: process.env.NODE_ENV === "production",
    ...(stepupDomain ? { domain: stepupDomain } : {}),
  });
}

export async function hasStepUp(userId: number): Promise<boolean> {
  const token = cookies().get(STEPUP_COOKIE)?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload.purpose === "stepup" && Number(payload.uid) === userId;
  } catch {
    return false;
  }
}

/** Chốt chặn step-up dùng trong server actions nhạy cảm: thiếu/hết hạn xác thực lại
 *  thì redirect sang trang /step-up rồi quay về returnTo sau khi xác thực. */
export async function assertStepUp(userId: number, returnTo: string): Promise<void> {
  if (!(await hasStepUp(userId))) {
    redirect(`/step-up?next=${encodeURIComponent(returnTo)}`);
  }
}

/* ---------- 2FA: cookie chờ xác thực hai lớp (JWT ký riêng, hạn 5 phút) ---------- */
export const PENDING_2FA_COOKIE = "smmv2_2fa_pending";

export async function createPending2fa(user: { id: number; username: string }) {
  const token = await new SignJWT({ uid: user.id, username: user.username, purpose: "2fa" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret);
  const pendingDomain = sharedCookieDomain();
  cookies().set(PENDING_2FA_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 5,
    secure: process.env.NODE_ENV === "production",
    ...(pendingDomain ? { domain: pendingDomain } : {}),
  });
}

export async function getPending2fa(): Promise<{ id: number; username: string } | null> {
  const token = cookies().get(PENDING_2FA_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    if (payload.purpose !== "2fa") return null;
    return { id: Number(payload.uid), username: String(payload.username) };
  } catch {
    return null;
  }
}

export function clearPending2fa() {
  cookies().delete(PENDING_2FA_COOKIE);
}

/* ---------- Bảo mật Enterprise GĐ1: whitelist IP + bắt buộc 2FA cho khu quản trị ---------- */

/** IP hiện tại của request (qua proxy tin cậy) — chỉ dùng trong request context */
export function currentIp(): string {
  try {
    return clientIp(headers());
  } catch {
    return "?";
  }
}

/** Whitelist IP vào khu quản trị: setting admin_ip_whitelist, mỗi IP 1 dòng.
 *  Danh sách TRỐNG = tắt tính năng (không chặn ai — mặc định an toàn để không khoá admin). */
export async function adminIpBlocked(): Promise<{ blocked: boolean; ip: string; list: string[] }> {
  const s = await getSettings().catch(() => null);
  const list = (s?.admin_ip_whitelist || "").split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
  const ip = currentIp();
  if (!list.length) return { blocked: false, ip, list };
  return { blocked: !list.includes(ip), ip, list };
}

/** Tài khoản quản trị (ADMIN/STAFF web mẹ) có bị bắt buộc bật 2FA mà chưa bật không.
 *  GĐ3: đăng nhập bằng PASSKEY có xác minh người dùng (UV) được coi là xác thực mạnh
 *  (kết hợp sở hữu thiết bị + sinh trắc/PIN, chống phishing) — phiên passkey thoả
 *  luôn điều kiện này, không bị dẫn đi thiết lập TOTP nữa. */
export async function adminNeeds2fa(user: { role: string; totpEnabled: boolean; passkeyAuth?: boolean }): Promise<boolean> {
  if (user.totpEnabled) return false;
  if (user.passkeyAuth) return false;
  if (user.role !== "ADMIN" && user.role !== "STAFF") return false;
  const s = await getSettings().catch(() => null);
  return s?.admin_2fa_required !== "0";
}

/** Chốt chặn dùng chung cho layout + guard trang quản trị web mẹ:
 *  - IP ngoài whitelist -> trang /admin-blocked
 *  - Quản trị chưa bật 2FA (khi đang bắt buộc) -> trang Hồ sơ > Bảo mật để thiết lập
 *  Trang thiết lập 2FA nằm NGOÀI /admin nên không khoá vòng lặp. */
export async function enforceAdminSecurity(user: { role: string; totpEnabled: boolean; passkeyAuth?: boolean }) {
  const wl = await adminIpBlocked();
  if (wl.blocked) redirect("/admin-blocked");
  if (await adminNeeds2fa(user)) redirect("/dashboard/ho-so?tab=security&bat2fa=1");
}

export async function getSession(): Promise<SessionUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  // GĐ3: verify bằng khoá hiện hành trước, không khớp thì thử khoá cũ (còn hạn 7 ngày sau xoay vòng)
  const { current, prev } = await getSessionSecrets();
  for (const key of [current, prev]) {
    if (!key) continue;
    try {
      const { payload } = await jwtVerify(token, key);
      return { id: Number(payload.uid), role: String(payload.role), username: String(payload.username), sv: Number(payload.sv ?? 0), sid: payload.sid ? String(payload.sid) : undefined, amr: payload.amr ? String(payload.amr) : undefined };
    } catch { /* thử khoá tiếp theo */ }
  }
  return null;
}

export async function getCurrentUser() {
  const s = await getSession();
  if (!s) return null;
  const user = await prisma.user.findUnique({ where: { id: s.id } });
  if (!user || user.status === "BANNED") return null;
  if ((s.sv ?? 0) !== user.sessionVersion) return null; // phiên cấp trước lần đổi mật khẩu gần nhất -> đã huỷ
  // GĐ3: phiên đăng nhập bằng passkey (đã bắt buộc xác minh người dùng UV trên thiết
  // bị) mang theo cờ này để thoả điều kiện 2FA của khu quản trị — xem adminNeeds2fa.
  if (s.amr === "passkey") (user as any).passkeyAuth = true;
  // GĐ2: token có sid thì phiên tương ứng phải còn hiệu lực (chưa bị thu hồi từ xa).
  // Token cũ cấp trước GĐ2 không có sid -> vẫn hợp lệ tới khi hết hạn (giới hạn đã ghi nhận).
  if (s.sid) {
    const sess = await prisma.userSession.findUnique({ where: { sid: s.sid } }).catch(() => null);
    if (!sess || sess.userId !== user.id || sess.revokedAt) return null;
    if (Date.now() - sess.lastSeenAt.getTime() > 5 * 60 * 1000) {
      await prisma.userSession.update({ where: { id: sess.id }, data: { lastSeenAt: new Date() } }).catch(() => null);
    }
  }
  return user;
}

export async function requireUser() {
  const u = await getCurrentUser();
  if (!u) throw new Error("UNAUTHORIZED");
  return u;
}

/* Phân quyền 2 tầng (chốt 2026-11-04):
   - requireStaff(): ADMIN hoặc STAFF — xem và xử lý đơn SMM/Premium, trả lời ticket, xem danh sách.
   - requireAdmin(): CHỈ ADMIN — mọi thao tác tiền (số dư, duyệt nạp), nhà cung cấp + API key,
     người dùng + vai trò, dịch vụ + giá, sản phẩm + kho, cấu hình, thông báo. */
export async function requireStaff() {
  const u = await getCurrentUser();
  if (!u || (u.role !== "ADMIN" && u.role !== "STAFF")) throw new Error("FORBIDDEN");
  await enforceAdminSecurity(u);
  return u;
}

export async function requireAdmin() {
  const u = await getCurrentUser();
  if (!u || u.role !== "ADMIN") throw new Error("FORBIDDEN");
  await enforceAdminSecurity(u);
  return u;
}

/* Chốt cứng ở các trang quản trị chỉ dành cho ADMIN: STAFF gõ thẳng URL cũng bị đưa về /admin */
export async function requireAdminPage() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (u.role !== "ADMIN") redirect("/admin");
  await enforceAdminSecurity(u);
  return u;
}

export async function userByApiKey(key: string | null | undefined) {
  if (!key) return null;
  const u = await prisma.user.findUnique({ where: { apiKey: key } });
  if (!u || u.status === "BANNED") return null;
  return u;
}
