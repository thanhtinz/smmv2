import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { generateTotpSecret, otpauthUri, verifyTotp } from "@/lib/totp";
import { userTotpSecret, storeTotpSecret, verifyLoginCode, regenerateBackupCodes } from "@/lib/twofa";
import { rateLimitExceeded, clientIp } from "@/lib/rate-limit";

/** Quản lý 2FA của chính tài khoản đang đăng nhập (Hồ sơ → Bảo mật):
 *  - setup: sinh secret (lưu mã hoá, CHƯA bật) + trả secret & otpauth URI để nhập app Authenticator
 *  - enable: nhập mã đúng từ secret đang chờ -> bật 2FA + sinh 8 mã dự phòng (hiện 1 lần)
 *  - disable: BẮT BUỘC mật khẩu hiện tại + mã 2FA/mã dự phòng — không tắt không xác minh
 *  - regen: nhập mã 2FA đúng -> sinh lại bộ mã dự phòng mới (hiện 1 lần) */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Chưa đăng nhập" }, { status: 401 });
  if (rateLimitExceeded(`2fa-manage|${user.id}|${clientIp(req.headers)}`, 20, 10 * 60 * 1000)) {
    return NextResponse.json({ ok: false, error: "Thao tác quá nhiều lần, thử lại sau" }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");
  const code = String(body.code || "").trim();

  if (action === "setup") {
    if (user.totpEnabled) return NextResponse.json({ ok: false, error: "2FA đang bật — muốn cài lại hãy tắt trước" }, { status: 400 });
    const secret = generateTotpSecret();
    await prisma.user.update({ where: { id: user.id }, data: { totpSecret: storeTotpSecret(secret) } });
    const s = await getSettings().catch(() => null);
    return NextResponse.json({ ok: true, secret, uri: otpauthUri(secret, user.username, s?.site_name || "SMMv2") });
  }

  if (action === "enable") {
    if (user.totpEnabled) return NextResponse.json({ ok: false, error: "2FA đã bật rồi" }, { status: 400 });
    const secret = userTotpSecret(user);
    if (!secret) return NextResponse.json({ ok: false, error: "Chưa bắt đầu thiết lập, hãy bấm Bắt đầu thiết lập trước" }, { status: 400 });
    if (!verifyTotp(secret, code)) return NextResponse.json({ ok: false, error: "Mã xác thực không đúng — kiểm tra lại giờ trên điện thoại" }, { status: 400 });
    const backupCodes = await regenerateBackupCodes(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: true } });
    return NextResponse.json({ ok: true, backupCodes });
  }

  if (action === "disable") {
    if (!user.totpEnabled) return NextResponse.json({ ok: false, error: "2FA chưa bật" }, { status: 400 });
    const password = String(body.password || "");
    if (!(await bcrypt.compare(password, user.passwordHash))) {
      return NextResponse.json({ ok: false, error: "Mật khẩu hiện tại không đúng" }, { status: 400 });
    }
    if (!(await verifyLoginCode(user, code))) {
      return NextResponse.json({ ok: false, error: "Cần nhập đúng mã 2FA hoặc mã dự phòng để tắt 2FA" }, { status: 400 });
    }
    await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecret: null, backupCodes: null } });
    return NextResponse.json({ ok: true });
  }

  if (action === "regen") {
    if (!user.totpEnabled) return NextResponse.json({ ok: false, error: "2FA chưa bật" }, { status: 400 });
    const secret = userTotpSecret(user);
    if (!secret || !verifyTotp(secret, code)) return NextResponse.json({ ok: false, error: "Cần nhập đúng mã 2FA để tạo lại mã dự phòng" }, { status: 400 });
    const backupCodes = await regenerateBackupCodes(user.id);
    return NextResponse.json({ ok: true, backupCodes });
  }

  return NextResponse.json({ ok: false, error: "Thao tác không hợp lệ" }, { status: 400 });
}
