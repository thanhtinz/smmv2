/**
 * Fixture cho scripts/shots-pass.mjs (nghiệm thu trang /pass + admin Pass):
 *  - mode "setup": bật Pass (giá 49.000/129.000/399.000, hoàn 10%, giảm 5%,
 *    scope ALL), quà = sản phẩm AUTO_STOCK đầu tiên của seed (bổ sung kho nếu
 *    thiếu), bảo đảm có danh mục + 5 bài FAQ "pass-faq" (giống prisma/seed.ts),
 *    tài khoản demo có Pass còn hạn 20 ngày và chưa nhận quà tháng này.
 *  - mode "cleanup": dọn toàn bộ dấu vết (xoá settings pass_*, hạn của demo,
 *    lượt nhận + đơn quà 0đ + kho đã giao, giao dịch Pass của demo) — bài FAQ
 *    giữ lại vì là nội dung seed chính thức.
 * Chạy: npx tsx scripts/pass-shots-fixture.ts setup|cleanup
 */
export {};
async function main() {
  const mode = process.argv[2];
  const { prisma } = await import("../src/lib/db");
  const demo = await prisma.user.findUnique({ where: { username: "demo" } });
  if (!demo) throw new Error("thiếu user demo (chưa seed?)");

  if (mode === "setup") {
    const prod = await prisma.premiumProduct.findFirst({
      where: { fulfillment: "AUTO_STOCK", active: true },
      include: { variants: { where: { active: true }, orderBy: { id: "asc" } } },
      orderBy: { id: "asc" },
    });
    if (!prod || !prod.variants[0]) throw new Error("seed không có sản phẩm AUTO_STOCK cho quà");
    const variant = prod.variants[0];
    const avail = await prisma.premiumStock.count({ where: { variantId: variant.id, status: "AVAILABLE" } });
    if (avail < 2) for (let i = avail; i < 2; i++) await prisma.premiumStock.create({ data: { variantId: variant.id, payload: `PASS-GIFT-DEMO-${Date.now()}-${i}` } });
    const kv: Record<string, string> = {
      pass_enabled: "1", pass_price_1m: "49000", pass_price_3m: "129000", pass_price_12m: "399000",
      pass_cashback_percent: "10", pass_discount_percent: "5", pass_scope: "ALL",
      pass_gift_product_id: String(prod.id), pass_gift_variant_id: String(variant.id),
    };
    for (const [k, v] of Object.entries(kv)) await prisma.setting.upsert({ where: { key: k }, create: { key: k, value: v }, update: { value: v } });
    const faqCat = await prisma.postCategory.upsert({ where: { slug: "pass-faq" }, create: { slug: "pass-faq", name: "Hỏi đáp về Pass" }, update: {} });
    const posts: Array<[string, string, string]> = [
      ["pass-faq-mua-the-nao", "Mua Pass bằng cách nào?", "<p>Bạn nạp tiền vào ví trên website rồi vào trang Pass chọn kỳ hạn 1, 3 hoặc 12 tháng và bấm Mua ngay — hệ thống trừ trực tiếp từ số dư ví và kích hoạt ngay.</p>"],
      ["pass-faq-quyen-loi", "Quyền lợi của Pass gồm những gì?", "<p>Trong thời gian còn hạn, mỗi đơn thuộc phạm vi áp dụng được giảm thêm % khi thanh toán (áp sau flash sale và mã giảm giá) và được hoàn % số tiền thực trả về ví. Ngoài ra mỗi tháng bạn nhận miễn phí 1 phần quà do website chọn sẵn.</p>"],
      ["pass-faq-qua-thang", "Quà tháng nhận thế nào?", "<p>Vào trang Pass khi gói còn hạn và bấm Nhận quà tháng này. Mỗi tài khoản nhận tối đa 1 lần trong một tháng dương lịch; quà được giao qua đơn hàng như đơn mua thường.</p>"],
    ];
    for (const [slug, title, content] of posts) {
      await prisma.post.upsert({ where: { slug }, create: { slug, title, excerpt: title, content, categoryId: faqCat.id, published: true }, update: { categoryId: faqCat.id, published: true } });
    }
    await prisma.passGiftClaim.deleteMany({ where: { userId: demo.id } });
    await prisma.user.update({ where: { id: demo.id }, data: { passExpiresAt: new Date(Date.now() + 20 * 86400_000) } });
    console.log(JSON.stringify({ giftProduct: prod.name, giftVariant: variant.name }));
  } else if (mode === "cleanup") {
    const giftOrders = await prisma.premiumOrder.findMany({ where: { userId: demo.id, total: 0 }, select: { id: true } });
    await prisma.premiumStock.updateMany({ where: { orderId: { in: giftOrders.map((o) => o.id) } }, data: { status: "AVAILABLE", orderId: null } });
    await prisma.passGiftClaim.deleteMany({ where: { userId: demo.id } });
    await prisma.premiumOrder.deleteMany({ where: { id: { in: giftOrders.map((o) => o.id) } } });
    // Hoàn lại số tiền demo đã trừ khi mua/gia hạn Pass trong lúc chụp, rồi mới xoá sổ
    const spent = await prisma.transaction.aggregate({ where: { userId: demo.id, type: "PASS_PURCHASE" }, _sum: { amount: true } });
    if (spent._sum.amount) await prisma.user.update({ where: { id: demo.id }, data: { balance: { increment: -spent._sum.amount } } });
    await prisma.transaction.deleteMany({ where: { userId: demo.id, type: { in: ["PASS_PURCHASE", "PASS_CASHBACK"] } } });
    await prisma.notification.deleteMany({ where: { userId: demo.id, title: { contains: "Pass" } } });
    await prisma.user.update({ where: { id: demo.id }, data: { passExpiresAt: null } });
    await prisma.setting.deleteMany({ where: { key: { startsWith: "pass_" } } });
    console.log("cleanup ok");
  } else throw new Error("dùng: setup | cleanup");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
