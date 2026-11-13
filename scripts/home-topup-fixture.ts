/**
 * Fixture kiểm chứng mục "Top-Up Game" trên trang chủ (đợt 107, lệnh Tín
 * 2026-11-12): seed local KHÔNG có sẵn game top-up nào nên tạo trực tiếp
 * trong DB local 25 sản phẩm nhóm topups (đủ để "Xem thêm" mở 10 -> 20 ->
 * 25 rồi ẩn nút), kèm:
 *  - bìa SVG local /ht-covers/ cho 24 game; game cuối KHÔNG ảnh để kiểm
 *    ô chữ cái đầu dự phòng;
 *  - đơn PremiumOrder DELIVERED với số đã bán giảm dần 43/17/9/5/2 (còn
 *    lại 0) để kiểm thứ tự BÁN CHẠY NHẤT + dòng "Đã bán N"; thêm 1 đơn
 *    CANCELED ở game đầu để chứng minh đơn huỷ KHÔNG tính vào Đã bán;
 *  - review THẬT: game đầu 2 review (5 sao + 3 sao -> "4.0 (2)" đúng ảnh
 *    mẫu của Tín), game hai 1 review 5 sao ("5.0 (1)"), các game còn lại
 *    0 review (chỉ hiện "Đã bán").
 *  clean: xoá toàn bộ đơn/review/variant/sản phẩm + bìa fixture.
 * Chạy: npx tsx scripts/home-topup-fixture.ts seed|clean
 */
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { prisma } from "../src/lib/db";

const COVER_DIR = "public/ht-covers";
const SLUG_PREFIX = "ht-fixture-";
const CODE_PREFIX = "HTF";

const ok = (cond: boolean, label: string) => console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);

function coverSvg(title: string, hue: number): string {
  const t = title.replace(/[<>&"]/g, "").slice(0, 26);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},65%,42%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360},70%,26%)"/></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/><text x="28" y="320" font-family="Arial,sans-serif" font-size="27" font-weight="bold" fill="#ffffff">${t}</text><text x="28" y="350" font-family="Arial,sans-serif" font-size="14" fill="#ffffff" opacity="0.75">TOP-UP</text></svg>`;
}

const GAMES: { name: string; sold: number; reviews: number[] }[] = [
  { name: "Liên Quân Fixture", sold: 43, reviews: [5, 3] },
  { name: "Genshin Fixture", sold: 17, reviews: [5] },
  { name: "ZingSpeed Fixture", sold: 9, reviews: [] },
  { name: "PUBG Fixture", sold: 5, reviews: [] },
  { name: "Free Fire Fixture", sold: 2, reviews: [] },
  ...Array.from({ length: 20 }, (_, i) => ({ name: `Game Fixture ${String(i + 6).padStart(2, "0")}`, sold: 0, reviews: [] as number[] })),
];

async function clean() {
  const prods = await prisma.premiumProduct.findMany({ where: { slug: { startsWith: SLUG_PREFIX } }, select: { id: true } });
  const pids = prods.map((p) => p.id);
  if (pids.length) {
    const vids = (await prisma.premiumVariant.findMany({ where: { productId: { in: pids } }, select: { id: true } })).map((v) => v.id);
    if (vids.length) await prisma.premiumOrder.deleteMany({ where: { variantId: { in: vids } } });
    await prisma.premiumReview.deleteMany({ where: { productId: { in: pids } } });
    await prisma.premiumVariant.deleteMany({ where: { productId: { in: pids } } });
    await prisma.premiumProduct.deleteMany({ where: { id: { in: pids } } });
  }
  await prisma.premiumOrder.deleteMany({ where: { code: { startsWith: CODE_PREFIX } } });
  if (existsSync(COVER_DIR)) rmSync(COVER_DIR, { recursive: true, force: true });
  console.log(`clean xong (${pids.length} sản phẩm fixture)`);
}

async function seed() {
  await clean();
  const demo = await prisma.user.findFirst({ where: { username: "demo" } });
  const admin = await prisma.user.findFirst({ where: { username: "admin" } });
  const cat = await prisma.premiumCategory.findFirst({ where: { active: true }, orderBy: { sort: "asc" } });
  if (!demo || !cat) throw new Error("thiếu user demo hoặc danh mục — chạy seed chuẩn trước");
  const reviewers = [demo, ...(admin ? [admin] : [])];
  mkdirSync(COVER_DIR, { recursive: true });

  let codeSeq = 0;
  const nextCode = () => `${CODE_PREFIX}${String(++codeSeq).padStart(6, "0")}`;
  const created: { id: number; name: string }[] = [];

  for (let i = 0; i < GAMES.length; i++) {
    const g = GAMES[i];
    const n = i + 1;
    const noImage = i === GAMES.length - 1;
    let images: string | null = null;
    if (!noImage) {
      const file = `ht-${String(n).padStart(2, "0")}.svg`;
      writeFileSync(`${COVER_DIR}/${file}`, coverSvg(g.name, (n * 47) % 360));
      images = JSON.stringify([`/ht-covers/${file}`]);
    }
    const product = await prisma.premiumProduct.create({
      data: {
        categoryId: cat.id,
        name: g.name,
        slug: `${SLUG_PREFIX}${String(n).padStart(2, "0")}`,
        color: "#3178fc",
        fulfillment: "API",
        images,
        active: true,
      },
    });
    const variant = await prisma.premiumVariant.create({
      data: {
        productId: product.id,
        name: "Gói nạp 100",
        price: 20000,
        providerGroup: "topups",
        providerItemId: `fixture-offer-${n}`,
        active: true,
      },
    });
    created.push({ id: product.id, name: g.name });

    // Đơn đã giao = Đã bán; 1 đơn CANCELED ở game đầu (không được tính).
    const orders = Array.from({ length: g.sold }, () => ({
      code: nextCode(), userId: demo.id, variantId: variant.id, quantity: 1, total: 20000, status: "DELIVERED" as const,
    }));
    if (orders.length) await prisma.premiumOrder.createMany({ data: orders });
    if (i === 0) {
      await prisma.premiumOrder.create({
        data: { code: nextCode(), userId: demo.id, variantId: variant.id, quantity: 1, total: 20000, status: "CANCELED" },
      });
    }
    // Review thật (mỗi user 1 review/sản phẩm theo unique của schema).
    for (let r = 0; r < g.reviews.length; r++) {
      const reviewer = reviewers[r % reviewers.length];
      await prisma.premiumReview.create({
        data: { productId: product.id, userId: reviewer.id, rating: g.reviews[r], content: `Đánh giá fixture ${g.reviews[r]} sao` },
      });
    }
  }

  const pool = await prisma.premiumProduct.count({ where: { active: true, variants: { some: { providerGroup: "topups", active: true } } } });
  ok(pool >= 25, `pool topups có ${pool} game (>= 25)`);
  const soldTop = await prisma.premiumOrder.count({ where: { code: { startsWith: CODE_PREFIX }, status: { not: "CANCELED" } } });
  ok(soldTop === 76, `tổng đơn tính Đã bán = ${soldTop} (43+17+9+5+2 = 76)`);
  console.log("IDS", JSON.stringify(created));
}

async function main() {
  const cmd = process.argv[2];
  try {
    if (cmd === "seed") await seed();
    else if (cmd === "clean") await clean();
    else console.log("dùng: home-topup-fixture.ts seed|clean");
  } finally {
    await prisma.$disconnect();
  }
}
main();
