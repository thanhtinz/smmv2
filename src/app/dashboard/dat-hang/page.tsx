import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PageHead, Flash } from "@/components/ui";
import { OrderForm, ServiceDTO } from "@/components/client";
import { LEVEL_DISCOUNT } from "@/lib/format";
import { getSettings, levelDiscountFromSettings } from "@/lib/settings";
import { panelTierDiscount } from "@/lib/orders";
import { placeSmmOrderAction } from "@/app/actions/user";

export const dynamic = "force-dynamic";

export default async function OrderPage({ searchParams }: { searchParams: { service?: string; msg?: string; err?: string; link?: string; qty?: string; campaign?: string } }) {
  const user = (await getCurrentUser())!;
  const settings = await getSettings();
  // Khách của panel con: giá hiển thị đã cộng markup của chủ panel, không chiết khấu cấp bậc
  const panel = user.panelId ? await prisma.childPanel.findUnique({ where: { id: user.panelId } }) : null;
  const panelActive = panel && panel.status === "ACTIVE" ? panel : null;
  const [services, categories] = await Promise.all([
    prisma.smmService.findMany({ where: { active: true, OR: [{ panelId: null }, ...(user.panelId ? [{ panelId: user.panelId }] : [])] }, include: { category: true }, orderBy: [{ categoryId: "asc" }, { sort: "asc" }] }),
    prisma.smmCategory.findMany({ where: { active: true }, orderBy: { sort: "asc" } }),
  ]);
  const dto: ServiceDTO[] = services.map((s) => ({
    id: s.id, name: s.name, description: s.description, rate: s.panelId ? s.rate : panelActive ? Math.round(s.rate * (1 + panelActive.markup / 100)) : s.rate, min: s.min, max: s.max,
    avgTime: s.avgTime, refill: s.refill, dripfeed: s.dripfeed, categoryId: s.categoryId, categoryName: s.category.name, platform: s.category.platform,
  }));
  const cats = categories.filter((c) => services.some((s) => s.categoryId === c.id)).map((c) => ({ id: c.id, name: c.name, platform: c.platform }));
  return (
    <div>
      <PageHead title="Đặt đơn SMM" desc="Chọn dịch vụ, dán link công khai và nhập số lượng — hệ thống tự đẩy qua nhà cung cấp hoặc hàng đợi xử lý tay tuỳ dịch vụ." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      {panelActive && (
        <div className="card px-5 py-3.5 mb-5 text-sm text-slate-600">Bạn đang mua qua panel <b className="text-slate-900">{panelActive.name}</b> — giá đã gồm phụ phí {panelActive.markup}% của panel{panelTierDiscount(panelActive, user.level) > 0 ? `, cấp bậc của bạn được giảm thêm ${panelTierDiscount(panelActive, user.level)}%` : ""}.</div>
      )}
      <OrderForm services={dto} categories={cats} discount={panelActive ? panelTierDiscount(panelActive, user.level) : levelDiscountFromSettings(settings, user.level)} preselect={searchParams.service ? parseInt(searchParams.service) : undefined} campaignId={searchParams.campaign ? parseInt(searchParams.campaign) : undefined} action={placeSmmOrderAction}
        balance={user.balance} initialLink={searchParams.link} initialQty={searchParams.qty ? parseInt(searchParams.qty) : undefined} />
    </div>
  );
}
