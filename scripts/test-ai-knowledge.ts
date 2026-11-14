/**
 * Test hồi quy audit đợt 2 P3-01: kho tri thức AI (buildAiDocs) chỉ chứa
 * sản phẩm ĐANG BÁN và gói ĐANG BÁN.
 *   npx tsx scripts/test-ai-knowledge.ts   (chỉ cần DB local)
 * Tạo 1 sản phẩm active + 1 sản phẩm inactive (mỗi cái 1 gói active và 1
 * gói inactive) rồi kiểm: doc của sản phẩm inactive KHÔNG tồn tại; doc
 * của sản phẩm active chỉ liệt kê gói active.
 */
import { prisma } from "../src/lib/db";
import { buildAiDocs } from "../src/lib/ai-knowledge";

let pass = 0, fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) { pass++; console.log("  PASS", label); }
  else { fail++; console.log("  FAIL", label); }
}

async function main() {
  const cat: any = await prisma.premiumCategory.findFirst();
  if (!cat) throw new Error("thiếu category mẫu (chạy seed trước)");
  const stamp = Date.now().toString().slice(-8);
  const mk = async (slug: string, active: boolean) => {
    const p: any = await prisma.premiumProduct.create({
      data: { categoryId: cat.id, name: `AIKB ${slug}`, slug, fulfillment: "MANUAL", active } as any,
    });
    await prisma.premiumVariant.create({ data: { productId: p.id, name: "Gói hiện", price: 111000, active: true } as any });
    await prisma.premiumVariant.create({ data: { productId: p.id, name: "Gói ẩn", price: 222000, active: false } as any });
    return p;
  };
  const onP = await mk(`aikb-on-${stamp}`, true);
  const offP = await mk(`aikb-off-${stamp}`, false);
  try {
    const docs = await buildAiDocs();
    const onDoc = docs.find((d) => d.id === `shop-product-${onP.slug}`);
    const offDoc = docs.find((d) => d.id === `shop-product-${offP.slug}`);
    ok(!!onDoc, "sản phẩm đang bán CÓ trong kho tri thức AI");
    ok(!offDoc, "sản phẩm đã tắt KHÔNG lọt vào kho tri thức AI");
    ok(!!onDoc && onDoc.body.includes("Gói hiện") && onDoc.body.includes("111.000đ"), "gói đang bán được liệt kê kèm giá");
    ok(!!onDoc && !onDoc.body.includes("Gói ẩn") && !onDoc.body.includes("222.000đ"), "gói đã tắt KHÔNG bị liệt kê");
  } finally {
    await prisma.premiumVariant.deleteMany({ where: { productId: { in: [onP.id, offP.id] } } });
    await prisma.premiumProduct.deleteMany({ where: { id: { in: [onP.id, offP.id] } } });
  }
  console.log(fail === 0 ? `\nALL PASS (${pass})` : `\n${fail} FAIL / ${pass} PASS`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
