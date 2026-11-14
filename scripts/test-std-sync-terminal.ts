/**
 * Full-audit a75d260 P2-02 — syncPremiumOrderStatus không được hồi
 * sinh đơn đã REFUNDED/CANCELED dù history của NCC vẫn trả completed
 * kèm nội dung giao. (Lớp action adminPremiumOrderAction chặn cùng
 * điều kiện trước khi gọi sang service.)
 */
import { createServer } from "node:http";
import { prisma } from "../src/lib/db";
import { syncPremiumOrderStatus } from "../src/lib/orders";

let fails = 0;
function ok(cond: boolean, label: string) {
  console.log(`${cond ? "PASS" : "FAIL"} ${label}`);
  if (!cond) fails++;
}

async function main() {
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const params = new URLSearchParams(body);
      res.setHeader("Content-Type", "application/json");
      if (params.get("action") === "history") {
        res.end(JSON.stringify({ success: true, data: [{ order_code: "F", status: "completed", data: "DELIVERY-F" }], pagination: { last_page: 1 } }));
      } else {
        res.end(JSON.stringify({ success: true, data: [] }));
      }
    });
  });
  await new Promise<void>((r) => server.listen(3994, r));
  try {
    const stamp = Date.now().toString(36);
    const user = await prisma.user.create({
      data: {
        username: `sst${stamp}`, email: `sst${stamp}@t.local`, passwordHash: "x", balance: 50000,
        apiKey: `sstkey${stamp}`, depositCode: `ST${stamp}`.slice(0, 12).toUpperCase(), refCode: `RF${stamp}`.toUpperCase(),
      },
    });
    const provider = await prisma.provider.create({
      data: { name: `MockSTD-T ${stamp}`, driver: "STANDARD", kind: "PREMIUM", apiUrl: "http://127.0.0.1:3994/api/product", apiKey: "std_test", currency: "VND", active: true } as any,
    });
    const cat = await prisma.premiumCategory.create({ data: { name: `SstCat ${stamp}`, slug: `sst-${stamp}` } });
    const product = await prisma.premiumProduct.create({
      data: { name: `SstProd ${stamp}`, slug: `sstp-${stamp}`, categoryId: cat.id, fulfillment: "API", providerId: provider.id, providerProductId: "6" } as any,
    });
    const variant = await prisma.premiumVariant.create({ data: { productId: product.id, name: "Gói", price: 30000 } });
    const mk = async (code: string, status: "REFUNDED" | "CANCELED") =>
      prisma.premiumOrder.create({
        data: { code, userId: user.id, variantId: variant.id, quantity: 1, total: 30000, status, providerId: provider.id, providerOrderId: "F", refundedAmount: status === "REFUNDED" ? 30000 : 0 },
      });

    for (const st of ["REFUNDED", "CANCELED"] as const) {
      const o = await mk(`SST${stamp}${st === "REFUNDED" ? "R" : "C"}`.slice(0, 16).toUpperCase(), st);
      const after: any = await syncPremiumOrderStatus(o as any);
      const fresh = await prisma.premiumOrder.findUnique({ where: { id: o.id } });
      ok(fresh?.status === st && !fresh?.deliveryData && after?.status === st,
        `T-${st}: sync giữ nguyên ${st}, không hồi sinh DELIVERED`);
    }
    const balNow = (await prisma.user.findUnique({ where: { id: user.id } }))!.balance;
    ok(balNow === 50000, "T-BAL: số dư không đổi sau các lượt sync đơn kết thúc");

    await prisma.premiumOrder.deleteMany({ where: { userId: user.id } });
    await prisma.transaction.deleteMany({ where: { userId: user.id } });
    await prisma.notification.deleteMany({ where: { userId: user.id } });
    await prisma.premiumVariant.delete({ where: { id: variant.id } });
    await prisma.premiumProduct.delete({ where: { id: product.id } });
    await prisma.premiumCategory.delete({ where: { id: cat.id } });
    await prisma.provider.delete({ where: { id: provider.id } });
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  } finally {
    server.close();
  }
  console.log(fails === 0 ? "ALL PASS" : `${fails} FAIL`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
