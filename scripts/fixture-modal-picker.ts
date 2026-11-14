/** Fixture kiểm chứng local cho đợt đóng-popup + picker từ nguồn:
 *  - Tạo/cập nhật nhà cung cấp STANDARD "Nguồn Giả Lập" trỏ về mock
 *    ThaTim ở 127.0.0.1:8791 (key mã hoá bằng chính encryptSecret của app).
 *  - Tắt yêu cầu 2FA admin trên DB TEST local (như fixture đợt 126) để
 *    đăng nhập thẳng bằng mật khẩu khi lái trình duyệt kiểm chứng.
 *  Chạy: npx tsx scripts/fixture-modal-picker.ts */
import { prisma } from "../src/lib/db";
import { encryptSecret } from "../src/lib/secret-box";
import { setSetting } from "../src/lib/settings";

async function main() {
  const data = {
    kind: "PREMIUM" as const,
    driver: "STANDARD",
    name: "Nguồn Giả Lập",
    apiUrl: "http://127.0.0.1:8791/api/v2",
    apiKey: encryptSecret("mockkey"),
    currency: "VND",
    exchangeRate: 1,
    markupPercent: 30,
    active: true,
  };
  const existing = await prisma.provider.findFirst({ where: { name: { in: ["Nguồn Giả Lập", "Nguồn Giả Lập 2"] } } });
  if (existing) {
    await prisma.provider.update({ where: { id: existing.id }, data: { ...data, name: existing.name } });
    console.log("provider updated id=", existing.id);
  } else {
    const p = await prisma.provider.create({ data });
    console.log("provider created id=", p.id);
  }
  await setSetting("admin_2fa_required", "0");
  console.log("admin_2fa_required=0 (DB test local)");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
