/**
 * Fixture kiểm chứng đợt CÂN BẰNG TRANG NẠP TIỀN (2026-11-10): bật đủ 4
 * phương thức nạp như đợt chụp ảnh (QR ngân hàng + MoMo, PayPal, Stripe,
 * USDT qua mock BoltUtil ở :3997) và tuỳ chọn thêm lịch sử nạp mẫu.
 *   npx tsx scripts/naptien-balance-fixture.ts           -> bật 4 phương thức
 *   npx tsx scripts/naptien-balance-fixture.ts history   -> + 6 dòng lịch sử cho user demo
 *   npx tsx scripts/naptien-balance-fixture.ts clean     -> xoá fixture, trả về seed
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const KEYS: Record<string, string> = {
  bank_name: "Vietcombank",
  bank_account: "0123456789",
  bank_holder: "NGUYEN VAN A",
  momo_phone: "0901234567",
  momo_name: "NGUYEN VAN A",
  sepay_enabled: "1",
  paypal_enabled: "1",
  paypal_client_id: "fixture_client_id",
  paypal_client_secret: "fixture_client_secret",
  paypal_mode: "sandbox",
  stripe_enabled: "1",
  stripe_publishable_key: "pk_test_fixture",
  stripe_secret_key: "sk_test_fixture",
  boltutil_enabled: "1",
  boltutil_api_key: "bolt_test_key",
  boltutil_webhook_secret: "boltwhsec_test",
  boltutil_api_url: "http://127.0.0.1:3997",
  boltutil_networks: "TRON,BSC,SOLANA",
  boltutil_default_network: "TRON",
};

async function setSetting(key: string, value: string) {
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

async function main() {
  const mode = process.argv[2] || "on";
  const demo = await prisma.user.findUnique({ where: { username: "demo" } });
  if (!demo) throw new Error("chưa có user demo — chạy seed trước");

  if (mode === "clean") {
    await prisma.setting.deleteMany({ where: { key: { in: Object.keys(KEYS) } } });
    await prisma.deposit.deleteMany({ where: { code: { startsWith: "NAPFIX" } } });
    await prisma.deposit.deleteMany({ where: { userId: demo.id, method: "USDT", status: "PENDING", externalId: { startsWith: "bolt:" } } });
    await prisma.user.update({ where: { id: demo.id }, data: { totalDeposited: 0 } });
    console.log("cleaned fixture nap-tien");
    return;
  }

  for (const [k, v] of Object.entries(KEYS)) await setSetting(k, v);
  console.log("fixture: đã bật 4 phương thức nạp");

  if (mode === "history") {
    await prisma.deposit.deleteMany({ where: { code: { startsWith: "NAPFIX" } } });
    const rows = [
      { code: "NAPFIX01", method: "BANK" as const, amount: 500000, bonus: 10000, status: "APPROVED" as const, auto: true, daysAgo: 1 },
      { code: "NAPFIX02", method: "USDT" as const, amount: 254000, bonus: 0, status: "APPROVED" as const, auto: true, daysAgo: 2 },
      { code: "NAPFIX03", method: "BANK" as const, amount: 200000, bonus: 0, status: "PENDING" as const, auto: false, daysAgo: 3 },
      { code: "NAPFIX04", method: "BANK" as const, amount: 1000000, bonus: 50000, status: "APPROVED" as const, auto: true, daysAgo: 5 },
      { code: "NAPFIX05", method: "MOMO" as const, amount: 100000, bonus: 0, status: "REJECTED" as const, auto: false, daysAgo: 6 },
      { code: "NAPFIX06", method: "BANK" as const, amount: 300000, bonus: 0, status: "APPROVED" as const, auto: true, daysAgo: 8 },
    ];
    for (const r of rows) {
      await prisma.deposit.create({
        data: {
          code: r.code, userId: demo.id, method: r.method, amount: r.amount, bonus: r.bonus,
          status: r.status, auto: r.auto,
          createdAt: new Date(Date.now() - r.daysAgo * 86400000),
        },
      });
    }
    const total = rows.filter((r) => r.status === "APPROVED").reduce((s, r) => s + r.amount + r.bonus, 0);
    await prisma.user.update({ where: { id: demo.id }, data: { totalDeposited: total } });
    console.log(`fixture: đã thêm ${rows.length} dòng lịch sử, totalDeposited=${total}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
