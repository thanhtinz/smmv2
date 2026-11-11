import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/* Seed cho BẢN CÀI PRODUCTION (deploy/install.sh dùng file này, KHÔNG dùng
   seed.ts): chỉ ghi vài cấu hình mặc định vô hại. TUYỆT ĐỐI không tạo tài
   khoản nào (không admin mặc định, không demo) và không nạp dữ liệu mẫu —
   tài khoản quản trị đầu tiên do chủ site tự tạo ở trang /setup trong lần
   mở website đầu tiên (lệnh Tín 2026-11-11). Các giá trị ở đây đều trùng
   DEFAULT_SETTINGS trong code nên kể cả không chạy seed này site vẫn boot. */
async function main() {
  const settings: Record<string, string> = {
    site_name: "SMMv2",
    site_tagline: "SMM Panel & Tài khoản Premium — tự động 24/7",
    deposit_min: "10000",
  };
  for (const [k, v] of Object.entries(settings)) {
    await prisma.setting.upsert({ where: { key: k }, create: { key: k, value: v }, update: {} });
  }
  console.log("Seed production xong: chỉ cấu hình mặc định — không tài khoản, không dữ liệu mẫu. Mở website để hoàn tất trang /setup.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
