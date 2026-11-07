import { NextRequest, NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import type { AuthenticatorTransport, Base64URLString } from "@simplewebauthn/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { passkeysEnabled, parseTransports, rpFromRequest, saveChallenge } from "@/lib/webauthn";

/** Bước 1 đăng ký passkey: tạo options cho navigator.credentials.create().
 *  Bắt buộc đã đăng nhập — passkey luôn gắn với tài khoản hiện tại.
 *  Challenge được ký + cất vào cookie httpOnly (hạn 5 phút) để bước verify đối chiếu. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Bạn cần đăng nhập để thêm passkey" }, { status: 401 });
  }
  if (!(await passkeysEnabled())) {
    return NextResponse.json({ ok: false, error: "Passkey đang tắt" }, { status: 403 });
  }
  const settings = await getSettings().catch(() => null);
  const { rpID } = rpFromRequest(req);
  const existing = await prisma.userPasskey.findMany({
    where: { userId: user.id },
    select: { credentialId: true, transports: true },
  });
  const options = await generateRegistrationOptions({
    rpName: settings?.site_name || "SMMv2",
    rpID,
    // @simplewebauthn/server v14: userID là Uint8Array (không còn nhận string)
    userID: new TextEncoder().encode(user.username),
    userName: user.username,
    userDisplayName: user.fullName || user.username,
    excludeCredentials: existing.map((p) => ({
      id: p.credentialId as Base64URLString,
      transports: parseTransports(p.transports) as AuthenticatorTransport[] | undefined,
    })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
  });
  await saveChallenge({ challenge: options.challenge, purpose: "pk-reg", uid: user.id });
  return NextResponse.json(options);
}
