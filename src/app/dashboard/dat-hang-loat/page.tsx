import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { moduleOn } from "@/lib/modules";
import { PageHead, Flash } from "@/components/ui";
import { BulkOrderForm, type ServiceDTO } from "@/components/client";
import { bulkPlaceOrdersAction } from "@/app/actions/user";
import { LEVEL_DISCOUNT } from "@/lib/format";
import { getSettings, levelDiscountFromSettings } from "@/lib/settings";
import { panelTierDiscount } from "@/lib/orders";

export const dynamic = "force-dynamic";

export default async function BulkOrderPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const user = (await getCurrentUser())!;
  if (!(await moduleOn("bulk", user.panelId))) { const { redirect } = await import("next/navigation"); redirect("/dashboard"); }
  const settings = await getSettings();
  const panel = user.panelId ? await prisma.childPanel.findUnique({ where: { id: user.panelId } }) : null;
  const panelActive = panel && panel.status === "ACTIVE" ? panel : null;
  const services = await prisma.smmService.findMany({ where: { active: true }, include: { category: true }, orderBy: [{ categoryId: "asc" }, { sort: "asc" }] });
  const dto: ServiceDTO[] = services.map((s) => ({
    id: s.id, name: s.name, description: s.description, rate: panelActive ? Math.round(s.rate * (1 + panelActive.markup / 100)) : s.rate, min: s.min, max: s.max,
    avgTime: s.avgTime, refill: s.refill, dripfeed: s.dripfeed, categoryId: s.categoryId, categoryName: s.category.name, platform: s.category.platform,
  }));
  return (
    <div>
      <PageHead title="Đặt hàng loạt" desc="Dán danh sách đơn theo định dạng sẵn — hệ thống kiểm tra từng dòng, tính tổng tiền trước, dòng nào lỗi bỏ qua dòng đó." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <BulkOrderForm services={dto} discount={panelActive ? panelTierDiscount(panelActive, user.level) : levelDiscountFromSettings(settings, user.level)} balance={user.balance} action={bulkPlaceOrdersAction} />
    </div>
  );
}
