import { NextRequest, NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { passkeysEnabled, rpFromRequest, saveChallenge } from "@/lib/webauthn";

/** Bước 1 đăng nhập bằng passkey: tạo options cho navigator.credentials.get().
 *  Không cần đăng nhập trước và KHÔNG truyền allowCredentials — dùng
 *  discoverable credential: thiết bị tự đề xuất passkey khớp với trang web.
 *  userVerification bắt buộc "required": xem quy tắc 2FA ở login-verify. */
export async function POST(req: NextRequest) {
  if (!(await passkeysEnabled())) {
    return NextResponse.json({ ok: false, error: "Passkey đang tắt" }, { status: 403 });
  }
  const { rpID } = rpFromRequest(req);
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
  });
  await saveChallenge({ challenge: options.challenge, purpose: "pk-login" });
  return NextResponse.json(options);
}
