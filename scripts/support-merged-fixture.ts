/** Fixture tạm cho đợt GỘP FAQ VÀO TICKET (2026-11-09): kênh liên hệ mẫu qua
 *  settings support_* (đúng nguồn Admin → Liên hệ cấu hình) để cột phụ của
 *  trang gộp có thẻ "Kênh liên hệ khác" mà chụp/kiểm chứng.
 *  Chạy: npx tsx scripts/support-merged-fixture.ts apply|cleanup
 *  cleanup: xoá đúng các settings fixture + mọi ticket của user demo (ticket
 *  kiểm chứng tạo qua UI khi chạy bộ chụp), đưa local về trạng thái seed. */
import { prisma } from "@/lib/db";

const CONTACTS: Record<string, string> = {
  support_hotline: "0901 234 567",
  support_telegram: "@smmv2hotro",
  support_facebook: "smmv2.vn",
  support_zalo: "0901234567",
};

async function main() {
  const mode = process.argv[2] || "apply";
  if (mode === "apply") {
    for (const [key, value] of Object.entries(CONTACTS)) {
      await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
    }
    console.log("fixture contacts applied");
  } else {
    await prisma.setting.deleteMany({ where: { key: { in: Object.keys(CONTACTS) } } });
    const demo = await prisma.user.findFirst({ where: { username: "demo" }, select: { id: true } });
    if (demo) {
      await prisma.ticketMessage.deleteMany({ where: { ticket: { userId: demo.id } } });
      const del = await prisma.ticket.deleteMany({ where: { userId: demo.id } });
      console.log(`cleanup: settings removed, demo tickets deleted=${del.count}`);
    } else {
      console.log("cleanup: settings removed, no demo user");
    }
  }
}

main().finally(() => prisma.$disconnect());
