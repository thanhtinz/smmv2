/**
 * Fixture kiểm chứng PHÂN TRANG admin (đợt phân trang 2026-11-08):
 *  seed: tạo 45 sản phẩm Game Key ("ZZ Check Game 01..45", mỗi game 1
 *        edition gamekeys) + 45 danh mục Gift Card ("ZZ Check Card 01..45",
 *        mỗi danh mục 1 mệnh giá giftcards) trực tiếp trong DB — để trang
 *        admin /admin/game-key/san-pham và /admin/gift-card/san-pham có
 *        3 trang (20 + 20 + 5).
 *  clean: xoá sạch các sản phẩm ZZ Check * + variant của chúng, trả DB về
 *        đúng seed (9 sản phẩm, demo 500.000đ).
 * Chạy: npx tsx scripts/fixture-adminpage.ts seed|clean
 */
import { prisma } from "../src/lib/db";

const N = 45;
const pad = (i: number) => String(i).padStart(2, "0");

async function seed() {
  const category = await prisma.premiumCategory.findFirst({ orderBy: { id: "asc" } });
  if (!category) throw new Error("Chưa có PremiumCategory — chạy seed trước");
  await clean(true);
  for (let i = 1; i <= N; i++) {
    const game = await prisma.premiumProduct.create({
      data: {
        categoryId: category.id,
        name: `ZZ Check Game ${pad(i)}`,
        slug: `zz-check-game-${pad(i)}`,
        fulfillment: "API",
        providerProductId: `zz-gk-${pad(i)}`,
        providerPlatform: "Steam",
        providerRegion: "GLOBAL",
        active: true,
      },
    });
    await prisma.premiumVariant.create({
      data: {
        productId: game.id, name: "Standard Edition", price: 100000 + i * 1000, cost: 0, warrantyDays: 0,
        providerGroup: "gamekeys", providerItemId: `zz-key-${pad(i)}`, providerStock: 10 + i, active: true,
      },
    });
    const card = await prisma.premiumProduct.create({
      data: {
        categoryId: category.id,
        name: `ZZ Check Card ${pad(i)}`,
        slug: `zz-check-card-${pad(i)}`,
        fulfillment: "API",
        providerProductId: `zz-gc-${pad(i)}`,
        description: `Ghi chú fixture ${pad(i)}`,
        active: true,
      },
    });
    await prisma.premiumVariant.create({
      data: {
        productId: card.id, name: "10 USD", price: 250000, cost: 0, warrantyDays: 0,
        providerGroup: "giftcards", providerItemId: `zz-card-${pad(i)}`, providerStock: 5 + i, active: true,
      },
    });
  }
  const gk = await prisma.premiumProduct.count({ where: { variants: { some: { providerGroup: "gamekeys" } } } });
  const gc = await prisma.premiumProduct.count({ where: { variants: { some: { providerGroup: "giftcards" } } } });
  console.log(`SEEDED gamekeys products=${gk} giftcards products=${gc}`);
}

async function clean(silent = false) {
  const products = await prisma.premiumProduct.findMany({ where: { slug: { startsWith: "zz-check-" } }, select: { id: true } });
  const ids = products.map((p) => p.id);
  if (ids.length) {
    const variantIds = (await prisma.premiumVariant.findMany({ where: { productId: { in: ids } }, select: { id: true } })).map((v) => v.id);
    if (variantIds.length) {
      await prisma.premiumOrder.deleteMany({ where: { variantId: { in: variantIds } } });
      await prisma.premiumVariant.deleteMany({ where: { id: { in: variantIds } } });
    }
    await prisma.premiumProduct.deleteMany({ where: { id: { in: ids } } });
  }
  if (!silent) {
    const total = await prisma.premiumProduct.count({ where: { panelId: null } });
    const demo = await prisma.user.findFirst({ where: { username: "demo" }, select: { balance: true } });
    console.log(`CLEANED products_left=${total} demo_balance=${demo?.balance}`);
  }
}

async function main() {
  const mode = process.argv[2];
  if (mode === "seed") await seed();
  else if (mode === "clean") await clean();
  else throw new Error("Dùng: seed|clean");
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
