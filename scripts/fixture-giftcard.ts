/**
 * FIX11 — Fixture cho kiểm chứng khu Gift Card qua CDP: tạo provider FZR trỏ
 * vào mock (cổng 3998, phải đang chạy bản mock MỚI), đồng bộ catalog thật
 * qua syncFzrCatalog (3 category giftcards của mock + các nhóm khác), rồi
 * thêm 30 category fixture trực tiếp (chỉ để thử phân trang/tìm kiếm).
 * Chạy: npx tsx scripts/fixture-giftcard.ts seed | clean
 */
import { prisma } from "../src/lib/db";
import { syncFzrCatalog } from "../src/lib/fzr-sync";

const PID = 999011;

async function clean() {
  const variantIds = (await prisma.premiumVariant.findMany({ where: { providerId: PID }, select: { id: true } })).map((v) => v.id);
  if (variantIds.length) {
    await prisma.premiumOrder.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.premiumVariant.deleteMany({ where: { id: { in: variantIds } } });
  }
  await prisma.premiumProduct.deleteMany({ where: { providerId: PID } });
  await prisma.premiumCategory.deleteMany({ where: { slug: { endsWith: `-${PID}` }, products: { none: {} } } });
  await prisma.provider.deleteMany({ where: { id: PID } });
  const demo = await prisma.user.findUnique({ where: { username: "demo" } });
  if (demo) await prisma.user.update({ where: { id: demo.id }, data: { balance: 500000 } });
  console.log("CLEAN done — provider/fixture đã xoá, demo = 500.000đ");
}

async function seed() {
  await clean();
  const provider = await prisma.provider.create({
    data: { id: PID, kind: "PREMIUM", driver: "FZR", name: "MockFZR-GC", apiUrl: "http://127.0.0.1:3998", apiKey: "fc_test_mock", currency: "USD", exchangeRate: 1000, markupPercent: 0, active: true },
  });
  const r = await syncFzrCatalog(provider, { includeSteamGifts: true });
  console.log(`sync: created=${r.created} variants=${r.variants}`);
  const gcCount = await prisma.premiumProduct.count({ where: { providerId: PID, variants: { some: { providerGroup: "giftcards" } } } });
  console.log(`giftcard categories từ mock: ${gcCount}`);

  // 30 category fixture (phân trang): mỗi category 1 mệnh giá.
  let cat = await prisma.premiumCategory.findFirst({ where: { name: "Gift Cards" } });
  if (!cat) cat = await prisma.premiumCategory.create({ data: { name: "Gift Cards", slug: `gift-cards-${PID}` } });
  for (let i = 1; i <= 30; i++) {
    const nn = String(i).padStart(2, "0");
    const p = await prisma.premiumProduct.create({
      data: {
        categoryId: cat.id, name: `Fixture Gift Card ${nn}`, slug: `fixture-gc-${nn}-${PID}`,
        fulfillment: "API", providerId: PID, providerProductId: `fixture-gc-${nn}`, active: true,
      },
    });
    await prisma.premiumVariant.create({
      data: {
        productId: p.id, name: `Fixture ${nn} - 10 USD`, price: 10000, cost: 9000, warrantyDays: 0,
        providerId: PID, providerGroup: "giftcards", providerItemId: `fixture-card-${nn}`, providerStock: 9,
      },
    });
  }
  const total = await prisma.premiumProduct.count({ where: { providerId: PID, variants: { some: { providerGroup: "giftcards", active: true } } } });
  console.log(`tổng category giftcards khả dụng: ${total} (kỳ vọng 33)`);
}

(process.argv[2] === "clean" ? clean() : seed())
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
