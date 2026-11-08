import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PageHead } from "@/components/ui";
import { ServicesExplorer, ServiceDTO } from "@/components/client";
import { avgTimesFromRecentOrders } from "@/lib/avg-time";
import { getActiveFlashSale, flashAppliesTo, applyFlashAmount } from "@/lib/flash";
import { FlashBanner } from "@/components/flash-banner";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

/* Bảng giá nằm TRONG khu khách (lệnh Tín 2026-11-05): giá web mẹ như ở trang đặt đơn. */
export default async function DashPricePage() {
  const user = (await getCurrentUser())!;
  const { L } = await getServerI18n();
  const services = await prisma.smmService.findMany({ where: { active: true, panelId: null }, include: { category: true }, orderBy: [{ categoryId: "asc" }, { sort: "asc" }] });
  const hiddenCatIds = new Set<number>();
  const avgMap = await avgTimesFromRecentOrders(services.map((s) => s.id));
  const flashSale = await getActiveFlashSale("SMM");
  const dto: ServiceDTO[] = services.filter((s) => !hiddenCatIds.has(s.categoryId)).map((s) => ({
    id: s.id, name: s.name, description: s.description, notice: s.notice, rate: applyFlashAmount(s.rate, flashAppliesTo(flashSale, s.id) ? flashSale!.percent : 0), min: s.min, max: s.max,
    avgTime: avgMap.get(s.id) ?? s.avgTime, refill: s.refill, dripfeed: s.dripfeed, categoryId: s.categoryId, categoryName: s.category.name, platform: s.category.platform,
  }));
  return (
    <div>
      <FlashBanner kind="SMM" />
      <PageHead title={L("Bảng giá dịch vụ")} desc={L("Toàn bộ dịch vụ SMM đang mở bán kèm giá và giới hạn mỗi đơn.")} />
      <ServicesExplorer services={dto} orderMode />
    </div>
  );
}
