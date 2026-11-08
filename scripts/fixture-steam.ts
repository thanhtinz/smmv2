/** FIX7 TASK D — fixture Steam để kiểm chứng 2 trang đặt hàng + lịch sử:
 *  nhà cung cấp FZR trỏ vào mock local (:3998, tỉ giá 1000, markup 0 để số
 *  tiền nhỏ, đặt đơn được bằng số dư demo), 1 sản phẩm top-up (2 mệnh giá),
 *  2 game gift (1 game có 2 phiên bản). Hình dạng bám đúng output của
 *  fzr-sync. Chạy: `npx tsx scripts/fixture-steam.ts seed|clean|status`. */
import { prisma } from "../src/lib/db";
import { FZR_LABELS } from "../src/lib/fzr";

const MOCK = "http://127.0.0.1:3998";
const PROVIDER_NAME = "FZR Mock (fixture steam)";
const SLUGS = ["fixture-steam-topup", "fixture-steam-gift-elden", "fixture-steam-gift-cs2"];
const GIFT_CAT_SLUG = "fixture-steam-gift-games";

async function seed() {
  const provider = await prisma.provider.create({
    data: { kind: "PREMIUM", driver: "FZR", name: PROVIDER_NAME, apiUrl: MOCK, apiKey: "fc_test_mock", currency: "USD", exchangeRate: 1000, markupPercent: 0, active: true },
  });
  const steamCat = await prisma.premiumCategory.findFirst({ where: { name: "Steam" } });
  if (!steamCat) throw new Error("Thiếu danh mục Steam trong DB local");
  const giftCat = await prisma.premiumCategory.create({ data: { name: "Steam Gift Games", slug: GIFT_CAT_SLUG, sort: 98 } });

  const topup = await prisma.premiumProduct.create({
    data: {
      categoryId: steamCat.id, name: "Nạp Steam Wallet (USD)", slug: SLUGS[0], fulfillment: "API",
      providerId: provider.id, providerProductId: "steam-topup",
      customFields: JSON.stringify([{ label: FZR_LABELS.steamLogin, type: "text", required: true, placeholder: "Tên đăng nhập Steam" }]),
      variants: {
        create: [
          { name: "5 USD", price: 5000, cost: 5000, active: true, providerId: provider.id, providerGroup: "steam_topup", providerItemId: "5" },
          { name: "10 USD", price: 10000, cost: 10000, active: true, providerId: provider.id, providerGroup: "steam_topup", providerItemId: "10" },
        ],
      },
    },
  });
  const giftFields = JSON.stringify([{ label: FZR_LABELS.giftReceiver, type: "text", required: true, placeholder: "Tài khoản Steam nhận gift" }]);
  const elden = await prisma.premiumProduct.create({
    data: {
      categoryId: giftCat.id, name: "ELDEN RING", slug: SLUGS[1], fulfillment: "API",
      providerId: provider.id, providerProductId: "app-1245620", customFields: giftFields,
      variants: {
        create: [
          { name: "Bản gift", price: 45990, cost: 45990, active: true, providerId: provider.id, providerGroup: "steam_gift", providerItemId: "1245620" },
          { name: "Bản Deluxe", price: 59990, cost: 59990, active: true, providerId: provider.id, providerGroup: "steam_gift", providerItemId: "1245620" },
        ],
      },
    },
  });
  const cs2 = await prisma.premiumProduct.create({
    data: {
      categoryId: giftCat.id, name: "Counter-Strike 2", slug: SLUGS[2], fulfillment: "API",
      providerId: provider.id, providerProductId: "app-730", customFields: giftFields,
      variants: {
        create: [
          { name: "Bản gift", price: 39990, cost: 39990, active: true, providerId: provider.id, providerGroup: "steam_gift", providerItemId: "730" },
        ],
      },
    },
  });
  console.log(JSON.stringify({ providerId: provider.id, topup: topup.id, elden: elden.id, cs2: cs2.id, giftCat: giftCat.id }));
}

async function clean() {
  const products = await prisma.premiumProduct.findMany({ where: { slug: { in: SLUGS } }, select: { id: true } });
  const pids = products.map((p) => p.id);
  const variants = pids.length ? await prisma.premiumVariant.findMany({ where: { productId: { in: pids } }, select: { id: true } }) : [];
  const vids = variants.map((v) => v.id);
  if (vids.length) await prisma.premiumOrder.deleteMany({ where: { variantId: { in: vids } } });
  if (pids.length) await prisma.premiumVariant.deleteMany({ where: { productId: { in: pids } } });
  if (pids.length) await prisma.premiumProduct.deleteMany({ where: { id: { in: pids } } });
  await prisma.premiumCategory.deleteMany({ where: { slug: GIFT_CAT_SLUG } });
  await prisma.provider.deleteMany({ where: { name: PROVIDER_NAME } });
  await prisma.user.updateMany({ where: { username: "demo" }, data: { balance: 500000 } });
  console.log("cleaned; demo balance restored");
}

async function status() {
  const demo = await prisma.user.findFirst({ where: { username: "demo" }, select: { balance: true } });
  const steamOrders = await prisma.premiumOrder.findMany({
    where: { variant: { providerGroup: { in: ["steam_topup", "steam_gift"] } } },
    select: { code: true, status: true, total: true, buyerInfo: true, variant: { select: { providerGroup: true, name: true } } },
    orderBy: { id: "asc" },
  });
  console.log(JSON.stringify({ balance: demo?.balance, steamOrders }, null, 1));
}

(async () => {
  const cmd = process.argv[2];
  if (cmd === "seed") await seed();
  else if (cmd === "clean") await clean();
  else await status();
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
