import { prisma } from "@/lib/db";
import { requirePanelOwnerPage } from "@/lib/panel-access";
import { PageHead, Flash } from "@/components/ui";
import { PanelCodesClient, type PanelCodeDTO } from "@/components/panel-features";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

/** Mã giảm giá riêng của panel — chỉ khách mua qua website này mới dùng được. */
export default async function PanelCodesPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const { panel } = await requirePanelOwnerPage();
  const { L, Ld } = await getServerI18n((panel as { langConfig?: string | null }).langConfig ?? null);
  const rows = await prisma.discountCode.findMany({ where: { panelId: panel.id }, orderBy: { id: "desc" } });
  const dtos: PanelCodeDTO[] = rows.map((c) => ({
    id: c.id, code: c.code, type: c.type, value: c.value, minOrder: c.minOrder, maxDiscount: c.maxDiscount,
    usageLimit: c.usageLimit, usedCount: c.usedCount, scope: c.scope,
    startsAt: c.startsAt ? c.startsAt.toISOString().slice(0, 16) : null,
    endsAt: c.endsAt ? c.endsAt.toISOString().slice(0, 16) : null,
    active: c.active,
  }));
  return (
    <div>
      <PageHead title={L("Mã giảm giá")} desc={L("Mã riêng của website — chỉ áp dụng cho đơn mua qua panel của bạn.")} />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <PanelCodesClient codes={dtos} />
    </div>
  );
}
