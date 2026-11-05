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
  if (settings.module_smm === "0" || (panelActive && !panelActive.sellSmm)) {
    return (
      <div>
        <PageHead title="Đặt đơn SMM" desc="Tăng follow, like, view cho Facebook, TikTok, Instagram, YouTube…" />
        <div className="card p-8 text-center">
          <div className="text-lg font-bold text-slate-900">Mảng dịch vụ SMM đang tắt</div>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{panelActive && settings.module_smm !== "0" ? "Gian hàng của bạn hiện không bán dịch vụ SMM." : "Hệ thống đang tạm ngưng mảng dịch vụ SMM. Vui lòng quay lại sau."}</p>
        </div>
      </div>
    );
  }
  const [services, categories] = await Promise.all([
    prisma.smmService.findMany({ where: { active: true, OR: [{ panelId: null }, ...(user.panelId ? [{ panelId: user.panelId }] : [])] }, include: { category: true }, orderBy: [{ categoryId: "asc" }, { sort: "asc" }] }),
    prisma.smmCategory.findMany({ where: { active: true }, orderBy: { sort: "asc" } }),
  ]);
  const hiddenCatIds = new Set((panelActive?.hiddenCats || "").split(",").map((x) => parseInt(x.trim())).filter((n) => Number.isFinite(n)));
  const dto: ServiceDTO[] = services.filter((s) => !hiddenCatIds.has(s.categoryId)).map((s) => ({
    id: s.id, name: s.name, description: s.description, notice: s.notice, rate: s.panelId ? s.rate : panelActive ? Math.round(s.rate * (1 + panelActive.markup / 100)) : s.rate, min: s.min, max: s.max,
    avgTime: s.avgTime, refill: s.refill, dripfeed: s.dripfeed, categoryId: s.categoryId, categoryName: s.category.name, platform: s.category.platform,
  }));
  const cats = categories.filter((c) => !hiddenCatIds.has(c.id) && services.some((s) => s.categoryId === c.id)).map((c) => ({ id: c.id, name: c.name, platform: c.platform }));
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
