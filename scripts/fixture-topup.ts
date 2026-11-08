/**
 * Fixture khu Top-Up cho kiểm chứng CDP (shots-topup.mjs):
 *  seed: tạo provider FZR trỏ mock :3998 (tỉ giá 25000, markup 20) -> chạy
 *        syncFzrCatalog THẬT (3 category topups theo OpenAPI: offers +
 *        fields[] qua /topups/offers) -> thêm 25 category fixture trực tiếp
 *        (đủ để kiểm phân trang 20/trang + tìm kiếm ở trang admin) -> thay
 *        ảnh bìa các category đồng bộ bằng bìa local /tp-covers/*.svg.
 *  drop <providerProductId>: xoá 1 sản phẩm (+ variant + đơn) để test luồng
 *        picker thêm lại qua UI.
 *  clean: xoá provider + sản phẩm + đơn phát sinh + bìa local, trả demo về
 *        500.000đ, dọn setting telegram_topup_* / markup khu của fixture.
 * Chạy: npx tsx scripts/fixture-topup.ts seed|drop <id>|clean
 */
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { prisma } from "../src/lib/db";
import { syncFzrCatalog } from "../src/lib/fzr-sync";

const PROVIDER_NAME = "FZR Mock (fixture topup)";
const MOCK = "http://127.0.0.1:3998";
const COVER_DIR = "public/tp-covers";

const ok = (cond: boolean, label: string) => console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);

function coverSvg(title: string, hue: number): string {
  const t = title.replace(/[<>&"]/g, "").slice(0, 26);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},65%,42%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360},70%,26%)"/></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/><text x="28" y="320" font-family="Arial,sans-serif" font-size="27" font-weight="bold" fill="#ffffff">${t}</text><text x="28" y="350" font-family="Arial,sans-serif" font-size="14" fill="#ffffff" opacity="0.75">TOP-UP</text></svg>`;
}

async function deleteProductDeep(productId: number) {
  const vids = (await prisma.premiumVariant.findMany({ where: { productId }, select: { id: true } })).map((v) => v.id);
  if (vids.length) {
    await prisma.premiumOrder.deleteMany({ where: { variantId: { in: vids } } });
    await prisma.premiumVariant.deleteMany({ where: { id: { in: vids } } });
  }
  await prisma.premiumProduct.delete({ where: { id: productId } });
}

async function clean(silent = false) {
  const provider = await prisma.provider.findFirst({ where: { name: PROVIDER_NAME } });
  if (provider) {
    const prods = await prisma.premiumProduct.findMany({ where: { providerId: provider.id }, select: { id: true } });
    for (const p of prods) await deleteProductDeep(p.id);
    await prisma.provider.delete({ where: { id: provider.id } });
    // Setting đường giao Telegram qua top-up trỏ vào provider fixture này
    const st = await prisma.setting.findMany({ where: { key: { in: ["telegram_topup_provider_id", "telegram_topup_category_id", "telegram_topup_offer_id", "telegram_topup_field"] } } });
    if (st.find((s) => s.key === "telegram_topup_provider_id")?.value === String(provider.id)) {
      await prisma.setting.updateMany({ where: { key: { startsWith: "telegram_topup_" } }, data: { value: "" } });
    }
  }
  await prisma.setting.deleteMany({ where: { key: { in: ["fzr_markup_topups", "fzr_markup_telegram_stars", "fzr_markup_telegram_premium"] } } });
  await prisma.premiumCategory.deleteMany({ where: { slug: { startsWith: "top-up-" }, products: { none: {} } } });
  const demo = await prisma.user.findFirst({ where: { username: "demo" } });
  if (demo) await prisma.user.update({ where: { id: demo.id }, data: { balance: 500000 } });
  if (existsSync(COVER_DIR)) rmSync(COVER_DIR, { recursive: true, force: true });
  if (!silent) console.log("clean xong");
}

async function seed() {
  await clean(true);
  const provider = await prisma.provider.create({
    data: { kind: "PREMIUM", driver: "FZR", name: PROVIDER_NAME, apiUrl: MOCK, apiKey: "fc_test_mock", currency: "USD", exchangeRate: 25000, markupPercent: 20, active: true },
  });
  const r = await syncFzrCatalog(provider as any);
  console.log(`sync: created=${r.created} updated=${r.updated} variants=${r.variants} skipped=${r.skipped}`);
  const tpCount = await prisma.premiumProduct.count({ where: { providerId: provider.id, variants: { some: { providerGroup: "topups" } } } });
  ok(tpCount === 3, `sync tạo 3 category top-up từ mock (thấy ${tpCount})`);

  // Bìa local cho các category đồng bộ (URL mock cdn.example.com không tải được)
  mkdirSync(COVER_DIR, { recursive: true });
  const synced = await prisma.premiumProduct.findMany({ where: { providerId: provider.id, variants: { some: { providerGroup: "topups" } } }, select: { id: true, name: true, providerProductId: true } });
  let hue = 200;
  for (const p of synced) {
    const file = `${COVER_DIR}/${p.providerProductId}.svg`;
    writeFileSync(file, coverSvg(p.name, hue)); hue += 47;
    await prisma.premiumProduct.update({ where: { id: p.id }, data: { imageUrl: `/${file.replace("public/", "")}` } });
  }

  // 25 category fixture để kiểm phân trang (20/trang) + tìm kiếm
  const cat = await prisma.premiumCategory.findFirst({ where: { name: "Top-Up" } });
  if (!cat) throw new Error("Chưa có PremiumCategory Top-Up sau sync");
  for (let i = 1; i <= 25; i++) {
    const nn = String(i).padStart(2, "0");
    const product = await prisma.premiumProduct.create({
      data: {
        categoryId: cat.id, name: `Fixture TopUp ${nn}`, slug: `fixture-topup-${nn}`,
        fulfillment: "API", providerId: provider.id, providerProductId: `fx-tp-${nn}`,
      },
    });
    await prisma.premiumVariant.create({
      data: {
        productId: product.id, name: `Gói fixture ${nn}`, price: 12000 + i * 1500, cost: 0, warrantyDays: 0,
        providerId: provider.id, providerGroup: "topups", providerItemId: `fx-of-${nn}`,
      },
    });
  }
  const total = await prisma.premiumProduct.count({ where: { variants: { some: { providerGroup: "topups" } } } });
  ok(total === 28, `tổng category top-up = 28 (3 sync + 25 fixture), thấy ${total}`);
  const demo = await prisma.user.findFirst({ where: { username: "demo" } });
  if (demo) await prisma.user.update({ where: { id: demo.id }, data: { balance: 500000 } });
  console.log("seed xong");
}

async function main() {
  const cmd = process.argv[2] || "seed";
  if (cmd === "seed") await seed();
  else if (cmd === "clean") await clean();
  else if (cmd === "drop") {
    const ppid = process.argv[3];
    const p = await prisma.premiumProduct.findFirst({ where: { providerProductId: ppid }, select: { id: true } });
    if (p) { await deleteProductDeep(p.id); console.log(`đã xoá sản phẩm ${ppid}`); }
    else console.log(`không thấy sản phẩm ${ppid}`);
  } else throw new Error(`Lệnh lạ: ${cmd}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
