import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PageHead, Flash } from "@/components/ui";
import { FlashBanner } from "@/components/flash-banner";
import { getActiveFlashSale, flashAppliesTo, applyFlashAmount } from "@/lib/flash";
import { OrderForm, ServiceDTO } from "@/components/client";
import { getSettings, levelDiscountFromSettings } from "@/lib/settings";
import { panelTierDiscount } from "@/lib/orders";
import { placeSmmOrderAction } from "@/app/actions/user";
import { avgTimesFromRecentOrders } from "@/lib/avg-time";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

export default async function OrderPage({ searchParams }: { searchParams: { service?: string; platform?: string; cat?: string; msg?: string; err?: string; link?: string; qty?: string; campaign?: string } }) {
  const user = (await getCurrentUser())!;
  const settings = await getSettings();
  // Khách của panel con: giá hiển thị đã cộng markup của chủ panel, không chiết khấu cấp bậc
  const panel = user.panelId ? await prisma.childPanel.findUnique({ where: { id: user.panelId } }) : null;
  const panelActive = panel && panel.status === "ACTIVE" ? panel : null;
  const panelLangRaw = user.panelId ? (panel?.langConfig ?? null) : undefined;
  const { L, Ld } = await getServerI18n(panelLangRaw);
  if (settings.module_smm === "0" || (panelActive && !panelActive.sellSmm)) {
    return (
      <div>
        <PageHead title={L("Đặt đơn SMM")} />
        <div className="card p-8 text-center">
          <div className="text-lg font-bold text-slate-900">{L("Mảng dịch vụ SMM đang tắt")}</div>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{panelActive && settings.module_smm !== "0" ? L("Website của bạn hiện không bán dịch vụ SMM.") : L("Hệ thống đang tạm ngưng mảng dịch vụ SMM. Vui lòng quay lại sau.")}</p>
        </div>
      </div>
    );
  }
  const [services, categories] = await Promise.all([
    prisma.smmService.findMany({ where: { active: true, OR: [{ panelId: null }, ...(user.panelId ? [{ panelId: user.panelId }] : [])] }, include: { category: true }, orderBy: [{ categoryId: "asc" }, { sort: "asc" }] }),
    prisma.smmCategory.findMany({ where: { active: true }, orderBy: { sort: "asc" } }),
  ]);
  const hiddenCatIds = new Set((panelActive?.hiddenCats || "").split(",").map((x) => parseInt(x.trim())).filter((n) => Number.isFinite(n)));
  // Thời gian trung bình: tính thật từ 10 đơn hoàn thành gần nhất; chưa có đơn thì dùng giá trị admin đặt
  const avgMap = await avgTimesFromRecentOrders(services.map((s) => s.id));
  const flashSale = await getActiveFlashSale(user.panelId ?? null, "SMM");
  const dto: ServiceDTO[] = services.filter((s) => !hiddenCatIds.has(s.categoryId)).map((s) => ({
    id: s.id, name: s.name, description: s.description, notice: s.notice, rate: applyFlashAmount(s.panelId ? s.rate : panelActive ? Math.round(s.rate * (1 + panelActive.markup / 100)) : s.rate, flashAppliesTo(flashSale, s.id) ? flashSale!.percent : 0), min: s.min, max: s.max,
    avgTime: avgMap.get(s.id) ?? s.avgTime, refill: s.refill, dripfeed: s.dripfeed, categoryId: s.categoryId, categoryName: s.category.name, platform: s.category.platform,
  }));
  const cats = categories.filter((c) => !hiddenCatIds.has(c.id) && services.some((s) => s.categoryId === c.id)).map((c) => ({ id: c.id, name: c.name, platform: c.platform }));
  // Deep-link từ menu nền tảng (mẫu trumapi): ?platform=..&cat=.. -> chọn sẵn phân loại đó qua
  // dịch vụ đầu tiên của phân loại (OrderForm tự suy ra nền tảng + phân loại từ dịch vụ được chọn).
  // ?service=.. vẫn ưu tiên cao nhất; tham số sai/không tồn tại -> mặc định như cũ.
  let preselect = searchParams.service ? parseInt(searchParams.service) : undefined;
  if (!preselect && (searchParams.cat || searchParams.platform)) {
    const catParam = searchParams.cat ? parseInt(searchParams.cat) : NaN;
    const targetCat = (Number.isFinite(catParam) ? cats.find((c) => c.id === catParam) : undefined)
      || (searchParams.platform ? cats.find((c) => c.platform === searchParams.platform) : undefined);
    if (targetCat) preselect = dto.find((sv) => sv.categoryId === targetCat.id)?.id;
  }
  return (
    <div>
      <PageHead title={L("Đặt đơn SMM")} />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <FlashBanner panelId={user.panelId ?? null} kind="SMM" />
      {panelActive && (
        <div className="card px-5 py-3.5 mb-5 text-sm text-slate-600">{L("Bạn đang mua qua panel")} <b className="text-slate-900">{panelActive.name}</b> {Ld(`— giá đã gồm phụ phí ${panelActive.markup}% của panel${panelTierDiscount(panelActive, user.level) > 0 ? `, cấp bậc của bạn được giảm thêm ${panelTierDiscount(panelActive, user.level)}%` : ""}.`)}</div>
      )}
      <OrderForm services={dto} categories={cats} discount={panelActive ? panelTierDiscount(panelActive, user.level) : levelDiscountFromSettings(settings, user.level)} preselect={preselect} campaignId={searchParams.campaign ? parseInt(searchParams.campaign) : undefined} action={placeSmmOrderAction}
        balance={user.balance} initialLink={searchParams.link} initialQty={searchParams.qty ? parseInt(searchParams.qty) : undefined} />
    </div>
  );
}
