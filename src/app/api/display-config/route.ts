import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSettings } from "@/lib/settings";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

/** Cấu hình hiển thị công khai cho phía khách: tỉ giá quy đổi hiển thị (VND vẫn là tiền thật).
 *  Khách thuộc panel nào thì dùng tỉ giá RIÊNG của panel đó nếu chủ panel đã đặt
 *  (trang Tiền tệ trong Panel Admin); chưa đặt thì dùng tỉ giá của web mẹ. */
export async function GET() {
  const s = await getSettings().catch(() => null);
  const rates: Record<string, number> = {
    USD: parseInt(s?.usd_rate || "25000") || 25000,
    EUR: parseInt(s?.rate_eur || "27000") || 27000,
    CNY: parseInt(s?.rate_cny || "3450") || 3450,
    THB: parseInt(s?.rate_thb || "720") || 720,
    JPY: parseInt(s?.rate_jpy || "160") || 160,
    KRW: parseFloat(s?.rate_krw || "17.5") || 17.5,
  };
  let overridden = false;
  try {
    type RateFields = { rateUsd: string | null; rateEur: string | null; rateCny: string | null; rateThb: string | null; rateJpy: string | null; rateKrw: string | null };
    let panel: RateFields | null = null;
    const fields = { rateUsd: true, rateEur: true, rateCny: true, rateThb: true, rateJpy: true, rateKrw: true } as const;
    const user = await getCurrentUser().catch(() => null);
    if (user?.panelId) panel = await prisma.childPanel.findUnique({ where: { id: user.panelId }, select: fields });
    else if (user) panel = await prisma.childPanel.findUnique({ where: { ownerId: user.id }, select: fields });
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
