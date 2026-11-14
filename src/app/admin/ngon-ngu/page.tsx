import { requireAdminPage } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { LANG_KEYS, sanitizeEnabled, sanitizeOverrides, countOverrides } from "@/lib/lang-config";
import { LangAdminView, buildLangRows } from "@/components/lang-admin";
import { adminSaveLangSettingsAction, adminSaveLangOverridesAction, adminResetLangOverrideAction } from "@/app/actions/admin";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

/** Quản lý ngôn ngữ của web mẹ: bật/tắt 6 ngôn ngữ, đặt mặc định cho khách mới,
 *  sửa bản dịch trực tiếp (lưu Setting lang_overrides, áp dụng ngay). */
export default async function AdminLangPage( { searchParams: searchParamsPromise }: { searchParams: Promise<{ msg?: string; err?: string; lang?: string; q?: string }> }) {
  const searchParams = await searchParamsPromise;
  await requireAdminPage();
  const { Ld } = await getServerI18n(null);
  const s = await getSettings();
  let enabled: string[] = [];
  try { enabled = sanitizeEnabled(JSON.parse(s.langs_enabled || "[]")); } catch { enabled = sanitizeEnabled(null); }
  const defaultLang = LANG_KEYS.includes(s.default_lang) ? s.default_lang : "en";
  let overrides = sanitizeOverrides({});
  try { overrides = sanitizeOverrides(JSON.parse(s.lang_overrides || "{}")); } catch { /* bản ghi hỏng -> coi như chưa tuỳ chỉnh */ }
  const lang = searchParams.lang && LANG_KEYS.includes(searchParams.lang) && searchParams.lang !== "vi" ? searchParams.lang : "en";
  const q = searchParams.q || "";
  const ownOv = overrides[lang] || {};
  const { rows, totalMatches, totalDict } = buildLangRows(lang, {}, ownOv, q);
  return (
    <LangAdminView
      basePath="/admin/ngon-ngu"
      msg={searchParams.msg ? Ld(searchParams.msg) : undefined}
      err={searchParams.err ? Ld(searchParams.err) : undefined}
      settingsAction={adminSaveLangSettingsAction}
      saveAction={adminSaveLangOverridesAction}
      resetAction={adminResetLangOverrideAction}
      enabled={enabled}
      defaultLang={defaultLang}
      lang={lang}
      q={q}
      rows={rows}
      totalMatches={totalMatches}
      totalDict={totalDict}
      ownCount={Object.keys(ownOv).length}
      totalOwn={countOverrides(overrides)}
    />
  );
}
