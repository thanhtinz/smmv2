import { getSettings, setSetting } from "@/lib/settings";

/** Tỉ giá thị trường tự động (lệnh Tín 2026-11-08): nguồn keyless
 *  open.er-api.com (ExchangeRate-API, gốc USD — 1 USD = rates[X] đơn vị X,
 *  có VND trực tiếp). Tỉ giá lưu vào ĐÚNG các Setting mà mọi nơi tiêu thụ
 *  đang đọc (usd_rate, rate_eur, …, usdt_rate) nên bật/tắt không đổi hành
 *  vi quy đổi, chỉ đổi nguồn số. Đồng nào nguồn không trả thì GIỮ NGUYÊN. */
export const MARKET_RATE_SOURCE = "open.er-api.com (ExchangeRate-API, gốc USD)";
export const MARKET_RATE_URL = "https://open.er-api.com/v6/latest/USD";

export const RATE_KEY_BY_CODE: Record<string, string> = {
  USD: "usd_rate", EUR: "rate_eur", CNY: "rate_cny", THB: "rate_thb", JPY: "rate_jpy", KRW: "rate_krw",
};

/** Lấy tỉ giá thị trường: trả map mã tiền → VNĐ cho 1 đơn vị. */
export async function fetchMarketRates(url: string = MARKET_RATE_URL): Promise<Record<string, number>> {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`Nguồn tỉ giá HTTP ${r.status}`);
  const j: any = await r.json().catch(() => null);
  if (!j || j.result !== "success" || !(Number(j?.rates?.VND) > 0)) throw new Error("Nguồn tỉ giá trả dữ liệu không hợp lệ");
  const vndPerUsd = Number(j.rates.VND);
  const out: Record<string, number> = {};
  for (const code of Object.keys(RATE_KEY_BY_CODE)) {
    const perUsd = code === "USD" ? 1 : Number(j.rates[code]);
    if (perUsd > 0 && isFinite(perUsd)) out[code] = vndPerUsd / perUsd;
  }
  return out;
}

const roundRate = (code: string, v: number) => (code === "KRW" ? Math.round(v * 100) / 100 : Math.round(v));

/** Ghi tỉ giá thị trường vào Settings. Không ép (force=false) thì tự bỏ qua
 *  nếu lần cập nhật trước chưa đầy 1 giờ — cron gọi thường xuyên vẫn nhẹ. */
export async function applyMarketRates(opts: { force?: boolean } = {}): Promise<{ updated: string[]; skipped?: string }> {
  const s = await getSettings();
  const last = s.rates_auto_updated_at ? Date.parse(s.rates_auto_updated_at) : 0;
  if (!opts.force && last && Date.now() - last < 55 * 60 * 1000) {
    return { updated: [], skipped: "Vừa cập nhật cách đây chưa đầy 1 giờ" };
  }
  const rates = await fetchMarketRates();
  const updated: string[] = [];
  for (const [code, v] of Object.entries(rates)) {
    await setSetting(RATE_KEY_BY_CODE[code], String(roundRate(code, v)));
    updated.push(code);
  }
  // USDT bám sát USD trên thị trường — khi tự động cập nhật, usdt_rate theo USD.
  if (rates.USD) {
    await setSetting("usdt_rate", String(Math.round(rates.USD)));
    updated.push("USDT");
  }
  await setSetting("rates_auto_source", MARKET_RATE_SOURCE);
  await setSetting("rates_auto_updated_at", new Date().toISOString());
  return { updated };
}
