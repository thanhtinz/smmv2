/** Helper cho shots-storeclean.mjs — chạy bằng tsx với subcommand:
 *  cheapest   -> sản phẩm THƯỜNG (không thuộc 8 nhóm khu riêng) rẻ nhất + gói rẻ nhất
 *  state      -> { balance, maxOrderId } của user demo
 *  lastorder  -> đơn Premium mới nhất của demo { id, variantId, quantity, total, status } */
import { prisma } from "../src/lib/db";
import { DEDICATED_GROUPS } from "../src/lib/order-scope";

async function main() {
  const cmd = process.argv[2];
  if (cmd === "cheapest") {
    const products = await prisma.premiumProduct.findMany({
      where: { active: true, panelId: null, variants: { none: { providerGroup: { in: DEDICATED_GROUPS } } } },
      include: { variants: { where: { active: true }, orderBy: { price: "asc" } } },
    });
    let best: any = null;
    for (const p of products) {
      const v = p.variants[0];
      if (v && (!best || v.price < best.price)) best = { slug: p.slug, productName: p.name, variantId: v.id, variantName: v.name, price: v.price, fulfillment: p.fulfillment };
    }
    console.log(JSON.stringify(best));
  } else if (cmd === "state") {
    const demo = await prisma.user.findFirst({ where: { username: "demo" } });
    const agg = await prisma.premiumOrder.aggregate({ _max: { id: true } });
    console.log(JSON.stringify({ balance: demo?.balance, maxOrderId: agg._max.id || 0 }));
  } else if (cmd === "lastorder") {
    const demo = await prisma.user.findFirst({ where: { username: "demo" } });
    const o = await prisma.premiumOrder.findFirst({ where: { userId: demo!.id }, orderBy: { id: "desc" } });
    console.log(JSON.stringify(o ? { id: o.id, variantId: o.variantId, quantity: o.quantity, total: o.total, status: o.status } : null));
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
