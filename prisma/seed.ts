import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const key = (s: string) => s.padEnd(32, "x").slice(0, 32);

async function main() {
  /* ---------- Cấu hình mặc định ---------- */
  const settings: Record<string, string> = {
    site_name: "SMMv2",
    site_tagline: "SMM Panel & Tài khoản Premium — tự động 24/7",
    deposit_min: "10000",
    deposit_bonus_tiers: JSON.stringify([
      { from: 1000000, percent: 2 },
      { from: 5000000, percent: 5 },
    ]),
  };
  for (const [k, v] of Object.entries(settings)) {
    await prisma.setting.upsert({ where: { key: k }, create: { key: k, value: v }, update: {} });
  }

  /* ---------- Tài khoản admin + demo ---------- */
  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    create: {
      username: "admin",
      email: "admin@smmv2.local",
      fullName: "Quản trị viên",
      passwordHash: await bcrypt.hash("Admin@123", 10),
      role: "ADMIN",
      level: "VIP",
      apiKey: key("adminkey"),
      depositCode: "ADM001",
    },
    update: {},
  });
  await prisma.user.upsert({
    where: { username: "demo" },
    create: {
      username: "demo",
      email: "demo@smmv2.local",
      fullName: "Khách demo",
      passwordHash: await bcrypt.hash("Demo@123", 10),
      role: "USER",
      level: "RESELLER",
      balance: 500000,
      totalDeposited: 500000,
      apiKey: key("demokey"),
      depositCode: "DEMO01",
    },
    update: {},
  });
  console.log("Admin:", admin.username, "| mật khẩu mẫu: Admin@123 (đổi ngay sau khi đăng nhập)");

  await prisma.announcement.upsert({
    where: { id: 1 },
    create: {
      title: "Chào mừng bạn đến với hệ thống mới",
      body: "Nạp tiền chuyển khoản đúng nội dung SMM + mã nạp của bạn để được cộng tự động. Dịch vụ API chạy ngay khi đặt; dịch vụ thủ công được xử lý trong giờ hành chính.",
    },
    update: {},
  });

  /* ---------- Provider mẫu: ThaTim (chưa kích hoạt, chờ admin dán API key) ---------- */
  const providerCount = await prisma.provider.count();
  if (providerCount === 0) {
    await prisma.provider.create({
      data: {
        kind: "BOTH",
        name: "ThaTim",
        apiUrl: "https://thatim.vn/api/v2",
        apiKey: "THAY-BANG-API-KEY-THAT-CUA-BAN",
        currency: "VND",
        exchangeRate: 1,
        markupPercent: 20,
        active: false,
        note: "Nguồn ThaTim (thatim.vn): SMM v2 gồm services/add/status/cancel/refill + tham số comments/reaction/minutes; kèm API mua sản phẩm category/buy/history. Vào Admin → Nhà cung cấp API, dán API key thật của tài khoản ThaTim, bật lên rồi bấm Đồng bộ dịch vụ.",
      },
    });
  }

  /* ---------- Dịch vụ SMM mẫu (thủ công) ---------- */
  if ((await prisma.smmService.count()) === 0) {
    const cats: Record<string, number> = {};
    const catDefs: [string, string, number][] = [
      ["facebook", "Facebook Followers", 1],
      ["facebook", "Facebook Like & Cảm xúc", 2],
      ["facebook", "Facebook View & Watch", 3],
      ["tiktok", "TikTok Followers", 4],
      ["tiktok", "TikTok Like, View & Comment", 5],
      ["instagram", "Instagram Followers & Like", 6],
      ["youtube", "YouTube Sub, View & Like", 7],
      ["telegram", "Telegram Members", 8],
      ["shopee", "Shopee Follow & Like", 9],
    ];
    for (const [platform, name, sort] of catDefs) {
      const c = await prisma.smmCategory.create({ data: { platform, name, sort } });
      cats[name] = c.id;
    }
    type Sv = [string, string, number, number, number, number, string, boolean, string];
    const services: Sv[] = [
      ["Facebook Followers", "Facebook | Follow trang cá nhân | Tài khoản Việt, tốc độ ~5.000/ngày, bảo hành 30 ngày", 45000, 30000, 50, 200000, "1-6 giờ", true, "Link trang cá nhân để chế độ công khai. Không chạy cho trang bị giới hạn tuổi/quốc gia."],
      ["Facebook Followers", "Facebook | Follow Fanpage | Lên đều, bảo hành 30 ngày", 38000, 25000, 50, 500000, "0-3 giờ", true, "Dán link fanpage. Page mới tạo nên để qua 24h trước khi chạy."],
      ["Facebook Like & Cảm xúc", "Facebook | Like bài viết | Việt, lên nhanh", 15000, 9000, 20, 100000, "0-30 phút", false, "Bài viết phải để công khai."],
      ["Facebook Like & Cảm xúc", "Facebook | Cảm xúc (Tim/Haha/Wow) bài viết", 25000, 16000, 20, 50000, "0-1 giờ", false, "Chọn 1 loại cảm xúc chính cho cả đơn, ghi vào phần ghi chú nếu cần."],
      ["Facebook View & Watch", "Facebook | View video | Tốc độ cao", 8000, 5000, 100, 1000000, "0-1 giờ", false, "Video công khai, không giới hạn quốc gia."],
      ["TikTok Followers", "TikTok | Followers Việt | Tốc độ 3.000-10.000/ngày, bảo hành 30 ngày", 55000, 38000, 10, 300000, "0-6 giờ", true, "Tài khoản để công khai, không đổi username trong lúc chạy."],
      ["TikTok Followers", "TikTok | Followers quốc tế giá rẻ | Tốc độ cao", 32000, 20000, 10, 1000000, "0-3 giờ", false, "Phù hợp kéo số nhanh cho kênh mới."],
      ["TikTok Like, View & Comment", "TikTok | Tim video | Lên nhanh sau 5-15 phút", 20000, 12000, 10, 200000, "0-15 phút", false, "Dán link video công khai."],
      ["TikTok Like, View & Comment", "TikTok | View video | Giá rẻ, tốc độ rất cao", 3000, 1800, 100, 5000000, "0-15 phút", false, "View tính theo lượt phát, phù hợp đẩy đề xuất."],
      ["TikTok Like, View & Comment", "TikTok | Comment Việt tuỳ chỉnh | Viết sẵn nội dung, mỗi dòng 1 comment", 350000, 250000, 10, 1000, "1-12 giờ", false, "Ghi toàn bộ nội dung comment vào phần ghi chú khi đặt đơn, mỗi comment 1 dòng."],
      ["Instagram Followers & Like", "Instagram | Followers | Bảo hành 30 ngày", 60000, 40000, 10, 200000, "1-6 giờ", true, "Tài khoản phải để công khai trong suốt quá trình chạy."],
      ["Instagram Followers & Like", "Instagram | Like bài viết / Reels", 18000, 11000, 10, 100000, "0-30 phút", false, "Dán link bài viết hoặc reels công khai."],
      ["YouTube Sub, View & Like", "YouTube | Subscribe kênh | Lên chậm tự nhiên, bảo hành 30 ngày", 180000, 130000, 10, 50000, "6-24 giờ", true, "Kênh không ẩn số sub. Tốc độ chậm để an toàn cho kênh."],
      ["YouTube Sub, View & Like", "YouTube | View video | Giữ chân người xem 30-60 giây", 35000, 22000, 100, 1000000, "0-6 giờ", false, "Video công khai, không chạy cho video giới hạn tuổi."],
      ["YouTube Sub, View & Like", "YouTube | Like video", 25000, 15000, 10, 100000, "0-1 giờ", false, ""],
      ["Telegram Members", "Telegram | Member group/channel | Bảo hành 15 ngày", 90000, 60000, 50, 100000, "1-12 giờ", true, "Nhóm/kênh công khai hoặc gửi link mời vào ghi chú."],
      ["Shopee Follow & Like", "Shopee | Follow shop", 45000, 30000, 10, 50000, "1-6 giờ", false, "Dán link shop."],
      ["Shopee Follow & Like", "Shopee | Like sản phẩm", 20000, 13000, 10, 100000, "0-3 giờ", false, "Dán link sản phẩm."],
    ];
    for (const [cat, name, rate, cost, min, max, avg, refill, desc] of services) {
      await prisma.smmService.create({
        data: {
          categoryId: cats[cat],
          name,
          rate,
          costRate: cost,
          min,
          max,
          avgTime: avg,
          refill,
          cancelable: true,
          // Dịch vụ follow/sub/member cho phép thả nhỏ giọt (drip-feed)
          dripfeed: /follow|subscribe|member/i.test(name),
          fulfillment: "MANUAL",
          description: desc || null,
        },
      });
    }
    console.log(`Đã seed ${services.length} dịch vụ SMM mẫu (thủ công)`);
  }

  /* ---------- Premium ---------- */
  if ((await prisma.premiumProduct.count()) === 0) {
    const catVideo = await prisma.premiumCategory.create({ data: { name: "Xem phim & Video", slug: "xem-phim-video", sort: 1 } });
    const catMusic = await prisma.premiumCategory.create({ data: { name: "Âm nhạc", slug: "am-nhac", sort: 2 } });
    const catAI = await prisma.premiumCategory.create({ data: { name: "AI & Công cụ", slug: "ai-cong-cu", sort: 3 } });
    const catOther = await prisma.premiumCategory.create({ data: { name: "Học tập & Khác", slug: "hoc-tap-khac", sort: 4 } });

    const product = async (
      categoryId: number,
      name: string,
      slug: string,
      tagline: string,
      color: string,
      fulfillment: "AUTO_STOCK" | "MANUAL",
      description: string,
      variants: [string, number, number, number][],
      sort: number
    ) => {
      const p = await prisma.premiumProduct.create({
        data: { categoryId, name, slug, tagline, color, fulfillment, description, sort },
      });
      const vs = [];
      for (const [vname, price, cost, warranty] of variants) {
        vs.push(await prisma.premiumVariant.create({ data: { productId: p.id, name: vname, price, cost, warrantyDays: warranty } }));
      }
      return vs;
    };

    await product(catVideo.id, "YouTube Premium", "youtube-premium",
      "Xem không quảng cáo + YouTube Music, slot Family chính chủ", "#FF0000", "MANUAL",
      "Nâng cấp dạng slot trong nhóm Family do shop quản lý. Bạn chỉ cần gửi email Google — không cần mật khẩu. Lưu ý chính sách Google: một tài khoản chỉ đổi nhóm Family 1 lần mỗi 12 tháng.",
      [["1 tháng — slot Family", 55000, 30000, 30], ["6 tháng — slot Family", 279000, 179000, 180], ["1 năm — slot Family", 499000, 358000, 365]], 1);

    const netflix = await product(catVideo.id, "Netflix Premium 4K", "netflix-premium",
      "1 profile riêng, xem 4K HDR, giao ngay từ kho", "#E50914", "AUTO_STOCK",
      "Mỗi đơn là 1 profile trên tài khoản 4K (không dùng chung profile với người khác). Đổi PIN profile sau khi nhận. Bảo hành đổi acc trong thời hạn gói nếu lỗi từ phía shop.",
      [["1 tháng — 1 profile 4K", 70000, 30000, 30]], 2);
    for (let i = 1; i <= 3; i++) {
      await prisma.premiumStock.create({
        data: { variantId: netflix[0].id, payload: `DEMO-${i} — Tài khoản mẫu, admin thay bằng tài khoản thật tại mục Kho Premium trước khi bán.\nEmail: demo${i}@example.com | Mật khẩu: demo | Profile ${i}` },
      });
    }

    await product(catMusic.id, "Spotify Premium", "spotify-premium",
      "Nghe nhạc không quảng cáo, slot Family chính chủ", "#1DB954", "MANUAL",
      "Nâng cấp slot Family lên chính tài khoản Spotify của bạn — gửi email đăng ký Spotify, không cần mật khẩu. Giữ nguyên playlist và thư viện của bạn.",
      [["6 tháng — slot Family", 200000, 107000, 180], ["1 năm — slot Family", 320000, 214000, 365]], 1);

    await product(catAI.id, "ChatGPT Go", "chatgpt-go",
      "Nâng cấp gói Go chính chủ trên tài khoản của bạn", "#10A37F", "MANUAL",
      "Shop nâng cấp gói ChatGPT Go (gói chính hãng giá rẻ của OpenAI) trực tiếp lên tài khoản của bạn — bạn chỉ gửi email, không gửi mật khẩu. Giá đã gồm phí nâng cấp cho khách không có thẻ quốc tế.",
      [["1 tháng — chính chủ", 170000, 132000, 30]], 1);

    const canva = await product(catAI.id, "Canva Pro (Team Edu)", "canva-pro",
      "Slot team giáo dục — đầy đủ tính năng Pro, giá mềm", "#00C4CC", "AUTO_STOCK",
      "Slot trong team Edu: dùng đủ tính năng Pro (xoá nền, kho premium, brand kit). Nguồn Edu có thể bị Canva quét theo đợt — gói đã gồm bảo hành thay slot mới trong thời hạn.",
      [["1 năm — slot team Edu", 129000, 20000, 180]], 2);
    for (let i = 1; i <= 5; i++) {
      await prisma.premiumStock.create({
        data: { variantId: canva[0].id, payload: `DEMO-${i} — Link mời team mẫu, admin thay bằng link thật tại mục Kho Premium.\nhttps://www.canva.com/brand/join?token=DEMO${i}` },
      });
    }

    await product(catAI.id, "CapCut Pro", "capcut-pro",
      "Mở khoá toàn bộ hiệu ứng & tính năng Pro qua team workspace", "#111111", "MANUAL",
      "Shop add tài khoản CapCut của bạn vào team workspace Pro. Gửi email đăng ký CapCut khi đặt đơn.",
      [["1 năm — add team", 279000, 150000, 180]], 3);

    await product(catOther.id, "Microsoft 365 Family", "microsoft-365",
      "Word/Excel/PowerPoint bản quyền + 1TB OneDrive mỗi người", "#0078D4", "MANUAL",
      "Slot trong nhóm Microsoft 365 Family chính hãng: mỗi người có 1TB OneDrive riêng và dùng đủ bộ Office trên 5 thiết bị.",
      [["1 năm — slot Family", 399000, 320000, 365]], 1);

    await product(catOther.id, "Google One 2TB", "google-one",
      "Slot chia sẻ trong nhóm 2TB — giới hạn 400GB/người, minh bạch từ đầu", "#4285F4", "MANUAL",
      "Dung lượng 2TB là của chung cả nhóm; mỗi slot được giới hạn riêng 400GB để không ai dùng lấn của người khác. Kèm quyền lợi Google Photos & tính năng AI cơ bản theo chính sách Google từng thời điểm.",
      [["1 năm — slot 400GB", 499000, 450000, 365]], 2);

    await product(catOther.id, "ELSA Speak Pro", "elsa-speak-pro",
      "Mã kích hoạt Pro 1 năm — luyện phát âm tiếng Anh với AI", "#F59E0B", "AUTO_STOCK",
      "Mã kích hoạt chính hãng, nhập trực tiếp trong app ELSA. Shop thường ôm mã vào các đợt khuyến mãi của hãng nên giá tốt hơn mua lẻ trong app.",
      [["1 năm — mã kích hoạt", 549000, 495000, 0]], 3);

    console.log("Đã seed danh mục + sản phẩm Premium (giá theo bảng vốn/lãi đã khảo sát 04/11)");
  }

  console.log("Seed hoàn tất.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
