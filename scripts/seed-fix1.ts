/**
 * Seed phục vụ chụp kiểm chứng đợt fix1 (trang chủ shopkey + §C) rồi dọn sạch:
 *   npx tsx scripts/seed-fix1.ts seed   -> flash sale 20% + đơn mẫu lấy số "đã bán" + /tmp/shots-fix1.json
 *   npx tsx scripts/seed-fix1.ts clean  -> xoá hết artifact, khôi phục admin_2fa_required "1" + demo 500000
 */
import { writeFileSync } from "node:fs";
import { SignJWT } from "jose";
import { prisma } from "../src/lib/db";
import { setSetting } from "../src/lib/settings";

async function mint(u: any) {
  const secret = new TextEncoder().encode((process.env.AUTH_SECRET || "").replace(/^"|"$/g, ""));
  return new SignJWT({ uid: u.id, role: u.role, username: u.username, sv: u.sessionVersion })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2h").sign(secret);
}

const CODE_PREFIX = "SHOTF1-";

async function seed() {
  const demo: any = await prisma.user.findUnique({ where: { username: "demo" } });
  const admin: any = await prisma.user.findUnique({ where: { username: "admin" } });
  await setSetting("admin_2fa_required", "0");

  const now = new Date();
  const flash = await prisma.flashSale.create({
    data: { name: "FIX1 SHOT", percent: 20, scope: "PREMIUM", startsAt: new Date(now.getTime() - 3600e3), endsAt: new Date(now.getTime() + 86400e3), active: true },
  });

  // Số "đã bán" mẫu: youtube 6, netflix 4, spotify 3, canva 2, elsa 1 (đơn của admin)
  const plan: Record<string, number> = { "youtube-premium": 6, "netflix-premium": 4, "spotify-premium": 3, "canva-pro": 2, "elsa-speak-pro": 1 };
  let n = 0;
  for (const [slug, count] of Object.entries(plan)) {
    const p: any = await prisma.premiumProduct.findUnique({ where: { slug }, include: { variants: { where: { active: true }, orderBy: { price: "asc" } } } });
    if (!p?.variants[0]) continue;
    for (let i = 0; i < count; i++) {
      n++;
      await prisma.premiumOrder.create({
        data: { code: `${CODE_PREFIX}${String(n).padStart(3, "0")}`, userId: admin.id, variantId: p.variants[0].id, quantity: 1, total: p.variants[0].price, status: "COMPLETED" },
      });
    }
  }

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
      image: null, price: v.price, qty: cart.length === 0 ? 1 : 2,
      custom: {}, buyerInfo: null,
      stockCap: p.fulfillment === "AUTO_STOCK" ? 5 : null, group: v.providerGroup || null,
    });
  }

  writeFileSync("/tmp/shots-fix1.json", JSON.stringify({ demo: await mint(demo), admin: await mint(admin), cart, flashId: flash.id }, null, 2));
  console.log("SEEDED", JSON.stringify({ orders: n, cartLines: cart.length, flashId: flash.id }));
  process.exit(0);
}

async function clean() {
  await prisma.premiumOrder.deleteMany({ where: { code: { startsWith: CODE_PREFIX } } });
  await prisma.flashSale.deleteMany({ where: { name: "FIX1 SHOT" } });
  await setSetting("admin_2fa_required", "1");
  const demo = await prisma.user.findUnique({ where: { username: "demo" } });
  if (demo) await prisma.user.update({ where: { id: demo.id }, data: { balance: 500000 } });
  console.log("CLEANED");
  process.exit(0);
}

(process.argv[2] === "clean" ? clean() : seed()).catch((e) => { console.error(e); process.exit(1); });
