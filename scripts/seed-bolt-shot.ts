/**
 * Seed 1 phiên nạp BoltUtil đang chờ cho ảnh trang nạp tiền, rồi dọn:
 *   npx tsx scripts/seed-bolt-shot.ts seed|clean
 */
import { spawn, type ChildProcess } from "node:child_process";
import { prisma } from "../src/lib/db";
import { setSetting } from "../src/lib/settings";
import { getBoltConfig, boltCreateOrder } from "../src/lib/boltutil";
import { genCode } from "../src/lib/format";

async function seed() {
  const mock: ChildProcess = spawn("node", ["scripts/mock-boltutil.mjs"], { stdio: "ignore" });
  try {
    await new Promise((r) => setTimeout(r, 800));
    await setSetting("boltutil_enabled", "1");
    await setSetting("boltutil_api_key", "bolt_test_key");
    await setSetting("boltutil_webhook_secret", "boltwhsec_test");
    await setSetting("boltutil_api_url", "http://127.0.0.1:3997");
    await setSetting("boltutil_networks", "TRON,BSC,SOLANA");
    await setSetting("usdt_rate", "25000");
    const demo: any = await prisma.user.findUnique({ where: { username: "demo" } });
    const rate = 25000;
    const amountVnd = 500000;
    const usd = amountVnd / rate;
    const dep = await prisma.deposit.create({
      data: { code: "TMP", userId: demo.id, method: "USDT", amount: amountVnd, bonus: 0, status: "PENDING", auto: true, content: "TRON", usdCents: Math.round(usd * 100), providerData: JSON.stringify({ rateVndPerUsd: rate, network: "TRON", currency: "USDT", boltStatus: "CREATING" }) },
    });
    const code = genCode("NAP", dep.id);
    await prisma.deposit.update({ where: { id: dep.id }, data: { code, externalId: `bolt:${code}` } });
    const cfg = await getBoltConfig();
    const order = await boltCreateOrder(cfg, { externalOrderId: code, amountUsd: usd, network: "TRON" });
    await prisma.deposit.update({
      where: { id: dep.id },
      data: { providerRef: order.orderId, providerData: JSON.stringify({ rateVndPerUsd: rate, network: "TRON", currency: "USDT", externalOrderId: code, checkoutUrl: order.checkoutUrl, paymentAddress: order.paymentAddress, cryptoAmount: String(order.cryptoAmount), expiresAt: order.expiresAt, boltStatus: "PENDING" }) },
    });
    console.log("BOLT SEEDED", code, order.orderId);
    // giữ mock sống cho tới khi chụp xong: tiến trình cha (exec) kết thúc sẽ kill theo group — ghi pid để dọn tay
    console.log("MOCK_PID", mock.pid);
    mock.unref();
    // Không exit ngay: chờ tín hiệu file /tmp/bolt-shot-done tối đa 10 phút
    for (let i = 0; i < 600; i++) {
      const { existsSync } = await import("node:fs");
      if (existsSync("/tmp/bolt-shot-done")) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
  } finally {
    mock.kill();
  }
  process.exit(0);
}

async function clean() {
  await prisma.deposit.deleteMany({ where: { externalId: { startsWith: "bolt:" }, status: "PENDING" } });
  await setSetting("boltutil_enabled", "0");
  await setSetting("boltutil_api_key", "");
  await setSetting("boltutil_webhook_secret", "");
  await setSetting("boltutil_api_url", "");
  await setSetting("boltutil_networks", "TRON");
  console.log("BOLT CLEANED");
  process.exit(0);
}

(process.argv[2] === "clean" ? clean() : seed()).catch((e) => { console.error(e); process.exit(1); });
