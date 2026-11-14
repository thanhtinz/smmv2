/**
 * Full-audit a75d260 P3-01 — nhập kho không tạo trùng credential:
 * payload đang SOLD bị bỏ qua; hai lượt nhập đồng thời cùng một lô
 * chỉ tạo một dòng cho mỗi payload (unique DB + skipDuplicates).
 * Test mô phỏng đúng thân hàm adminImportStock (action cần phiên
 * admin nên không gọi trực tiếp được từ script — cùng mẫu
 * test-admin-order-cas).
 */
import { createHash } from "crypto";
import { prisma } from "../src/lib/db";

let fails = 0;
function ok(cond: boolean, label: string) {
  console.log(`${cond ? "PASS" : "FAIL"} ${label}`);
  if (!cond) fails++;
}
const hashOf = (x: string) => createHash("sha256").update(x).digest("hex");

async function importLikeAction(variantId: number, rawItems: string[]): Promise<number> {
  const items = Array.from(new Set(rawItems));
  const existing = await prisma.premiumStock.findMany({
    where: { variantId, OR: [{ payload: { in: items } }, { payloadHash: { in: items.map(hashOf) } }] },
    select: { payload: true, payloadHash: true },
  });
  const dupPayloads = new Set(existing.map((x) => x.payload));
  const dupHashes = new Set(existing.map((x) => x.payloadHash).filter(Boolean));
  const fresh = items.filter((x) => !dupPayloads.has(x) && !dupHashes.has(hashOf(x)));
  if (!fresh.length) return 0;
  const r = await prisma.premiumStock.createMany({
    data: fresh.map((payload) => ({ variantId, payload, payloadHash: hashOf(payload) })),
    skipDuplicates: true,
  });
  return r.count;
}

async function main() {
  const stamp = Date.now().toString(36);
  const cat = await prisma.premiumCategory.create({ data: { name: `SidCat ${stamp}`, slug: `sid-${stamp}` } });
  const product = await prisma.premiumProduct.create({ data: { name: `SidProd ${stamp}`, slug: `sidp-${stamp}`, categoryId: cat.id } });
  const variant = await prisma.premiumVariant.create({ data: { productId: product.id, name: "Gói", price: 10000 } });

  // Một payload đã SOLD từ trước
  await prisma.premiumStock.create({
    data: { variantId: variant.id, payload: "SOLD-KEY-1", payloadHash: hashOf("SOLD-KEY-1"), status: "SOLD" },
  });

  const n1 = await importLikeAction(variant.id, ["SOLD-KEY-1", "FRESH-KEY-1", "FRESH-KEY-1", "FRESH-KEY-2"]);
  const rows1 = await prisma.premiumStock.count({ where: { variantId: variant.id } });
  ok(n1 === 2 && rows1 === 3, `D1: nhập lại payload SOLD bị bỏ qua, lô tạo 2 dòng mới (tạo ${n1}, tổng ${rows1})`);

  // Hai lượt nhập đồng thời cùng một lô mới
  const [a, b] = await Promise.all([
    importLikeAction(variant.id, ["RACE-KEY-1", "RACE-KEY-2"]),
    importLikeAction(variant.id, ["RACE-KEY-1", "RACE-KEY-2"]),
  ]);
  const raceRows = await prisma.premiumStock.count({ where: { variantId: variant.id, payload: { in: ["RACE-KEY-1", "RACE-KEY-2"] } } });
  ok(raceRows === 2 && a + b === 2, `D2: hai lượt đồng thời -> mỗi payload đúng 1 dòng (tạo ${a}+${b}, DB ${raceRows})`);

  // Unique ở DB chặn cả đường ghi thẳng không qua bộ lọc
  let blocked = false;
  try {
    await prisma.premiumStock.create({ data: { variantId: variant.id, payload: "SOLD-KEY-1", payloadHash: hashOf("SOLD-KEY-1") } });
  } catch { blocked = true; }
  ok(blocked, "D3: DB unique (variantId, payloadHash) chặn ghi trùng trực tiếp");

  await prisma.premiumStock.deleteMany({ where: { variantId: variant.id } });
  await prisma.premiumVariant.delete({ where: { id: variant.id } });
  await prisma.premiumProduct.delete({ where: { id: product.id } });
  await prisma.premiumCategory.delete({ where: { id: cat.id } });

  console.log(fails === 0 ? "ALL PASS" : `${fails} FAIL`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
