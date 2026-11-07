import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { getSettings } from "./settings";
import { panelByHost } from "./panel-host";

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

export type SessionUser = { id: number; role: string; username: string; sv?: number };

export async function createSession(user: SessionUser) {
  let days = Math.min(90, Math.max(1, parseInt((await getSettings()).session_days) || 7));
  try {
    const hostPanel = await panelByHost();
    if (hostPanel?.sessionDays && hostPanel.sessionDays > 0) days = Math.min(90, Math.max(1, hostPanel.sessionDays));
  } catch { /* ngoài ngữ cảnh request thì dùng cấu hình chung */ }
  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { sessionVersion: true } }).catch(() => null);
  const token = await new SignJWT({ uid: user.id, role: user.role, username: user.username, sv: dbUser?.sessionVersion ?? 0 })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${days}d`)
    .sign(secret);
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * days,
    secure: process.env.NODE_ENV === "production",
  });
}

export function destroySession() {
  cookies().delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return { id: Number(payload.uid), role: String(payload.role), username: String(payload.username), sv: Number(payload.sv ?? 0) };
  } catch {
    return null;
  }
}

export async function getCurrentUser() {
  const s = await getSession();
  if (!s) return null;
  const user = await prisma.user.findUnique({ where: { id: s.id } });
  if (!user || user.status === "BANNED") return null;
  if ((s.sv ?? 0) !== user.sessionVersion) return null; // phiên cấp trước lần đổi mật khẩu gần nhất -> đã huỷ
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
  return u;
}

export async function requireAdmin() {
  const u = await getCurrentUser();
  if (!u || u.role !== "ADMIN") throw new Error("FORBIDDEN");
  return u;
}

/* Chốt cứng ở các trang quản trị chỉ dành cho ADMIN: STAFF gõ thẳng URL cũng bị đưa về /admin */
export async function requireAdminPage() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (u.role !== "ADMIN") redirect("/admin");
  return u;
}

export async function userByApiKey(key: string | null | undefined) {
  if (!key) return null;
  const u = await prisma.user.findUnique({ where: { apiKey: key } });
  if (!u || u.status === "BANNED") return null;
  return u;
}
