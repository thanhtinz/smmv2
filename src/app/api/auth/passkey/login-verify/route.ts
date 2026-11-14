import { NextRequest, NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransport,
  Base64URLString,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { recordLoginEvent } from "@/lib/login-events";
import { clientIp } from "@/lib/rate-limit";
import { lockdownMessage, lockdownState, userCanBypassLockdown } from "@/lib/lockdown";
import {
  clearChallenge,
  parseTransports,
  passkeysEnabled,
  readChallenge,
  rpFromRequest,
} from "@/lib/webauthn";

/** Bước 2 đăng nhập bằng passkey: xác minh assertion, kiểm tra các chốt chặn
 *  như luồng mật khẩu (tài khoản bị khoá / IP bị cấm / khoá khẩn cấp) rồi tạo phiên.
 *
 *  QUY TẮC 2FA: passkey ở đây bắt buộc userVerification = "required" (xem
 *  login-options) — tức người dùng đã xác minh ngay trên thiết bị bằng sinh trắc
 *  (Face ID / vân tay) hoặc PIN, đồng thời phải sở hữu thiết bị giữ khoá riêng.
 *  Hai yếu tố "sở hữu thiết bị + sinh trắc/PIN" kết hợp + khoá gắn với đúng
 *  origin (chống phishing) là xác thực mạnh tương đương 2 yếu tố, nên đăng nhập
 *  passkey KHÔNG đi qua cổng /login/2fa và thoả điều kiện admin_2fa_required
 *  nhờ claim amr="passkey" mà createSession ghi vào JWT (lib/auth.ts xử lý:
 *  adminNeeds2fa bỏ qua cho phiên passkey). */
export async function POST(req: NextRequest) {
  if (!(await passkeysEnabled())) {
    return NextResponse.json({ ok: false, error: "Passkey đang tắt" }, { status: 403 });
  }
  const ip = clientIp(req.headers);
  const ua = req.headers.get("user-agent") || "";
  const fail = (status: number, error: string) =>
    NextResponse.json({ ok: false, error }, { status });

  const body = (await req.json().catch(() => null)) as AuthenticationResponseJSON | null;
  if (!body || typeof body.id !== "string" || !body.id) {
    return fail(401, "Passkey không hợp lệ");
  }

  const saved = await readChallenge(req, "pk-login");
  if (!saved) {
    return fail(401, "Passkey không hợp lệ");
  }

  const passkey = await prisma.userPasskey.findUnique({
    where: { credentialId: body.id },
    include: { user: true },
  });
  if (!passkey || !passkey.user) {
    await clearChallenge();
    return fail(401, "Passkey không hợp lệ");
  }
  const user = passkey.user;

  if (user.status === "BANNED") {
    await recordLoginEvent({
      userId: user.id,
      username: user.username,
      success: false,
      reason: "Tài khoản đã bị khoá (Passkey)",
      ip,
      userAgent: ua,
    });
    await clearChallenge();
    return fail(403, "Tài khoản đã bị khoá, vui lòng liên hệ hỗ trợ");
  }

  if (ip && ip !== "?") {
    const ban = await prisma.ipBan
      .findFirst({
        where: {
          ip,
          panelId: null,
        },
      })
      .catch(() => null);
    if (ban) {
      await recordLoginEvent({
        userId: user.id,
        username: user.username,
        success: false,
        reason: "IP bị chặn (Passkey)",
        ip,
        userAgent: ua,
      });
      await clearChallenge();
      return fail(403, "Địa chỉ IP của bạn đã bị chặn" + (ban.reason ? `: ${ban.reason}` : ""));
    }
  }

  const ld = await lockdownState();
  if (ld.on && !(await userCanBypassLockdown(user))) {
    await recordLoginEvent({
      userId: user.id,
      username: user.username,
      success: false,
      reason: "Bị chặn do khoá khẩn cấp (lockdown, Passkey)",
      ip,
      userAgent: ua,
    });
    await clearChallenge();
    return fail(403, lockdownMessage(ld.reason));
  }

  const { rpID, origin } = rpFromRequest(req);
  let verified = false;
  let newCounter = passkey.counter;
  try {
    const result = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: saved.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: passkey.credentialId as Base64URLString,
        publicKey: isoBase64URL.toBuffer(passkey.publicKey),
        counter: passkey.counter,
        transports: parseTransports(passkey.transports) as AuthenticatorTransport[] | undefined,
      },
      requireUserVerification: true,
    });
    verified = result.verified;
    if (result.authenticationInfo) newCounter = result.authenticationInfo.newCounter;
  } catch {
    verified = false;
  }
  await clearChallenge();

  if (!verified) {
    await recordLoginEvent({
      userId: user.id,
      username: user.username,
      success: false,
      reason: "Xác minh Passkey thất bại",
      ip,
      userAgent: ua,
    });
    return fail(401, "Passkey không hợp lệ");
  }

  await prisma.userPasskey.update({
    where: { id: passkey.id },
    data: { counter: newCounter, lastUsedAt: new Date() },
  });
  await recordLoginEvent({
    userId: user.id,
    username: user.username,
    success: true,
    reason: "Đăng nhập bằng Passkey",
    ip,
    userAgent: ua,
  });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSession({
    id: user.id,
    role: user.role,
    username: user.username,
    authMethod: "passkey",
  });

  return NextResponse.json({
    ok: true,
    redirect: user.role === "ADMIN" || user.role === "STAFF" ? "/admin" : "/",
  });
}
