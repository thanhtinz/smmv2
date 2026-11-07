import { cache } from "react";
import { cookies } from "next/headers";
import { getSettings } from "./settings";
import { panelByHost } from "./panel-host";
import { resolveLangConfig, parsePanelLangConfig, type ResolvedLangConfig } from "./lang-config";
import { tr, trd } from "./i18n";

/** Ngôn ngữ hiển thị đọc phía SERVER từ cookie smmv2-lang (DisplaySettings ghi đồng thời
 *  vào localStorage + cookie này). Mặc định "en" như lựa chọn mặc định phía khách. */
export function getLang(): string {
  try {
    return cookies().get("smmv2-lang")?.value || "en";
  } catch {
    return "en";
  }
}

export type ServerI18n = {
  lang: string;
  cfg: ResolvedLangConfig;
  /** Dịch khớp chính xác, đã gồm bản dịch tuỳ chỉnh (Admin → Ngôn ngữ). */
  L: (t: string) => string;
  /** Như L nhưng thêm dịch theo mảnh cho dòng ghép có số. */
  Ld: (t: string) => string;
};

const loadCfg = cache(async (panelLangRaw: string | null): Promise<ResolvedLangConfig> => {
  const s = await getSettings().catch(() => ({}) as Record<string, string>);
  return resolveLangConfig(s, parsePanelLangConfig(panelLangRaw));
});

/** Bộ dịch phía server cho một request:
 *  - panelRaw === undefined: tự nhận diện panel theo tên miền (site con trên domain riêng).
 *  - panelRaw là chuỗi langConfig của panel (layout đã biết panel) hoặc null (chỉ dùng cấu hình mẹ).
 *  Ngôn ngữ hiệu lực: cookie của khách nếu còn được bật, ngược lại ngôn ngữ mặc định đã cấu hình. */
export async function getServerI18n(panelRaw?: string | null): Promise<ServerI18n> {
  let raw: string | null = panelRaw ?? null;
  if (panelRaw === undefined) {
    const p = await panelByHost().catch(() => null);
    raw = (p as unknown as { langConfig?: string | null } | null)?.langConfig ?? null;
  }
  const cfg = await loadCfg(raw);
  let cookieLang: string | null = null;
  try {
    cookieLang = cookies().get("smmv2-lang")?.value || null;
  } catch { /* ngoài request */ }
  const lang = cookieLang && cfg.enabled.includes(cookieLang) ? cookieLang : cfg.defaultLang;
  const ov = cfg.overrides[lang];
  return {
    lang,
    cfg,
    L: (t: string) => tr(lang, t, ov),
    Ld: (t: string) => trd(lang, t, ov),
  };
}
