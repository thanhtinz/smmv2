import { LANGS } from "./i18n";

/* Cấu hình ngôn ngữ lưu trong DB (Admin → Ngôn ngữ):
 * - Web mẹ: Setting langs_enabled (JSON mảng mã), default_lang, lang_overrides (JSON {lang: {chuỗi Việt: bản dịch}})
 * - Panel con: ChildPanel.langConfig (JSON {enabled?, defaultLang?, overrides?}) — null/thiếu = theo web mẹ,
 *   overrides của panel đè lên overrides của mẹ theo từng chuỗi.
 * Thứ tự áp dụng bản dịch: từ điển gốc (DICT) → override mẹ → override panel. */

export const LANG_KEYS: string[] = LANGS.map((l) => l.key);
export type LangOverrides = Record<string, Record<string, string>>;

export type PanelLangConfig = {
  enabled?: string[];
  defaultLang?: string;
  overrides?: LangOverrides;
};

export type ResolvedLangConfig = {
  enabled: string[];
  defaultLang: string;
  overrides: LangOverrides;
};

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Lọc danh sách mã ngôn ngữ hợp lệ; rỗng/không hợp lệ -> toàn bộ 6 ngôn ngữ. */
export function sanitizeEnabled(list: unknown): string[] {
  if (!Array.isArray(list)) return [...LANG_KEYS];
  const out = list.filter((x): x is string => typeof x === "string" && LANG_KEYS.includes(x));
  return out.length ? Array.from(new Set(out)) : [...LANG_KEYS];
}

export function sanitizeOverrides(raw: unknown): LangOverrides {
  const out: LangOverrides = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [lang, map] of Object.entries(raw as Record<string, unknown>)) {
    if (!LANG_KEYS.includes(lang) || lang === "vi" || !map || typeof map !== "object") continue;
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(map as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim() && k) clean[k] = v;
    }
    if (Object.keys(clean).length) out[lang] = clean;
  }
  return out;
}

export function parsePanelLangConfig(raw: string | null | undefined): PanelLangConfig {
  const v = parseJson<PanelLangConfig>(raw, {});
  const out: PanelLangConfig = {};
  if (Array.isArray(v.enabled)) out.enabled = sanitizeEnabled(v.enabled);
  if (typeof v.defaultLang === "string" && LANG_KEYS.includes(v.defaultLang)) out.defaultLang = v.defaultLang;
  if (v.overrides) out.overrides = sanitizeOverrides(v.overrides);
  return out;
}

/** Hợp nhất cấu hình mẹ + panel thành cấu hình hiệu lực cho một site. */
export function resolveLangConfig(
  settings: Record<string, string>,
  panelLang?: PanelLangConfig | null
): ResolvedLangConfig {
  const motherEnabled = sanitizeEnabled(parseJson<unknown>(settings.langs_enabled, null));
  const motherOverrides = sanitizeOverrides(parseJson<unknown>(settings.lang_overrides, {}));
  let enabled = panelLang?.enabled ? sanitizeEnabled(panelLang.enabled) : motherEnabled;
  let defaultLang =
    panelLang?.defaultLang && LANG_KEYS.includes(panelLang.defaultLang)
      ? panelLang.defaultLang
      : settings.default_lang && LANG_KEYS.includes(settings.default_lang)
        ? settings.default_lang
        : "en";
  if (!enabled.includes(defaultLang)) defaultLang = enabled[0] || "en";
  if (!enabled.length) enabled = [...LANG_KEYS];
  const overrides: LangOverrides = {};
  for (const src of [motherOverrides, panelLang?.overrides || {}]) {
    for (const [lang, map] of Object.entries(src)) {
      overrides[lang] = { ...(overrides[lang] || {}), ...map };
    }
  }
  return { enabled, defaultLang, overrides };
}

/** Đếm số chuỗi đã tuỳ chỉnh trong một bản overrides. */
export function countOverrides(ov: LangOverrides): number {
  return Object.values(ov).reduce((n, m) => n + Object.keys(m).length, 0);
}
