/* Test sống đợt bổ sung: chạy bằng tsx trong thư mục project (env Prisma như thường lệ).
 * Tạo dữ liệu test riêng, kiểm tra, rồi TỰ DỌN. */
import { prisma } from "../src/lib/db";
import { issueEmailVerification, verifyEmailByToken } from "../src/lib/email-verify";
import { cleanAttachments, parseAttachments } from "../src/lib/attachments";
import { notifyUser } from "../src/lib/notify";
import { createSmmOrder } from "../src/lib/orders";
import { orderTransition } from "../src/lib/notify";
import bcrypt from "bcryptjs";

const log = (ok: boolean, name: string, extra = "") => console.log(`${ok ? "PASS" : "FAIL"} ${name} ${extra}`);
async function main() {
  const uname = "supptest" + Date.now().toString().slice(-6);
  const user = await prisma.user.create({
    data: {
      username: uname, email: `${uname}@test.local`, passwordHash: await bcrypt.hash("Test@123", 10),
      apiKey: "supp" + Math.random().toString(36).slice(2, 30), depositCode: "SUP" + Math.random().toString(36).slice(2, 6).toUpperCase(),
      balance: 10_000_000,
    },
  });
  try {
    // 1) Email verify
    const link = await issueEmailVerification({ id: user.id, email: user.email, username: user.username });
    const token = new URL(link).searchParams.get("token")!;
    const bad = await verifyEmailByToken("x".repeat(40));
    const res = await verifyEmailByToken(token);
    const after = await prisma.user.findUnique({ where: { id: user.id } });
    log(bad === "invalid" && res === "ok" && after!.emailVerified === true, "1 email-verify", `link=${link.slice(0, 60)}...`);
    const again = await verifyEmailByToken(token);
    log(again === "invalid", "1b token dùng 1 lần");

    // 2) Ticket attachments validation
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const cleaned = cleanAttachments(JSON.stringify([png, "data:text/html;base64,PHNjcmlwdD4=", "https://evil/x.png"]));
    const parsed = parseAttachments(cleaned);
    log(parsed.length === 1 && parsed[0] === png, "2 attachments validation");

    // 6) Notify prefs: tắt order -> không tạo; system -> vẫn tạo
    await prisma.user.update({ where: { id: user.id }, data: { notifyPrefs: JSON.stringify({ order: false, deposit: true, refund: true, promo: true, system: true, ticket: true }) } });
    await notifyUser(user.id, "Đơn hàng đã hoàn thành", "test order off", "/dashboard/don-hang/1");
    await notifyUser(user.id, "Thông báo hệ thống", "test system on", "/dashboard/thong-bao");
    const notifs = await prisma.notification.findMany({ where: { userId: user.id } });
    log(notifs.length === 1 && notifs[0].title.includes("hệ thống"), "6 notify-prefs", `count=${notifs.length}`);

    // 8+9) Flash sale + points qua createSmmOrder thật
    const cat = await prisma.smmCategory.findFirst();
    const svc = await prisma.smmService.create({
      data: { name: "SUPP TEST SVC", rate: 200000, costRate: 0, min: 100, max: 100000, categoryId: cat!.id, active: true, fulfillment: "MANUAL" },
    });
    const full = (await prisma.user.findUnique({ where: { id: user.id } }))!;
    const o1 = await createSmmOrder({ user: full, serviceId: svc.id, link: "https://example.com/a", quantity: 1000 });
    log(o1.charge === 200000, "8a giá thường", `charge=${o1.charge}`);
    const sale = await prisma.flashSale.create({
      data: { name: "SUPP SALE", percent: 50, startsAt: new Date(Date.now() - 3600000), endsAt: new Date(Date.now() + 3600000), panelId: null, active: true },
    });
    const o2 = await createSmmOrder({ user: full, serviceId: svc.id, link: "https://example.com/b", quantity: 1000 });
    log(o2.charge === 100000, "8b giá flash -50%", `charge=${o2.charge}`);
    // hết hạn -> giá thường
    await prisma.flashSale.update({ where: { id: sale.id }, data: { endsAt: new Date(Date.now() - 1000) } });
    const o3 = await createSmmOrder({ user: full, serviceId: svc.id, link: "https://example.com/c", quantity: 1000 });
    log(o3.charge === 200000, "8c hết flash giá thường", `charge=${o3.charge}`);
    await prisma.flashSale.delete({ where: { id: sale.id } });

    // points: hoàn thành o1 (charge 200.000 -> 2 điểm)
    const before = (await prisma.user.findUnique({ where: { id: user.id } }))!.points;
    await orderTransition({ id: o1.id, userId: user.id, code: o1.code }, "COMPLETED");
    await orderTransition({ id: o1.id, userId: user.id, code: o1.code }, "COMPLETED"); // gọi trùng không cộng 2 lần
    const afterPts = (await prisma.user.findUnique({ where: { id: user.id } }))!;
    log(afterPts.points === before + 2, "9 points earn + chống trùng", `points=${afterPts.points}`);

    // ticket rating guard data: closed ticket
    const t = await prisma.ticket.create({ data: { userId: user.id, subject: "SUPP rating", status: "CLOSED", messages: { create: { body: "x" } } } });
    await prisma.ticket.update({ where: { id: t.id }, data: { rating: 5, ratingNote: "Tốt" } });
    const tr = await prisma.ticket.findUnique({ where: { id: t.id } });
    log(tr!.rating === 5, "3 ticket rating stored");

    // cleanup đơn test
    for (const o of [o1, o2, o3]) {
      await prisma.orderEvent.deleteMany({ where: { orderId: o.id } });
      await prisma.apiLog.deleteMany({ where: { kind: "points_earn", ref: `smm-${o.id}` } });
      await prisma.smmOrder.delete({ where: { id: o.id } });
    }
    await prisma.smmService.delete({ where: { id: svc.id } });
    await prisma.ticket.delete({ where: { id: t.id } });
  } finally {
    await prisma.notification.deleteMany({ where: { userId: user.id } });
    await prisma.transaction.deleteMany({ where: { userId: user.id } });
    await prisma.ticket.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    console.log("cleaned test user", uname);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
