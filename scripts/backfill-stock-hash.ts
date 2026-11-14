/**
 * Backfill payloadHash cho các dòng PremiumStock cũ (full-audit
 * a75d260 P3-01) + dọn trùng AVAILABLE trước khi unique index có
 * hiệu lực đầy đủ. Idempotent: chạy lại không đổi gì thêm.
 * Chạy: npx tsx scripts/backfill-stock-hash.ts
 */
import { createHash } from "crypto";
import { prisma } from "../src/lib/db";

const hashOf = (x: string) => createHash("sha256").update(x).digest("hex");

async function main() {
  const rows = await prisma.premiumStock.findMany({ orderBy: { id: "asc" } });
  const seen = new Map<string, number>();
  let filled = 0;
  let removed = 0;
  for (const r of rows) {
    const h = hashOf(r.payload);
    const key = `${r.variantId}|${h}`;
    if (seen.has(key)) {
      if (r.status === "AVAILABLE") {
        await prisma.premiumStock.delete({ where: { id: r.id } });
        removed++;
      }
      continue;
    }
    seen.set(key, r.id);
    if (r.payloadHash !== h) {
      await prisma.premiumStock.update({ where: { id: r.id }, data: { payloadHash: h } });
      filled++;
    }
  }
  console.log(`backfill xong: tong ${rows.length} dong, dien hash ${filled}, xoa trung AVAILABLE ${removed}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
