/**
 * Fixture kiểm chứng đợt GOM MARKUP FZR về form nhà cung cấp (2026-11-09):
 * tạo 1 nhà cung cấp FZR giả + đặt sẵn override fzr_markup_gamekeys=44 để
 * form nhà cung cấp phải nạp đúng; chạy với arg "clean" để dọn sạch.
 *   npx tsx scripts/markup-central-fixture.ts [clean]
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const PID = 999010;
const GROUPS = ["gamekeys", "giftcards", "topups", "manual", "telegram_stars", "telegram_premium", "steam_topup", "steam_gift"];

async function main() {
  if (process.argv[2] === "clean") {
    await prisma.provider.deleteMany({ where: { id: PID } });
    await prisma.setting.deleteMany({ where: { key: { in: GROUPS.map((g) => `fzr_markup_${g}`) } } });
    console.log("cleaned");
    return;
  }
  await prisma.provider.upsert({
    where: { id: PID },
    create: {
      id: PID, kind: "PREMIUM", driver: "FZR", name: "Markup Central FZR",
      apiUrl: "https://api.fzr.cards", apiKey: "fc_fixture_markup", currency: "USD",
      exchangeRate: 25000, markupPercent: 30, active: true,
    },
    update: { driver: "FZR", name: "Markup Central FZR", exchangeRate: 25000, markupPercent: 30, active: true },
  });
  await prisma.setting.deleteMany({ where: { key: { in: GROUPS.map((g) => `fzr_markup_${g}`) } } });
  await prisma.setting.create({ data: { key: "fzr_markup_gamekeys", value: "44" } });
  console.log("fixture ready");
}

main().finally(() => prisma.$disconnect());
