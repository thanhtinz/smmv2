import { requirePanelOwnerPage } from "@/lib/panel-access";
import { PageHead, Flash } from "@/components/ui";
import { ContactWidgetsManager } from "@/components/contact-widgets";
import { panelSaveContactWidgetAction, panelDeleteContactWidgetAction, panelToggleContactWidgetAction, panelSeedContactWidgetsAction } from "@/app/actions/panel";
import { listContactWidgets } from "@/lib/contact";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

/** Widget Liên hệ của panel — trang riêng như admin web mẹ (trước nằm lẫn trong Cài đặt panel). */
export default async function PanelContactWidgets({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const { panel } = await requirePanelOwnerPage();
  const { L, Ld } = await getServerI18n((panel as { langConfig?: string | null }).langConfig ?? null);
  const contactItems = await listContactWidgets(panel.id);
  const panelHasLegacy = !!(panel.supportZalo || panel.supportTelegram || panel.supportFacebook || panel.supportHotline);
  return (
    <div>
      <PageHead title={L("Widget Liên hệ")} desc={L("Các kênh liên hệ hiện thị trên website của bạn. Để trống thì khách thấy widget của web chính.")} />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <div className="card p-6">
        <div className="max-w-3xl">
          <ContactWidgetsManager
            items={contactItems}
            saveAction={panelSaveContactWidgetAction}
            deleteAction={panelDeleteContactWidgetAction}
            toggleAction={panelToggleContactWidgetAction}
            seedAction={panelSeedContactWidgetsAction}
            hasLegacy={panelHasLegacy}
          />
        </div>
      </div>
    </div>
  );
}
