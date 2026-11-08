import { NextResponse } from "next/server";
import { getSettings, DEFAULT_SETTINGS } from "@/lib/settings";
import { resolveLangConfig } from "@/lib/lang-config";

/** Cấu hình hiển thị công khai cho phía khách: tỉ giá quy đổi hiển thị (VND vẫn là
 *  tiền thật) + cấu hình ngôn ngữ hiệu lực (Admin → Ngôn ngữ). */
export async function GET() {
  const s = await getSettings().catch(() => null);
  // Dự phòng lấy từ DEFAULT_SETTINGS — nguồn mặc định duy nhất của toàn hệ thống
  const rates: Record<string, number> = {
    USD: parseInt(s?.usd_rate || DEFAULT_SETTINGS.usd_rate) || Number(DEFAULT_SETTINGS.usd_rate),
    EUR: parseInt(s?.rate_eur || DEFAULT_SETTINGS.rate_eur) || Number(DEFAULT_SETTINGS.rate_eur),
    CNY: parseInt(s?.rate_cny || DEFAULT_SETTINGS.rate_cny) || Number(DEFAULT_SETTINGS.rate_cny),
    THB: parseInt(s?.rate_thb || DEFAULT_SETTINGS.rate_thb) || Number(DEFAULT_SETTINGS.rate_thb),
    JPY: parseInt(s?.rate_jpy || DEFAULT_SETTINGS.rate_jpy) || Number(DEFAULT_SETTINGS.rate_jpy),
    KRW: parseFloat(s?.rate_krw || DEFAULT_SETTINGS.rate_krw) || Number(DEFAULT_SETTINGS.rate_krw),
  };
  const langCfg = resolveLangConfig(s ?? {});
  const hasOverrides = Object.keys(langCfg.overrides).length > 0;
  return NextResponse.json(
    { rates, langsEnabled: langCfg.enabled, defaultLang: langCfg.defaultLang, overrides: langCfg.overrides },
    { headers: { "Cache-Control": hasOverrides ? "private, no-store" : "public, max-age=300" } }
  );
}
