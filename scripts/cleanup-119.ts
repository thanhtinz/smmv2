/** DỌN DB LOCAL về trạng thái seed chuẩn sau đợt 119: TRUNCATE toàn bộ bảng
 *  trong DB của app này (chỉ database hiện tại — không đụng các database
 *  khác cùng cụm PG), sau đó chạy lại prisma/seed.ts.
 *  Chạy: npx tsx scripts/cleanup-119.ts (chỉ dùng cho DB local thử nghiệm). */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const db = await prisma.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
  console.log("Database:", db[0]?.db);
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  const names = tables.map((t) => `"public"."${t.tablename}"`);
  console.log(`TRUNCATE ${names.length} bảng…`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${names.join(", ")} RESTART IDENTITY CASCADE`);
  console.log("Xong truncate.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
