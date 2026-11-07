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
  /* Đăng nhập chéo thiết bị (hybrid): generateAuthenticationOptions của
     @simplewebauthn/server 14.1.0 chưa chuyển tiếp tham số hints nên route
     tự gắn vào JSON trả ra — client @simplewebauthn/browser trải nguyên
     optionsJSON vào navigator.credentials.get() nên hints tới được trình
     duyệt: "hybrid" (quét mã bằng điện thoại) ưu tiên trước, "client-device"
     (passkey ngay trên máy) ngay sau. Trình duyệt không hỗ trợ hints sẽ bỏ
     qua trường này như mọi trường lạ của dictionary WebAuthn. */
  return NextResponse.json({ ...options, hints: ["hybrid", "client-device"] });
}
