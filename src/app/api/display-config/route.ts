import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSettings, DEFAULT_SETTINGS } from "@/lib/settings";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

/** Cấu hình hiển thị công khai cho phía khách: tỉ giá quy đổi hiển thị (VND vẫn là tiền thật).
 *  Khách thuộc panel nào thì dùng tỉ giá RIÊNG của panel đó nếu chủ panel đã đặt
 *  (trang Tiền tệ trong Panel Admin); chưa đặt thì dùng tỉ giá của web mẹ. */
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
  let overridden = false;
  try {
    type RateFields = { rateUsd: string | null; rateEur: string | null; rateCny: string | null; rateThb: string | null; rateJpy: string | null; rateKrw: string | null };
    let panel: RateFields | null = null;
    const fields = { rateUsd: true, rateEur: true, rateCny: true, rateThb: true, rateJpy: true, rateKrw: true } as const;
    const user = await getCurrentUser().catch(() => null);
    if (user?.panelId) panel = await prisma.childPanel.findUnique({ where: { id: user.panelId }, select: fields });
    else if (user) panel = await prisma.childPanel.findFirst({ where: { ownerId: user.id }, select: fields });
    if (!panel) {
      const host = (headers().get("host") || "").split(":")[0];
      if (host) panel = await prisma.childPanel.findFirst({ where: { domain: host }, select: fields });
    }
    if (panel) {
      const map: Record<string, string | null> = { USD: panel.rateUsd, EUR: panel.rateEur, CNY: panel.rateCny, THB: panel.rateThb, JPY: panel.rateJpy, KRW: panel.rateKrw };
      for (const k of Object.keys(map)) {
        const v = parseFloat(map[k] || "");
        if (Number.isFinite(v) && v > 0) { rates[k] = v; overridden = true; }
      }
    }
  } catch { /* không xác định được panel thì dùng tỉ giá web mẹ */ }
  return NextResponse.json(
    { rates },
    { headers: { "Cache-Control": overridden ? "private, no-store" : "public, max-age=300" } }
  );
}
