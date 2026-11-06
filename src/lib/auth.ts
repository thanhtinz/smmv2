import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { getSettings } from "./settings";

const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-secret-can-thay-bang-chuoi-ngau-nhien-dai"
);
export const SESSION_COOKIE = "smmv2_session";

export type SessionUser = { id: number; role: string; username: string };

export async function createSession(user: SessionUser) {
  const days = Math.min(90, Math.max(1, parseInt((await getSettings()).session_days) || 7));
  const token = await new SignJWT({ uid: user.id, role: user.role, username: user.username })
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
    return { id: Number(payload.uid), role: String(payload.role), username: String(payload.username) };
  } catch {
    return null;
  }
}

export async function getCurrentUser() {
  const s = await getSession();
  if (!s) return null;
  const user = await prisma.user.findUnique({ where: { id: s.id } });
  if (!user || user.status === "BANNED") return null;
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
