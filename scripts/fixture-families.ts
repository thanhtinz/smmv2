/**
 * FIX8 TASK 4 — fixture họ Telegram/Steam cho admin mới: 1 provider FZR trỏ
 * mock :3998 (tỉ giá 1000, markup 0) + 4 họ gói đúng hình đồng bộ FZR tạo:
 *  - telegram_stars: 1 gói đơn vị (giá hiển thị 15đ/sao = quote mock 0.015 x 1000)
 *  - telegram_premium: 3 gói 3/6/12 tháng (12.990 / 23.990 / 39.990)
 *  - steam_topup: mệnh giá 5/10/20/50/100 USD (giá = mệnh giá x 1000)
 *  - steam_gift: ELDEN RING appid 1245620 (giá hiển thị 45.990 = offer mock rẻ nhất)
 * Chạy: npx tsx scripts/fixture-families.ts seed | clean
 * clean xoá provider + sản phẩm + MỌI đơn premium của demo do kiểm chứng tạo,
 * trả số dư demo về 500.000.
 */
import { prisma } from "../src/lib/db";
import { FZR_LABELS } from "../src/lib/fzr";

const PROVIDER_NAME = "FZR Mock (fixture families)";
const MOCK = "http://127.0.0.1:3998";
const SLUGS = ["fam-telegram-stars", "fam-telegram-premium", "fam-steam-topup", "fam-steam-gift-er"];

async function getOrCreateCategory(name: string, slug: string): Promise<number> {
  const found = await prisma.premiumCategory.findFirst({ where: { name } });
  if (found) return found.id;
  const created = await prisma.premiumCategory.create({ data: { name, slug } });
  return created.id;
}

async function seed() {
  await clean(true);
  const provider = await prisma.provider.create({
    data: { kind: "BOTH", driver: "FZR", name: PROVIDER_NAME, apiUrl: MOCK, apiKey: "fc_test_mock", currency: "USD", exchangeRate: 1000, markupPercent: 0, active: true },
  });
  const tgCat = await getOrCreateCategory("Telegram", "fam-cat-telegram");
  const steamCat = await getOrCreateCategory("Steam", "fam-cat-steam");
  const giftCat = await getOrCreateCategory("Steam Gift Games", "fam-cat-steam-gift");

  const tgFields = JSON.stringify([
    { label: FZR_LABELS.telegramId, type: "text", required: false, placeholder: "ID số của tài khoản Telegram (không bắt buộc)" },
    { label: "Tên người dùng Telegram", type: "text", required: true, placeholder: "@username của tài khoản nhận" },
  ]);

  await prisma.premiumProduct.create({
    data: {
      categoryId: tgCat, name: "Telegram Stars", slug: SLUGS[0], fulfillment: "API",
      providerId: provider.id, providerProductId: "telegram-stars", customFields: tgFields,
      variants: { create: [{ name: "1 sao", price: 15, cost: 15, active: true, providerId: provider.id, providerGroup: "telegram_stars", providerItemId: "stars" }] },
    },
  });
  await prisma.premiumProduct.create({
    data: {
      categoryId: tgCat, name: "Telegram Premium", slug: SLUGS[1], fulfillment: "API",
      providerId: provider.id, providerProductId: "telegram-premium", customFields: tgFields,
      variants: {
        create: [
          { name: "3 tháng", price: 12990, cost: 12990, active: true, providerId: provider.id, providerGroup: "telegram_premium", providerItemId: "3", providerCycle: 3 },
          { name: "6 tháng", price: 23990, cost: 23990, active: true, providerId: provider.id, providerGroup: "telegram_premium", providerItemId: "6", providerCycle: 6 },
          { name: "12 tháng", price: 39990, cost: 39990, active: true, providerId: provider.id, providerGroup: "telegram_premium", providerItemId: "12", providerCycle: 12 },
        ],
      },
    },
  });
  await prisma.premiumProduct.create({
    data: {
      categoryId: steamCat, name: "Nạp Steam Wallet (USD)", slug: SLUGS[2], fulfillment: "API",
      providerId: provider.id, providerProductId: "steam-topup",
      customFields: JSON.stringify([{ label: FZR_LABELS.steamLogin, type: "text", required: true, placeholder: "Tên đăng nhập Steam" }]),
      variants: {
        create: [5, 10, 20, 50, 100].map((a) => ({
          name: `${a} USD`, price: a * 1000, cost: a * 1000, active: true,
          providerId: provider.id, providerGroup: "steam_topup", providerItemId: String(a),
        })),
      },
    },
  });
  await prisma.premiumProduct.create({
    data: {
      categoryId: giftCat, name: "ELDEN RING", slug: SLUGS[3], fulfillment: "API",
      imageUrl: "https://example.com/er.jpg",
      providerId: provider.id, providerProductId: "app-1245620",
      customFields: JSON.stringify([{ label: FZR_LABELS.giftReceiver, type: "text", required: true, placeholder: "Tài khoản Steam nhận gift" }]),
      variants: { create: [{ name: "Bản gift", price: 45990, cost: 45990, active: true, providerId: provider.id, providerGroup: "steam_gift", providerItemId: "1245620" }] },
    },
  });
  console.log(JSON.stringify({ seeded: true, providerId: provider.id }));
}

async function clean(silent = false) {
  const provider = await prisma.provider.findFirst({ where: { name: PROVIDER_NAME } });
  // Xoá cả sản phẩm do ĐỒNG BỘ tạo dưới provider fixture (gamekeys/giftcards…)
  const products = await prisma.premiumProduct.findMany({
    where: { OR: [{ slug: { in: SLUGS } }, ...(provider ? [{ providerId: provider.id }] : [])] },
    select: { id: true },
  });
  const productIds = products.map((p) => p.id);
  if (productIds.length) {
    const variants = await prisma.premiumVariant.findMany({ where: { productId: { in: productIds } }, select: { id: true } });
    const variantIds = variants.map((v) => v.id);
    if (variantIds.length) await prisma.premiumOrder.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.premiumVariant.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.premiumProduct.deleteMany({ where: { id: { in: productIds } } });
  }
  if (provider) await prisma.provider.delete({ where: { id: provider.id } });
  await prisma.premiumCategory.deleteMany({ where: { slug: { in: ["fam-cat-telegram", "fam-cat-steam", "fam-cat-steam-gift"] } } });
  await prisma.user.update({ where: { username: "demo" }, data: { balance: 500000 } });
  if (!silent) {
    const left = await prisma.premiumOrder.count();
    const demo = await prisma.user.findUnique({ where: { username: "demo" }, select: { balance: true } });
    console.log(JSON.stringify({ cleaned: true, premiumOrdersLeft: left, demoBalance: demo?.balance }));
  }
}

(async () => {
  try {
    if (process.argv[2] === "clean") await clean();
    else await seed();
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => { console.error(e); process.exit(1); });
