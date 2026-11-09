/**
 * Seed cho đợt kiểm chứng nút đồng bộ theo sản phẩm + bulk-add (2026-11-09):
 * tạo provider trỏ vào mock mutable (cổng 3999) rồi đồng bộ khu gamekeys
 * lần đầu (markup chung 30%) để trang admin có sản phẩm. Script shots
 * (shots-syncbtn.mjs) tự dọn provider/sản phẩm sau khi chạy.
 *   npx tsx scripts/syncbtn-seed.ts
 */
import { prisma } from "../src/lib/db";
import { syncFzrCatalog } from "../src/lib/fzr-sync";
import { fzrMarkupResolver } from "../src/lib/fzr-markup";

export const SYNCBTN_PROVIDER_ID = 999021;

async function main() {
  const PID = SYNCBTN_PROVIDER_ID;
  const oldVariants = (await prisma.premiumVariant.findMany({ where: { providerId: PID }, select: { id: true } })).map((v) => v.id);
  if (oldVariants.length) {
    await prisma.premiumOrder.deleteMany({ where: { variantId: { in: oldVariants } } });
    await prisma.premiumVariant.deleteMany({ where: { id: { in: oldVariants } } });
  }
  await prisma.premiumProduct.deleteMany({ where: { providerId: PID } });
  await prisma.provider.deleteMany({ where: { id: PID } });
  const provider = await prisma.provider.create({
    data: {
      id: PID, kind: "PREMIUM", driver: "FZR", name: "MockSyncBtn",
      apiUrl: "http://127.0.0.1:3999", apiKey: "fc_test_mock", currency: "USD",
      exchangeRate: 25000, markupPercent: 30, active: true,
    },
  });
  const markupFor = await fzrMarkupResolver(provider);
  const r = await syncFzrCatalog(provider, { groups: ["gamekeys"], markupFor });
  console.log("SEED sync:", JSON.stringify(r));
  const products = await prisma.premiumProduct.findMany({
    where: { providerId: PID },
    select: { id: true, providerProductId: true, name: true, providerPlatform: true, providerRegion: true },
    orderBy: { id: "asc" },
  });
  console.log("PRODUCTS:", JSON.stringify(products));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
