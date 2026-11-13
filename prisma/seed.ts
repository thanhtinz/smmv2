import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();
// API key seed phải NGẪU NHIÊN (lỗi cũ: padEnd từ "adminkey"/"demokey" làm key lộ tiền tố dễ đoán)
import { randomBytes } from "crypto";
const key = (_s: string) => randomBytes(16).toString("hex");

async function main() {
  /* ---------- Cấu hình mặc định ---------- */
  const settings: Record<string, string> = {
    site_name: "SMMv2",
    site_tagline: "Tài khoản Premium & Sản phẩm số — tự động 24/7",
    deposit_min: "10000",
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
      passwordHash: await hashPassword(process.env.ADMIN_PASSWORD || "Admin@123"),
      role: "ADMIN",
      level: "VIP",
      apiKey: key("adminkey"),
      depositCode: "ADM001",
    },
    update: {},
  });
  if (process.env.SEED_DEMO !== "0") await prisma.user.upsert({
    where: { username: "demo" },
    create: {
      username: "demo",
      email: "demo@smmv2.local",
      fullName: "Khách demo",
      passwordHash: await hashPassword("Demo@123"),
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


  // FAQ mẫu (danh mục slug "faq") — admin sửa/thêm qua Bài viết; mục Câu hỏi thường gặp trong trang /dashboard/ticket đọc từ đây
  const faqCat = await prisma.postCategory.upsert({
    where: { slug: "faq" },
    create: { name: "Hỏi đáp thường gặp", slug: "faq", description: "Câu hỏi thường gặp của khách hàng" },
    update: {},
  });
  const faqs: [string, string, string][] = [
    ["faq-nap-tien-chua-vao", "Nạp tiền rồi nhưng số dư chưa tăng thì làm sao?", "Kiểm tra lại nội dung chuyển khoản đã đúng cú pháp kèm mã nạp của bạn chưa (xem ở trang Nạp tiền). Giao dịch đúng cú pháp thường được cộng trong vài phút; nếu quá 30 phút chưa thấy, hãy tạo ticket kèm ảnh chụp giao dịch để được kiểm tra ngay."],
    ["faq-don-loi", "Đơn hàng bị lỗi hoặc không chạy thì xử lý thế nào?", "Mở chi tiết đơn để xem trạng thái và ghi chú. Nếu đơn báo lỗi/hoàn một phần, phần chưa chạy sẽ được hoàn tiền tự động theo chính sách. Nếu cần hỗ trợ thêm, bấm nút Báo lỗi đơn ngay trong chi tiết đơn để gửi ticket kèm sẵn mã đơn."],
    ["faq-api-o-dau", "Lấy API key và tài liệu API ở đâu?", "Vào Hồ sơ → tab Kết nối API để xem endpoint và API key của bạn; tài liệu đầy đủ có ở mục Tài liệu API trong menu. Giữ key bí mật như mật khẩu, tạo key mới sẽ làm key cũ hết hiệu lực ngay."],
    ["faq-hoan-tien", "Chính sách hoàn tiền như thế nào?", "Đơn huỷ hoặc lỗi phần nào sẽ hoàn đúng phần chưa thực hiện vào số dư ví, xem được trong Lịch sử giao dịch. Đơn đã chạy hoàn thành thì không hoàn. Có thể bấm Yêu cầu hoàn tiền trong chi tiết đơn để đội hỗ trợ xem xét trường hợp đặc biệt."],
    ["faq-thoi-gian-chay", "Đơn thường chạy trong bao lâu?", "Tuỳ dịch vụ: đa số bắt đầu trong vài phút đến vài giờ sau khi đặt. Thời gian dự kiến và tốc độ ghi rõ ở mô tả từng dịch vụ trong Bảng giá. Đơn chậm bất thường sẽ được hệ thống tự đồng bộ lại trạng thái."],
    ["faq-nap-toi-thieu", "Nạp tối thiểu bao nhiêu và bằng cách nào?", "Số tiền nạp tối thiểu và các phương thức đang mở (QR ngân hàng, PayPal/Stripe, USDT...) hiển thị ở trang Nạp tiền. Nạp qua QR ngân hàng nhớ ghi đúng nội dung kèm mã nạp để tiền vào tự động."],
  ];
  for (const [slug, title, content] of faqs) {
    await prisma.post.upsert({
      where: { slug },
      create: { title, slug, content, excerpt: content.slice(0, 250), categoryId: faqCat.id, published: true },
      update: {},
    });
  }

  // FAQ mẫu của trang PASS (danh mục slug "pass-faq") — admin sửa/thêm qua Bài viết;
  // trang /pass đọc từ đây, cùng cơ chế với FAQ chính (slug "faq") ở trên.
  const passFaqCat = await prisma.postCategory.upsert({
    where: { slug: "pass-faq" },
    create: { name: "Hỏi đáp về Pass", slug: "pass-faq", description: "Câu hỏi thường gặp về gói thành viên Pass" },
    update: {},
  });
  const passFaqs: [string, string, string][] = [
    ["pass-faq-mua-the-nao", "Mua Pass bằng cách nào?", "Pass được mua và gia hạn trực tiếp bằng số dư ví trên website: chọn kỳ hạn ở trang Pass rồi bấm Mua ngay. Số dư chưa đủ thì nạp thêm ở trang Nạp tiền trước."],
    ["pass-faq-quyen-loi", "Quyền lợi của Pass áp dụng khi nào?", "Quyền lợi (giảm thêm khi thanh toán, hoàn tiền mỗi đơn, quà tháng) áp dụng tự động cho các đơn thuộc phạm vi của gói trong suốt thời gian Pass còn hạn — bạn không cần nhập mã hay thao tác thêm."],
    ["pass-faq-gia-han", "Gia hạn Pass có bị mất ngày còn lại không?", "Không. Gia hạn cộng tiếp vào hạn hiện tại: hạn mới = hạn cũ cộng thêm số tháng của kỳ bạn mua, nên mua sớm không bị thiệt ngày."],
    ["pass-faq-hoan-tien", "Hoàn tiền của Pass nhận ở đâu?", "Phần hoàn theo % của mỗi đơn được cộng thẳng vào số dư ví ngay khi đơn chốt tiền, xem lại được trong Lịch sử số dư (mục Hoàn tiền Pass). Đơn bị hoàn tiền sẽ thu hồi phần hoàn tương ứng."],
    ["pass-faq-qua-thang", "Quà tháng nhận thế nào?", "Khi Pass còn hạn, vào trang Pass và bấm Nhận quà tháng này. Mỗi tháng dương lịch nhận tối đa 1 lần; quà được giao qua một đơn hàng 0đ như đơn mua thường."],
  ];
  for (const [slug, title, content] of passFaqs) {
    await prisma.post.upsert({
      where: { slug },
      create: { title, slug, content, excerpt: content.slice(0, 250), categoryId: passFaqCat.id, published: true },
      update: {},
    });
  }

  // Tự xoay các API key cũ sinh từ seed lỗi (bắt đầu bằng adminkey/demokey) sang key ngẫu nhiên
  const legacy = await prisma.user.findMany({ where: { OR: [{ apiKey: { startsWith: "adminkey" } }, { apiKey: { startsWith: "demokey" } }] }, select: { id: true, username: true } });
  for (const u of legacy) {
    await prisma.user.update({ where: { id: u.id }, data: { apiKey: randomBytes(16).toString("hex") } });
    console.log(`Đã xoay API key mới cho ${u.username}`);
  }

  console.log("Seed hoàn tất.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
