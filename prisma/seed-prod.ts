import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/* Seed cho BẢN CÀI PRODUCTION (deploy/install.sh dùng file này, KHÔNG dùng
   seed.ts): chỉ ghi vài cấu hình vận hành mặc định vô hại. TUYỆT ĐỐI không
   tạo tài khoản nào (không admin mặc định, không demo), không nạp dữ liệu
   mẫu và KHÔNG trồng sẵn nhận diện thương hiệu: site_name/site_tagline chỉ
   do chính chủ site nhập ở trang /setup trong lần mở website đầu tiên —
   form setup là nơi ghi đầu tiên và duy nhất của tên website (lệnh Tín
   2026-11-11). Các giá trị ở đây đều trùng DEFAULT_SETTINGS trong code nên
   kể cả không chạy seed này site vẫn boot. */
async function main() {
  const settings: Record<string, string> = {
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
