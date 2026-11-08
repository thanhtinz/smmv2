import { getPanelAccess } from "@/lib/panel-access";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PageHead, Flash } from "@/components/ui";
import { PanelSetupWizard, type PanelWizardData } from "@/components/client";
import { createPanelAction, updatePanelAction } from "@/app/actions/user";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

/** Trang cấu hình lần đầu của panel con — wizard 5 bước (có bước nhập API key liên kết web mẹ),
 *  dùng cho cả tạo mới và bổ sung cấu hình */
export default async function PanelSetupPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const user = (await getCurrentUser())!;
  const panelLangRaw = user.panelId
    ? ((await prisma.childPanel.findUnique({ where: { id: user.panelId }, select: { langConfig: true } }))?.langConfig ?? null)
    : undefined;
  const { L, Ld } = await getServerI18n(panelLangRaw);
  const panel = (await getPanelAccess(user.id))?.panel ?? null;
  const samples = await prisma.smmService.findMany({ where: { active: true }, take: 3, orderBy: { id: "asc" }, select: { name: true, rate: true } });
  const host = headers().get("host") || "localhost";
  const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  const apiUrl = `${proto}://${host}/api/v2`;
  const initial: PanelWizardData = panel
    ? {
        name: panel.name, slug: panel.slug, tagline: panel.tagline || "", accent: panel.accent,
        markup: panel.markup, discountMember: panel.discountMember, discountReseller: panel.discountReseller,
        discountAgency: panel.discountAgency, discountVip: panel.discountVip,
        apiKey: "", domain: panel.domain || "", support: panel.support || "", // không đưa key liên kết xuống trình duyệt — để trống = giữ key hiện tại
      }
    : { name: "", slug: "", tagline: "", accent: "blue", markup: 20, discountMember: 0, discountReseller: 5, discountAgency: 10, discountVip: 15, apiKey: user.apiKey, domain: "", support: "" };
  return (
    <div>
      <PageHead
        title={panel ? L("Cấu hình panel con") : L("Cấu hình panel con lần đầu")}
        desc={panel ? L("Chỉnh lại thông tin, giá theo cấp bậc, API key liên kết, tên miền và hỗ trợ của website.") : L("Năm bước ngắn để website của bạn sẵn sàng mở bán: thông tin, giá theo cấp bậc, nhập API key liên kết web mẹ, tên miền và hỗ trợ.")}
      />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <PanelSetupWizard mode={panel ? "edit" : "create"} initial={initial} samples={samples} apiUrl={apiUrl} action={panel ? updatePanelAction : createPanelAction} />
    </div>
  );
}
