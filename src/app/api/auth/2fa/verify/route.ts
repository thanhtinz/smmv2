import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPending2fa, clearPending2fa, createSession } from "@/lib/auth";
import { verifyLoginCode } from "@/lib/twofa";
import { recordLoginEvent } from "@/lib/login-events";
import { clientIp, rateLimitExceeded } from "@/lib/rate-limit";

/** Bước 2 của đăng nhập: kiểm mã TOTP / mã dự phòng từ cookie chờ (hạn 5 phút).
 *  Đúng mã mới tạo phiên thật + ghi LoginEvent thành công; sai mã ghi sự kiện
 *  thất bại và bị giới hạn 10 lần / 5 phút / tài khoản+IP. */
export async function POST(req: NextRequest) {
  const pending = await getPending2fa();
  if (!pending) return NextResponse.json({ ok: false, error: "Phiên xác thực đã hết hạn, vui lòng đăng nhập lại" }, { status: 401 });
  const ip = clientIp(req.headers);
  const ua = req.headers.get("user-agent") || "";
  if (rateLimitExceeded(`2fa|${pending.id}|${ip}`, 10, 5 * 60 * 1000)) {
    await clearPending2fa();
    return NextResponse.json({ ok: false, error: "Nhập sai quá nhiều lần, vui lòng đăng nhập lại" }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const code = String(body.code || "").trim();
  const user = await prisma.user.findUnique({ where: { id: pending.id } });
  if (!user || !user.totpEnabled || user.status === "BANNED") {
    await clearPending2fa();
    return NextResponse.json({ ok: false, error: "Phiên xác thực không hợp lệ, vui lòng đăng nhập lại" }, { status: 401 });
  }
  const kind = code ? await verifyLoginCode(user, code) : null;
  if (!kind) {
    await recordLoginEvent({ userId: user.id, username: user.username, success: false, reason: "Sai mã xác thực 2FA", ip, userAgent: ua});
    return NextResponse.json({ ok: false, error: "Mã xác thực không đúng, thử lại" }, { status: 400 });
  }
  await recordLoginEvent({ userId: user.id, username: user.username, success: true, reason: kind === "totp" ? "Đăng nhập bằng mật khẩu + mã 2FA" : "Đăng nhập bằng mật khẩu + mã dự phòng 2FA", ip, userAgent: ua});
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await clearPending2fa();
  await createSession({ id: user.id, role: user.role, username: user.username });
  // GĐ3: tính lại điểm rủi ro nền sau đăng nhập
  void (async () => { const { evaluateUserRisk } = await import("@/lib/risk"); await evaluateUserRisk(user.id); })();
  return NextResponse.json({ ok: true, redirect: user.role === "ADMIN" || user.role === "STAFF" ? "/admin" : "/" });
}
