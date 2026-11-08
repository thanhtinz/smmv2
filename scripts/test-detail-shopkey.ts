/**
 * Helper kiểm chứng khôi phục bố cục shopkey cho trang chi tiết Premium:
 *   npx tsx scripts/test-detail-shopkey.ts fixture
 *     -> một sản phẩm MANUAL/API có >= 2 gói: { slug, productName, fulfillment,
 *          block: {id,name}, tracked: {id,name} } (block = gói sẽ bị đánh dấu
 *          hết hàng; tracked = gói sẽ được gán stockQty = 7 để thấy "Còn 7")
 *   npx tsx scripts/test-detail-shopkey.ts apply <blockId> <trackedId>
 *     -> block: outOfStock = true; tracked: stockQty = 7
 *   npx tsx scripts/test-detail-shopkey.ts restore <blockId> <trackedId>
 *     -> trả outOfStock = false, stockQty = null
 */
import { prisma } from "../src/lib/db";

async function main() {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === "fixture") {
    const p = await prisma.premiumProduct.findFirst({
      where: { active: true, panelId: null, fulfillment: { in: ["MANUAL", "API"] }, variants: { some: { active: true } } },
      include: { variants: { where: { active: true }, orderBy: { price: "asc" } } },
      orderBy: { id: "asc" },
    });
    const vs = (p?.variants || []).filter((v) => !v.outOfStock);
    if (!p || vs.length < 2) { console.log(JSON.stringify(null)); return; }
    console.log(JSON.stringify({
      slug: p.slug, productName: p.name, fulfillment: p.fulfillment,
      block: { id: vs[0].id, name: vs[0].name },
      tracked: { id: vs[1].id, name: vs[1].name },
    }));
  } else if (cmd === "apply") {
    await prisma.premiumVariant.update({ where: { id: parseInt(a) }, data: { outOfStock: true } });
    await prisma.premiumVariant.update({ where: { id: parseInt(b) }, data: { stockQty: 7 } });
    console.log("applied");
  } else if (cmd === "restore") {
    await prisma.premiumVariant.update({ where: { id: parseInt(a) }, data: { outOfStock: false } });
    await prisma.premiumVariant.update({ where: { id: parseInt(b) }, data: { stockQty: null } });
    console.log("restored");
  } else {
    console.log("unknown command");
    process.exitCode = 1;
  }
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
