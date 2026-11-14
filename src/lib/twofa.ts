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
  const norm = normalizeBackupCode(code);
  if (!norm) return false;
  // P2-02 (audit 2026-11-13): ghi lại danh sách bằng CAS (updateMany với
  // điều kiện backupCodes = đúng chuỗi JSON vừa đọc) — hai lần đăng nhập
  // đồng thời bằng mã dự phòng không thể cùng thành công, và không ghi đè
  // mất mã do request song song vừa tiêu thụ. Thua CAS thì đọc lại danh
  // sách mới nhất và thử lại một lần (mã kia có thể vẫn còn nguyên).
  let currentJson = backupCodesJson;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!currentJson) return false;
    let hashes: string[] = [];
    try {
      hashes = JSON.parse(currentJson) as string[];
    } catch {
      return false;
    }
    if (!Array.isArray(hashes) || !hashes.length) return false;
    let matched = false;
    for (let i = 0; i < hashes.length; i++) {
      if (await bcrypt.compare(norm, hashes[i])) {
        const rest = hashes.filter((_, j) => j !== i);
        const cas = await prisma.user.updateMany({
          where: { id: userId, backupCodes: currentJson },
          data: { backupCodes: JSON.stringify(rest) },
        });
        if (cas.count === 1) return true;
        matched = true;
        break;
      }
    }
    if (!matched) return false;
    const fresh = await prisma.user.findUnique({ where: { id: userId }, select: { backupCodes: true } }).catch(() => null);
    currentJson = fresh?.backupCodes ?? null;
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
