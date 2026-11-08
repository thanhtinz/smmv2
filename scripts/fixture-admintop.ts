/**
 * Fixture kiểm chứng "form thêm gói lên đầu trang + tab Telegram" (2026-11-08):
 *  seed: tạo 25 gói sao + 25 gói Premium Telegram (sản phẩm fixture gắn
 *        provider FZR phục vụ Telegram nếu có) để cả 2 tab đều có 2 trang
 *        (20 + 5); đánh dấu mọi dòng bằng slug "zz-admintop-*".
 *  clean: xoá sạch fixture, trả DB về đúng seed.
 * Chạy: npx tsx scripts/fixture-admintop.ts seed|clean|check
 */
import { prisma } from "../src/lib/db";
import { getTelegramProvider } from "../src/lib/tg";

const N = 25;
const pad = (i: number) => String(i).padStart(2, "0");

async function check() {
  const prov = await getTelegramProvider();
  console.log("tg provider:", prov ? `${prov.id} ${prov.name} driver=${prov.driver}` : null);
  const counts = await prisma.premiumVariant.groupBy({ by: ["providerGroup"], _count: true });
  console.log("variants:", JSON.stringify(counts));
  console.log("products:", await prisma.premiumProduct.count());
  const demo = await prisma.user.findUnique({ where: { username: "demo" }, select: { balance: true } });
  console.log("demo balance:", demo?.balance);
}

async function clean(silent = false) {
  const prods = await prisma.premiumProduct.findMany({ where: { slug: { startsWith: "zz-admintop-" } }, select: { id: true } });
  if (prods.length) {
    await prisma.premiumVariant.deleteMany({ where: { productId: { in: prods.map((p) => p.id) } } });
    await prisma.premiumProduct.deleteMany({ where: { id: { in: prods.map((p) => p.id) } } });
  }
  // Xoá cả các gói admin thêm tay vào sản phẩm Stars của NCC fixture (gói
  // "ZZ Fixture Added") + chính NCC fixture.
  const prov = await prisma.provider.findFirst({ where: { name: "ZZ Admintop FZR" } });
  if (prov) {
    const provProds = await prisma.premiumProduct.findMany({ where: { providerId: prov.id }, select: { id: true } });
    if (provProds.length) {
      await prisma.premiumVariant.deleteMany({ where: { productId: { in: provProds.map((p) => p.id) } } });
      await prisma.premiumProduct.deleteMany({ where: { id: { in: provProds.map((p) => p.id) } } });
    }
    await prisma.provider.delete({ where: { id: prov.id } });
  }
  if (!silent) console.log("cleaned", prods.length, "fixture products");
}

async function seed() {
  await clean(true);
  const category = await prisma.premiumCategory.findFirst({ orderBy: { id: "asc" } });
  if (!category) throw new Error("Chưa có PremiumCategory — chạy seed trước");
  // NCC FZR fixture (dummy, chỉ để form thêm gói qua được cửa kiểm tra cấu
  // hình — không gọi ra ngoài).
  const provider = await prisma.provider.create({
    data: { kind: "PREMIUM", driver: "FZR", name: "ZZ Admintop FZR", apiUrl: "https://api.fzr.cards", apiKey: "zz-dummy", active: true, exchangeRate: 25000, markupPercent: 30 },
  });
  const starsProd = await prisma.premiumProduct.create({
    data: { categoryId: category.id, name: "ZZ Admintop Stars", slug: "zz-admintop-stars", fulfillment: "API", active: true },
  });
  const premProd = await prisma.premiumProduct.create({
    data: { categoryId: category.id, name: "ZZ Admintop Premium", slug: "zz-admintop-premium", fulfillment: "API", active: true },
  });
  // Gói đơn vị neo (providerItemId = "stars") + 25 gói sao theo số lượng.
  await prisma.premiumVariant.create({
    data: { productId: starsProd.id, name: "1 sao (đơn vị)", price: 150, providerGroup: "telegram_stars", providerItemId: "stars", providerId: provider?.id ?? null },
  });
  for (let i = 1; i <= N; i++) {
    await prisma.premiumVariant.create({
      data: {
        productId: starsProd.id, name: `ZZ Gói ${1000 + i} sao`, price: (1000 + i) * 15,
        providerGroup: "telegram_stars", providerItemId: String(1000 + i), providerId: provider?.id ?? null,
      },
    });
  }
  for (let i = 1; i <= N; i++) {
    await prisma.premiumVariant.create({
      data: {
        productId: premProd.id, name: `ZZ Premium ${i} tháng`, price: 100000 + i * 1000,
        providerGroup: "telegram_premium", providerItemId: String(100 + i), providerCycle: i, providerId: provider?.id ?? null,
      },
    });
  }
  console.log("seeded: 25 stars packages + 25 premium plans, providerId =", provider?.id ?? null);
}

async function main() {
  const cmd = process.argv[2];
  if (cmd === "seed") await seed();
  else if (cmd === "clean") await clean();
  else await check();
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
