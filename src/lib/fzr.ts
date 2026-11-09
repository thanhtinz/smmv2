import { decryptSecret } from "./secret-box";
import type { Provider } from "@prisma/client";

/**
 * Client FazerCards (api.fzr.cards) — API v2 theo tài liệu công khai
 * https://api.fzr.cards/public/docs (OpenAPI 3.0.3, đọc 2026-11-07):
 *   - Mọi call xác thực bằng header X-API-Key: fc_… (hoặc Authorization: Bearer).
 *   - Số tiền là CHUỖI JSON (số dư 4 số lẻ, giá sao Telegram 7 số lẻ) — parse bằng
 *     số nguyên scaled (BigInt), không dùng float để tránh trôi giá.
 *   - Envelope: thành công {ok:true, …}; lỗi {ok:false, error, code} kèm HTTP
 *     400/401/402 (hết số dư)/403 (thiếu gói/addon)/404/409/422/429/503.
 *   - Tạo đơn KHÔNG có endpoint chung — mỗi nhóm sản phẩm một endpoint riêng.
 *     Idempotency-Key: tài liệu reseller nói MỌI endpoint tạo đơn đều nhận
 *     (OpenAPI liệt kê tường minh ở 6/8 endpoint, trừ 2 endpoint Telegram).
 *     Từ 2026-11-08 (lệnh chủ) gửi khoá cho cả Telegram — nhưng Telegram
 *     TUYỆT ĐỐI không retry tự động (xem cờ noRetry trong call()).
 *   - Đơn trả về KHÔNG có schema trường cố định: giữ nguyên JSON thô, trích nội
 *     dung giao hàng phòng thủ (extractFzrDelivery ở dưới).
 */

export class FzrError extends Error {
  httpStatus: number;
  code?: string;
  /** definitive = lỗi dứt khoát phía provider (đầu vào sai / hết số dư / thiếu addon):
   *  đơn CHẮC CHẮN không được tạo -> an toàn để huỷ + hoàn tiền cho khách.
   *  Ngược lại (timeout, 5xx, JSON hỏng) là mơ hồ: provider có thể đã nhận đơn. */
  definitive: boolean;
  constructor(message: string, httpStatus: number, code?: string) {
    super(message);
    this.httpStatus = httpStatus;
    this.code = code;
    // 403 gồm SUBSCRIPTION_REQUIRED / PLAN_RESTRICTED (docs reseller) — dứt khoát.
    // 409: chỉ INSUFFICIENT_STOCK / INSUFFICIENT_BALANCE là dứt khoát; DUPLICATED_ORDER
    // nghĩa là provider ĐÃ có đơn (idempotency) — mơ hồ, giữ PENDING chờ đối soát.
    this.definitive =
      [400, 401, 402, 403, 404, 422].includes(httpStatus) ||
      (httpStatus === 409 && ["INSUFFICIENT_STOCK", "INSUFFICIENT_BALANCE"].includes(String(code || "")));
  }
}

/** Nhãn trường tuỳ chỉnh (customFields) mà đồng bộ catalog FZR gắn cho sản phẩm —
 *  luồng thực thi đơn đọc lại đúng các nhãn này từ thông tin khách đã điền. */
export const FZR_LABELS = {
  telegramId: "Telegram user ID",
  steamLogin: "Steam login",
  playerId: "Tài khoản / ID người chơi",
  giftReceiver: "Tài khoản Steam nhận gift",
  extraInfo: "Thông tin bổ sung",
} as const;

const SCALE = BigInt(10_000_000); // 7 số lẻ — đủ cho giá sao Telegram (7dp)

/** Parse chuỗi số thập phân ("12.3400") thành số nguyên scaled ×10^7 (BigInt, không float). */
export function parseDecimalScaled(v: unknown): bigint {
  if (typeof v === "number") v = String(v);
  if (typeof v !== "string") return BigInt(0);
  const s = v.trim().replace(",", ".");
  const m = s.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!m) return BigInt(0);
  const neg = m[1] === "-";
  const intPart = BigInt(m[2]);
  const frac = (m[3] || "").slice(0, 7).padEnd(7, "0");
  const out = intPart * SCALE + BigInt(frac || "0");
  return neg ? -out : out;
}

/** Chuỗi thập phân -> số thực (chỉ dùng hiển thị/ghi log, không dùng tính giá bán). */
export function decimalToNumber(v: unknown): number {
  return Number(parseDecimalScaled(v)) / 1e7;
}

/**
 * Giá bán VND từ giá gốc USD của FZR: ceil(usd × exchangeRate × (1 + markup%)).
 * Tính hoàn toàn bằng BigInt: usd scaled ×10^7, mẫu số 10^7 × 100.
 */
export function fzrUsdToVnd(usd: unknown, exchangeRate: number, markupPercent: number): number {
  const scaled = parseDecimalScaled(usd);
  if (scaled <= BigInt(0)) return 0;
  const num = scaled * BigInt(Math.max(1, exchangeRate)) * BigInt(100 + Math.max(0, markupPercent));
  const den = SCALE * BigInt(100);
  return Number((num + den - BigInt(1)) / den); // ceil
}

/** Giá VỐN VND (chưa markup) — lưu vào variant.cost để tính lãi. */
export function fzrUsdCostVnd(usd: unknown, exchangeRate: number): number {
  return fzrUsdToVnd(usd, exchangeRate, 0);
}

function baseUrl(provider: Provider): string {
  return provider.apiUrl.replace(/\/+$/, "");
}

async function call<T = any>(
  provider: Provider,
  method: "GET" | "POST",
  path: string,
  opts: { body?: Record<string, unknown>; query?: Record<string, string | number | undefined>; idempotencyKey?: string; timeoutMs?: number; noRetry?: boolean } = {}
): Promise<T> {
  const url = new URL(baseUrl(provider) + path);
  for (const [k, v] of Object.entries(opts.query || {})) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }
  // 429 RATE_LIMITED: backoff theo Retry-After + jitter ±15% (đúng công thức
  // cookbook FZR: chờ ÍT NHẤT Retry-After, cộng jitter; tối đa 3 lần) — CHỈ
  // retry khi an toàn: GET, hoặc POST có Idempotency-Key. Telegram buy nay
  // CÓ gửi khoá nhưng kèm noRetry=true nên vẫn không bao giờ bị gọi lại.
  const retryable = method === "GET" || (!!opts.idempotencyKey && !opts.noRetry);
  let res: Response | null = null;
  for (let attempt = 0; attempt <= 3; attempt++) {
    try {
      res = await fetch(url.toString(), {
        method,
        headers: {
          "X-API-Key": decryptSecret(provider.apiKey),
          "Content-Type": "application/json",
          ...(opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {}),
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(opts.timeoutMs ?? 30000),
      });
    } catch (e: any) {
      // Timeout / lỗi mạng: MƠ HỒ — provider có thể đã nhận đơn, tuyệt đối không coi là dứt khoát
      throw new FzrError(`FZR lỗi mạng/timeout: ${String(e?.message || e)}`, 0);
    }
    if (res.status === 429 && retryable && attempt < 3) {
      const ra = Number(res.headers.get("retry-after"));
      const base = Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 30000) : [1000, 2000, 4000][attempt];
      const waitMs = Math.round(base * (1 + (Math.random() * 0.3 - 0.15))); // jitter ±15%
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    break;
  }
  if (!res) throw new FzrError("FZR không phản hồi", 0);
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new FzrError(`FZR trả dữ liệu không hợp lệ (HTTP ${res.status})`, res.status >= 500 ? 503 : res.status);
  }
  if (!res.ok || json?.ok === false) {
    const base = String(json?.error || json?.message || `FZR HTTP ${res.status}`);
    // Tài liệu: response 403 có thể mang blockReason (gói/tính năng bị khoá,
    // IP bị chặn...) — nối vào message để ghi chú admin đọc được lý do thật.
    const withBlock = json?.blockReason ? `${base} [blockReason: ${String(json.blockReason)}]` : base;
    throw new FzrError(withBlock, res.status, json?.code ? String(json.code) : undefined);
  }
  return json as T;
}

/* ---------------- Tài khoản ---------------- */

export async function fzrBalance(provider: Provider): Promise<{ balance: string; currency: string }> {
  const r = await call<any>(provider, "GET", "/api/v2/balance");
  return { balance: String(r?.balance ?? "0"), currency: String(r?.currency || "USD") };
}

export async function fzrMe(provider: Provider): Promise<any> {
  return call<any>(provider, "GET", "/api/v2/me");
}

export async function fzrGetOrder(provider: Provider, orderId: string): Promise<any> {
  const r = await call<any>(provider, "GET", `/api/v2/orders/${encodeURIComponent(orderId)}`);
  return r?.order ?? r;
}

/** Lịch sử biến động số dư tài khoản reseller (GET /transactions, phân trang
 *  page/limit): items[] { id, type, status, amount, balanceBefore,
 *  balanceAfter, note, createdAt } — hiện ở trang Nhà cung cấp (FZR). */
export async function fzrTransactions(provider: Provider, limit = 8): Promise<any[]> {
  const r = await call<any>(provider, "GET", "/api/v2/transactions", { query: { page: 1, limit } });
  return Array.isArray(r?.items) ? r.items : Array.isArray(r?.transactions) ? r.transactions : [];
}

/** Trạng thái webhook phía tài khoản FZR (GET /account/webhook): { url,
 *  secret, enabled, consecutive_failures, last_success_at, last_failure_at,
 *  last_failure_reason, ... } — chỉ ĐỌC để hiện sức khoẻ webhook ở admin;
 *  URL/secret vẫn do chủ site đặt trong panel FZR + form nhà cung cấp. */
export async function fzrWebhookConfig(provider: Provider): Promise<any> {
  return call<any>(provider, "GET", "/api/v2/account/webhook");
}

/** Bắn 1 sự kiện webhook.test thử nghiệm (POST /account/webhook/test) — dùng
 *  nút kiểm tra ở trang Nhà cung cấp; FZR gửi thử tới URL đã đăng ký, không
 *  retry. Trả raw để nơi gọi hiển thị kết quả. */
export async function fzrWebhookTest(provider: Provider): Promise<any> {
  return call<any>(provider, "POST", "/api/v2/account/webhook/test", { body: {} });
}

/* ---------------- Catalog ---------------- */

/** Game Keys — theo OpenAPI FZR (api.fzr.cards/public/docs/openapi.json):
 *  GET /gamekeys phân trang CURSOR (limit + cursor), trả { items[], meta{
 *  total, limit, next_cursor, has_more } }; mỗi item: { name, game_id, region,
 *  platform, region_restriction, appid, imageurl } — KHÔNG có giá ở tầng game:
 *  giá + tồn kho nằm ở từng edition qua GET /gamekeys/keys?game_id=. */
export async function fzrGameKeys(provider: Provider, cursor?: string): Promise<any> {
  return call<any>(provider, "GET", "/api/v2/gamekeys", { query: { limit: 100, include_ui: 1, ...(cursor ? { cursor } : {}) } });
}

/** Editions (keys) của 1 game: { game_id, GameName, region, platform,
 *  region_restriction, appid, imageurl, keys: [{ key_id, name, price_usd,
 *  stock, min_order_quantity, max_order_quantity }] }. */
export async function fzrGameKeyKeys(provider: Provider, gameId: string): Promise<any> {
  return call<any>(provider, "GET", "/api/v2/gamekeys/keys", { query: { game_id: gameId, include_ui: 1 } });
}

/** Gift Cards — theo OpenAPI FZR (đọc lại 2026-11-08 khi làm khu Gift Card):
 *  GET /giftcards phân trang CURSOR (limit + cursor, include_ui=1 để có ảnh
 *  bìa), items[] phẳng: { category_id, name, note?, imageurl? } — tầng
 *  CATEGORY không có giá; mệnh giá nằm ở offers qua GET /giftcards/cards. */
/** Chi tiết giới hạn quốc gia của 1 game (GET /gamekeys/region-restriction?
 *  game_id=): { region_type, has_availability, available: [{code, name}],
 *  unavailable: [{code, name}] } — đồng bộ chỉ gọi cho game có
 *  region_restriction = true và lưu vào product.providerRegionInfo. */
export async function fzrGameKeyRegionRestriction(provider: Provider, gameId: string): Promise<{ regionType: string | null; available: { code: string; name: string }[]; unavailable: { code: string; name: string }[] } | null> {
  const r = await call<any>(provider, "GET", "/api/v2/gamekeys/region-restriction", { query: { game_id: gameId } });
  if (!r || typeof r !== "object") return null;
  const list = (v: any) => (Array.isArray(v) ? v.map((c: any) => ({ code: String(c?.code || ""), name: String(c?.name || c?.code || "") })).filter((c: any) => c.code) : []);
  return { regionType: r?.region_type ? String(r.region_type) : null, available: list(r?.available), unavailable: list(r?.unavailable) };
}

export async function fzrGiftCards(provider: Provider, cursor?: string): Promise<any> {
  return call<any>(provider, "GET", "/api/v2/giftcards", { query: { limit: 100, include_ui: 1, ...(cursor ? { cursor } : {}) } });
}

/** Offers (mệnh giá) của 1 category gift card: { category_id, name, note?,
 *  imageurl?, offers: [{ card_id (có thể null), name, price_usd, stock,
 *  min_order_quantity, max_order_quantity }] }. */
export async function fzrGiftCardCards(provider: Provider, categoryId: string): Promise<any> {
  return call<any>(provider, "GET", "/api/v2/giftcards/cards", { query: { category_id: categoryId, include_ui: 1 } });
}

/** Trường tuỳ chỉnh PHÍA NHÀ CUNG CẤP sau chuẩn hoá — dùng chung cho cả hai
 *  nhóm FZR có định nghĩa trường người mua: topups (fields[] với key) và
 *  manual-services replenishment (fields[] với code). key = khoá ánh xạ khoá
 *  cứng khi gửi đơn; label = nhãn phía NCC (admin được đổi khi lưu vào sản
 *  phẩm); required: body đặt đơn của cả hai nhóm đều yêu cầu object fields
 *  theo đúng các khoá này nên mặc định bắt buộc. */
export type FzrProviderField = { key: string; label: string; type: "text" | "select"; required: boolean; options?: string[] };

function providerFieldOptions(raw: any): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = raw
    .map((o: any) => {
      if (typeof o === "string") return o;
      if (o && typeof o === "object") {
        const v = o.value ?? o.label ?? o.name ?? o.id;
        return v === undefined || v === null ? "" : String(v);
      }
      return "";
    })
    .filter(Boolean)
    .slice(0, 12);
  return out.length ? out : undefined;
}

/** fields[] của topups (GET /topups/offers): { key, label, type: text|select, options[] }. */
export function normalizeTopupFields(raw: any): FzrProviderField[] {
  if (!Array.isArray(raw)) return [];
  const out: FzrProviderField[] = [];
  for (const f of raw) {
    const key = String(f?.key || "").trim();
    if (!key) continue;
    const type = f?.type === "select" ? ("select" as const) : ("text" as const);
    out.push({
      key,
      label: String(f?.label || key).slice(0, 80),
      type,
      required: true,
      ...(type === "select" ? { options: providerFieldOptions(f?.options) } : {}),
    });
  }
  return out.slice(0, 8);
}

/** fields[] của manual-services (GET /manual-services/:id/offers — CHỈ có khi
 *  category.kind = "replenishment"): theo OpenAPI mỗi field chỉ có { code,
 *  name } — code là khoá, name là nhãn; không có type/options nên mọi trường
 *  là ô nhập 1 dòng, và body đặt đơn ghi rõ "required field codes only". */
export function normalizeManualFields(raw: any): FzrProviderField[] {
  if (!Array.isArray(raw)) return [];
  const out: FzrProviderField[] = [];
  for (const f of raw) {
    const key = String(f?.code || "").trim();
    if (!key) continue;
    out.push({ key, label: String(f?.name || key).slice(0, 80), type: "text" as const, required: true });
  }
  return out.slice(0, 8);
}

/** Top-Ups — theo OpenAPI FZR (đọc lại 2026-11-08): GET /topups phân trang
 *  CURSOR (limit + cursor, include_ui=1 để có ảnh bìa), items[] phẳng:
 *  { category_id (= topup_id), name, note?, imageurl? } — tầng category
 *  KHÔNG có fields và KHÔNG có giá; offers + fields nằm ở GET /topups/offers. */
export async function fzrTopups(provider: Provider, cursor?: string): Promise<any> {
  return call<any>(provider, "GET", "/api/v2/topups", { query: { limit: 100, include_ui: 1, ...(cursor ? { cursor } : {}) } });
}

/** Offers + fields của 1 category top-up: { category_id, name, note?,
 *  imageurl?, offers: [{ offer_id (có thể null), name, price_usd }],
 *  fields: [{ key, label, type, options? }] } — fields là của CATEGORY. */
export async function fzrTopupOffers(provider: Provider, categoryId: string): Promise<any> {
  return call<any>(provider, "GET", "/api/v2/topups/offers", { query: { category_id: categoryId, include_ui: 1 } });
}

/** Các category top-up HỖ TRỢ kiểm tra ID người chơi (GET /topups/validate-id):
 *  { items: [{ category_id, name, fields[] }] } — danh sách động phía NCC. */
export async function fzrTopupValidations(provider: Provider): Promise<any> {
  return call<any>(provider, "GET", "/api/v2/topups/validate-id");
}

export async function fzrManualServices(provider: Provider): Promise<any> {
  return call<any>(provider, "GET", "/api/v2/manual-services", { query: { include_ui: 1 } });
}

export async function fzrManualOffers(provider: Provider, manualServiceId: string): Promise<any> {
  return call<any>(provider, "GET", `/api/v2/manual-services/${encodeURIComponent(manualServiceId)}/offers`);
}

export async function fzrTelegramStarsQuote(provider: Provider): Promise<{ pricePerStar: string; price?: string; minAmount?: number; maxAmount?: number; currency: string; balanceEnough?: boolean }> {
  const r = await call<any>(provider, "GET", "/api/v2/telegram/stars");
  // Theo OpenAPI (đọc lại 2026-11-09): { price_per_star (7dp), min_amount,
  // max_amount, rates_updated_at } — snake_case. Đọc snake_case TRƯỚC; các
  // tên camelCase cũ chỉ là fallback phòng thủ. LƯU Ý: tài liệu KHÔNG có
  // trường balanceEnough — đọc phòng thủ nếu NCC trả thêm, không coi là
  // hành vi đã tài liệu hoá.
  const be = (r as any)?.balanceEnough ?? (r as any)?.balance_enough;
  return {
    pricePerStar: String(r?.price_per_star ?? r?.pricePerStar ?? r?.price ?? "0"),
    price: r?.price,
    minAmount: r?.min_amount ?? r?.minAmount,
    maxAmount: r?.max_amount ?? r?.maxAmount,
    currency: String(r?.currency || "USD"),
    balanceEnough: typeof be === "boolean" ? be : undefined,
  };
}

export async function fzrTelegramPremiumPlans(provider: Provider): Promise<{ durationMonths: number; price: string; finalPrice?: string }[]> {
  const r = await call<any>(provider, "GET", "/api/v2/telegram/premium");
  const plans = Array.isArray(r?.plans) ? r.plans : [];
  // Theo OpenAPI (đọc lại 2026-11-09): plans[] = { months, price_usd } +
  // rates_updated_at ở top-level. durationMonths/finalPrice cũ là fallback.
  return plans.map((p: any) => {
    const price = String(p?.price_usd ?? p?.finalPrice ?? p?.price ?? "0");
    return { durationMonths: Number(p?.months ?? p?.durationMonths), price, finalPrice: price };
  });
}

export async function fzrSteamRates(provider: Provider): Promise<any> {
  return call<any>(provider, "GET", "/api/v2/steam-topup/rates");
}

/** Danh sách game Steam gift — RATE LIMIT 1 request / 3 phút / API key (tài
 *  liệu OpenAPI): CHỈ gọi khi admin bấm đồng bộ tay. Endpoint CHỈ có tham số
 *  `limit` (không page/search); item chỉ { name, appid }; meta có
 *  { total, returned, truncated }; catalog làm mới mỗi 3 giờ phía NCC. */
export async function fzrSteamGiftGames(provider: Provider, limit?: number): Promise<any> {
  return call<any>(provider, "GET", "/api/v2/steam-gifts/games", { query: limit ? { limit } : {} });
}

export type FzrSteamGiftOffer = { subId: string; name: string; regions: { region: string; price: string }[] };

/** Offers của 1 game Steam gift (GET /steam-gifts/games/{appid}): theo
 *  OpenAPI offers[] = { sub_id, name, regions: [{ region, price }] } — giá
 *  nằm THEO REGION trong từng offer, không có giá phẳng ở offer. Báo giá
 *  của NCC được cache tối đa 24h phía NCC cho mỗi game. */
export async function fzrSteamGiftOffers(provider: Provider, appid: string | number): Promise<FzrSteamGiftOffer[]> {
  const r = await call<any>(provider, "GET", `/api/v2/steam-gifts/games/${encodeURIComponent(String(appid))}`);
  const offers = Array.isArray(r?.offers) ? r.offers : [];
  return offers.map((o: any) => ({
    subId: String(o?.sub_id ?? o?.subId ?? ""),
    name: String(o?.name || ""),
    regions: (Array.isArray(o?.regions) ? o.regions : [])
      .filter((g: any) => g?.region && g?.price !== undefined && g?.price !== null)
      .map((g: any) => ({ region: String(g.region), price: String(g.price) })),
  })).filter((o: FzrSteamGiftOffer) => o.regions.length > 0);
}

/** Offer rẻ nhất (theo từng cặp sub_id × region) — dùng cho báo giá lúc mua
 *  và chọn đúng sub_id/region khi đặt đơn theo tài liệu. */
export function cheapestSteamGiftOffer(offers: FzrSteamGiftOffer[]): { subId: string; name: string; region: string; price: string } | null {
  let best: { subId: string; name: string; region: string; price: string } | null = null;
  for (const o of offers) {
    for (const g of o.regions) {
      if (!best || parseDecimalScaled(g.price) < parseDecimalScaled(best.price)) {
        best = { subId: o.subId, name: o.name, region: g.region, price: g.price };
      }
    }
  }
  return best;
}

/* ---------------- Tạo đơn (idemKey = mã/id đơn của mình) ----------------
 * Theo tài liệu: Idempotency-Key được chấp nhận ở gamekeys, giftcards,
 * topups, manual-services, steam-gifts, steam-topup (khoá theo tài khoản,
 * giữ 7 ngày; dùng lại khoá cho LOẠI đơn khác -> 409). Hai endpoint mua
 * Telegram KHÔNG nằm trong danh sách đó — web vẫn gửi kèm khoá theo lệnh
 * chủ site 2026-11-08 nhưng luôn kèm noRetry nên không bao giờ gọi lại. */

/** Đặt đơn Game Key — body theo OpenAPI: { game_id, key_id, quantity } (cả 3
 *  bắt buộc). key_id là id của EDITION đã chọn (variant.providerItemId). */
export async function fzrCreateGameKeyOrder(provider: Provider, gameId: string, keyId: string, quantity: number, idemKey: string): Promise<any> {
  const r = await call<any>(provider, "POST", "/api/v2/gamekeys/order", { body: { game_id: gameId, key_id: keyId, quantity }, idempotencyKey: idemKey });
  return r?.order ?? r;
}

/** Đặt đơn Gift Card — body theo OpenAPI: { category_id, card_id, quantity }
 *  (cả 3 bắt buộc). card_id là id của OFFER/mệnh giá đã chọn
 *  (variant.providerItemId), category_id = providerProductId của sản phẩm. */
export async function fzrCreateGiftCardOrder(provider: Provider, categoryId: string, cardId: string, quantity: number, idemKey: string): Promise<any> {
  const r = await call<any>(provider, "POST", "/api/v2/giftcards/order", { body: { category_id: categoryId, card_id: cardId, quantity }, idempotencyKey: idemKey });
  return r?.order ?? r;
}

/** Kiểm tra ID người chơi — body theo OpenAPI: { category_id, fields } với
 *  fields là object theo ĐÚNG khoá fields[].key của category. Trả { valid,
 *  player_name, player_id, region }. HTTP 422 = không xác nhận được ID (lỗi
 *  dứt khoát trong thang FzrError). */
export async function fzrValidateTopupId(
  provider: Provider,
  categoryId: string,
  fields: Record<string, string>
): Promise<{ valid: boolean; playerName?: string; playerId?: string; region?: string }> {
  const r = await call<any>(provider, "POST", "/api/v2/topups/validate-id", { body: { category_id: categoryId, fields } });
  return {
    valid: !!r?.valid,
    ...(r?.player_name ? { playerName: String(r.player_name) } : {}),
    ...(r?.player_id ? { playerId: String(r.player_id) } : {}),
    ...(r?.region ? { region: String(r.region) } : {}),
  };
}

/** Đặt đơn top-up — body theo OpenAPI: { category_id, offer_id, fields } (cả
 *  ba bắt buộc; fields là object theo khoá của category, có thể rỗng khi
 *  category không định nghĩa trường). KHÔNG còn amount/quantity/orderParams. */
export async function fzrCreateTopupOrder(
  provider: Provider,
  input: { categoryId: string; offerId: string; fields: Record<string, string> },
  idemKey: string
): Promise<any> {
  const r = await call<any>(provider, "POST", "/api/v2/topups/order", {
    body: { category_id: input.categoryId, offer_id: input.offerId, fields: input.fields },
    idempotencyKey: idemKey,
  });
  return r?.order ?? r;
}

/** Đặt đơn manual — body theo OpenAPI: { manual_service_id, product_id,
 *  fields? } — fields CHỈ gửi cho category replenishment có trường (object
 *  theo field code); KHÔNG có quantity/additionalData trong tài liệu.
 *  Response PHẲNG ở top-level: { order_id, kind, status: "created", ... }. */
export async function fzrCreateManualOrder(
  provider: Provider,
  input: { manualServiceId: string; productId: string; fields?: Record<string, string> },
  idemKey: string
): Promise<any> {
  const r = await call<any>(provider, "POST", "/api/v2/manual-services/order", {
    body: {
      manual_service_id: input.manualServiceId,
      product_id: input.productId,
      ...(input.fields && Object.keys(input.fields).length ? { fields: input.fields } : {}),
    },
    idempotencyKey: idemKey,
  });
  return r?.order ?? r;
}

/** Telegram Stars: gọi ĐÚNG 1 LẦN, không retry. Body theo OpenAPI:
 *  { telegram_username, quantity } — username có thể kèm "@" ở đầu; quantity
 *  phải trong 50..100000 (và trong min/max của báo giá). Endpoint này KHÔNG
 *  có tham số Idempotency-Key trong tài liệu; web vẫn gửi kèm theo lệnh chủ
 *  site 2026-11-08 + noRetry nên call() không bao giờ tự gọi lại. */
export async function fzrBuyTelegramStars(provider: Provider, input: { username: string; quantity: number }, idemKey?: string): Promise<any> {
  const r = await call<any>(provider, "POST", "/api/v2/telegram/stars/buy", { body: { telegram_username: input.username, quantity: input.quantity }, idempotencyKey: idemKey, noRetry: true });
  return r?.order ?? r;
}

/** Telegram Premium: như Stars — body theo OpenAPI { telegram_username,
 *  months }; 1 lần gọi, không retry. */
export async function fzrBuyTelegramPremium(provider: Provider, input: { username: string; months: number }, idemKey?: string): Promise<any> {
  const r = await call<any>(provider, "POST", "/api/v2/telegram/premium/buy", { body: { telegram_username: input.username, months: input.months }, idempotencyKey: idemKey, noRetry: true });
  return r?.order ?? r;
}

/** Kiểm tra login Steam trước khi nạp (POST /steam-topup/check-login) —
 *  body theo OpenAPI: { steamLogin }; trả { can_refill, unverified }.
 *  can_refill=false = login không nạp được (chặn đơn); unverified=true =
 *  đăng nhập chưa từng được xác minh nhưng VẪN nạp được. */
export async function fzrCheckSteamLogin(provider: Provider, steamLogin: string): Promise<{ canRefill: boolean; unverified: boolean }> {
  const r = await call<any>(provider, "POST", "/api/v2/steam-topup/check-login", { body: { steamLogin } });
  return { canRefill: !!r?.can_refill, unverified: !!r?.unverified };
}

/** Đặt đơn Steam top-up — body theo OpenAPI: { steamLogin, currency,
 *  amount } (amount là chuỗi USD tối đa 2 số lẻ; số tiền bị tính theo USD
 *  làm tròn LÊN cent tiếp theo phía NCC). */
export async function fzrCreateSteamTopupOrder(
  provider: Provider,
  input: { steamLogin: string; currency: string; amount: string },
  idemKey: string
): Promise<any> {
  const r = await call<any>(provider, "POST", "/api/v2/steam-topup/order", { body: input, idempotencyKey: idemKey });
  return r?.order ?? r;
}

/** Đặt đơn Steam gift — body theo OpenAPI: { invite_url, sub_id, app_id,
 *  region } (cả 4 bắt buộc; invite_url là link mời kết bạn Steam của người
 *  nhận, sub_id + region lấy từ offer đã chọn). Trả 201 khi tạo. */
export async function fzrCreateSteamGiftOrder(
  provider: Provider,
  input: { inviteUrl: string; subId: string; appId: number; region: string },
  idemKey: string
): Promise<any> {
  const r = await call<any>(provider, "POST", "/api/v2/steam-gifts/order", {
    body: { invite_url: input.inviteUrl, sub_id: /^-?\d+$/.test(input.subId) ? Number(input.subId) : input.subId, app_id: input.appId, region: input.region },
    idempotencyKey: idemKey,
  });
  return r?.order ?? r;
}

/* ---------------- Trạng thái + trích nội dung giao ---------------- */

/** Chuẩn hoá trạng thái đơn FZR (không có enum chính thức): created/processing/completed/refunded/refund/cancelled. */
export function fzrOrderStatus(raw: any): "completed" | "refunded" | "cancelled" | "partial" | "processing" | "unknown" {
  const s = String(raw?.status || raw?.state || "").toLowerCase();
  if (s === "partial" || s === "partially_completed" || s === "partial_completed") return "partial";
  if (s === "completed" || s === "complete" || s === "delivered" || s === "success" || s === "done") return "completed";
  if (s === "refunded" || s === "refund" || s === "failed" || s === "error") return "refunded";
  if (s === "cancelled" || s === "canceled") return "cancelled";
  if (s === "created" || s === "processing" || s === "pending" || s === "in_progress" || s === "in progress") return "processing";
  return s ? "processing" : "unknown";
}

/** Mã đơn phía FZR trong response tạo đơn / chi tiết đơn (thử các khoá phổ biến). */
export function fzrOrderIdOf(raw: any, fallbackBody?: any): string | null {
  const v = raw?.id ?? raw?.orderId ?? raw?.order_id ?? fallbackBody?.orderId ?? fallbackBody?.order_id ?? fallbackBody?.id;
  return v !== undefined && v !== null && v !== "" ? String(v) : null;
}

const DELIVERY_KEYS = ["keys", "key", "codes", "code", "pin", "pins", "serial", "serials", "delivery", "delivered", "items", "accounts", "account", "card", "cards", "content", "result", "data"];

function stringifyDelivery(v: any): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() ? v : null;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) {
    const parts = v.map((x) => stringifyDelivery(x)).filter(Boolean) as string[];
    return parts.length ? parts.join("\n") : null;
  }
  if (typeof v === "object") {
    // Object con: thử các khoá giao hàng quen thuộc trước khi dump JSON
    for (const k of DELIVERY_KEYS) {
      if (v[k] !== undefined) {
        const s = stringifyDelivery(v[k]);
        if (s) return s;
      }
    }
    return null;
  }
  return null;
}

/**
 * Trích nội dung giao hàng từ object đơn FZR (schema không cố định): quét đệ quy
 * các khoá ứng viên keys/key/code/codes/pin/serial/delivery/items…
 * Trả null khi không khoá nào khớp — caller quyết định fallback (xem fzrDeliveryOrRaw).
 */
/** Serialize 1 object "thẻ" (order.cards[]) thành dòng đọc được: "k: v · k: v". */
function cardToLine(card: any): string | null {
  if (card === null || card === undefined) return null;
  if (typeof card === "string") return card.trim() ? card : null;
  if (typeof card === "number") return String(card);
  if (typeof card === "object") {
    const parts = Object.entries(card)
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
    return parts.length ? parts.join(" · ") : null;
  }
  return null;
}

/** Nội dung giao trong order.payload (docs reseller): manual service dùng
 *  payload.details theo type account/gift/text/url; steam top-up mang
 *  {steam_login, amount_rub, …} — định dạng mọi trường details thành dòng. */
function payloadDelivery(payload: any): string | null {
  if (!payload || typeof payload !== "object") return null;
  const d = payload.details;
  if (d && typeof d === "object") {
    if (payload.type === "text" && typeof d.text === "string" && d.text.trim()) return d.text;
    if (payload.type === "url" && typeof d.url === "string" && d.url.trim()) return d.url;
    const lines = Object.entries(d)
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
    if (lines.length) return lines.join("\n");
  }
  if (typeof payload === "object") {
    const known = ["steam_login", "amount_rub", "login", "password", "link", "url", "text"];
    const lines = known.filter((k) => payload[k] !== undefined && payload[k] !== "").map((k) => `${k}: ${String(payload[k])}`);
    if (lines.length) return lines.join("\n");
  }
  return null;
}

export function extractFzrDelivery(raw: any): string | null {
  if (!raw || typeof raw !== "object") return null;
  // (1) order.cards — sản phẩm giao ngay trả mã trong mảng cards (cookbook reseller)
  if (Array.isArray(raw.cards) && raw.cards.length) {
    const lines = raw.cards.map(cardToLine).filter(Boolean) as string[];
    if (lines.length) return lines.join("\n");
  }
  // (2) order.payload.details theo type (manual service / steam top-up)
  const pd = payloadDelivery(raw.payload);
  if (pd) return pd;
  const seen = new Set<any>();
  const walk = (node: any, depth: number): string | null => {
    if (!node || typeof node !== "object" || depth > 4 || seen.has(node)) return null;
    seen.add(node);
    if (!Array.isArray(node)) {
      for (const k of DELIVERY_KEYS) {
        if (node[k] !== undefined) {
          const s = stringifyDelivery(node[k]);
          if (s) return s;
        }
      }
    }
    for (const v of Object.values(node)) {
      const s = walk(v, depth + 1);
      if (s) return s;
    }
    return null;
  };
  return walk(raw, 0);
}

/**
 * Nội dung giao khi đơn đã COMPLETED nhưng không trích được khoá nào quen thuộc:
 * giữ nguyên JSON thô để không mất dữ liệu — admin đọc và đối soát tay.
 * CHỈ dùng khi trạng thái đã hoàn thành; đơn đang xử lý không được coi là đã giao.
 */
export function fzrDeliveryOrRaw(raw: any): string | null {
  const found = extractFzrDelivery(raw);
  if (found) return found;
  try {
    const j = JSON.stringify(raw);
    return j && j !== "{}" ? j : null;
  } catch {
    return null;
  }
}

/* ================= CHAT ĐƠN MANUAL (đợt 2026-11-08) =================
 * Tài liệu FZR có đủ hai chiều:
 *   GET  /manual-services/orders/{orderId}/chat -> { ok, chat_frozen,
 *        chat_opened, chat_read_only, messages[{sender, body, image_url,
 *        image_urls, created_at}] }
 *   POST cùng đường (multipart/form-data: body, image?) -> { ok, message }
 * orderId ở đây là mã đơn PHÍA NCC (PremiumOrder.providerOrderId). */

export type FzrChatMessage = {
  sender: string;
  body: string | null;
  image_url: string | null;
  image_urls?: string[];
  created_at: string | null;
};
export type FzrChatThread = {
  chat_frozen: boolean;
  chat_opened: boolean;
  chat_read_only: boolean;
  messages: FzrChatMessage[];
};

export async function fzrManualChatGet(provider: Provider, providerOrderId: string): Promise<FzrChatThread> {
  const r = await call<any>(provider, "GET", `/api/v2/manual-services/orders/${encodeURIComponent(providerOrderId)}/chat`);
  return {
    chat_frozen: !!r?.chat_frozen,
    chat_opened: !!r?.chat_opened,
    chat_read_only: !!r?.chat_read_only,
    messages: Array.isArray(r?.messages) ? r.messages : [],
  };
}

/** Gửi 1 tin lên chat NCC. Multipart theo tài liệu; KHÔNG retry tự động
 *  (tránh nhân đôi tin) — lỗi thì người dùng bấm gửi lại. */
export async function fzrManualChatPost(provider: Provider, providerOrderId: string, body: string): Promise<FzrChatMessage> {
  const form = new FormData();
  form.append("body", body);
  let res: Response;
  try {
    res = await fetch(`${baseUrl(provider)}/api/v2/manual-services/orders/${encodeURIComponent(providerOrderId)}/chat`, {
      method: "POST",
      headers: { "X-API-Key": decryptSecret(provider.apiKey) },
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
  } catch (e: any) {
    throw new FzrError(`FZR lỗi mạng/timeout khi gửi chat: ${String(e?.message || e)}`, 0);
  }
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { throw new FzrError("FZR trả phản hồi chat không phải JSON", res.status); }
  if (!res.ok || json?.ok === false) {
    throw new FzrError(String(json?.error || `FZR chat HTTP ${res.status}`), res.status, json?.code);
  }
  const m = json?.message || {};
  return {
    sender: String(m?.sender ?? "reseller"),
    body: m?.body ?? body,
    image_url: m?.image_url ?? null,
    image_urls: Array.isArray(m?.image_urls) ? m.image_urls : undefined,
    created_at: m?.created_at ?? null,
  };
}
