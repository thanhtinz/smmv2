/**
 * Fixture kiểm chứng đợt ĐỐI CHIẾU TÀI LIỆU FZR (2026-11-09):
 *  seed: tạo provider FZR trỏ mock :3998 -> syncFzrCatalog THẬT (game
 *        Cyberpunk gk-3 bị giới hạn vùng phải có providerRegionInfo từ
 *        /gamekeys/region-restriction) -> gán provider này phục vụ Telegram
 *        để trang Nhà cung cấp hiện khối FZR (sức khoẻ webhook + biến động
 *        số dư từ mock).
 *  clean: xoá sạch fixture, trả setting + demo về seed.
 * Mock phải đang chạy ở :3998 (shots-docgap.mjs tự spawn).
 *   npx tsx scripts/docgap-fixture.ts seed|clean
 */
import { prisma } from "../src/lib/db";
import { syncFzrCatalog } from "../src/lib/fzr-sync";
import { setSetting } from "../src/lib/settings";

const PID = 999011;
const MOCK = "http://127.0.0.1:3998";

async function clean() {
  const vIds = (await prisma.premiumVariant.findMany({ where: { providerId: PID }, select: { id: true } })).map((v) => v.id);
  if (vIds.length) {
    await prisma.premiumOrder.deleteMany({ where: { variantId: { in: vIds } } });
    await prisma.premiumVariant.deleteMany({ where: { id: { in: vIds } } });
  }
  await prisma.premiumProduct.deleteMany({ where: { providerId: PID } });
  await prisma.premiumCategory.deleteMany({ where: { slug: { endsWith: `-${PID}` }, products: { none: {} } } });
  await prisma.provider.deleteMany({ where: { id: PID } });
  await setSetting("telegram_provider_id", "");
  console.log("cleaned");
}

async function seed() {
  await clean();
  const provider = await prisma.provider.create({
    data: { id: PID, kind: "PREMIUM", driver: "FZR", name: "DocGap FZR", apiUrl: MOCK, apiKey: "fc_test_mock", currency: "USD", exchangeRate: 25000, markupPercent: 20, autoUpdatePrice: true, syncContent: true, active: true },
  });
  await syncFzrCatalog(provider as any, {});
  await setSetting("telegram_provider_id", String(PID));
  const cp = await prisma.premiumProduct.findFirst({ where: { providerId: PID, providerProductId: "gk-3" }, select: { id: true, providerRegionInfo: true } });
  console.log(`seeded — Cyberpunk id=${cp?.id} regionInfo=${(cp?.providerRegionInfo || "").slice(0, 80)}`);
}

(process.argv[2] === "clean" ? clean() : seed())
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
