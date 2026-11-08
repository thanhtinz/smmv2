import { prisma } from "../src/lib/db";
async function main() {
  const demo = await prisma.user.findUnique({ where: { username: "demo" } });
  if (!demo) throw new Error("no demo");
  const cat = await prisma.premiumCategory.findFirst({ orderBy: { id: "asc" } });
  if (!cat) throw new Error("no category");
  const p = await prisma.premiumProduct.create({ data: { slug: "fixture-telegram", name: "Telegram (fixture)", fulfillment: "API", active: false, categoryId: cat.id } });
  const v = await prisma.premiumVariant.create({ data: { productId: p.id, name: "50 Stars", price: 25000, providerGroup: "telegram_stars" } });
  await prisma.premiumOrder.create({ data: { code: "PRE100203", userId: demo.id, variantId: v.id, quantity: 50, total: 25000, status: "DELIVERED", buyerInfo: "Tên người dùng Telegram: @demo_user\nTelegram user ID: 123456789", deliveryData: "Đã nạp 50 Stars cho @demo_user" } });
  console.log(JSON.stringify({ demoSv: demo.sessionVersion, demoId: demo.id, productId: p.id }));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
