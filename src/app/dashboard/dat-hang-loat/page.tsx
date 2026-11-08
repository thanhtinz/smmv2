import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { moduleOn } from "@/lib/modules";
import { PageHead, Flash } from "@/components/ui";
import { BulkOrderForm, type ServiceDTO } from "@/components/client";
import { bulkPlaceOrdersAction } from "@/app/actions/user";
import { getSettings, levelDiscountFromSettings } from "@/lib/settings";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

export default async function BulkOrderPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const user = (await getCurrentUser())!;
  if (!(await moduleOn("bulk"))) { const { redirect } = await import("next/navigation"); redirect("/dashboard"); }
  const settings = await getSettings();
  const { L, Ld } = await getServerI18n();
  const services = await prisma.smmService.findMany({ where: { active: true, panelId: null }, include: { category: true }, orderBy: [{ categoryId: "asc" }, { sort: "asc" }] });
  const dto: ServiceDTO[] = services.map((s) => ({
    id: s.id, name: s.name, description: s.description, rate: s.rate, min: s.min, max: s.max,
    avgTime: s.avgTime, refill: s.refill, dripfeed: s.dripfeed, categoryId: s.categoryId, categoryName: s.category.name, platform: s.category.platform,
  }));
  return (
    <div>
      <PageHead title={L("Đặt hàng loạt")} desc={L("Dán danh sách đơn theo định dạng sẵn — hệ thống kiểm tra từng dòng, tính tổng tiền trước, dòng nào lỗi bỏ qua dòng đó.")} />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <BulkOrderForm services={dto} discount={levelDiscountFromSettings(settings, user.level)} balance={user.balance} action={bulkPlaceOrdersAction} />
    </div>
  );
}
