import { prisma } from "../src/lib/db";
async function main() {
  const demo = await prisma.user.findUnique({ where: { username: "demo" } });
  if (!demo) throw new Error("no demo");
  const svc = await prisma.smmService.findFirst({ where: { active: true }, orderBy: { id: "asc" } });
  if (!svc) throw new Error("no service");
  const mk = async (code: string, status: any, viaApi: boolean, extra: any = {}) => {
    const o = await prisma.smmOrder.create({ data: {
      code, userId: demo.id, serviceId: svc.id, link: "https://www.instagram.com/demo.profile/",
      quantity: 1000, charge: 30000, cost: 0, startCount: 120, remains: status === "COMPLETED" ? 0 : 640,
      status, fulfillment: "MANUAL", viaApi, ...extra } });
    await prisma.orderEvent.createMany({ data: [
      { orderId: o.id, status: "PENDING", note: "Đơn hàng được tạo" },
      { orderId: o.id, status, note: "Trạng thái cập nhật (dữ liệu mẫu kiểm chứng giao diện)" } ] });
    return o;
  };
  await mk("SMM100101", "PROCESSING", false);
  await mk("SMM100102", "COMPLETED", true);
  await mk("SMM100103", "PENDING", false, { params: JSON.stringify({ dripfeed: true, runs: 5, interval: 60 }) });
  const yt = await prisma.premiumProduct.findFirst({ where: { slug: "youtube-premium" }, include: { variants: { orderBy: { id: "asc" } } } });
  if (!yt) throw new Error("no yt");
  await prisma.premiumOrder.create({ data: { code: "PRE100201", userId: demo.id, variantId: yt.variants[1].id, quantity: 1, total: yt.variants[1].price, status: "DELIVERED", deliveryData: "Tài khoản: demo@example.com\nMật khẩu: DemoPass123", buyerInfo: JSON.stringify({ "Email nhận hàng": "demo@example.com" }), warrantyUntil: new Date(Date.now() + 30 * 864e5) } });
  await prisma.premiumOrder.create({ data: { code: "PRE100202", userId: demo.id, variantId: yt.variants[0].id, quantity: 2, total: yt.variants[0].price * 2, status: "PENDING", buyerInfo: JSON.stringify({ "Email nhận hàng": "demo@example.com" }) } });
  const tgVar = await prisma.premiumVariant.findFirst({ where: { providerGroup: { in: ["telegram_stars", "telegram_premium"] } }, orderBy: { id: "asc" } });
  const tgSetting = await prisma.setting.findUnique({ where: { key: "telegram_enabled" } });
  console.log(JSON.stringify({ smm: ["SMM100101","SMM100102","SMM100103"], premium: ["PRE100201","PRE100202"], tgVariant: tgVar ? { id: tgVar.id, group: tgVar.providerGroup } : null, telegram_enabled: tgSetting?.value ?? null }));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
