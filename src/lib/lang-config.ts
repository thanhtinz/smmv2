import { LANGS } from "./i18n";

/* Cấu hình ngôn ngữ lưu trong DB (Admin → Ngôn ngữ): Setting langs_enabled
 * (JSON mảng mã), default_lang, lang_overrides (JSON {lang: {chuỗi Việt: bản dịch}}).
 * Thứ tự áp dụng bản dịch: từ điển gốc (DICT) → override của admin. */

export const LANG_KEYS: string[] = LANGS.map((l) => l.key);
export type LangOverrides = Record<string, Record<string, string>>;

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


/** Cấu hình ngôn ngữ hiệu lực từ cấu hình của web mẹ. */
export function resolveLangConfig(settings: Record<string, string>): ResolvedLangConfig {
  const enabled0 = sanitizeEnabled(parseJson<unknown>(settings.langs_enabled, null));
  const overrides = sanitizeOverrides(parseJson<unknown>(settings.lang_overrides, {}));
  let defaultLang =
    settings.default_lang && LANG_KEYS.includes(settings.default_lang) ? settings.default_lang : "en";
  let enabled = enabled0;
  if (!enabled.includes(defaultLang)) defaultLang = enabled[0] || "en";
  if (!enabled.length) enabled = [...LANG_KEYS];
  return { enabled, defaultLang, overrides };
}

/** Đếm số chuỗi đã tuỳ chỉnh trong một bản overrides. */
export function countOverrides(ov: LangOverrides): number {
  return Object.values(ov).reduce((n, m) => n + Object.keys(m).length, 0);
}
