import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { decryptSecret, encryptSecret } from "./secret-box";
import { verifyTotp, generateBackupCodes, normalizeBackupCode } from "./totp";

/** Tiện ích 2FA dùng chung: đọc secret đã mã hoá, kiểm mã TOTP,
 *  kiểm + TIÊU mã dự phòng (dùng 1 lần — hash khớp sẽ bị xoá khỏi danh sách). */

export function userTotpSecret(user: { totpSecret: string | null }): string | null {
  if (!user.totpSecret) return null;
  return decryptSecret(user.totpSecret);
}

export function storeTotpSecret(secretPlain: string): string {
  return encryptSecret(secretPlain);
}

export async function hashBackupCodes(codes: string[]): Promise<string> {
  const hashes: string[] = [];
  for (const c of codes) hashes.push(await bcrypt.hash(normalizeBackupCode(c), 10));
  return JSON.stringify(hashes);
}

/** Kiểm mã dự phòng: khớp thì xoá hash đó khỏi DB (không dùng lại được) */
export async function consumeBackupCode(userId: number, backupCodesJson: string | null, code: string): Promise<boolean> {
  if (!backupCodesJson) return false;
  let hashes: string[] = [];
  try {
    hashes = JSON.parse(backupCodesJson) as string[];
  } catch {
    return false;
  }
  if (!Array.isArray(hashes) || !hashes.length) return false;
  const norm = normalizeBackupCode(code);
  if (!norm) return false;
  for (let i = 0; i < hashes.length; i++) {
    if (await bcrypt.compare(norm, hashes[i])) {
      const rest = hashes.filter((_, j) => j !== i);
      await prisma.user.update({ where: { id: userId }, data: { backupCodes: JSON.stringify(rest) } });
      return true;
    }
  }
  return false;
}

/** Kiểm mã đăng nhập 2FA: TOTP trước, mã dự phòng sau. Trả về loại mã đã dùng. */
export async function verifyLoginCode(user: { id: number; totpSecret: string | null; backupCodes: string | null }, code: string): Promise<"totp" | "backup" | null> {
  const secret = userTotpSecret(user);
  if (secret && verifyTotp(secret, code)) return "totp";
  if (await consumeBackupCode(user.id, user.backupCodes, code)) return "backup";
  return null;
}

/** Sinh bộ mã dự phòng mới (ghi đè bộ cũ) — trả về mã dạng rõ để hiện 1 lần cho khách */
export async function regenerateBackupCodes(userId: number): Promise<string[]> {
  const codes = generateBackupCodes(8);
  await prisma.user.update({ where: { id: userId }, data: { backupCodes: await hashBackupCodes(codes) } });
  return codes;
}

/** Số mã dự phòng còn chưa dùng */
export function backupCodesLeft(backupCodesJson: string | null): number {
  try {
    const arr = JSON.parse(backupCodesJson || "[]");
    return Array.isArray(arr) ? arr.length : 0;
  } catch {
    return 0;
  }
}
