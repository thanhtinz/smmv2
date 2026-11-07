import bcrypt from "bcryptjs";

/* Mật khẩu (bảo mật Enterprise GĐ2): Argon2id cho hash MỚI qua @node-rs/argon2
   (napi prebuilt). Nạp lazy: nếu nền tảng thiếu binary thì tự rơi về bcrypt —
   không bao giờ để luồng đăng nhập gãy vì thư viện.
   Hash cũ bcrypt ($2...) vẫn kiểm tra được; đăng nhập thành công bằng hash cũ
   sẽ được nơi gọi tự nâng cấp sang Argon2id (lazy upgrade). */

type Argon2Module = typeof import("@node-rs/argon2");
let argon2Mod: Argon2Module | null | undefined;

function loadArgon2(): Argon2Module | null {
  if (argon2Mod === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      argon2Mod = require("@node-rs/argon2") as Argon2Module;
    } catch {
      argon2Mod = null;
    }
  }
  return argon2Mod;
}

export function isArgonHash(hash: string | null | undefined): boolean {
  return !!hash && hash.startsWith("$argon2");
}

export async function hashPassword(password: string): Promise<string> {
  const a = loadArgon2();
  if (a) {
    try {
      // algorithm 2 = Argon2id; thông số theo khuyến nghị OWASP (19 MiB, t=2, p=1)
      return await a.hash(password, { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as Parameters<Argon2Module["hash"]>[1]);
    } catch {
      /* rơi xuống bcrypt bên dưới */
    }
  }
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(hash: string | null | undefined, password: string): Promise<boolean> {
  if (!hash) return false;
  if (isArgonHash(hash)) {
    const a = loadArgon2();
    if (!a) return false;
    try {
      return await a.verify(hash, password);
    } catch {
      return false;
    }
  }
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

/** Hash giả để chạy verify khi tài khoản không tồn tại (chống lộ tồn tại qua thời gian phản hồi) */
export const DUMMY_PASSWORD_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
