/**
 * Test sống toàn bộ luồng đấu API kiểu ThaTim với mock provider (scripts/mock-provider.py):
 *   npx tsx scripts/test-provider.ts
 * Kiểm: sync SMM, sync Premium, đặt đơn API (+comments), sync trạng thái + hoàn partial,
 * mua premium qua API + sync history lấy nội dung giao, refill thật.
 */
import { prisma } from "../src/lib/db";
import { providerBalance, syncProviderServices, syncProviderPremium, providerRefill } from "../src/lib/provider";
import { createSmmOrder, createPremiumOrder, syncSmmOrderStatus, syncPremiumOrderStatus } from "../src/lib/orders";

const ok = (cond: boolean, label: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) process.exitCode = 1;
};

async function main() {
  const demo = await prisma.user.findUnique({ where: { username: "demo" } });
  if (!demo) throw new Error("Chưa seed demo user");

  const provider = await prisma.provider.upsert({
    where: { id: 999001 },
    create: { id: 999001, kind: "BOTH", name: "MockThaTim", apiUrl: "http://127.0.0.1:3999/api/v2", apiKey: "mock-key", currency: "VND", exchangeRate: 1, markupPercent: 50, active: true },
    update: { active: true },
  });

  const bal = await providerBalance(provider);
  ok(bal.vnd === 5000000, `balance quy VND = ${bal.vnd}`);

  const s1 = await syncProviderServices(provider);
  ok(s1.total === 2 && s1.created >= 0, `sync SMM services total=${s1.total} created=${s1.created}`);
  const tikService = await prisma.smmService.findFirst({ where: { providerId: provider.id, providerServiceId: "101" } });
  ok(!!tikService && tikService.rate === 30000, `giá bán = vốn 20000 + markup 50% = ${tikService?.rate}`);
  ok(tikService?.fulfillment === "API", "dịch vụ sync có fulfillment=API");

  const s2 = await syncProviderPremium(provider);
  ok(s2.total === 2 && s2.variants === 4, `sync Premium total=${s2.total} variants=${s2.variants}`);
  const netflix = await prisma.premiumProduct.findFirst({ where: { providerId: provider.id, providerProductId: "900" }, include: { variants: true } });
  ok(!!netflix && netflix.variants.length === 2, "Netflix Mock có 2 chu kỳ");
  const v1 = netflix!.variants.find((v) => v.providerCycle === 1)!;
  ok(v1.price === 45000 && v1.cost === 30000, `variant 1 tháng: bán ${v1.price} / vốn ${v1.cost}`);

  const balBefore = (await prisma.user.findUnique({ where: { id: demo.id } }))!.balance;

  // Đặt đơn SMM qua API provider, kèm comments cho dịch vụ comment
  const cmtService = await prisma.smmService.findFirst({ where: { providerId: provider.id, providerServiceId: "102" } });
  const o1 = await createSmmOrder({
    user: (await prisma.user.findUnique({ where: { id: demo.id } }))!,
    serviceId: cmtService!.id,
    link: "https://facebook.com/post/1",
    quantity: 10,
    extra: { comments: "Hay quá\nRất tốt" },
  });
  ok(o1.status === "PROCESSING" && !!o1.providerOrderId, `đơn comment đẩy sang provider, mã nguồn=${o1.providerOrderId}, params=${(o1 as any).params}`);

  const o2 = await createSmmOrder({
    user: (await prisma.user.findUnique({ where: { id: demo.id } }))!,
    serviceId: tikService!.id,
    link: "https://tiktok.com/@demo",
    quantity: 1000,
  });
  ok(o2.status === "PROCESSING", "đơn TikTok đang xử lý phía provider");
  const o2after = await syncSmmOrderStatus(o2 as any);
  ok(o2after?.status === "COMPLETED" && o2after?.startCount === 1500, `sync trạng thái -> COMPLETED, start=${o2after?.startCount}`);

  // Refill thật
  const rid = await providerRefill(provider, o2.providerOrderId!);
  ok(rid === "555001", `refill id=${rid}`);

  // Mua premium qua API provider
  const po = await createPremiumOrder({
    user: (await prisma.user.findUnique({ where: { id: demo.id } }))!,
    variantId: v1.id,
    quantity: 1,
    buyerInfo: "khach@gmail.com",
  });
  ok(po.status === "PENDING" && !!po.providerOrderId, `đơn premium API chờ giao, order_code nguồn=${po.providerOrderId}`);
  const poAfter = await syncPremiumOrderStatus(po as any);
  ok(poAfter?.status === "DELIVERED" && (poAfter?.deliveryData || "").includes("mock123"), `sync history -> DELIVERED, có nội dung giao`);

  const balAfter = (await prisma.user.findUnique({ where: { id: demo.id } }))!.balance;
  console.log(`Số dư demo: trước ${balBefore} -> sau ${balAfter} (đã trừ đơn comment ${o1.charge} + TikTok ${o2.charge} + Netflix ${po.total})`);
  ok(balBefore - balAfter === o1.charge + o2.charge + po.total, "số dư khớp tổng chi");

  console.log("== XONG ==");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("TEST ERROR:", e);
  await prisma.$disconnect();
  process.exit(1);
});
