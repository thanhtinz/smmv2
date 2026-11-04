import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PageHead, Flash } from "@/components/ui";
import { BulkOrderForm, type ServiceDTO } from "@/components/client";
import { bulkPlaceOrdersAction } from "@/app/actions/user";
import { LEVEL_DISCOUNT } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function BulkOrderPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const user = (await getCurrentUser())!;
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
      <BulkOrderForm services={dto} discount={panelActive ? 0 : LEVEL_DISCOUNT[user.level] || 0} balance={user.balance} action={bulkPlaceOrdersAction} />
    </div>
  );
}
