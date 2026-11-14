import { NextRequest, NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { clientIp } from "@/lib/rate-limit";
import { claimPasskeyChallenge, clearChallenge, passkeysEnabled, readChallenge, rpFromRequest } from "@/lib/webauthn";

/** Bước 2 đăng ký passkey: xác minh attestation từ thiết bị, lưu khoá công khai.
 *  @simplewebauthn/server v14: kết quả nằm ở registrationInfo.credential
 *  ({ id: base64url, publicKey: Uint8Array, counter, transports }) — không còn
 *  các trường phẳng credentialID/credentialPublicKey như bản cũ. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Bạn cần đăng nhập để thêm passkey" }, { status: 401 });
  }
  if (!(await passkeysEnabled())) {
    return NextResponse.json({ ok: false, error: "Passkey đang tắt" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.id !== "string") {
    return NextResponse.json({ ok: false, error: "Dữ liệu passkey không hợp lệ" }, { status: 400 });
  }
  const { deviceName: rawDeviceName, ...rest } = body;
  const response = rest as unknown as RegistrationResponseJSON;

  const saved = await readChallenge(req, "pk-reg");
  if (!saved || saved.uid !== user.id) {
    await clearChallenge();
    return NextResponse.json(
      { ok: false, error: "Phiên đăng ký passkey đã hết hạn, vui lòng thử lại" },
      { status: 400 },
    );
  }

  // P3-01 (full-audit 6750109): claim nguyên tử challenge ở server
  // trước khi xác minh — cùng một attestation nộp hai lần/song song
  // chỉ một lượt qua được.
  if (!(await claimPasskeyChallenge(saved))) {
    await clearChallenge();
    return NextResponse.json(
      { ok: false, error: "Phiên đăng ký passkey đã hết hạn, vui lòng thử lại" },
      { status: 400 },
    );
  }

  const { rpID, origin } = rpFromRequest(req);
  let verified = false;
  let registrationInfo: Awaited<ReturnType<typeof verifyRegistrationResponse>>["registrationInfo"];
  try {
    const result = await verifyRegistrationResponse({
      response,
      expectedChallenge: saved.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });
    verified = result.verified;
    registrationInfo = result.registrationInfo;
  } catch {
    verified = false;
  }
  await clearChallenge();
  if (!verified || !registrationInfo) {
    return NextResponse.json({ ok: false, error: "Không xác minh được passkey, vui lòng thử lại" }, { status: 400 });
  }

  const credential = registrationInfo.credential;
  const deviceName =
    (typeof rawDeviceName === "string" ? rawDeviceName.trim().slice(0, 100) : "") || "Thiết bị không tên";
  const transports =
    credential.transports ?? response.response.transports;

  let created: { id: number };
  try {
    created = await prisma.userPasskey.create({
      data: {
        userId: user.id,
        credentialId: credential.id,
        publicKey: isoBase64URL.fromBuffer(credential.publicKey),
        counter: credential.counter,
        transports: transports && transports.length ? JSON.stringify(transports) : null,
        deviceName,
      },
      select: { id: true },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Passkey này đã được đăng ký, vui lòng thử thiết bị khác" },
      { status: 400 },
    );
  }

  await writeAudit({
    actorId: user.id,
    actorName: user.username,
    role: user.role,
    scope: "mother",
    panelId: null,
    action: "passkey.add",
    targetType: "UserPasskey",
    targetId: created.id,
    detail: `Thêm passkey "${deviceName}"`,
    ip: clientIp(req.headers),
  });

  return NextResponse.json({ ok: true });
}
