import { cache } from "react";
import { cookies } from "next/headers";
import { getSettings, DEFAULT_SETTINGS } from "./settings";
import { resolveLangConfig, type ResolvedLangConfig } from "./lang-config";
import { tr, trd, formatMoney, CURRENCIES } from "./i18n";

/** Ngôn ngữ hiển thị đọc phía SERVER từ cookie smmv2-lang (DisplaySettings ghi đồng thời
 *  vào localStorage + cookie này). Mặc định "en" như lựa chọn mặc định phía khách. */
export async function getLang(): Promise<string> {
  try {
    return (await cookies()).get("smmv2-lang")?.value || "en";
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
  /** Tiền tệ hiển thị khách đã chọn (cookie smmv2-cur), mặc định VND. */
  cur: string;
  /** Tỉ giá VND/1 đơn vị ngoại tệ hiệu lực của site (từ cấu hình web mẹ). */
  rates: Record<string, number>;
  /** Định dạng số tiền VND tại lúc render theo cur + rates + lang. */
  M: (n: number) => string;
};

/** Tiền tệ hiển thị từ cookie smmv2-cur (DisplaySettings ghi đồng thời localStorage + cookie). */
export async function getCur(): Promise<string> {
  try {
    const v = (await cookies()).get("smmv2-cur")?.value || "";
    return CURRENCIES.some((c) => c.key === v) ? v : "VND";
  } catch {
    return "VND";
  }
}

const loadRates = cache(async (): Promise<Record<string, number>> => {
  const s = await getSettings().catch(() => ({}) as Record<string, string>);
  return {
    USD: parseInt(s?.usd_rate || DEFAULT_SETTINGS.usd_rate) || Number(DEFAULT_SETTINGS.usd_rate),
    EUR: parseInt(s?.rate_eur || DEFAULT_SETTINGS.rate_eur) || Number(DEFAULT_SETTINGS.rate_eur),
    CNY: parseInt(s?.rate_cny || DEFAULT_SETTINGS.rate_cny) || Number(DEFAULT_SETTINGS.rate_cny),
    THB: parseInt(s?.rate_thb || DEFAULT_SETTINGS.rate_thb) || Number(DEFAULT_SETTINGS.rate_thb),
    JPY: parseInt(s?.rate_jpy || DEFAULT_SETTINGS.rate_jpy) || Number(DEFAULT_SETTINGS.rate_jpy),
    KRW: parseFloat(s?.rate_krw || DEFAULT_SETTINGS.rate_krw) || Number(DEFAULT_SETTINGS.rate_krw),
  };
});

const loadCfg = cache(async (): Promise<ResolvedLangConfig> => {
  const s = await getSettings().catch(() => ({}) as Record<string, string>);
  return resolveLangConfig(s);
});

/** Bộ dịch phía server cho một request.
 *  Ngôn ngữ hiệu lực: cookie của khách nếu còn được bật, ngược lại ngôn ngữ mặc định đã cấu hình. */
export async function getServerI18n(_panelRaw?: string | null): Promise<ServerI18n> {
  const cfg = await loadCfg();
  let cookieLang: string | null = null;
  try {
    cookieLang = (await cookies()).get("smmv2-lang")?.value || null;
  } catch { /* ngoài request */ }
  const lang = cookieLang && cfg.enabled.includes(cookieLang) ? cookieLang : cfg.defaultLang;
  const ov = cfg.overrides[lang];
  const cur = await getCur();
  const rates = await loadRates();
  return {
    lang,
    cfg,
    L: (t: string) => tr(lang, t, ov),
    Ld: (t: string) => trd(lang, t, ov),
    cur,
    rates,
    M: (n: number) => formatMoney(n, cur, lang, rates),
  };
}
