/**
 * Fixture kiểm chứng đợt PICKER + FOOTER (2026-11-09): tạo 1 sản phẩm Premium
 * thường với 5 gói — có gói hết hàng (stockQty = 0), gói tên rất dài (~90 ký
 * tự), gói Giao nhanh/chậm, đủ bảo hành — và đặt tạm các kênh liên hệ trong
 * Cấu hình (hotline/telegram/facebook/zalo) để khối liên hệ ở footer có dữ
 * liệu thật mà hiển thị khi chụp ảnh. Toàn bộ là dữ liệu fixture local, bị
 * xoá khi chạy lại scripts/pg-local.sh (seed gốc).
 *   npx tsx scripts/picker-fixture.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const SLUG = "picker-kiem-chung";

async function main() {
  const cat = await prisma.premiumCategory.findFirst({ where: { active: true }, orderBy: { sort: "asc" } });
  if (!cat) throw new Error("Chưa có danh mục Premium nào trong seed");

  const existing = await prisma.premiumProduct.findUnique({ where: { slug: SLUG } });
  if (existing) {
    await prisma.premiumVariant.deleteMany({ where: { productId: existing.id } });
    await prisma.premiumProduct.delete({ where: { id: existing.id } });
  }
  const product = await prisma.premiumProduct.create({
    data: {
      categoryId: cat.id,
      name: "Sản phẩm kiểm chứng Picker",
      slug: SLUG,
      tagline: "Sản phẩm fixture phục vụ kiểm chứng khối chọn gói + footer (chỉ có ở bản local).",
      description: "<p>Mô tả ngắn của sản phẩm kiểm chứng.</p>",
      color: "#3178fc",
      fulfillment: "MANUAL",
      active: true,
      sort: 999,
    },
  });
  const variants = [
    { name: "Gói trải nghiệm 7 ngày", price: 19000, warrantyDays: 0, deliveryType: null as string | null, stockQty: null as number | null, sort: 1 },
    { name: "Gói 1 tháng", price: 55000, warrantyDays: 30, deliveryType: "FAST", stockQty: 12, sort: 2 },
    { name: "Gói 3 tháng", price: 149000, warrantyDays: 90, deliveryType: null, stockQty: null, sort: 3 },
    { name: "Gói 12 tháng — Nâng cấp chính chủ, bảo hành full thời gian, hỗ trợ đổi tài khoản khi lỗi", price: 499000, warrantyDays: 365, deliveryType: "FAST", stockQty: 3, sort: 4 },
    { name: "Gói 6 tháng", price: 279000, warrantyDays: 180, deliveryType: null, stockQty: 0, sort: 5 },
  ];
  for (const v of variants) {
    await prisma.premiumVariant.create({
      data: {
        productId: product.id, name: v.name, price: v.price, cost: 0,
        warrantyDays: v.warrantyDays, deliveryType: v.deliveryType, stockQty: v.stockQty, sort: v.sort, active: true,
      },
    });
  }

  // Kênh liên hệ fixture cho footer (settings — đúng nguồn admin cấu hình).
  const contacts: Record<string, string> = {
    support_hotline: "0901 234 567",
    support_telegram: "@smmv2hotro",
    support_facebook: "smmv2.vn",
    support_zalo: "0901234567",
  };
  for (const [key, value] of Object.entries(contacts)) {
    await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }

  const demo = await prisma.user.findFirst({ where: { username: "demo" }, select: { id: true, sessionVersion: true } });
  console.log(`fixture ready: product=${SLUG} variants=5 demo=${JSON.stringify(demo)}`);
}

main().finally(() => prisma.$disconnect());
