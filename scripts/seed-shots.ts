/**
 * Seed dữ liệu phục vụ chụp màn hình kiểm chứng B′/C/D rồi dọn sạch:
 *   npx tsx scripts/seed-shots.ts seed    -> tạo mock provider + 2 đơn Telegram, in JSON phiên/cart vào /tmp/shots.json
 *   npx tsx scripts/seed-shots.ts clean   -> xoá mọi artifact, khôi phục demo 500000 + admin_2fa_required "1"
 */
import { spawn, type ChildProcess } from "node:child_process";
import { writeFileSync } from "node:fs";
import { SignJWT } from "jose";
import { prisma } from "../src/lib/db";
import { setSetting } from "../src/lib/settings";
import { syncFzrCatalog } from "../src/lib/fzr-sync";
import { createPremiumOrder } from "../src/lib/orders";
import { getTelegramVariants } from "../src/lib/tg";

const PROVIDER_ID = 999005;
const MOCK = "http://127.0.0.1:3998";

async function mint(u: any) {
  const secret = new TextEncoder().encode((process.env.AUTH_SECRET || "").replace(/^"|"$/g, ""));
  return new SignJWT({ uid: u.id, role: u.role, username: u.username, sv: u.sessionVersion })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2h").sign(secret);
}

async function seed() {
  const mock: ChildProcess = spawn("node", ["scripts/mock-fzr.mjs"], { stdio: "ignore" });
  try {
    for (let i = 0; i < 40; i++) { try { const r = await fetch(`${MOCK}/api/v2/balance`, { headers: { "X-API-Key": "fc_test_mock" } }); if (r.ok) break; } catch { /* chờ */ } await new Promise((r) => setTimeout(r, 250)); }
    await prisma.provider.upsert({
      where: { id: PROVIDER_ID },
      create: { id: PROVIDER_ID, name: "FZR Demo (mock)", kind: "PREMIUM", driver: "FZR", apiUrl: MOCK, apiKey: "fc_test_mock", currency: "USD", exchangeRate: 25000, markupPercent: 20, autoUpdatePrice: true, syncContent: true, active: true },
      update: { apiUrl: MOCK, apiKey: "fc_test_mock", driver: "FZR", active: true },
    });
    const provider: any = await prisma.provider.findUnique({ where: { id: PROVIDER_ID } });
    await syncFzrCatalog(provider, {});
    await setSetting("telegram_provider_id", String(PROVIDER_ID));
    await setSetting("telegram_enabled", "1");
    await setSetting("admin_2fa_required", "0");

    const demo: any = await prisma.user.findUnique({ where: { username: "demo" } });
    const admin: any = await prisma.user.findUnique({ where: { username: "admin" } });
    await prisma.user.update({ where: { id: demo.id }, data: { balance: 50000000 } });
    const { stars, premium } = await getTelegramVariants(PROVIDER_ID);
    const o1: any = await createPremiumOrder({ user: demo, variantId: stars!.id, quantity: 500, customData: { "Telegram user ID": "123456789", "Tên người dùng Telegram": "@tin_test" } });
    const p3 = premium.find((v: any) => v.providerItemId === "3")!;
    const o2: any = await createPremiumOrder({ user: demo, variantId: p3.id, quantity: 1, customData: { "Telegram user ID": "123456789", "Tên người dùng Telegram": "@tin_test" } });
    // Đơn premium để PENDING cho ảnh lịch sử có đủ trạng thái
    await prisma.premiumOrder.update({ where: { id: o2.id }, data: { status: "PENDING", deliveryData: null } });
    void o1;

    // Giỏ hàng mẫu: 2 variant thật của seed (1 gói đơn không trường bắt buộc + 1 gói bất kỳ)
    const products = await prisma.premiumProduct.findMany({
      where: { active: true, panelId: null },
      include: { variants: { where: { active: true }, orderBy: { price: "asc" } } },
      take: 30,
    });
    const cart: any[] = [];
    for (const p of products as any[]) {
      if (cart.length >= 2) break;
      const v = p.variants[0];
      if (!v) continue;
      cart.push({
        variantId: v.id, productId: p.id, productName: p.name, variantName: v.name,
        image: p.image || null, price: v.price, qty: cart.length === 0 ? 1 : 2,
        custom: {}, buyerInfo: null,
        stockCap: p.fulfillment === "AUTO_STOCK" ? 5 : null, group: v.providerGroup || null,
      });
    }
    writeFileSync("/tmp/shots.json", JSON.stringify({ demo: await mint(demo), admin: await mint(admin), cart }, null, 2));
    console.log("SEEDED", JSON.stringify({ orders: [o1.code, o2.code], cartLines: cart.length }));
  } finally {
    mock.kill();
  }
  process.exit(0);
}

async function clean() {
  const vIds = (await prisma.premiumVariant.findMany({ where: { providerId: PROVIDER_ID }, select: { id: true } })).map((v) => v.id);
  await prisma.premiumOrder.deleteMany({ where: { variantId: { in: vIds } } });
  const pIds = (await prisma.premiumProduct.findMany({ where: { variants: { some: { providerId: PROVIDER_ID } } }, select: { id: true } })).map((p) => p.id);
  await prisma.premiumVariant.deleteMany({ where: { providerId: PROVIDER_ID } });
  await prisma.premiumProduct.deleteMany({ where: { id: { in: pIds } } });
  await prisma.provider.deleteMany({ where: { id: PROVIDER_ID } });
  await setSetting("telegram_provider_id", "");
  await setSetting("telegram_topup_offer_id", "");
  await setSetting("telegram_topup_field", "");
  await setSetting("telegram_topup_provider_id", "");
  await setSetting("admin_2fa_required", "1");
  const demo = await prisma.user.findUnique({ where: { username: "demo" } });
  if (demo) await prisma.user.update({ where: { id: demo.id }, data: { balance: 500000 } });
  console.log("CLEANED");
  process.exit(0);
}

(process.argv[2] === "clean" ? clean() : seed()).catch((e) => { console.error(e); process.exit(1); });
