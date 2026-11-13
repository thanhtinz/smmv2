/** FIXTURE KIỂM CHỨNG ĐỢT 125 — banner trang chủ khi shop chưa có sản phẩm.
 *  Điều khiển trạng thái DB local theo từng bước kiểm chứng, có SNAPSHOT
 *  trạng thái gốc (sản phẩm đang active + toàn bộ HomeBanner) và khôi phục
 *  CHÍNH XÁC ở bước restore — không dựa vào seed (seed không dọn banner).
 *  Chạy: npx tsx scripts/fixture-banner-125.ts <state|setup|off|one|restore>
 *   - setup:   tắt active MỌI sản phẩm (catalog trống) + tạo 1 banner
 *              fixture active (ảnh JPG thật ghi vào public/ để server phục vụ).
 *   - off:     tắt active banner fixture (kỳ vọng trang chủ về trạng thái
 *              trống nguyên bản, 0 hero).
 *   - one:     bật lại banner + bật đúng 1 sản phẩm (kỳ vọng nhánh đầy đủ:
 *              hero chạy banner như cũ).
 *   - restore: xoá fixture, dựng lại banner gốc + active gốc, xoá ảnh tạm. */
import { PrismaClient } from "@prisma/client";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const prisma = new PrismaClient();
const STATE_FILE = "/tmp/fixture125-state.json";
const IMG_URL = "/banner-fixture-125.jpg";
const IMG_FILE = "public/banner-fixture-125.jpg";

type Snap = {
  activeProductIds: number[];
  banners: { image: string; href: string | null; lang: string; active: boolean; sort: number }[];
};

async function takeSnapshot(): Promise<Snap> {
  if (existsSync(STATE_FILE)) return JSON.parse(readFileSync(STATE_FILE, "utf8")) as Snap;
  const activeProductIds = (await prisma.premiumProduct.findMany({ where: { active: true }, select: { id: true }, orderBy: { id: "asc" } })).map((p) => p.id);
  const banners = (await prisma.homeBanner.findMany({ orderBy: { id: "asc" } })).map((b) => ({ image: b.image, href: b.href, lang: b.lang, active: b.active, sort: b.sort }));
  const snap: Snap = { activeProductIds, banners };
  writeFileSync(STATE_FILE, JSON.stringify(snap, null, 2));
  return snap;
}

async function makeImage() {
  const svg = `<svg width="1920" height="640" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1e3a8a"/><stop offset="0.55" stop-color="#2563eb"/><stop offset="1" stop-color="#38bdf8"/>
    </linearGradient></defs>
    <rect width="1920" height="640" fill="url(#g)"/>
    <text x="960" y="300" font-family="Arial, sans-serif" font-size="92" font-weight="bold" fill="#ffffff" text-anchor="middle">BANNER KIEM CHUNG 125</text>
    <text x="960" y="390" font-family="Arial, sans-serif" font-size="44" fill="#dbeafe" text-anchor="middle">Shop chua co san pham - banner van phai hien</text>
  </svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toFile(IMG_FILE);
}

async function main() {
  const cmd = process.argv[2];
  if (cmd === "state") {
    const [pAll, pActive, bAll] = await Promise.all([prisma.premiumProduct.count(), prisma.premiumProduct.count({ where: { active: true } }), prisma.homeBanner.count()]);
    console.log(`products total=${pAll} active=${pActive} banners=${bAll} snapshot=${existsSync(STATE_FILE) ? "co" : "chua"}`);
    return;
  }
  if (cmd === "setup") {
    const snap = await takeSnapshot();
    await makeImage();
    await prisma.premiumProduct.updateMany({ data: { active: false } });
    await prisma.homeBanner.deleteMany({});
    const b = await prisma.homeBanner.create({ data: { image: IMG_URL, href: null, lang: "vi", active: true, sort: 0 } });
    const pActive = await prisma.premiumProduct.count({ where: { active: true } });
    console.log(`SETUP ok: banner fixture id=${b.id} active=true; products active con lai=${pActive}; snapshot: ${snap.activeProductIds.length} san pham active, ${snap.banners.length} banner goc`);
    return;
  }
  if (cmd === "off") {
    const r = await prisma.homeBanner.updateMany({ where: { image: IMG_URL }, data: { active: false } });
    console.log(`OFF ok: da tat ${r.count} banner fixture`);
    return;
  }
  if (cmd === "one") {
    const snap = await takeSnapshot();
    await prisma.homeBanner.updateMany({ where: { image: IMG_URL }, data: { active: true } });
    const pid = snap.activeProductIds[0];
    if (pid == null) throw new Error("snapshot khong co san pham active nao de bat lai");
    const p = await prisma.premiumProduct.update({ where: { id: pid }, data: { active: true }, select: { id: true, name: true } });
    console.log(`ONE ok: banner bat lai + san pham id=${p.id} name=${JSON.stringify(p.name)} active=true`);
    return;
  }
  if (cmd === "restore") {
    const snap = await takeSnapshot();
    await prisma.homeBanner.deleteMany({});
    for (const b of snap.banners) await prisma.homeBanner.create({ data: b });
    await prisma.premiumProduct.updateMany({ data: { active: false } });
    if (snap.activeProductIds.length) await prisma.premiumProduct.updateMany({ where: { id: { in: snap.activeProductIds } }, data: { active: true } });
    if (existsSync(IMG_FILE)) rmSync(IMG_FILE);
    if (existsSync(STATE_FILE)) rmSync(STATE_FILE);
    const [pActive, bAll] = await Promise.all([prisma.premiumProduct.count({ where: { active: true } }), prisma.homeBanner.count()]);
    console.log(`RESTORE ok: products active=${pActive} (goc ${snap.activeProductIds.length}), banners=${bAll} (goc ${snap.banners.length})`);
    return;
  }
  throw new Error(`lenh la: ${cmd}`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
