/**
 * Full-audit 6750109 P2-03 — providerOrderId không còn VARCHAR(60):
 * đơn Telegram Premium quantity=10 tạo 10 mã đơn con; mọi mã phải được
 * lưu (cột TEXT) và poll truy được từng mã. Cộng kiểm tra ghi trực
 * tiếp một chuỗi mã dài 259 ký tự (>60) không còn lỗi tràn cột.
 * Cần mock FZR: tự spawn scripts/mock-fzr.mjs (port 3998).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { prisma } from "../src/lib/db";
import { executeFzrPremiumOrder, pollFzrPremiumOrder } from "../src/lib/fzr-orders";

let fails = 0;
function ok(cond: boolean, label: string) {
  console.log(`${cond ? "PASS" : "FAIL"} ${label}`);
  if (!cond) fails++;
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const proc: ChildProcess = spawn("node", ["scripts/mock-fzr.mjs"], { stdio: "ignore" });
  await wait(1200);
  try {
    const stamp = Date.now().toString(36);
    const user = await prisma.user.create({
      data: {
        username: `cid${stamp}`, email: `cid${stamp}@t.local`, passwordHash: "x", balance: 0,
        apiKey: `cidkey${stamp}`, depositCode: `CI${stamp}`.slice(0, 12).toUpperCase(), refCode: `RF${stamp}`.toUpperCase(),
      },
    });
    const provider = await prisma.provider.create({
      data: { name: `MockFZR ${stamp}`, driver: "FZR", kind: "PREMIUM", apiUrl: "http://127.0.0.1:3998", apiKey: "fc_test_mock", currency: "USD", active: true } as any,
    });
    const cat = await prisma.premiumCategory.create({ data: { name: `CidCat ${stamp}`, slug: `cid-${stamp}` } });
    const product = await prisma.premiumProduct.create({
      data: { name: `CidProd ${stamp}`, slug: `cidp-${stamp}`, categoryId: cat.id, fulfillment: "API", providerId: provider.id, providerProductId: "telegram-premium" } as any,
    });
    const variant = await prisma.premiumVariant.create({
      data: { productId: product.id, name: "Premium 3 tháng", price: 30000, providerGroup: "telegram_premium", providerItemId: "3" } as any,
    });

    // 1) Ghi chuỗi mã dài 259 ký tự — VARCHAR(60) sẽ ném lỗi
    const longIds = Array.from({ length: 10 }, (_, i) => `fzr-child-order-${stamp}-${i}-xxxx`).join(",");
    const probe = await prisma.premiumOrder.create({
      data: { code: `CID${stamp}P`.slice(0, 16).toUpperCase(), userId: user.id, variantId: variant.id, quantity: 10, total: 300000, status: "PENDING", providerId: provider.id, providerOrderId: longIds },
    });
    const probeBack = await prisma.premiumOrder.findUnique({ where: { id: probe.id } });
    ok(probeBack?.providerOrderId === longIds && longIds.length > 60, `D1: chuỗi mã ${longIds.length} ký tự lưu/đọc nguyên vẹn`);

    // 2) Thực thi thật qty=10 qua mock: đủ 10 mã con được lưu
    const order = await prisma.premiumOrder.create({
      data: { code: `CID${stamp}E`.slice(0, 16).toUpperCase(), userId: user.id, variantId: variant.id, quantity: 10, total: 300000, status: "PENDING", providerId: provider.id },
    });
    const variantFull = await prisma.premiumVariant.findUnique({ where: { id: variant.id } });
    const updated: any = await executeFzrPremiumOrder({
      order: order as any, variant: variantFull as any, provider: provider as any,
      inputs: { telegram_username: "buyer_user" },
    });
    const ids = (updated.providerOrderId || "").split(",").filter(Boolean);
    ok(ids.length === 10, `D2: đủ 10 mã đơn con sau thực thi (có ${ids.length})`);

    // 3) Poll truy được từng mã con (không lỗi, không mất dấu)
    const polled: any = await pollFzrPremiumOrder(updated);
    ok(!!polled && (polled.providerOrderId || "").split(",").filter(Boolean).length === 10, "D3: poll đọc lại đủ 10 mã con");

    await prisma.premiumOrder.deleteMany({ where: { userId: user.id } });
    await prisma.transaction.deleteMany({ where: { userId: user.id } });
    await prisma.notification.deleteMany({ where: { userId: user.id } });
    await prisma.premiumVariant.delete({ where: { id: variant.id } });
    await prisma.premiumProduct.delete({ where: { id: product.id } });
    await prisma.premiumCategory.delete({ where: { id: cat.id } });
    await prisma.provider.delete({ where: { id: provider.id } });
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  } finally {
    proc.kill();
  }

  console.log(fails === 0 ? "ALL PASS" : `${fails} FAIL`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
