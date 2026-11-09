/**
 * Fixture khu Manual Services cho kiểm chứng CDP (shots-manual.mjs):
 *  seed: tạo provider FZR trỏ mock :3998 (tỉ giá 25000, markup 20) -> chạy
 *        syncFzrCatalog THẬT chỉ nhóm manual (2 category của mock: ms-1
 *        standard + ms-2 replenishment có fields) -> bìa local wide ->
 *        thêm 2 sản phẩm fixture trực tiếp: 1 dịch vụ TẠM NGƯNG (mọi gói
 *        inactive -> dải cam "Tạm thời không khả dụng") + 1 dịch vụ info
 *        DÀI (popover chip file, kind replenishment -> chip loại giao).
 *  drop <providerProductId>: xoá 1 sản phẩm (+ variant + đơn) để test
 *        luồng picker thêm lại qua UI ở trang admin.
 *  clean: xoá provider + sản phẩm + đơn phát sinh + bìa local, demo về
 *        500.000đ, xoá setting markup khu của fixture.
 * Chạy: npx tsx scripts/fixture-manual.ts seed|drop <id>|clean
 */
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { prisma } from "../src/lib/db";
import { syncFzrCatalog } from "../src/lib/fzr-sync";

const PROVIDER_NAME = "FZR Mock (fixture manual)";
const MOCK = "http://127.0.0.1:3998";
const COVER_DIR = "public/ms-covers";

const ok = (cond: boolean, label: string) => console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);

function coverSvg(title: string, hue: number): string {
  const t = title.replace(/[<>&"]/g, "").slice(0, 30);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},65%,42%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360},70%,26%)"/></linearGradient></defs><rect width="800" height="400" fill="url(#g)"/><text x="36" y="330" font-family="Arial,sans-serif" font-size="30" font-weight="bold" fill="#ffffff">${t}</text><text x="36" y="362" font-family="Arial,sans-serif" font-size="15" fill="#ffffff" opacity="0.75">MANUAL SERVICE</text></svg>`;
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
  }
  if (existsSync(COVER_DIR)) rmSync(COVER_DIR, { recursive: true, force: true });
  await prisma.setting.deleteMany({ where: { key: "fzr_markup_manual" } });
  const demo = await prisma.user.findFirst({ where: { username: "demo" } });
  if (demo && demo.balance !== 500000) await prisma.user.update({ where: { id: demo.id }, data: { balance: 500000 } });
  if (!silent) console.log("clean xong");
}

async function seed() {
  await clean(true);
  const provider = await prisma.provider.create({
    data: { kind: "PREMIUM", driver: "FZR", name: PROVIDER_NAME, apiUrl: MOCK, apiKey: "fc_test_mock", currency: "USD", exchangeRate: 25000, markupPercent: 20, active: true },
  });
  const r = await syncFzrCatalog(provider as any, { groups: ["manual"] });
  console.log(`sync: created=${r.created} updated=${r.updated} variants=${r.variants} skipped=${r.skipped}`);
  const msCount = await prisma.premiumProduct.count({ where: { providerId: provider.id, variants: { some: { providerGroup: "manual" } } } });
  ok(msCount === 2, `sync tạo 2 category manual từ mock (thấy ${msCount})`);

  // Kiểm dữ liệu nguồn đã lưu đúng: kind + info + minutes/note của offer
  const ms2 = await prisma.premiumProduct.findFirst({
    where: { providerId: provider.id, providerProductId: "ms-2" },
    include: { variants: true },
  });
  ok(ms2?.providerKind === "replenishment", `ms-2 providerKind = replenishment (thấy ${ms2?.providerKind})`);
  ok((ms2?.description || "").includes("ID người chơi"), "ms-2 description = info của NCC");
  ok(ms2?.variants[0]?.deliveryMinutes === 30, `ms-2 offer deliveryMinutes = 30 (thấy ${ms2?.variants[0]?.deliveryMinutes})`);
  ok((ms2?.customFields || "").includes("player_id"), "ms-2 customFields chứa key player_id");

  // Bìa local wide cho các category đồng bộ
  mkdirSync(COVER_DIR, { recursive: true });
  const synced = await prisma.premiumProduct.findMany({ where: { providerId: provider.id, variants: { some: { providerGroup: "manual" } } }, select: { id: true, name: true, providerProductId: true } });
  let hue = 210;
  for (const p of synced) {
    const file = `${COVER_DIR}/${p.providerProductId}.svg`;
    writeFileSync(file, coverSvg(p.name, hue)); hue += 47;
    await prisma.premiumProduct.update({ where: { id: p.id }, data: { imageUrl: `/${file.replace("public/", "")}` } });
  }

  const cat = await prisma.premiumCategory.findFirst({ where: { name: "Dịch vụ thủ công" } });
  if (!cat) throw new Error("Chưa có PremiumCategory Dịch vụ thủ công sau sync");

  // Fixture 1 — dịch vụ TẠM NGƯNG: có sản phẩm nhưng MỌI gói inactive
  const off = await prisma.premiumProduct.create({
    data: {
      categoryId: cat.id, name: "Fixture Manual Unavailable (Global)", slug: "fixture-manual-unavailable",
      description: "Dịch vụ đang bảo trì phía nhà cung cấp.", providerKind: "standard",
      fulfillment: "API", providerId: provider.id, providerProductId: "fx-ms-off",
      imageUrl: "/ms-covers/fx-off.svg",
    },
  });
  writeFileSync(`${COVER_DIR}/fx-off.svg`, coverSvg(off.name, 20));
  await prisma.premiumVariant.create({
    data: {
      productId: off.id, name: "Gói tạm ngưng", price: 50000, cost: 0, warrantyDays: 0,
      providerId: provider.id, providerGroup: "manual", providerItemId: "fx-off-1", active: false,
    },
  });

  // Fixture 2 — info DÀI (popover) + kind replenishment (chip loại giao)
  const longInfo = [
    "Region: US",
    "Warranty: 24 hours after delivery.",
    "9+ means the accounts are reliable and the balance can usually be spent immediately after login with a very low chance of suspension.",
    "Please keep the account credentials unchanged for the first 24 hours so the warranty stays valid.",
  ].join("\n");
  const li = await prisma.premiumProduct.create({
    data: {
      categoryId: cat.id, name: "Fixture Manual Long Info (US)", slug: "fixture-manual-long-info",
      description: longInfo, providerKind: "replenishment",
      fulfillment: "API", providerId: provider.id, providerProductId: "fx-ms-long",
      imageUrl: "/ms-covers/fx-long.svg",
    },
  });
  writeFileSync(`${COVER_DIR}/fx-long.svg`, coverSvg(li.name, 280));
  await prisma.premiumVariant.create({
    data: {
      productId: li.id, name: "Tài khoản nạp sẵn 9+", price: 99000, cost: 0, warrantyDays: 0,
      providerId: provider.id, providerGroup: "manual", providerItemId: "fx-long-1",
      deliveryMinutes: 120, providerNote: "Giao tài khoản qua mục Chi tiết giao của đơn.",
    },
  });

  const total = await prisma.premiumProduct.count({ where: { variants: { some: { providerGroup: "manual" } } } });
  ok(total === 4, `tổng sản phẩm manual = 4 (2 sync + 2 fixture), thấy ${total}`);
}

async function main() {
  const mode = process.argv[2] || "clean";
  try {
    if (mode === "seed") await seed();
    else if (mode === "drop") {
      const pid = process.argv[3];
      const provider = await prisma.provider.findFirst({ where: { name: PROVIDER_NAME } });
      if (!provider || !pid) throw new Error("thiếu provider hoặc providerProductId");
      const p = await prisma.premiumProduct.findFirst({ where: { providerId: provider.id, providerProductId: pid }, select: { id: true } });
      if (p) await deleteProductDeep(p.id);
      console.log(`dropped ${pid}`);
    } else await clean();
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
