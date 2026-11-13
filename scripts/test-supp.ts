/* Test sống đợt bổ sung: chạy bằng tsx trong thư mục project (env Prisma như thường lệ).
 * Tạo dữ liệu test riêng, kiểm tra, rồi TỰ DỌN. */
import { prisma } from "../src/lib/db";
import { issueEmailVerification, verifyEmailByToken } from "../src/lib/email-verify";
import { cleanAttachments, parseAttachments } from "../src/lib/attachments";
import { notifyUser } from "../src/lib/notify";
import { createPremiumOrder } from "../src/lib/orders";
import { awardPointsForPremiumOrder } from "../src/lib/points";
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
    await notifyUser(user.id, "Đơn hàng đã hoàn thành", "test order off", "/dashboard/don-premium");
    await notifyUser(user.id, "Thông báo hệ thống", "test system on", "/dashboard/thong-bao");
    const notifs = await prisma.notification.findMany({ where: { userId: user.id } });
    log(notifs.length === 1 && notifs[0].title.includes("hệ thống"), "6 notify-prefs", `count=${notifs.length}`);

    // 8+9) Flash sale + points qua createPremiumOrder thật
    const pcat = await prisma.premiumCategory.create({ data: { name: "SUPP TEST PCAT", slug: "supp-test-" + uname } });
    const pprod = await prisma.premiumProduct.create({ data: { categoryId: pcat.id, name: "SUPP TEST PROD", slug: "supp-prod-" + uname, fulfillment: "MANUAL" } });
    const pvar = await prisma.premiumVariant.create({ data: { productId: pprod.id, name: "Gói SUPP", price: 200000, cost: 0 } });
    const full = (await prisma.user.findUnique({ where: { id: user.id } }))!;
    const o1 = await createPremiumOrder({ user: full, variantId: pvar.id, quantity: 1, buyerInfo: "supp@test.local" });
    log(o1.total === 200000, "8a giá thường", `total=${o1.total}`);
    const sale = await prisma.flashSale.create({
      data: { name: "SUPP SALE", percent: 50, scope: "ALL", startsAt: new Date(Date.now() - 3600000), endsAt: new Date(Date.now() + 3600000), panelId: null, active: true },
    });
    const o2 = await createPremiumOrder({ user: full, variantId: pvar.id, quantity: 1, buyerInfo: "supp@test.local" });
    log(o2.total === 100000, "8b giá flash -50%", `total=${o2.total}`);
    // hết hạn -> giá thường
    await prisma.flashSale.update({ where: { id: sale.id }, data: { endsAt: new Date(Date.now() - 1000) } });
    const o3 = await createPremiumOrder({ user: full, variantId: pvar.id, quantity: 1, buyerInfo: "supp@test.local" });
    log(o3.total === 200000, "8c hết flash giá thường", `total=${o3.total}`);
    await prisma.flashSale.delete({ where: { id: sale.id } });

    // points: đơn Premium 200.000 -> 2 điểm; cộng trùng không nhân đôi
    const before = (await prisma.user.findUnique({ where: { id: user.id } }))!.points;
    await awardPointsForPremiumOrder({ id: o1.id, userId: user.id, total: o1.total, code: o1.code });
    await awardPointsForPremiumOrder({ id: o1.id, userId: user.id, total: o1.total, code: o1.code });
    const afterPts = (await prisma.user.findUnique({ where: { id: user.id } }))!;
    log(afterPts.points === before + 2, "9 points earn + chống trùng", `points=${afterPts.points}`);

    // ticket rating guard data: closed ticket
    const t = await prisma.ticket.create({ data: { userId: user.id, subject: "SUPP rating", status: "CLOSED", messages: { create: { body: "x" } } } });
    await prisma.ticket.update({ where: { id: t.id }, data: { rating: 5, ratingNote: "Tốt" } });
    const tr = await prisma.ticket.findUnique({ where: { id: t.id } });
    log(tr!.rating === 5, "3 ticket rating stored");

    // cleanup đơn test
    await prisma.premiumOrder.deleteMany({ where: { userId: user.id } });
    await prisma.apiLog.deleteMany({ where: { kind: "points_earn", ref: `premium-${o1.id}` } });
    await prisma.premiumVariant.delete({ where: { id: pvar.id } });
    await prisma.premiumProduct.delete({ where: { id: pprod.id } });
    await prisma.premiumCategory.delete({ where: { id: pcat.id } });
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
