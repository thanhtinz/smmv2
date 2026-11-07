import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PageHead } from "@/components/ui";
import { ServicesExplorer, ServiceDTO } from "@/components/client";
import { avgTimesFromRecentOrders } from "@/lib/avg-time";
import { getActiveFlashSale, flashAppliesTo, applyFlashAmount } from "@/lib/flash";
import { FlashBanner } from "@/components/flash-banner";

export const dynamic = "force-dynamic";

/* Bảng giá nằm TRONG khu khách (lệnh Tín 2026-11-05): khách panel thấy giá
   panel (đã gồm markup / giá riêng của panel) như ở trang đặt đơn. */
export default async function DashPricePage() {
  const user = (await getCurrentUser())!;
  const panel = user.panelId ? await prisma.childPanel.findUnique({ where: { id: user.panelId } }) : null;
  const panelActive = panel && panel.status === "ACTIVE" ? panel : null;
  const services = await prisma.smmService.findMany({ where: { active: true, OR: [{ panelId: null }, ...(user.panelId ? [{ panelId: user.panelId }] : [])] }, include: { category: true }, orderBy: [{ categoryId: "asc" }, { sort: "asc" }] });
  const hiddenCatIds = new Set((panelActive?.hiddenCats || "").split(",").map((x) => parseInt(x.trim())).filter((n) => Number.isFinite(n)));
  const avgMap = await avgTimesFromRecentOrders(services.map((s) => s.id));
  const flashSale = await getActiveFlashSale(user.panelId ?? null, "SMM");
  const dto: ServiceDTO[] = services.filter((s) => !hiddenCatIds.has(s.categoryId)).map((s) => ({
    id: s.id, name: s.name, description: s.description, notice: s.notice, rate: applyFlashAmount(s.panelId ? s.rate : panelActive ? Math.round(s.rate * (1 + panelActive.markup / 100)) : s.rate, flashAppliesTo(flashSale, s.id) ? flashSale!.percent : 0), min: s.min, max: s.max,
    avgTime: avgMap.get(s.id) ?? s.avgTime, refill: s.refill, dripfeed: s.dripfeed, categoryId: s.categoryId, categoryName: s.category.name, platform: s.category.platform,
  }));
  return (
    <div>
      <FlashBanner panelId={user.panelId ?? null} kind="SMM" />
      <PageHead title="Bảng giá dịch vụ" desc="Toàn bộ dịch vụ SMM đang mở bán kèm giá và giới hạn mỗi đơn." />
      <ServicesExplorer services={dto} orderMode />
    </div>
  );
}
