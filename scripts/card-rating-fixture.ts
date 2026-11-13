/**
 * Fixture kiểm chứng dòng "★ điểm (số đánh giá) | Đã bán N" trên thẻ sản
 * phẩm (lệnh Tín 2026-11-12; ngăn cách "|" theo đính chính 21:20):
 *   npx tsx scripts/card-rating-fixture.ts         -> trồng 3 sản phẩm fixture
 *   npx tsx scripts/card-rating-fixture.ts clean   -> xoá fixture
 * A: 2 đánh giá 4★ (TB 4.0) + 43 đơn  -> dòng phải là "4.0 (2) | Đã bán 43"
 * B: 0 đánh giá + 7 đơn               -> dòng chỉ "Đã bán 7"
 * C: 0 đánh giá + 0 đơn               -> dòng chỉ "Đã bán 0"
 * Cả 3 là sản phẩm catalog thường (panelId null, không nhóm FZR), tạo mới
 * nhất để lên đầu lưới "Sản phẩm nổi bật" trang chủ (A trước, B, C sau).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const SLUGS = ["fixture-a-netflix-4k", "fixture-b-spotify", "fixture-c-canva"];

async function clean() {
  const prods = await prisma.premiumProduct.findMany({ where: { slug: { in: SLUGS } }, select: { id: true } });
  const ids = prods.map((p) => p.id);
  if (ids.length) {
    const vars = await prisma.premiumVariant.findMany({ where: { productId: { in: ids } }, select: { id: true } });
    const vids = vars.map((v) => v.id);
    if (vids.length) await prisma.premiumOrder.deleteMany({ where: { variantId: { in: vids } } });
    await prisma.premiumReview.deleteMany({ where: { productId: { in: ids } } });
    await prisma.premiumVariant.deleteMany({ where: { productId: { in: ids } } });
    await prisma.premiumProduct.deleteMany({ where: { id: { in: ids } } });
  }
  console.log("cleaned", ids.length, "fixture products");
}

async function main() {
  if (process.argv[2] === "clean") { await clean(); await prisma.$disconnect(); return; }
  await clean();
  const users = await prisma.user.findMany({ select: { id: true }, orderBy: { id: "asc" }, take: 3 });
  if (users.length < 2) throw new Error("cần ít nhất 2 user trong DB seed");
  const buyer = users[1].id;
  const cat = await prisma.premiumCategory.findFirst({ where: { active: true }, orderBy: { sort: "asc" } });
  if (!cat) throw new Error("không có danh mục premium");
  const now = Date.now();
  const mk = async (slug: string, name: string, color: string, price: number, ageSec: number) => {
    const p = await prisma.premiumProduct.create({
      data: {
        categoryId: cat.id, name, slug, color, fulfillment: "AUTO_STOCK",
        createdAt: new Date(now - ageSec * 1000),
        variants: { create: [{ name: "1 tháng", price }] },
      },
      include: { variants: true },
    });
    return { productId: p.id, variantId: p.variants[0].id, price };
  };
  const A = await mk(SLUGS[0], "Fixture A — Netflix Premium 4K", "#e50914", 112500, 0);
  const B = await mk(SLUGS[1], "Fixture B — Spotify Premium", "#1db954", 50000, 60);
  const C = await mk(SLUGS[2], "Fixture C — Canva Pro", "#7d2ae8", 75000, 120);
  void C;
  const orders: { code: string; userId: number; variantId: number; total: number; status: "DELIVERED" }[] = [];
  for (let i = 1; i <= 43; i++) orders.push({ code: `FIXA${String(i).padStart(4, "0")}`, userId: buyer, variantId: A.variantId, total: A.price, status: "DELIVERED" });
  for (let i = 1; i <= 7; i++) orders.push({ code: `FIXB${String(i).padStart(4, "0")}`, userId: buyer, variantId: B.variantId, total: B.price, status: "DELIVERED" });
  await prisma.premiumOrder.createMany({ data: orders });
  await prisma.premiumReview.createMany({
    data: [
      { productId: A.productId, userId: users[0].id, rating: 4, content: "Fixture: dùng tốt, giao nhanh." },
      { productId: A.productId, userId: users[1].id, rating: 4, content: "Fixture: ổn, sẽ mua lại." },
    ],
  });
  console.log("planted:", { A: A.productId, B: B.productId, orders: orders.length });
  await prisma.$disconnect();
}
main();
