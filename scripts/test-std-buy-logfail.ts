/**
 * Full-audit 3d1309c P2-07 — trong vòng mua NCC chuẩn, apiLog.create lỗi
 * SAU khi provider đã nhận đơn không được tính là lượt mua thất bại.
 * Trước bản vá: log lỗi -> catch -> failed++ -> hoàn tiền cho đơn vị
 * vẫn được giao (giao hàng miễn phí). Nay log là best-effort.
 * Cách ép lỗi: thay prisma.apiLog.create bằng hàm ném lỗi trong lúc
 * chạy runPremiumApiFulfillment với stub provider trả buy thành công.
 */
import http from "http";
import { prisma } from "../src/lib/db";
import { runPremiumApiFulfillment } from "../src/lib/orders";

let fails = 0;
function ok(cond: boolean, label: string) {
  console.log(`${cond ? "PASS" : "FAIL"} ${label}`);
  if (!cond) fails++;
}

async function main() {
  // Stub provider STANDARD: buy -> thành công kèm nội dung giao
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const params = new URLSearchParams(body);
      const action = params.get("action");
      res.setHeader("Content-Type", "application/json");
      if (action === "buy") {
        res.end(JSON.stringify({ success: true, data: { order_code: "STD-LOG-1", delivery: "STD-DELIVERY-CONTENT" } }));
      } else {
        res.end(JSON.stringify({ success: true, data: [] }));
      }
    });
  });
  await new Promise<void>((r) => server.listen(3996, "127.0.0.1", r));

  const stamp = Date.now().toString(36);
  const user = await prisma.user.create({
    data: {
      username: `lgf${stamp}`, email: `lgf${stamp}@t.local`, passwordHash: "x", balance: 0,
      apiKey: `lgfkey${stamp}`, depositCode: `LG${stamp}`.slice(0, 12).toUpperCase(), refCode: `RF${stamp}`.toUpperCase(),
    },
  });
  const provider = await prisma.provider.create({
    data: { name: `StubStd ${stamp}`, driver: "STANDARD", kind: "PREMIUM", apiUrl: "http://127.0.0.1:3996/api/v2", apiKey: "stub", currency: "VND", active: true } as any,
  });
  const cat = await prisma.premiumCategory.create({ data: { name: `LgfCat ${stamp}`, slug: `lgf-${stamp}` } });
  const product = await prisma.premiumProduct.create({
    data: { name: `LgfProd ${stamp}`, slug: `lgfp-${stamp}`, categoryId: cat.id, fulfillment: "API", providerId: provider.id, providerProductId: "6" } as any,
  });
  const variant = await prisma.premiumVariant.create({
    data: { productId: product.id, name: "1 tháng", price: 40000, providerCycle: 1 } as any,
  });
  const order = await prisma.premiumOrder.create({
    data: { code: `LGF${stamp}`.slice(0, 16).toUpperCase(), userId: user.id, variantId: variant.id, quantity: 1, total: 40000, status: "PENDING", providerId: provider.id },
  });

  const variantFull = await prisma.premiumVariant.findUnique({ where: { id: variant.id }, include: { product: true } });
  const origCreate = (prisma as any).apiLog.create;
  (prisma as any).apiLog.create = async () => { throw new Error("log boom"); };
  let out: any;
  try {
    out = await runPremiumApiFulfillment({
      order: order as any, variant: variantFull as any, user: user as any,
      quantity: 1, customData: {}, buyerInfo: "buyer@t.local", total: 40000,
    });
  } finally {
    (prisma as any).apiLog.create = origCreate;
  }

  const after = (await prisma.premiumOrder.findUnique({ where: { id: order.id } }))!;
  const refunds = await prisma.transaction.count({ where: { userId: user.id, type: "REFUND", ref: order.code } });
  ok(after.providerOrderId === "STD-LOG-1", `L1: mã NCC được lưu dù log lỗi (${after.providerOrderId})`);
  ok(after.status === "DELIVERED" && (after.deliveryData || "").includes("STD-DELIVERY"), `L2: đơn DELIVERED kèm nội dung giao (${after.status})`);
  ok(refunds === 0 && after.refundedAmount === 0 && (await prisma.user.findUnique({ where: { id: user.id } }))!.balance === 0,
    "L3: KHÔNG hoàn tiền — log lỗi không biến thành lượt mua thất bại");
  ok(out?.id === order.id, "L4: fulfillment trả đơn bình thường");

  await prisma.premiumOrder.deleteMany({ where: { userId: user.id } });
  await prisma.transaction.deleteMany({ where: { userId: user.id } });
  await prisma.notification.deleteMany({ where: { userId: user.id } });
  await prisma.premiumVariant.delete({ where: { id: variant.id } });
  await prisma.premiumProduct.delete({ where: { id: product.id } });
  await prisma.premiumCategory.delete({ where: { id: cat.id } });
  await prisma.provider.delete({ where: { id: provider.id } });
  await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  server.close();

  console.log(fails === 0 ? "ALL PASS" : `${fails} FAIL`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
