import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getSettings } from "./settings";

/* Passkey / WebAuthn (bảo mật Enterprise GĐ3) — hạ tầng dùng chung cho các route
   /api/auth/passkey/*:
   - Suy RP ID + origin từ request (hỗ trợ chạy sau reverse proxy + localhost).
   - Challenge chống phát lại: JWT HS256 hạn 5 phút lưu trong cookie httpOnly
     "smmv2_pkc" (cùng mẫu cookie chờ 2FA / step-up trong lib/auth.ts). */

export const PASSKEY_CHALLENGE_COOKIE = "smmv2_pkc";

export type PasskeyChallengePurpose = "pk-reg" | "pk-login";
export type PasskeyChallenge = {
  challenge: string;
  purpose: PasskeyChallengePurpose;
  uid?: number;
};

/* Khoá ký challenge: suy từ AUTH_SECRET; thiếu thì sinh ngẫu nhiên theo tiến
   trình như lib/auth.ts (challenge chỉ sống 5 phút nên không cần bền qua
   khởi động lại, nhưng tuyệt đối không dùng khoá công khai cố định). */
const challengeSecretRaw = (() => {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { randomBytes } = require("crypto") as typeof import("crypto");
  return randomBytes(48).toString("hex");
})();
const challengeSecret = new TextEncoder().encode(challengeSecretRaw);

type HeaderSource = { headers: Headers } | Headers | null | undefined;

function headersOf(src: HeaderSource): Headers | null {
  if (!src) return null;
  if (src instanceof Headers) return src;
  return src.headers ?? null;
}

/** Suy rpID + origin từ request:
 *  - host: header "host" của request; không có thì lấy host của
 *    NEXT_PUBLIC_SITE_URL.
 *  - rpID: host bỏ port ("localhost" giữ nguyên "localhost").
 *  - origin: `${proto}://${host}` — proto lấy từ x-forwarded-proto; không có
 *    thì http cho localhost/127.*, còn lại https. */
export function rpFromRequest(req: HeaderSource): { rpID: string; origin: string } {
  const h = headersOf(req);
  let host = (h?.get("host") || "").trim();
  if (!host && process.env.NEXT_PUBLIC_SITE_URL) {
    try {
      host = new URL(process.env.NEXT_PUBLIC_SITE_URL).host;
    } catch {
      /* URL cấu hình sai thì bỏ qua, rpID sẽ rỗng và WebAuthn tự báo lỗi */
    }
  }
  const rpID = host.split(":")[0].toLowerCase();
  const forwarded = (h?.get("x-forwarded-proto") || "").split(",")[0].trim().toLowerCase();
  const proto =
    forwarded === "http" || forwarded === "https"
      ? forwarded
      : rpID === "localhost" || rpID.startsWith("127.")
        ? "http"
        : "https";
  return { rpID, origin: `${proto}://${host}` };
}

/** Passkey đang bật hay không (Cài đặt → Bảo mật): "1" = bật (mặc định). */
export async function passkeysEnabled(): Promise<boolean> {
  const s = await getSettings().catch(() => null);
  return s?.passkeys_enabled !== "0";
}

/* ---------- Cookie challenge ---------- */

/** Lưu challenge vào cookie httpOnly (dùng next/headers cookies() như các lib
 *  khác trong repo — chỉ gọi được trong request context của route handler).
 *  Hỗ trợ cả dạng saveChallenge(res, data) khi nơi gọi có sẵn một cookie store
 *  có method set (vd NextResponse.cookies). */
export async function saveChallenge(
  dataOrStore: PasskeyChallenge | { set: (...args: never[]) => unknown },
  maybeData?: PasskeyChallenge,
): Promise<void> {
  const data: PasskeyChallenge = (maybeData ?? dataOrStore) as PasskeyChallenge;
  const token = await new SignJWT({
    challenge: data.challenge,
    purpose: data.purpose,
    ...(data.uid != null ? { uid: data.uid } : {}),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(challengeSecret);
  const opts = {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 5,
    secure: process.env.NODE_ENV === "production",
  };
  if (maybeData && dataOrStore && typeof (dataOrStore as { set?: unknown }).set === "function") {
    (dataOrStore as { set: (name: string, value: string, o: typeof opts) => void }).set(
      PASSKEY_CHALLENGE_COOKIE,
      token,
      opts,
    );
    return;
  }
  cookies().set(PASSKEY_CHALLENGE_COOKIE, token, opts);
}

/** Đọc + kiểm chứng challenge: chữ ký, hạn 5 phút và purpose phải khớp.
 *  Dùng được cả hai dạng: readChallenge(purpose) — đọc từ cookies() của
 *  request hiện tại; hoặc readChallenge(req, purpose) — đọc từ header
 *  Cookie của request truyền vào. Sai/hết hạn/thiếu đều trả null. */
export async function readChallenge(
  reqOrPurpose: HeaderSource | PasskeyChallengePurpose,
  maybePurpose?: PasskeyChallengePurpose,
): Promise<PasskeyChallenge | null> {
  const purpose: PasskeyChallengePurpose =
    maybePurpose ?? (reqOrPurpose as PasskeyChallengePurpose);
  let token: string | undefined;
  if (typeof reqOrPurpose === "string" || maybePurpose === undefined) {
    try {
      token = cookies().get(PASSKEY_CHALLENGE_COOKIE)?.value;
    } catch {
      token = undefined;
    }
  }
  if (!token && typeof reqOrPurpose !== "string") {
    const h = headersOf(reqOrPurpose as HeaderSource);
    const raw = h?.get("cookie") || "";
    for (const part of raw.split(";")) {
      const [k, ...rest] = part.trim().split("=");
      if (k === PASSKEY_CHALLENGE_COOKIE) {
        try {
          token = decodeURIComponent(rest.join("="));
        } catch {
          token = rest.join("=");
        }
        break;
      }
    }
  }
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, challengeSecret);
    if (payload.purpose !== purpose) return null;
    if (typeof payload.challenge !== "string" || !payload.challenge) return null;
    return {
      challenge: payload.challenge,
      purpose: purpose as PasskeyChallengePurpose,
      uid: payload.uid != null ? Number(payload.uid) : undefined,
    };
  } catch {
    return null;
  }
}

/** Xoá cookie challenge sau khi dùng xong (đăng ký / đăng nhập thành công
 *  hay thất bại đều nên xoá để challenge không dùng lại được). */
export function clearChallenge(): void {
  try {
    cookies().delete(PASSKEY_CHALLENGE_COOKIE);
  } catch {
    /* ngoài request context thì không có gì để xoá */
  }
}

/** Parse transports đã lưu (JSON mảng) — hỏng/thiếu thì trả undefined. */
export function parseTransports(raw: string | null | undefined): string[] | undefined {
  if (!raw) return undefined;
  try {
    const v = JSON.parse(raw) as unknown;
    if (Array.isArray(v)) {
      const out = v.filter((x): x is string => typeof x === "string");
      return out.length ? out : undefined;
    }
  } catch {
    /* dữ liệu cũ hỏng — bỏ qua */
  }
  return undefined;
}
