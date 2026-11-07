import { requirePanelOwnerPage } from "@/lib/panel-access";
import { PageHead, Flash } from "@/components/ui";
import { ContactWidgetsManager } from "@/components/contact-widgets";
import { panelSaveContactWidgetAction, panelDeleteContactWidgetAction, panelToggleContactWidgetAction, panelSeedContactWidgetsAction } from "@/app/actions/panel";
import { listContactWidgets } from "@/lib/contact";

export const dynamic = "force-dynamic";

/** Widget Liên hệ của panel — trang riêng như admin web mẹ (trước nằm lẫn trong Cài đặt panel). */
export default async function PanelContactWidgets({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const { panel } = await requirePanelOwnerPage();
  const contactItems = await listContactWidgets(panel.id);
  const panelHasLegacy = !!(panel.supportZalo || panel.supportTelegram || panel.supportFacebook || panel.supportHotline);
  return (
    <div>
      <PageHead title="Widget Liên hệ" desc="Các kênh liên hệ hiện thị trên website của bạn. Để trống thì khách thấy widget của web chính." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
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
