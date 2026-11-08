import { cache } from "react";
import { cookies, headers } from "next/headers";
import { getSettings, DEFAULT_SETTINGS } from "./settings";
import { panelByHost } from "./panel-host";
import { prisma } from "./db";
import { getCurrentUser } from "./auth";
import { resolveLangConfig, parsePanelLangConfig, type ResolvedLangConfig } from "./lang-config";
import { tr, trd, formatMoney, CURRENCIES } from "./i18n";

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
  /** Tiền tệ hiển thị khách đã chọn (cookie smmv2-cur), mặc định VND. */
  cur: string;
  /** Tỉ giá VND/1 đơn vị ngoại tệ hiệu lực của site (settings + panel đè). */
  rates: Record<string, number>;
  /** Định dạng số tiền VND tại lúc render theo cur + rates + lang. */
  M: (n: number) => string;
};

/** Tiền tệ hiển thị từ cookie smmv2-cur (DisplaySettings ghi đồng thời localStorage + cookie). */
export function getCur(): string {
  try {
    const v = cookies().get("smmv2-cur")?.value || "";
    return CURRENCIES.some((c) => c.key === v) ? v : "VND";
  } catch {
    return "VND";
  }
}

const RATE_FIELDS = { rateUsd: true, rateEur: true, rateCny: true, rateThb: true, rateJpy: true, rateKrw: true } as const;

/** Tỉ giá hiệu lực của request — CÙNG nguồn và CÙNG thứ tự ưu tiên với /api/display-config:
 *  tỉ giá settings của web mẹ, panel của khách (theo tài khoản -> chủ panel -> tên miền) đè lên. */
const loadRates = cache(async (): Promise<Record<string, number>> => {
  const s = await getSettings().catch(() => ({}) as Record<string, string>);
  const rates: Record<string, number> = {
    USD: parseInt(s?.usd_rate || DEFAULT_SETTINGS.usd_rate) || Number(DEFAULT_SETTINGS.usd_rate),
    EUR: parseInt(s?.rate_eur || DEFAULT_SETTINGS.rate_eur) || Number(DEFAULT_SETTINGS.rate_eur),
    CNY: parseInt(s?.rate_cny || DEFAULT_SETTINGS.rate_cny) || Number(DEFAULT_SETTINGS.rate_cny),
    THB: parseInt(s?.rate_thb || DEFAULT_SETTINGS.rate_thb) || Number(DEFAULT_SETTINGS.rate_thb),
    JPY: parseInt(s?.rate_jpy || DEFAULT_SETTINGS.rate_jpy) || Number(DEFAULT_SETTINGS.rate_jpy),
    KRW: parseFloat(s?.rate_krw || DEFAULT_SETTINGS.rate_krw) || Number(DEFAULT_SETTINGS.rate_krw),
  };
  try {
    type RateFields = { rateUsd: string | null; rateEur: string | null; rateCny: string | null; rateThb: string | null; rateJpy: string | null; rateKrw: string | null };
    let panel: RateFields | null = null;
    const user = await getCurrentUser().catch(() => null);
    if (user?.panelId) panel = await prisma.childPanel.findUnique({ where: { id: user.panelId }, select: RATE_FIELDS });
    else if (user) panel = await prisma.childPanel.findFirst({ where: { ownerId: user.id }, select: RATE_FIELDS });
    if (!panel) {
      const host = (headers().get("host") || "").split(":")[0];
      if (host) panel = await prisma.childPanel.findFirst({ where: { domain: host }, select: RATE_FIELDS });
    }
    if (panel) {
      const map: Record<string, string | null> = { USD: panel.rateUsd, EUR: panel.rateEur, CNY: panel.rateCny, THB: panel.rateThb, JPY: panel.rateJpy, KRW: panel.rateKrw };
      for (const k of Object.keys(map)) {
        const v = parseFloat(map[k] || "");
        if (Number.isFinite(v) && v > 0) rates[k] = v;
      }
    }
  } catch { /* không xác định được panel thì dùng tỉ giá web mẹ */ }
  return rates;
});

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
  const cur = getCur();
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
