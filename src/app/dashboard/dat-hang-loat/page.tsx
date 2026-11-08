import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { moduleOn } from "@/lib/modules";
import { Flash } from "@/components/ui";
import { BulkOrderForm, type ServiceDTO } from "@/components/client";
import { bulkPlaceOrdersAction } from "@/app/actions/user";
import { getSettings, levelDiscountFromSettings } from "@/lib/settings";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

export default async function BulkOrderPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const user = (await getCurrentUser())!;
  if (!(await moduleOn("bulk"))) { const { redirect } = await import("next/navigation"); redirect("/"); }
  const settings = await getSettings();
  const { L, Ld } = await getServerI18n();
  const services = await prisma.smmService.findMany({ where: { active: true, panelId: null }, include: { category: true }, orderBy: [{ categoryId: "asc" }, { sort: "asc" }] });
  const dto: ServiceDTO[] = services.map((s) => ({
    id: s.id, name: s.name, description: s.description, rate: s.rate, min: s.min, max: s.max,
    avgTime: s.avgTime, refill: s.refill, dripfeed: s.dripfeed, categoryId: s.categoryId, categoryName: s.category.name, platform: s.category.platform,
  }));
  return (
    <div>
      {/* Thẻ header kiểu Telegram như các trang đơn khác (fix6 task 3) */}
      <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 via-brand-50/60 to-white px-6 py-6 sm:px-7">
        <h1 className="text-[22px] font-black leading-tight text-slate-900">{L("Đặt hàng loạt")}</h1>
        <p className="mt-1 text-sm text-slate-500">{L("Dán danh sách đơn theo định dạng sẵn — hệ thống kiểm tra từng dòng, tính tổng tiền trước, dòng nào lỗi bỏ qua dòng đó.")}</p>
      </div>
      <div className="mt-5"><Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} /></div>
      <BulkOrderForm services={dto} discount={levelDiscountFromSettings(settings, user.level)} balance={user.balance} action={bulkPlaceOrdersAction} />
    </div>
  );
}
