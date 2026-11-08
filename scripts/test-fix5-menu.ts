/** Helper WS6: bật/tắt tạm cổng 2FA admin ở DB LOCAL để chụp ma trận menu admin.
 *  npx tsx scripts/test-fix5-menu.ts 2fa-off | 2fa-on */
import { prisma } from "../src/lib/db";
async function main() {
  const v = process.argv[2] === "2fa-off" ? "0" : "1";
  await prisma.setting.upsert({ where: { key: "admin_2fa_required" }, update: { value: v }, create: { key: "admin_2fa_required", value: v } });
  console.log("admin_2fa_required =", v);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
