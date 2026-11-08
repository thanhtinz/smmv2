import { getSettings, setSetting, DEFAULT_SETTINGS } from "@/lib/settings";

/** ================================================================
 *  TỈ GIÁ ĐA TIỀN TỆ (đặc tả đợt thanh toán 2026-11-08)
 *  Mỗi tiền tệ có BA giá trị lưu DB (Settings):
 *    fx_manual_<code> — tỉ giá tay admin nhập (USDT để trống = theo USD)
 *    fx_auto_<code>   — tỉ giá auto gần nhất kéo từ nguồn thị trường
 *    fx_lock_<code>   — "1" = khoá tay: auto KHÔNG bao giờ ghi đè
 *  Tỉ giá ĐANG DÙNG (effective) được đồng bộ vào đúng key cũ mà mọi nơi
 *  tiêu thụ đang đọc (usd_rate, rate_eur, …, usdt_rate):
 *    auto TOÀN CỤC bật + không khoá tay + có số auto -> dùng auto
 *    còn lại -> dùng tỉ giá tay.
 *  Nguồn auto (keyless, tỉ giá THAM CHIẾU THEO NGÀY — không phải giá
 *  theo phút): CHÍNH Frankfurter v2 (api.frankfurter.dev/v2/rates,
 *  gốc USD, có VND trực tiếp); Frankfurter lỗi -> DỰ PHÒNG
 *  open.er-api.com/v6/latest/USD. Đồng nào nguồn không trả thì giữ nguyên.
 *  BIÊN AN TOÀN (fx_safety_margin_percent, mặc định 1%): chỉ áp khi cộng
 *  tiền NẠP bằng tỉ giá auto (không khoá tay):
 *    VNĐ được cộng = số tiền × tỉ giá × (1 − margin/100).
 *  Tỉ giá tay / khoá tay dùng đúng số đã nhập, không trừ biên.
 *  ================================================================ */

export const FX_BASE_CODES = ["USD", "EUR", "CNY", "THB", "JPY", "KRW", "USDT"] as const;

export const RATE_KEY_BY_CODE: Record<string, string> = {
  USD: "usd_rate", EUR: "rate_eur", CNY: "rate_cny", THB: "rate_thb", JPY: "rate_jpy", KRW: "rate_krw", USDT: "usdt_rate",
};
export const effectiveKeyFor = (code: string) => RATE_KEY_BY_CODE[code] || `rate_${code.toLowerCase()}`;
const lower = (code: string) => code.toLowerCase();

/** Danh sách tiền tệ đang quản: bộ cơ sở + mọi mã admin đã thêm (fx_*_<code>). */
export function fxCodesFromSettings(s: Record<string, string>): string[] {
  const out: string[] = [...FX_BASE_CODES];
  for (const k of Object.keys(s)) {
    const m = /^fx_(manual|auto|lock)_([a-z]{3})$/.exec(k);
    if (m && !out.includes(m[2].toUpperCase())) out.push(m[2].toUpperCase());
  }
  return out;
}

const parseRate = (v: unknown): number => {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const roundRate = (code: string, v: number) => (code === "KRW" ? Math.round(v * 100) / 100 : Math.round(v));

/** Tỉ giá tay đang lưu (0 = chưa đặt; riêng USDT: 0 = theo USD). */
export function manualRateFor(s: Record<string, string>, code: string): number {
  const m = parseRate(s[`fx_manual_${lower(code)}`]);
  if (m > 0) return m;
  if (code === "USDT") {
    // usdt_rate là key HIỆU LỰC (bị sync ghi liên tục) — chỉ coi là tỉ giá tay
    // cũ khi nó KHÁC giá trị sync gần nhất (fx_usdt_synced), tức admin đã đặt
    // tay qua bề mặt cũ trước khi có fx_manual_usdt.
    const legacy = parseRate(s.usdt_rate);
    return legacy > 0 && s.fx_usdt_synced !== s.usdt_rate ? legacy : 0;
  }
  // Chưa từng lưu fx_manual (kho mới nâng cấp): lấy tỉ giá hiệu lực hiện tại làm tay.
  return parseRate(s[effectiveKeyFor(code)]) || parseRate(DEFAULT_SETTINGS[effectiveKeyFor(code)]);
}

/** Tỉ giá auto gần nhất (USDT bám theo USD). */
export function autoRateFor(s: Record<string, string>, code: string): number {
  if (code === "USDT") return parseRate(s.fx_auto_usdt) || parseRate(s.fx_auto_usd);
  return parseRate(s[`fx_auto_${lower(code)}`]);
}

export const isFxLocked = (s: Record<string, string>, code: string) => s[`fx_lock_${lower(code)}`] === "1";

/** Chế độ đang dùng của 1 tiền tệ: "auto" chỉ khi công tắc toàn cục bật,
 *  tiền tệ không khoá tay và đã có số auto. USDT không đặt tay thì theo USD. */
export function fxMode(s: Record<string, string>, code: string): "auto" | "manual" {
  if (code === "USDT" && manualRateFor(s, "USDT") === 0) return fxMode(s, "USD");
  return s.rates_auto_enabled === "1" && !isFxLocked(s, code) && autoRateFor(s, code) > 0 ? "auto" : "manual";
}

/** Tỉ giá đang dùng (chưa trừ biên) — nguồn của mọi nơi tiêu thụ qua key cũ. */
export function effectiveFxRate(s: Record<string, string>, code: string): number {
  if (fxMode(s, code) === "auto") return autoRateFor(s, code);
  if (code === "USDT") {
    const m = manualRateFor(s, "USDT");
    return m > 0 ? m : effectiveFxRate(s, "USD");
  }
  return manualRateFor(s, code);
}

/** % biên an toàn (mặc định 1 khi chưa cấu hình; 0 = không trừ). */
export function fxMarginPercent(s: Record<string, string>): number {
  const raw = String(s.fx_safety_margin_percent ?? "").trim();
  if (!raw) return 1;
  const n = parseFloat(raw.replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n <= 50 ? n : 0;
}

/** Tỉ giá CỘNG TIỀN NẠP hiệu lực cho 1 tiền tệ: tỉ giá đang dùng, trừ biên
 *  an toàn NẾU đang dùng tỉ giá auto. Khách luôn được hiển thị đúng số này. */
export function fxDepositRate(s: Record<string, string>, code: string): { rate: number; rawRate: number; marginPercent: number; marginApplied: boolean } {
  const rawRate = effectiveFxRate(s, code);
  const applied = fxMode(s, code) === "auto";
  const marginPercent = applied ? fxMarginPercent(s) : 0;
  return { rawRate, marginPercent, marginApplied: applied, rate: Math.round(rawRate * (1 - marginPercent / 100) * 100) / 100 };
}

/** Tỉ giá cộng tiền nạp USDT (theo USD khi chưa đặt tỉ giá USDT riêng). */
export function usdtDepositRate(s: Record<string, string>): { rate: number; rawRate: number; marginPercent: number; marginApplied: boolean } {
  if (manualRateFor(s, "USDT") === 0) return fxDepositRate(s, "USD");
  return fxDepositRate(s, "USDT");
}

/** Đồng bộ tỉ giá đang dùng vào key hiệu lực cũ cho 1 tiền tệ. */
export async function syncEffectiveRate(code: string, s?: Record<string, string>): Promise<number> {
  const st = s || (await getSettings());
  const v = effectiveFxRate(st, code);
  if (v > 0) {
    const str = String(roundRate(code, v));
    await setSetting(effectiveKeyFor(code), str);
    // Đánh dấu giá trị USDT do sync ghi — để manualRateFor không nhầm nó là tỉ giá tay.
    if (code === "USDT") await setSetting("fx_usdt_synced", str);
  }
  return v;
}
export async function syncAllEffectiveRates(s?: Record<string, string>): Promise<void> {
  const st = s || (await getSettings());
  for (const code of fxCodesFromSettings(st)) await syncEffectiveRate(code, st);
}

/** Lưu form tỉ giá đầy đủ (trang Cấu hình nạp tiền): tỉ giá tay + khoá tay
 *  từng tiền tệ + biên an toàn + công tắc auto + thêm tiền tệ mới. */
export async function saveFxSettingsForm(formData: FormData): Promise<void> {
  const codes = String(formData.get("fx_codes") || "")
    .split(",").map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z]{3}$/.test(x));
  for (const code of codes) {
    const raw = formData.get(`fx_manual_${code}`);
    if (raw !== null) {
      const v = parseRate(raw);
      if (v > 0) await setSetting(`fx_manual_${lower(code)}`, String(v));
      else if (code === "USDT") await setSetting("fx_manual_usdt", ""); // trống = theo USD
    }
    await setSetting(`fx_lock_${lower(code)}`, formData.get(`fx_lock_${code}`) === "1" ? "1" : "0");
  }
  const newCode = String(formData.get("fx_new_code") || "").trim().toUpperCase();
  const newRate = parseRate(formData.get("fx_new_rate"));
  if (/^[A-Z]{3}$/.test(newCode) && newRate > 0) {
    await setSetting(`fx_manual_${lower(newCode)}`, String(newRate));
    await setSetting(`fx_lock_${lower(newCode)}`, formData.get("fx_new_lock") === "1" ? "1" : "0");
  }
  if (formData.get("fx_safety_margin_percent") !== null) {
    const m = parseFloat(String(formData.get("fx_safety_margin_percent") || "").replace(",", "."));
    if (Number.isFinite(m) && m >= 0 && m <= 50) await setSetting("fx_safety_margin_percent", String(m));
  }
  if (formData.get("rates_form_full") === "1") {
    await setSetting("rates_auto_enabled", formData.get("rates_auto_enabled") === "on" || formData.get("rates_auto_enabled") === "1" ? "1" : "0");
  }
  await syncAllEffectiveRates();
}

/* ---------------- Nguồn thị trường: Frankfurter (chính) -> er-api (dự phòng) ---------------- */

export const FRANKFURTER_BASE = "https://api.frankfurter.dev/v2/rates";
export const ER_API_URL = "https://open.er-api.com/v6/latest/USD";
export const MARKET_RATE_SOURCE_PRIMARY = "Frankfurter v2 (api.frankfurter.dev, gốc USD)";
export const MARKET_RATE_SOURCE_FALLBACK = "open.er-api.com (ExchangeRate-API, gốc USD — nguồn dự phòng)";

export type MarketRates = { rates: Record<string, number>; source: string; sourceKind: "primary" | "fallback" };

const vndPerUnit = (ratesPerUsd: Record<string, number>, codes: string[]): Record<string, number> => {
  const vnd = Number(ratesPerUsd.VND);
  if (!(vnd > 0)) throw new Error("Nguồn tỉ giá không có VND");
  const out: Record<string, number> = {};
  for (const code of codes) {
    const perUsd = code === "USD" ? 1 : Number(ratesPerUsd[code]);
    if (perUsd > 0 && Number.isFinite(perUsd)) out[code] = vnd / perUsd;
  }
  if (!out.USD) throw new Error("Nguồn tỉ giá không suy được USD/VND");
  return out;
};

/** Kéo tỉ giá thị trường: thử Frankfurter trước, lỗi thì dùng er-api.
 *  primaryUrl/fallbackUrl chỉ để kiểm chứng (mock / nguồn chết). */
export async function fetchMarketRates(opts: { codes?: string[]; primaryUrl?: string; fallbackUrl?: string } = {}): Promise<MarketRates> {
  const codes = (opts.codes && opts.codes.length ? opts.codes : [...FX_BASE_CODES]).filter((c) => c !== "USDT");
  const quotes = Array.from(new Set(["VND", ...codes])).join(",");
  const primaryUrl = opts.primaryUrl || `${FRANKFURTER_BASE}?base=USD&quotes=${quotes}`;
  try {
    const r = await fetch(primaryUrl, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`Frankfurter HTTP ${r.status}`);
    const j: any = await r.json().catch(() => null);
    if (!Array.isArray(j)) throw new Error("Frankfurter trả dữ liệu không hợp lệ");
    const perUsd: Record<string, number> = {};
    for (const row of j) if (row && typeof row.quote === "string") perUsd[row.quote] = Number(row.rate);
    return { rates: vndPerUnit(perUsd, codes), source: MARKET_RATE_SOURCE_PRIMARY, sourceKind: "primary" };
  } catch (primaryErr) {
    try {
      const r = await fetch(opts.fallbackUrl || ER_API_URL, { headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error(`er-api HTTP ${r.status}`);
      const j: any = await r.json().catch(() => null);
      if (!j || j.result !== "success" || !j.rates) throw new Error("er-api trả dữ liệu không hợp lệ");
      return { rates: vndPerUnit(j.rates, codes), source: MARKET_RATE_SOURCE_FALLBACK, sourceKind: "fallback" };
    } catch (fallbackErr: any) {
      throw new Error(`Cả hai nguồn tỉ giá đều lỗi — chính: ${String((primaryErr as any)?.message || primaryErr)}; dự phòng: ${String(fallbackErr?.message || fallbackErr)}`);
    }
  }
}

/** Kéo tỉ giá auto về DB: ghi fx_auto_* cho các đồng nguồn có (khoá tay vẫn
 *  ghi số auto để admin đối chiếu, nhưng tỉ giá đang dùng KHÔNG đổi), rồi
 *  đồng bộ tỉ giá đang dùng. Không ép (force=false) thì bỏ qua nếu công tắc
 *  auto đang tắt hoặc lần cập nhật trước chưa đầy 1 giờ. */
export async function applyMarketRates(opts: { force?: boolean; primaryUrl?: string; fallbackUrl?: string } = {}): Promise<{ updated: string[]; source?: string; sourceKind?: string; skipped?: string }> {
  const s = await getSettings();
  if (!opts.force) {
    if (s.rates_auto_enabled !== "1") return { updated: [], skipped: "Tự động cập nhật đang tắt" };
    const last = s.rates_auto_updated_at ? Date.parse(s.rates_auto_updated_at) : 0;
    if (last && Date.now() - last < 55 * 60 * 1000) return { updated: [], skipped: "Vừa cập nhật cách đây chưa đầy 1 giờ" };
  }
  const codes = fxCodesFromSettings(s);
  // Chụp tỉ giá tay cho các đồng chưa từng có fx_manual (giữ đúng số đang dùng
  // làm mốc tay trước khi auto xuất hiện lần đầu). USDT bỏ qua: tỉ giá tay của
  // nó chỉ đến từ form/admin — suy từ manualRateFor, không suy từ key hiệu lực.
  for (const code of codes) {
    if (code === "USDT") continue;
    if (!s[`fx_manual_${lower(code)}`] && parseRate(s[effectiveKeyFor(code)]) > 0) {
      await setSetting(`fx_manual_${lower(code)}`, String(parseRate(s[effectiveKeyFor(code)])));
    }
  }
  let fetched: MarketRates;
  try {
    fetched = await fetchMarketRates({ codes, primaryUrl: opts.primaryUrl, fallbackUrl: opts.fallbackUrl });
  } catch (e: any) {
    await setSetting("rates_auto_error", String(e?.message || e).slice(0, 250));
    throw e;
  }
  const now = new Date().toISOString();
  const updated: string[] = [];
  for (const [code, v] of Object.entries(fetched.rates)) {
    await setSetting(`fx_auto_${lower(code)}`, String(roundRate(code, v)));
    await setSetting(`fx_auto_at_${lower(code)}`, now);
    updated.push(code);
  }
  if (fetched.rates.USD) {
    await setSetting("fx_auto_usdt", String(Math.round(fetched.rates.USD)));
    await setSetting("fx_auto_at_usdt", now);
    updated.push("USDT");
  }
  await setSetting("rates_auto_source", fetched.source);
  await setSetting("rates_auto_updated_at", now);
  await setSetting("rates_auto_error", "");
  await syncAllEffectiveRates();
  return { updated, source: fetched.source, sourceKind: fetched.sourceKind };
}
