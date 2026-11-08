/** FIX8 — kiểm chứng TÁCH KHU đơn Premium: seed cho demo 4 đơn thuộc 4 tình
 *  huống (telegram_stars / steam_topup / Premium thường không nhóm / nhóm
 *  cửa hàng gamekeys) rồi đối chiếu số đếm theo điều kiện CŨ (chỉ userId —
 *  lẫn khu) với điều kiện MỚI regularPremiumWhere (đã tách).
 *  Chạy: `npx tsx scripts/seed-fix8-scope.ts seed|status|clean`. */
import { prisma } from "../src/lib/db";
import { regularPremiumWhere } from "../src/lib/order-scope";

const SLUGS = ["scope-tg-stars", "scope-steam-topup", "scope-regular-plain", "scope-gamekey"];
const CODES = ["PRE900001", "PRE900002", "PRE900003", "PRE900004"];

async function seed() {
  const demo = await prisma.user.findUnique({ where: { username: "demo" } });
  if (!demo) throw new Error("no demo");
  const cat = await prisma.premiumCategory.findFirst({ orderBy: { id: "asc" } });
  if (!cat) throw new Error("no category");
  const mk = async (slug: string, name: string, group: string | null, price: number, fulfillment: "MANUAL" | "API" = "MANUAL") => {
    const p = await prisma.premiumProduct.create({
      data: {
        categoryId: cat.id, name, slug, fulfillment,
        variants: { create: [{ name: "Gói scope", price, cost: price, active: true, providerGroup: group }] },
      },
      include: { variants: true },
    });
    return p.variants[0];
  };
  const vTg = await mk(SLUGS[0], "Scope Telegram Stars", "telegram_stars", 111000, "API");
  const vSteam = await mk(SLUGS[1], "Scope Steam Top-Up", "steam_topup", 222000, "API");
  const vPlain = await mk(SLUGS[2], "Scope Regular Plain", null, 100000);
  const vGame = await mk(SLUGS[3], "Scope Game Key", "gamekeys", 50000, "API");
  const ord = (code: string, variantId: number, status: any, total: number, buyerInfo: string) =>
    prisma.premiumOrder.create({ data: { code, userId: demo.id, variantId, quantity: 1, total, status, buyerInfo } });
  await ord(CODES[0], vTg.id, "DELIVERED", 999000, "Tên người dùng Telegram: @demo_user");
  await ord(CODES[1], vSteam.id, "PENDING", 888000, "Steam login: demo_steam");
  await ord(CODES[2], vPlain.id, "DELIVERED", 100000, "Email nhận hàng: demo@example.com");
  await ord(CODES[3], vGame.id, "PENDING", 50000, "");
  console.log(JSON.stringify({ demoId: demo.id, seeded: CODES }));
}

async function counts() {
  const demo = await prisma.user.findUnique({ where: { username: "demo" } });
  if (!demo) throw new Error("no demo");
  const uid = demo.id;
  const stats = async (base: (extra?: any) => any) => {
    const [total, delivered, pending, spent] = await Promise.all([
      prisma.premiumOrder.count({ where: base() }),
      prisma.premiumOrder.count({ where: base({ status: { in: ["DELIVERED", "COMPLETED"] } }) }),
      prisma.premiumOrder.count({ where: base({ status: "PENDING" }) }),
      prisma.premiumOrder.aggregate({ where: base({ status: { notIn: ["CANCELED", "REFUNDED"] } }), _sum: { total: true } }),
    ]);
    return { total, delivered, pending, spent: spent._sum.total || 0 };
  };
  const oldStats = await stats((extra = {}) => ({ userId: uid, ...extra }));
  const newStats = await stats((extra = {}) => ({ ...regularPremiumWhere(uid), ...extra }));
  const adminOld = await prisma.premiumOrder.count({ where: {} });
  const adminNew = await prisma.premiumOrder.count({ where: regularPremiumWhere() });
  const badgeOld = await prisma.premiumOrder.count({ where: { status: { in: ["PENDING", "WARRANTY"] } } });
  const badgeNew = await prisma.premiumOrder.count({ where: { ...regularPremiumWhere(), status: { in: ["PENDING", "WARRANTY"] } } });
  const list = await prisma.premiumOrder.findMany({ where: regularPremiumWhere(uid), orderBy: { id: "desc" }, select: { code: true } });
  console.log(JSON.stringify({
    demoId: uid, balance: demo.balance,
    customerStats: { before: oldStats, after: newStats },
    donPremiumListAfter: list.map((o) => o.code),
    adminQueue: { before: adminOld, after: adminNew },
    adminBadge: { before: badgeOld, after: badgeNew },
  }, null, 1));
}

async function clean() {
  await prisma.premiumOrder.deleteMany({ where: { code: { in: CODES } } });
  const products = await prisma.premiumProduct.findMany({ where: { slug: { in: SLUGS } }, select: { id: true } });
  const pids = products.map((p) => p.id);
  if (pids.length) {
    const variants = await prisma.premiumVariant.findMany({ where: { productId: { in: pids } }, select: { id: true } });
    await prisma.premiumOrder.deleteMany({ where: { variantId: { in: variants.map((v) => v.id) } } });
    await prisma.premiumVariant.deleteMany({ where: { productId: { in: pids } } });
    await prisma.premiumProduct.deleteMany({ where: { id: { in: pids } } });
  }
  await prisma.user.updateMany({ where: { username: "demo" }, data: { balance: 500000 } });
  const left = await prisma.premiumOrder.count({ where: { code: { in: CODES } } });
  console.log(JSON.stringify({ cleaned: true, leftoverScopeOrders: left }));
}

(async () => {
  const cmd = process.argv[2];
  if (cmd === "seed") await seed();
  else if (cmd === "clean") await clean();
  else await counts();
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
