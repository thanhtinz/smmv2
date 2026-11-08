/**
 * Helper kiểm chứng fix5 (quên mật khẩu) — kênh quan sát token ở local:
 * requestPasswordReset() TRẢ VỀ link chứa token plaintext (đúng như
 * issueEmailVerification của luồng xác thực email vẫn trả link cho nơi gọi).
 *   npx tsx scripts/test-fix5-reset.ts issue demo@smmv2.local
 *   npx tsx scripts/test-fix5-reset.ts state demo
 *   npx tsx scripts/test-fix5-reset.ts backdate demo
 *   npx tsx scripts/test-fix5-reset.ts setpw demo 'Demo@123'
 */
import { prisma } from "../src/lib/db";
import { requestPasswordReset } from "../src/lib/password-reset";
import { hashPassword } from "../src/lib/password";

async function main() {
  const [cmd, arg, extra] = process.argv.slice(2);
  if (cmd === "issue") {
    const link = await requestPasswordReset(arg);
    console.log(link ?? "NULL");
  } else if (cmd === "state") {
    const u = await prisma.user.findUnique({
      where: { username: arg },
      select: { id: true, email: true, balance: true, sessionVersion: true, passwordResetToken: true, passwordResetExpiry: true },
    });
    console.log(JSON.stringify({
      id: u?.id, email: u?.email, balance: u?.balance, sessionVersion: u?.sessionVersion,
      hasResetToken: !!u?.passwordResetToken, resetExpiry: u?.passwordResetExpiry?.toISOString() ?? null,
    }));
  } else if (cmd === "backdate") {
    await prisma.user.update({ where: { username: arg }, data: { passwordResetExpiry: new Date(Date.now() - 3600_000) } });
    console.log("backdated");
  } else if (cmd === "setpw") {
    await prisma.user.update({ where: { username: arg }, data: { passwordHash: await hashPassword(extra) } });
    console.log("password set");
  } else {
    console.log("unknown command");
    process.exitCode = 1;
  }
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
