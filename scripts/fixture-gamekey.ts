/**
 * FIX10 — fixture khu Game Key:
 *  seed: tạo provider FZR trỏ mock :3998 (tỉ giá 1000, markup 0) -> chạy
 *        syncFzrCatalog THẬT (5 game gamekeys theo OpenAPI: editions qua
 *        /gamekeys/keys, platform/region/stock) -> thêm 25 game fixture trực
 *        tiếp (đủ nền tảng/vùng/tồn kho để kiểm phân trang + lọc) -> thay
 *        ảnh bìa các game đồng bộ bằng bìa local /gk-covers/*.svg để chụp
 *        ảnh kiểm chứng (URL mock cdn.example.com không tải được).
 *  clean: xoá provider + sản phẩm gamekeys + đơn phát sinh, trả demo về
 *        500.000đ, xoá bìa local.
 * Chạy: npx tsx scripts/fixture-gamekey.ts seed|clean
 */
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { prisma } from "../src/lib/db";
import { syncFzrCatalog } from "../src/lib/fzr-sync";

const PROVIDER_NAME = "FZR Mock (fixture gamekey)";
const MOCK = "http://127.0.0.1:3998";
const COVER_DIR = "public/gk-covers";

const ok = (cond: boolean, label: string) => console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);

function coverSvg(title: string, hue: number): string {
  const t = title.replace(/[<>&"]/g, "").slice(0, 22);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},65%,42%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360},70%,26%)"/></linearGradient></defs><rect width="300" height="400" fill="url(#g)"/><text x="24" y="330" font-family="Arial,sans-serif" font-size="26" font-weight="bold" fill="#ffffff">${t}</text><text x="24" y="358" font-family="Arial,sans-serif" font-size="13" fill="#ffffff" opacity="0.75">GAME KEY</text></svg>`;
}

async function clean(silent = false) {
  const provider = await prisma.provider.findFirst({ where: { name: PROVIDER_NAME } });
  const variantIds = (await prisma.premiumVariant.findMany({
    where: { providerGroup: "gamekeys" },
    select: { id: true },
  })).map((v) => v.id);
  if (variantIds.length) {
    await prisma.premiumOrder.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.premiumVariant.deleteMany({ where: { id: { in: variantIds } } });
  }
  if (provider) {
    // Sản phẩm của provider này (kể cả các nhóm mock khác do sync tạo)
    const prods = await prisma.premiumProduct.findMany({ where: { providerId: provider.id }, select: { id: true } });
    const pids = prods.map((p) => p.id);
    if (pids.length) {
      const vids = (await prisma.premiumVariant.findMany({ where: { productId: { in: pids } }, select: { id: true } })).map((v) => v.id);
      if (vids.length) await prisma.premiumOrder.deleteMany({ where: { variantId: { in: vids } } });
      await prisma.premiumVariant.deleteMany({ where: { productId: { in: pids } } });
      await prisma.premiumProduct.deleteMany({ where: { id: { in: pids } } });
    }
    await prisma.provider.delete({ where: { id: provider.id } });
  }
  await prisma.premiumCategory.deleteMany({ where: { name: "Game Keys" } });
  const demo = await prisma.user.findFirst({ where: { username: "demo" } });
  if (demo) await prisma.user.update({ where: { id: demo.id }, data: { balance: 500000 } });
  if (existsSync(COVER_DIR)) rmSync(COVER_DIR, { recursive: true, force: true });
  if (!silent) console.log("clean xong");
}

const FIXTURE_GAMES: { name: string; platform: string; region: string; editions: { name: string; price: number; stock: number | null }[] }[] = [
  { name: "Fixture Alpha Quest", platform: "Steam", region: "GLOBAL", editions: [{ name: "Alpha Quest", price: 450000, stock: 30 }, { name: "Alpha Quest Deluxe", price: 690000, stock: 5 }] },
  { name: "Fixture Blade Runner X", platform: "Steam", region: "CIS", editions: [{ name: "Blade Runner X", price: 320000, stock: 0 }] },
  { name: "Fixture Castle Siege", platform: "GOG", region: "GLOBAL", editions: [{ name: "Castle Siege", price: 210000, stock: null }] },
  { name: "Fixture Dragon Vale", platform: "Steam", region: "EU", editions: [{ name: "Dragon Vale", price: 550000, stock: 18 }] },
  { name: "Fixture Emberfall", platform: "EA App", region: "GLOBAL", editions: [{ name: "Emberfall", price: 890000, stock: 9 }] },
  { name: "Fixture Frostbyte", platform: "Xbox", region: "NA", editions: [{ name: "Frostbyte", price: 610000, stock: 22 }] },
  { name: "Fixture Galaxy Raiders", platform: "Steam", region: "SEA", editions: [{ name: "Galaxy Raiders", price: 150000, stock: 77 }] },
  { name: "Fixture Harbor Kings", platform: "Ubisoft", region: "GLOBAL", editions: [{ name: "Harbor Kings", price: 430000, stock: 3 }] },
  { name: "Fixture Iron Harvest 2", platform: "Steam", region: "GLOBAL", editions: [{ name: "Iron Harvest 2", price: 720000, stock: 14 }] },
  { name: "Fixture Jungle Strike", platform: "Steam", region: "LATAM", editions: [{ name: "Jungle Strike", price: 99000, stock: 40 }] },
  { name: "Fixture Knightfall", platform: "GOG", region: "EU", editions: [{ name: "Knightfall", price: 380000, stock: 11 }] },
  { name: "Fixture Lunar Odyssey", platform: "Steam", region: "GLOBAL", editions: [{ name: "Lunar Odyssey", price: 840000, stock: 6 }, { name: "Lunar Odyssey GOTY", price: 990000, stock: 2 }] },
  { name: "Fixture Mecha Wars", platform: "EA App", region: "CIS", editions: [{ name: "Mecha Wars", price: 260000, stock: 19 }] },
  { name: "Fixture Neon Drift", platform: "Steam", region: "GLOBAL", editions: [{ name: "Neon Drift", price: 199000, stock: 51 }] },
  { name: "Fixture Ocean Depths", platform: "Xbox", region: "GLOBAL", editions: [{ name: "Ocean Depths", price: 470000, stock: 8 }] },
  { name: "Fixture Pirate Bay Tales", platform: "Steam", region: "EU", editions: [{ name: "Pirate Bay Tales", price: 290000, stock: 0 }, { name: "Pirate Bay Tales Gold", price: 410000, stock: 4 }] },
  { name: "Fixture Quantum Leap VR", platform: "Steam", region: "GLOBAL", editions: [{ name: "Quantum Leap VR", price: 660000, stock: 13 }] },
  { name: "Fixture Rogue Legacy X", platform: "GOG", region: "GLOBAL", editions: [{ name: "Rogue Legacy X", price: 175000, stock: 26 }] },
  { name: "Fixture Starforge", platform: "Steam", region: "NA", editions: [{ name: "Starforge", price: 920000, stock: 7 }] },
  { name: "Fixture Titanfall Arena", platform: "EA App", region: "GLOBAL", editions: [{ name: "Titanfall Arena", price: 540000, stock: 16 }] },
  { name: "Fixture Umbra Protocol", platform: "Ubisoft", region: "CIS", editions: [{ name: "Umbra Protocol", price: 360000, stock: 21 }] },
  { name: "Fixture Void Runners", platform: "Steam", region: "GLOBAL", editions: [{ name: "Void Runners", price: 240000, stock: 33 }] },
  { name: "Fixture Warfront 2077", platform: "Steam", region: "GLOBAL", editions: [{ name: "Warfront 2077", price: 780000, stock: 10 }] },
  { name: "Fixture Xenon Strike", platform: "Xbox", region: "EU", editions: [{ name: "Xenon Strike", price: 310000, stock: 12 }] },
  { name: "Fixture Zenith Blade", platform: "Steam", region: "SEA", editions: [{ name: "Zenith Blade", price: 505000, stock: 15 }] },
];

async function seed() {
  await clean(true);
  mkdirSync(COVER_DIR, { recursive: true });
  const provider = await prisma.provider.create({
    data: { kind: "BOTH", driver: "FZR", name: PROVIDER_NAME, apiUrl: MOCK, apiKey: "fc_test_mock", currency: "USD", exchangeRate: 1000, markupPercent: 0, active: true },
  });

  // 1) Đồng bộ THẬT từ mock (mọi nhóm; trọng tâm là gamekeys theo OpenAPI)
  const res = await syncFzrCatalog(provider);
  console.log("sync:", JSON.stringify(res));

  const gkProducts = await prisma.premiumProduct.findMany({
    where: { providerId: provider.id, variants: { some: { providerGroup: "gamekeys" } } },
    include: { variants: { where: { providerGroup: "gamekeys" }, orderBy: { price: "asc" } } },
    orderBy: { name: "asc" },
  });
  ok(gkProducts.length === 5, `sync tạo 5 game gamekeys (thấy ${gkProducts.length})`);
  const elden = gkProducts.find((p) => p.providerProductId === "gk-1");
  ok(!!elden && elden.providerPlatform === "Steam" && elden.providerRegion === "GLOBAL", "Elden Ring: platform=Steam, region=GLOBAL từ API");
  ok(!!elden && elden.variants.length === 3, `Elden Ring có 3 editions (thấy ${elden?.variants.length})`);
  ok(elden?.variants.find((v) => v.providerItemId === "gk-1-std")?.providerStock === 101, "edition std: providerStock=101");
  ok(elden?.variants.find((v) => v.providerItemId === "gk-1-std")?.price === 59990, "edition std: giá 59.99 USD x 1000 = 59.990đ");
  const bg3 = gkProducts.find((p) => p.providerProductId === "gk-2");
  ok(bg3?.variants.find((v) => v.providerItemId === "gk-2-std")?.providerStock === 0, "BG3 std: providerStock=0 (hết hàng)");
  const xgp = gkProducts.find((p) => p.providerProductId === "gk-5");
  ok(!!xgp && (xgp.variants[0]?.providerItemId || "").startsWith("name:"), "gk-5: key_id null phía FZR -> variant theo tên (name:...)");

  // Bìa local cho 5 game đồng bộ (URL mock không tải được trong sandbox)
  let ci = 0;
  for (const p of gkProducts) {
    const file = `sync-${p.providerProductId}.svg`;
    writeFileSync(`${COVER_DIR}/${file}`, coverSvg(p.name, 200 + ci * 25));
    await prisma.premiumProduct.update({ where: { id: p.id }, data: { imageUrl: `/gk-covers/${file}` } });
    ci++;
  }

  // 2) 25 game fixture trực tiếp
  const cat = await prisma.premiumCategory.findFirst({ where: { name: "Game Keys" } });
  if (!cat) throw new Error("sync chưa tạo category Game Keys");
  let fi = 0;
  for (const g of FIXTURE_GAMES) {
    fi++;
    const file = `fix-${String(fi).padStart(2, "0")}.svg`;
    writeFileSync(`${COVER_DIR}/${file}`, coverSvg(g.name, (fi * 47) % 360));
    await prisma.premiumProduct.create({
      data: {
        categoryId: cat.id,
        name: g.name,
        slug: `fzr-${provider.id}-gamekeys-fix-gk-${String(fi).padStart(2, "0")}`,
        imageUrl: `/gk-covers/${file}`,
        providerPlatform: g.platform,
        providerRegion: g.region,
        fulfillment: "API",
        providerId: provider.id,
        providerProductId: `fix-gk-${String(fi).padStart(2, "0")}`,
        variants: {
          create: g.editions.map((e, ei) => ({
            name: e.name, price: e.price, cost: Math.floor(e.price * 0.9), warrantyDays: 0,
            providerId: provider.id, providerGroup: "gamekeys",
            providerItemId: `fix-gk-${String(fi).padStart(2, "0")}-${ei + 1}`,
            providerStock: e.stock,
          })),
        },
      },
    });
  }
  const total = await prisma.premiumProduct.count({ where: { active: true, panelId: null, variants: { some: { providerGroup: "gamekeys", active: true } } } });
  ok(total === 30, `tổng catalog Game Key = 30 game (thấy ${total})`);
  console.log("seed xong. providerId =", provider.id);
}

(async () => {
  const mode = process.argv[2];
  if (mode === "seed") await seed();
  else if (mode === "clean") await clean();
  else { console.error("dùng: seed | clean"); process.exit(1); }
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
