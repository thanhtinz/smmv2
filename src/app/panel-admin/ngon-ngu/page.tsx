import { requirePanelOwnerPage } from "@/lib/panel-access";
import { getSettings } from "@/lib/settings";
import { LANG_KEYS, parsePanelLangConfig, resolveLangConfig, countOverrides } from "@/lib/lang-config";
import { LangAdminView, buildLangRows } from "@/components/lang-admin";
import { panelSaveLangSettingsAction, panelSaveLangOverridesAction, panelResetLangOverrideAction } from "@/app/actions/panel";

export const dynamic = "force-dynamic";

/** Quản lý ngôn ngữ RIÊNG của website con: danh sách bật/tắt + mặc định có thể theo
 *  web mẹ hoặc tự chọn; bản dịch tuỳ chỉnh của panel đè lên của web mẹ theo từng chuỗi. */
export default async function PanelLangPage({ searchParams }: { searchParams: { msg?: string; err?: string; lang?: string; q?: string } }) {
  const { panel } = await requirePanelOwnerPage();
  const s = await getSettings();
  const motherCfg = resolveLangConfig(s, null);
  const mine = parsePanelLangConfig(panel.langConfig);
  const ownList = !!(mine.enabled || mine.defaultLang);
  const enabled = mine.enabled ?? motherCfg.enabled;
  const defaultLang = mine.defaultLang ?? motherCfg.defaultLang;
  const lang = searchParams.lang && LANG_KEYS.includes(searchParams.lang) && searchParams.lang !== "vi" ? searchParams.lang : "en";
  const q = searchParams.q || "";
  const ownOv = mine.overrides?.[lang] || {};
  const baseOv = motherCfg.overrides[lang] || {};
  const { rows, totalMatches, totalDict } = buildLangRows(lang, baseOv, ownOv, q);
  const inherited = countOverrides(motherCfg.overrides);
  return (
    <LangAdminView
      basePath="/panel-admin/ngon-ngu"
      msg={searchParams.msg}
      err={searchParams.err}
      settingsAction={panelSaveLangSettingsAction}
      saveAction={panelSaveLangOverridesAction}
      resetAction={panelResetLangOverrideAction}
      enabled={enabled}
      defaultLang={defaultLang}
      panelMode
      ownList={ownList}
      lang={lang}
      q={q}
      rows={rows}
      totalMatches={totalMatches}
      totalDict={totalDict}
      ownCount={Object.keys(ownOv).length}
      totalOwn={countOverrides(mine.overrides || {})}
      inheritedNote={inherited ? `Đang kế thừa ${inherited} bản dịch tuỳ chỉnh từ web mẹ (hiện ở cột Bản dịch gốc).` : undefined}
    />
  );
}
