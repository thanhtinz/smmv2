/**
 * Full-audit a75d260 P2-01 — syncPremiumOrderStatus (NCC chuẩn) không
 * còn chốt DELIVERED khi mới MỘT đơn con giao. Đơn quantity=3 với
 * [completed, processing, cancelled] phải sang PARTIAL + hoàn phần
 * huỷ đúng một lần; chỉ khi MỌI đơn con completed mới DELIVERED.
 * NCC chuẩn được giả bằng stub HTTP trong test (cổng 3995).
 */
import { createServer } from "node:http";
import { prisma } from "../src/lib/db";
import { syncPremiumOrderStatus } from "../src/lib/orders";

let fails = 0;
function ok(cond: boolean, label: string) {
  console.log(`${cond ? "PASS" : "FAIL"} ${label}`);
  if (!cond) fails++;
}

// Trạng thái history giả, test điều khiển được theo từng mã đơn con.
const HIST: Record<string, { status: string; data?: string }> = {};

async function main() {
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const params = new URLSearchParams(body);
      const action = params.get("action");
      res.setHeader("Content-Type", "application/json");
      if (action === "history") {
        const data = Object.entries(HIST).map(([order_code, v]) => ({ order_code, status: v.status, ...(v.data ? { data: v.data } : {}) }));
        res.end(JSON.stringify({ success: true, data, pagination: { last_page: 1 } }));
      } else if (action === "balance") {
        res.end(JSON.stringify({ success: true, data: { balance: 1000000 } }));
      } else {
        res.end(JSON.stringify({ success: true, data: [] }));
      }
    });
  });
  await new Promise<void>((r) => server.listen(3995, r));

  try {
    const stamp = Date.now().toString(36);
    const user = await prisma.user.create({
      data: {
        username: `ssm${stamp}`, email: `ssm${stamp}@t.local`, passwordHash: "x", balance: 0,
        apiKey: `ssmkey${stamp}`, depositCode: `SS${stamp}`.slice(0, 12).toUpperCase(), refCode: `RF${stamp}`.toUpperCase(),
      },
    });
    const provider = await prisma.provider.create({
      data: { name: `MockSTD ${stamp}`, driver: "STANDARD", kind: "PREMIUM", apiUrl: "http://127.0.0.1:3995/api/product", apiKey: "std_test", currency: "VND", active: true } as any,
    });
    const cat = await prisma.premiumCategory.create({ data: { name: `SsmCat ${stamp}`, slug: `ssm-${stamp}` } });
    const product = await prisma.premiumProduct.create({
      data: { name: `SsmProd ${stamp}`, slug: `ssmp-${stamp}`, categoryId: cat.id, fulfillment: "API", providerId: provider.id, providerProductId: "6" } as any,
    });
    const variant = await prisma.premiumVariant.create({ data: { productId: product.id, name: "Gói", price: 30000 } });
    const mkOrder = async (code: string, ids: string, qty: number, total: number) =>
      prisma.premiumOrder.create({
        data: { code, userId: user.id, variantId: variant.id, quantity: qty, total, status: "PENDING", providerId: provider.id, providerOrderId: ids },
      });
    const bal = async () => (await prisma.user.findUnique({ where: { id: user.id } }))!.balance;
    const get = async (id: number) => (await prisma.premiumOrder.findUnique({ where: { id } }))!;

    // Đơn 3 con: A xong, B đang chạy, C huỷ
    const o1 = await mkOrder(`SSM${stamp}1`.slice(0, 16).toUpperCase(), "A,B,C", 3, 90000);
    HIST.A = { status: "completed", data: "DELIVERY-A" };
    HIST.B = { status: "processing" };
    HIST.C = { status: "cancelled" };
    await syncPremiumOrderStatus(o1 as any);
    let cur = await get(o1.id);
    ok(cur.status === "PARTIAL" && (cur.deliveryData || "").includes("DELIVERY-A"),
      `M1: [completed, processing, cancelled] -> PARTIAL + giữ phần đã giao (đang ${cur.status})`);
    ok(cur.refundedAmount === 30000 && (await bal()) === 30000,
      `M2: hoàn đúng phần đơn con huỷ 30000 (sổ ${cur.refundedAmount}, ví ${await bal()})`);

    // Đồng bộ lại nguyên trạng: không hoàn hai lần
    await syncPremiumOrderStatus(cur as any);
    cur = await get(o1.id);
    ok(cur.refundedAmount === 30000 && (await bal()) === 30000, "M3: đồng bộ lặp không hoàn trùng");

    // B xong nốt: vẫn PARTIAL (1 con đã huỷ + hoàn), nội dung đủ 2 phần
    HIST.B = { status: "completed", data: "DELIVERY-B" };
    await syncPremiumOrderStatus(cur as any);
    cur = await get(o1.id);
    ok(cur.status === "PARTIAL" && (cur.deliveryData || "").includes("DELIVERY-B"),
      "M4: con còn lại giao xong -> PARTIAL với đủ nội dung 2 phần");

    // Đơn 2 con: 1 xong 1 đang chạy -> PARTIAL không hoàn; đủ 2 -> DELIVERED
    const o2 = await mkOrder(`SSM${stamp}2`.slice(0, 16).toUpperCase(), "D,E", 2, 60000);
    HIST.D = { status: "completed", data: "DELIVERY-D" };
    HIST.E = { status: "processing" };
    await syncPremiumOrderStatus(o2 as any);
    cur = await get(o2.id);
    ok(cur.status === "PARTIAL" && cur.refundedAmount === 0, "M5: [completed, processing] -> PARTIAL, chưa hoàn");
    HIST.E = { status: "completed", data: "DELIVERY-E" };
    await syncPremiumOrderStatus(cur as any);
    cur = await get(o2.id);
    ok(cur.status === "DELIVERED" && (cur.deliveryData || "").includes("DELIVERY-E"), "M6: đủ 2/2 completed -> DELIVERED");

    // Đơn 1 con completed (đường phổ biến) -> DELIVERED như cũ
    const o3 = await mkOrder(`SSM${stamp}3`.slice(0, 16).toUpperCase(), "F", 1, 30000);
    HIST.F = { status: "completed", data: "DELIVERY-F" };
    await syncPremiumOrderStatus(o3 as any);
    cur = await get(o3.id);
    ok(cur.status === "DELIVERED", "M7: đơn 1 con completed -> DELIVERED");

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
