import { NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";

/** Cấu hình hiển thị công khai cho phía khách: tỉ giá quy đổi hiển thị (VND vẫn là tiền thật). */
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
  return NextResponse.json({ rates }, { headers: { "Cache-Control": "public, max-age=300" } });
}
