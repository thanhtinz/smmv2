/** FIXTURE KIỂM CHỨNG ĐỢT 126 — luật module bật/tắt toàn web + banner tự
 *  co giãn theo tỉ lệ ảnh.
 *  Chạy: npx tsx scripts/fixture-modules-126.ts <state|setup|restore|set>
 *   - setup:   SNAPSHOT trạng thái gốc (19 khoá module + admin_2fa_required
 *              + toàn bộ HomeBanner) rồi tạo fixture: 1 banner 1920×640 có
 *              chữ SÁT 4 MÉP (kiểm chứng banner-fit), 1 mã công khai
 *              MOD126 (trang Ưu đãi + checkPromo), 1 đợt flash FLASH126
 *              đang chạy. admin_2fa_required giữ "0" trong lúc chụp (như
 *              các đợt trước) và khôi phục ở restore.
 *   - set <key> <0|1>: đặt trực tiếp một khoá setting (lật module trong
 *              kiểm chứng mà không qua UI; riêng module_promo được lật
 *              qua UI admin thật trong shots).
 *   - promo-check: gọi thẳng checkPromo("MOD126", 100000) bằng lib thật ở
 *              trạng thái setting hiện tại — in OK/KO + lý do.
 *   - restore: khôi phục CHÍNH XÁC snapshot, xoá fixture + ảnh tạm. */
import { PrismaClient } from "@prisma/client";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const prisma = new PrismaClient();
const STATE_FILE = "/tmp/fixture126-state.json";
const IMG_URL = "/banner-fixture-126.jpg";
const IMG_FILE = "public/banner-fixture-126.jpg";
const PROMO_CODE = "MOD126";
const FLASH_NAME = "FLASH126";

const MODULE_KEYS = [
  "module_premium", "hero_banner_enabled", "module_flashsale",
  "area_steam_enabled", "area_gamekey_enabled", "area_giftcard_enabled",
  "area_topup_enabled", "area_manual_enabled", "telegram_enabled",
  "pass_enabled", "module_promo", "module_affiliate", "module_tickets",
  "module_api", "module_blog", "module_register", "livechat_enabled",
  "support_widget_enabled", "seasonal_decor_enabled",
];

type Snap = {
  settings: Record<string, string | null>; // null = khoá chưa tồn tại
  banners: { image: string; href: string | null; lang: string; active: boolean; sort: number }[];
};

async function takeSnapshot(): Promise<Snap> {
  if (existsSync(STATE_FILE)) return JSON.parse(readFileSync(STATE_FILE, "utf8")) as Snap;
  const settings: Record<string, string | null> = {};
  for (const k of [...MODULE_KEYS, "admin_2fa_required"]) {
    const row = await prisma.setting.findUnique({ where: { key: k } });
    settings[k] = row ? row.value : null;
  }
  const banners = (await prisma.homeBanner.findMany({ orderBy: { id: "asc" } })).map((b) => ({ image: b.image, href: b.href, lang: b.lang, active: b.active, sort: b.sort }));
  const snap: Snap = { settings, banners };
  writeFileSync(STATE_FILE, JSON.stringify(snap, null, 2));
  return snap;
}

async function makeImage() {
  // Banner 1920×640 (3:1) với chữ/số SÁT cả 4 mép + khung viền cách mép
  // 6px: nếu hero cắt bất kỳ mép nào, chữ/viền sẽ mất — nhìn là thấy.
  const svg = `<svg width="1920" height="640" xmlns="http://www.w3.org/2000/svg">
    <rect width="1920" height="640" fill="#1d4ed8"/>
    <rect x="6" y="6" width="1908" height="628" fill="none" stroke="#facc15" stroke-width="8"/>
    <text x="18" y="330" font-family="Arial, sans-serif" font-size="96" font-weight="bold" fill="#ffffff">TRAI</text>
    <text x="1902" y="330" font-family="Arial, sans-serif" font-size="96" font-weight="bold" fill="#ffffff" text-anchor="end">PHAI</text>
    <text x="960" y="110" font-family="Arial, sans-serif" font-size="64" font-weight="bold" fill="#fde68a" text-anchor="middle">TREN 126</text>
    <text x="960" y="590" font-family="Arial, sans-serif" font-size="64" font-weight="bold" fill="#fde68a" text-anchor="middle">DUOI 126</text>
    <text x="960" y="345" font-family="Arial, sans-serif" font-size="54" fill="#bfdbfe" text-anchor="middle">BANNER FIT 1920x640</text>
  </svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toFile(IMG_FILE);
}

async function main() {
  const cmd = process.argv[2];
  if (cmd === "state") {
    const demo = await prisma.user.findFirst({ where: { username: "demo" }, select: { apiKey: true } });
    console.log(`snapshot=${existsSync(STATE_FILE) ? "co" : "chua"} banners=${await prisma.homeBanner.count()} promoMOD126=${await prisma.discountCode.count({ where: { code: PROMO_CODE } })} flash126=${await prisma.flashSale.count({ where: { name: FLASH_NAME } })} demoApiKey=${demo?.apiKey ? "co" : "khong"}`);
    return;
  }
  if (cmd === "demokey") {
    const demo = await prisma.user.findFirst({ where: { username: "demo" }, select: { apiKey: true } });
    console.log(demo?.apiKey || "");
    return;
  }
  if (cmd === "setup") {
    await takeSnapshot();
    await makeImage();
    await prisma.homeBanner.deleteMany({});
    await prisma.homeBanner.create({ data: { image: IMG_URL, href: null, lang: "vi", active: true, sort: 0 } });
    await prisma.homeBanner.create({ data: { image: IMG_URL, href: null, lang: "en", active: true, sort: 0 } });
    await prisma.discountCode.deleteMany({ where: { code: PROMO_CODE } });
    await prisma.discountCode.create({ data: { code: PROMO_CODE, type: "PERCENT", value: 10, scope: "ALL", active: true, isPublic: true } });
    await prisma.flashSale.deleteMany({ where: { name: FLASH_NAME } });
    const now = Date.now();
    await prisma.flashSale.create({ data: { name: FLASH_NAME, percent: 15, scope: "PREMIUM", startsAt: new Date(now - 3600_000), endsAt: new Date(now + 2 * 3600_000), active: true } });
    // Giữ 2FA admin tắt trong lúc chụp như các đợt trước (restore sẽ trả lại).
    await prisma.setting.upsert({ where: { key: "admin_2fa_required" }, create: { key: "admin_2fa_required", value: "0" }, update: { value: "0" } });
    console.log("fixture 126: setup xong (banner mep + MOD126 + FLASH126)");
    return;
  }
  if (cmd === "set") {
    const [, , , key, val] = process.argv;
    if (!key || (val !== "0" && val !== "1")) throw new Error("dùng: set <key> <0|1>");
    await prisma.setting.upsert({ where: { key }, create: { key, value: val }, update: { value: val } });
    console.log(`set ${key}=${val}`);
    return;
  }
  if (cmd === "promo-check") {
    const { checkPromo } = await import("../src/lib/promo");
    try {
      const r = await checkPromo(PROMO_CODE, "PREMIUM", 100000);
      console.log(`PROMO_OK ${JSON.stringify(r)}`);
    } catch (e) {
      console.log(`PROMO_KO ${(e as Error).message}`);
    }
    return;
  }
  if (cmd === "restore") {
    if (!existsSync(STATE_FILE)) { console.log("chưa có snapshot — không khôi phục gì"); return; }
    const snap = JSON.parse(readFileSync(STATE_FILE, "utf8")) as Snap;
    for (const [k, v] of Object.entries(snap.settings)) {
      if (v === null) await prisma.setting.deleteMany({ where: { key: k } });
      else await prisma.setting.upsert({ where: { key: k }, create: { key: k, value: v }, update: { value: v } });
    }
    await prisma.homeBanner.deleteMany({});
    for (const b of snap.banners) await prisma.homeBanner.create({ data: b });
    await prisma.discountCode.deleteMany({ where: { code: PROMO_CODE } });
    await prisma.flashSale.deleteMany({ where: { name: FLASH_NAME } });
    if (existsSync(IMG_FILE)) rmSync(IMG_FILE);
    rmSync(STATE_FILE);
    console.log("fixture 126: đã khôi phục nguyên trạng");
    return;
  }
  console.log("lệnh: state | demokey | setup | set <key> <0|1> | promo-check | restore");
}

main().finally(() => prisma.$disconnect());
