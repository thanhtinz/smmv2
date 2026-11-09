import { prisma } from "./db";
import { FZR_LABELS, fzrUsdToVnd, fzrUsdCostVnd } from "./fzr";
import { ADMIN_VARIANT_MARK } from "./families";
import { DEFAULT_STAR_PACKAGES } from "./tg";
import {
  fzrGameKeys, fzrGameKeyKeys, fzrGiftCards, fzrGiftCardCards, fzrTopups, fzrTopupOffers, fzrManualServices, fzrManualOffers,
  fzrTelegramStarsQuote, fzrTelegramPremiumPlans, fzrSteamGiftGames,
  normalizeTopupFields, normalizeManualFields,
} from "./fzr";
import { parsePremiumFields, type PremiumCustomField } from "./format";
import type { Provider } from "@prisma/client";

/**
 * Đồng bộ catalog FazerCards -> sản phẩm Premium (panelId = null, web mẹ).
 * Nguyên tắc (khớp syncProviderPremium kiểu ThaTim):
 *  - Idempotent: định danh bằng (providerId, providerProductId) ở sản phẩm và
 *    (productId, providerGroup, providerItemId) ở gói — chạy lại chỉ cập nhật.
 *  - Tôn trọng autoUpdatePrice (tắt = giữ giá đã chốt) và syncContent (tắt = giữ tên).
 *  - Item biến mất phía FZR: chỉ TẮT gói (active=false), không xoá — đơn cũ còn đối soát.
 *  - Giá bán VND = ceil(USD x tỉ giá x (1 + markup%)) bằng số nguyên (lib/fzr).
 *  - Steam gift: endpoint danh sách bị rate-limit 1 request/3 phút nên CHỈ đồng bộ
 *    khi admin bấm tay (includeSteamGifts), mỗi lần tối đa 1 trang 100 game, và
 *    KHÔNG gọi offers theo từng game — giá chốt tại thời điểm mua (refreshFzrQuotePrice).
 */

type SyncVariant = { itemId: string; name: string; usd: string | null; cycle?: number; stock?: number; minutes?: number | null; note?: string };
type SyncItem = {
  group: string;
  productKey: string;
  productName: string;
  categoryName: string;
  description?: string;
  image?: string;
  platform?: string;
  region?: string;
  kind?: string;
  customFields?: PremiumCustomField[];
  variants: SyncVariant[];
};

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "khac";

function asArray(v: any): any[] {
  return Array.isArray(v) ? v : [];
}

function firstDefined(...vals: any[]): any {
  for (const v of vals) if (v !== undefined && v !== null && v !== "") return v;
  return undefined;
}

/** Gộp trường tuỳ chỉnh khi ĐỒNG BỘ LẠI cho hai nhóm có trường phía nhà cung
 *  cấp (topups / manual): trường theo KEY lấy từ nguồn làm khung (thứ tự +
 *  type + options + required theo NCC), nhưng NHÃN thì giữ nhãn admin đã đổi
 *  cho key còn tồn tại; key mới xuất hiện dùng nhãn NCC; key NCC đã bỏ thì
 *  mất theo. Trường KHÔNG key do admin tự thêm ở editor chung được giữ lại,
 *  trừ các nhãn generic do chính đồng bộ cũ gắn (playerId cho topups,
 *  extraInfo cho manual — chúng là trường giả của bản đấu nối sai trước đây,
 *  không phải trường NCC thật nên phải dọn). */
function mergeSyncedFields(group: string, existingJson: string | null | undefined, incoming: PremiumCustomField[]): PremiumCustomField[] {
  const existing = parsePremiumFields(existingJson);
  const byKey = new Map(existing.filter((f) => f.key).map((f) => [f.key!, f]));
  const legacyLabel = group === "topups" ? FZR_LABELS.playerId : group === "manual" ? FZR_LABELS.extraInfo : null;
  const merged: PremiumCustomField[] = incoming.map((f) => {
    const prev = f.key ? byKey.get(f.key) : undefined;
    return prev ? { ...f, label: prev.label } : f;
  });
  for (const f of existing) {
    if (!f.key && f.label !== legacyLabel) merged.push(f);
  }
  return merged.slice(0, 8);
}

/** Game Keys theo OpenAPI FZR (đọc lại 2026-11-08 khi làm khu Game Key):
 *  - GET /gamekeys: phân trang CURSOR, items[] phẳng { name, game_id, region,
 *    platform, region_restriction, appid, imageurl } — tầng game KHÔNG có giá.
 *  - GET /gamekeys/keys?game_id=: editions của game { key_id, name, price_usd,
 *    stock, min_order_quantity, max_order_quantity } — giá + tồn kho ở đây.
 *  Ánh xạ: 1 game = 1 PremiumProduct (providerProductId = game_id, platform/
 *  region lưu ở cột providerPlatform/providerRegion), 1 edition = 1 variant
 *  (providerItemId = key_id, providerStock = stock). Mỗi game tốn thêm 1 call
 *  /keys (catalog read tối đa 120/phút phía FZR) — game nào lỗi /keys hoặc
 *  không còn edition có giá thì bỏ qua (đếm skipped), không chặn cả đợt. */
async function collectGameKeys(provider: Provider): Promise<{ items: SyncItem[]; skipped: number }> {
  const rawGames: any[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 50; page++) {
    const raw = await fzrGameKeys(provider, cursor);
    const pageItems = asArray(raw?.items);
    rawGames.push(...pageItems);
    const next = raw?.meta?.next_cursor;
    if (!raw?.meta?.has_more || !next || pageItems.length === 0) break;
    cursor = String(next);
  }
  const items: SyncItem[] = [];
  let skipped = 0;
  for (const g of rawGames) {
    const gameId = firstDefined(g?.game_id, g?.gameId, g?.id);
    if (gameId === undefined) { skipped++; continue; }
    let keysRaw: any;
    try {
      keysRaw = await fzrGameKeyKeys(provider, String(gameId));
    } catch { skipped++; continue; }
    const variants: SyncVariant[] = [];
    for (const k of asArray(keysRaw?.keys)) {
      const price = firstDefined(k?.price_usd, k?.price);
      if (price === undefined) { skipped++; continue; }
      const stockNum = Number(k?.stock);
      variants.push({
        // key_id có thể null phía FZR (OpenAPI cho phép null): edition đó
        // không gọi order được bằng key_id — vẫn lưu theo tên để admin thấy,
        // lúc đặt FZR trả lỗi dứt khoát 404 -> hoàn tiền như các lỗi cứng khác.
        itemId: k?.key_id != null && k?.key_id !== "" ? String(k.key_id) : `name:${String(k?.name || "Key")}`,
        name: String(k?.name || g?.name || "Key game"),
        usd: String(price),
        ...(Number.isFinite(stockNum) ? { stock: stockNum } : {}),
      });
    }
    if (!variants.length) { skipped++; continue; }
    items.push({
      group: "gamekeys",
      productKey: String(gameId),
      productName: String(g?.name || keysRaw?.GameName || `Game Key ${gameId}`),
      categoryName: "Game Keys",
      image: firstDefined(g?.imageurl, g?.image, g?.imageUrl, keysRaw?.imageurl),
      platform: firstDefined(g?.platform, keysRaw?.platform) ? String(firstDefined(g?.platform, keysRaw?.platform)) : undefined,
      region: firstDefined(g?.region, keysRaw?.region) ? String(firstDefined(g?.region, keysRaw?.region)) : undefined,
      variants,
    });
  }
  return { items, skipped };
}

/** Gift Cards theo OpenAPI FZR (đọc lại 2026-11-08 khi làm khu Gift Card):
 *  - GET /giftcards: phân trang CURSOR, items[] phẳng { category_id, name,
 *    note?, imageurl? } — tầng category KHÔNG có giá và không lồng items.
 *    (Bản cũ tưởng response lồng category->items có sẵn id+price và order
 *    bằng { giftCardId } — ngược tài liệu, đấu key thật sẽ sync 0 sản phẩm
 *    và order bị 400, đúng bệnh của gamekeys trước FIX10.)
 *  - GET /giftcards/cards?category_id=: offers của category { card_id (có
 *    thể null), name, price_usd, stock, min/max_order_quantity } — giá +
 *    tồn kho ở đây.
 *  Ánh xạ: 1 category = 1 PremiumProduct (providerProductId = category_id,
 *  note -> description để trang chi tiết hiện thẻ NOTE đúng văn bản NCC),
 *  1 offer = 1 variant (providerItemId = card_id, providerStock = stock).
 *  Mỗi category tốn thêm 1 call /cards — category nào lỗi /cards hoặc
 *  không còn offer có giá thì bỏ qua (đếm skipped), không chặn cả đợt. */
async function collectGiftCards(provider: Provider): Promise<{ items: SyncItem[]; skipped: number }> {
  const rawCats: any[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 50; page++) {
    const raw = await fzrGiftCards(provider, cursor);
    const pageItems = asArray(raw?.items);
    rawCats.push(...pageItems);
    const next = raw?.meta?.next_cursor;
    if (!raw?.meta?.has_more || !next || pageItems.length === 0) break;
    cursor = String(next);
  }
  const items: SyncItem[] = [];
  let skipped = 0;
  for (const c of rawCats) {
    const categoryId = firstDefined(c?.category_id, c?.categoryId);
    if (categoryId === undefined) { skipped++; continue; }
    let cardsRaw: any;
    try {
      cardsRaw = await fzrGiftCardCards(provider, String(categoryId));
    } catch { skipped++; continue; }
    const variants: SyncVariant[] = [];
    for (const o of asArray(cardsRaw?.offers)) {
      const price = firstDefined(o?.price_usd, o?.price);
      if (price === undefined) { skipped++; continue; }
      const stockNum = Number(o?.stock);
      variants.push({
        // card_id có thể null phía FZR (OpenAPI cho phép null): offer đó
        // không gọi order được bằng card_id — vẫn lưu theo tên để admin
        // thấy, lúc đặt FZR trả lỗi dứt khoát -> hoàn tiền như lỗi cứng.
        itemId: o?.card_id != null && o?.card_id !== "" ? String(o.card_id) : `name:${String(o?.name || "Gift card")}`,
        name: String(o?.name || c?.name || "Gift card"),
        usd: String(price),
        ...(Number.isFinite(stockNum) ? { stock: stockNum } : {}),
      });
    }
    if (!variants.length) { skipped++; continue; }
    const note = firstDefined(cardsRaw?.note, c?.note);
    items.push({
      group: "giftcards",
      productKey: String(categoryId),
      productName: String(c?.name || cardsRaw?.name || `Gift Card ${categoryId}`),
      categoryName: "Gift Cards",
      ...(note ? { description: String(note) } : {}),
      image: firstDefined(c?.imageurl, cardsRaw?.imageurl, c?.image, c?.imageUrl),
      variants,
    });
  }
  return { items, skipped };
}

/** Top-Ups theo OpenAPI FZR (đọc lại 2026-11-08 — bản cũ gửi {page, limit, q}
 *  và tưởng response lồng category->offers có sẵn amount: ngược tài liệu, đấu
 *  key thật sẽ sync 0 sản phẩm và order bị 400, đúng bệnh gamekeys/giftcards):
 *  - GET /topups: CURSOR, items[] phẳng { category_id, name, note?, imageurl? }.
 *  - GET /topups/offers?category_id=: { offers: [{ offer_id (có thể null),
 *    name, price_usd }], fields: [{ key, label, type, options? }] } — fields
 *    là của CATEGORY, lưu vào customFields của sản phẩm KÈM key (admin đổi
 *    nhãn tự do; thực thi đơn gửi theo key — xem fzr-orders).
 *  Ánh xạ: 1 category = 1 PremiumProduct (providerProductId = category_id,
 *  note -> description), 1 offer = 1 variant (providerItemId = offer_id).
 *  Đường giao Telegram theo username (docs reseller): category tên chứa
 *  "Telegram" có trường username-like -> ghi nhận {categoryId, offerId đầu
 *  tiên, fieldKey} vào Settings cho luồng thực thi đơn Telegram. */
async function collectTopups(provider: Provider): Promise<{ items: SyncItem[]; skipped: number; tgTopup: { categoryId: string; offerId: string; field: string } | null }> {
  const rawCats: any[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 50; page++) {
    const raw = await fzrTopups(provider, cursor);
    const pageItems = asArray(raw?.items);
    rawCats.push(...pageItems);
    const next = raw?.meta?.next_cursor;
    if (!raw?.meta?.has_more || !next || pageItems.length === 0) break;
    cursor = String(next);
  }
  const items: SyncItem[] = [];
  let skipped = 0;
  let tgTopup: { categoryId: string; offerId: string; field: string } | null = null;
  for (const c of rawCats) {
    const categoryId = firstDefined(c?.category_id, c?.categoryId);
    if (categoryId === undefined) { skipped++; continue; }
    let offersRaw: any;
    try {
      offersRaw = await fzrTopupOffers(provider, String(categoryId));
    } catch { skipped++; continue; }
    const variants: SyncVariant[] = [];
    for (const o of asArray(offersRaw?.offers)) {
      const price = firstDefined(o?.price_usd, o?.price);
      if (price === undefined) { skipped++; continue; }
      variants.push({
        // offer_id có thể null phía FZR: offer đó không gọi order được bằng
        // offer_id — vẫn lưu theo tên để admin thấy, lúc đặt FZR trả lỗi dứt
        // khoát -> hoàn tiền như các lỗi cứng khác (như gamekeys/giftcards).
        itemId: o?.offer_id != null && o?.offer_id !== "" ? String(o.offer_id) : `name:${String(o?.name || "Gói nạp")}`,
        name: String(o?.name || c?.name || "Gói nạp"),
        usd: String(price),
      });
    }
    if (!variants.length) { skipped++; continue; }
    const fields = normalizeTopupFields(offersRaw?.fields);
    const note = firstDefined(offersRaw?.note, c?.note);
    items.push({
      group: "topups",
      productKey: String(categoryId),
      productName: String(c?.name || offersRaw?.name || `Top-Up ${categoryId}`),
      categoryName: "Top-Up",
      ...(note ? { description: String(note) } : {}),
      image: firstDefined(c?.imageurl, offersRaw?.imageurl, c?.image, c?.imageUrl),
      customFields: fields,
      variants,
    });
    if (!tgTopup && /telegram/i.test(String(c?.name || ""))) {
      const f = fields.find((x) => /user|telegram|nick|account/i.test(`${x.key} ${x.label}`));
      const firstRealOffer = variants.find((v) => !v.itemId.startsWith("name:"));
      if (f && firstRealOffer) tgTopup = { categoryId: String(categoryId), offerId: firstRealOffer.itemId, field: f.key };
    }
  }
  return { items, skipped, tgTopup };
}

/** Manual services theo OpenAPI FZR (đọc lại 2026-11-08 — bản cũ tưởng
 *  response lồng categories->services và giá ở price, order bằng
 *  {manualServiceId, offerId, additionalData}: ngược tài liệu ở cả ba điểm):
 *  - GET /manual-services: items[] PHẲNG { id, name, kind, chat, info } —
 *    mỗi item là một CATEGORY; `info` là văn bản của NCC cho khách -> lưu
 *    vào description của sản phẩm.
 *  - GET /manual-services/:id/offers: { items: [{ id, name, price_usd,
 *    delivery_minutes, note_product? }], info, fields? } — fields CHỈ có khi
 *    category.kind = "replenishment" ({ code, name }) -> lưu vào
 *    customFields kèm key = code. Category không phải replenishment KHÔNG
 *    có trường phía NCC: ô "Thông tin bổ sung" generic của bản cũ bị BỎ
 *    (tài liệu không định nghĩa trường nào cho chúng; thông tin bàn giao
 *    của khách vẫn nằm ở buyerInfo của đơn cho admin xử lý tay).
 *  Ánh xạ: 1 category = 1 PremiumProduct (providerProductId = id), 1 offer
 *  = 1 variant (providerItemId = offer id — id category lấy từ sản phẩm lúc
 *  đặt đơn, giống gamekeys/giftcards/topups). */
async function collectManual(provider: Provider): Promise<{ items: SyncItem[]; skipped: number }> {
  const raw = await fzrManualServices(provider);
  const cats = asArray(raw?.items);
  const items: SyncItem[] = [];
  let skipped = 0;
  for (const svc of cats) {
    const serviceId = firstDefined(svc?.id);
    if (serviceId === undefined) { skipped++; continue; }
    let offersRaw: any;
    try {
      offersRaw = await fzrManualOffers(provider, String(serviceId));
    } catch { skipped++; continue; }
    const variants: SyncVariant[] = [];
    for (const o of asArray(offersRaw?.items)) {
      const offerId = firstDefined(o?.id);
      const price = firstDefined(o?.price_usd, o?.price);
      if (offerId === undefined || price === undefined) { skipped++; continue; }
      variants.push({
        itemId: String(offerId), name: String(o?.name || o?.title || `Gói ${offerId}`), usd: String(price),
        // delivery_minutes + note_product của offer (tài liệu FZR) — dữ liệu
        // thật của NCC, chỉ để HIỆN ở trang mua khu Manual Services.
        minutes: typeof o?.delivery_minutes === "number" ? o.delivery_minutes : null,
        ...(o?.note_product ? { note: String(o.note_product) } : {}),
      });
    }
    if (!variants.length) { skipped++; continue; }
    const kind = String(offersRaw?.category?.kind || svc?.kind || "");
    const info = firstDefined(offersRaw?.info, svc?.info);
    items.push({
      group: "manual",
      productKey: String(serviceId),
      productName: String(svc?.name || svc?.title || `Dịch vụ ${serviceId}`),
      categoryName: "Dịch vụ thủ công",
      ...(kind ? { kind } : {}),
      ...(info ? { description: String(info) } : {}),
      image: firstDefined(svc?.imageurl, offersRaw?.imageurl, svc?.image, svc?.imageUrl),
      customFields: kind === "replenishment" ? normalizeManualFields(offersRaw?.fields) : [],
      variants,
    });
  }
  return { items, skipped };
}

async function collectSynthetic(provider: Provider): Promise<SyncItem[]> {
  const items: SyncItem[] = [];
  // Telegram Stars — 1 sản phẩm, giá mỗi sao báo tươi tại thời điểm mua
  try {
    const q = await fzrTelegramStarsQuote(provider);
    items.push({
      group: "telegram_stars",
      productKey: "telegram-stars",
      productName: "Telegram Stars",
      categoryName: "Telegram",
      customFields: [
        { label: FZR_LABELS.telegramId, type: "text", required: false, placeholder: "ID số của tài khoản Telegram (không bắt buộc)" },
        { label: "Tên người dùng Telegram", type: "text", required: true, placeholder: "@username của tài khoản nhận" },
      ],
      // Gói đơn vị "stars" (neo thực thi: đơn chạy quantity = số sao) + các
      // GÓI SAO mặc định theo số lượng (danh sách khách chọn ở trang đặt đơn;
      // giá gói ở đây là giá HIỂN THỊ = giá mỗi sao x số sao — giá tính tiền
      // vẫn chốt theo báo giá tại lúc mua). Admin thêm gói riêng ở Admin →
      // Telegram → Sản phẩm (dấu CUSTOM, sync không đụng).
      variants: [
        { itemId: "stars", name: "1 sao", usd: String(q.pricePerStar) },
        ...DEFAULT_STAR_PACKAGES.map((n) => ({
          itemId: String(n),
          name: `${n} sao`,
          usd: String(Math.round(Number(q.pricePerStar) * n * 1e6) / 1e6),
        })),
      ],
    });
  } catch { /* nhóm không khả dụng phía FZR (thiếu addon) -> bỏ qua, không chặn cả đợt sync */ }
  // Telegram Premium — các gói 3/6/12 tháng
  try {
    const plans = await fzrTelegramPremiumPlans(provider);
    if (plans.length) {
      items.push({
        group: "telegram_premium",
        productKey: "telegram-premium",
        productName: "Telegram Premium",
        categoryName: "Telegram",
        customFields: [
          { label: FZR_LABELS.telegramId, type: "text", required: false, placeholder: "ID số của tài khoản Telegram (không bắt buộc)" },
          { label: "Tên người dùng Telegram", type: "text", required: true, placeholder: "@username của tài khoản nhận" },
        ],
        variants: plans.filter((p) => [3, 6, 12].includes(p.durationMonths)).map((p) => ({
          itemId: String(p.durationMonths), name: `${p.durationMonths} tháng`, usd: p.price, cycle: p.durationMonths,
        })),
      });
    }
  } catch { /* bỏ qua nếu nhóm lỗi */ }
  // Steam Top-Up — mệnh giá USD cố định, nạp theo login
  items.push({
    group: "steam_topup",
    productKey: "steam-topup",
    productName: "Nạp Steam Wallet (USD)",
    categoryName: "Steam",
    customFields: [{ label: FZR_LABELS.steamLogin, type: "text", required: true, placeholder: "Tên đăng nhập Steam" }],
    variants: [5, 10, 20, 50, 100].map((a) => ({ itemId: String(a), name: `${a} USD`, usd: String(a) })),
  });
  return items;
}

/** Steam gift: CHỈ khi admin bấm tay — 1 request duy nhất (rate limit 1 lần/3 phút), tối đa 100 game đầu. */
async function collectSteamGifts(provider: Provider): Promise<{ items: SyncItem[]; skipped: number }> {
  const raw = await fzrSteamGiftGames(provider, 1);
  const games: any[] = asArray(raw?.games || raw?.data?.games || raw?.data || raw?.items);
  const items: SyncItem[] = [];
  let skipped = 0;
  for (const g of games) {
    const appid = firstDefined(g?.appid, g?.appId, g?.id);
    if (appid === undefined) { skipped++; continue; }
    const price = firstDefined(g?.price, g?.minPrice, g?.lowestPrice);
    items.push({
      group: "steam_gift",
      productKey: `app-${appid}`,
      productName: String(g?.name || `Steam Game ${appid}`),
      categoryName: "Steam Gift Games",
      image: firstDefined(g?.header_image, g?.image, g?.imageUrl, g?.capsule_image),
      customFields: [{ label: FZR_LABELS.giftReceiver, type: "text", required: true, placeholder: "Tài khoản Steam nhận gift" }],
      // price không có trong danh sách -> usd null = báo giá tại thời điểm mua từ offers
      variants: [{ itemId: String(appid), name: "Bản gift", usd: price !== undefined ? String(price) : null }],
    });
  }
  return { items, skipped };
}

export async function syncFzrCatalog(provider: Provider, opts: {
  includeSteamGifts?: boolean;
  /** FIX11 TASK 3 — đồng bộ RIÊNG một số nhóm (nút Đồng bộ trên trang sản
   *  phẩm từng khu): collector của nhóm khác không chạy, vòng tắt gói cũ
   *  cũng chỉ quét trong các nhóm của đợt này — không đụng catalog khu khác. */
  groups?: string[];
  /** Markup hiệu lực theo nhóm (override theo khu, xem lib/fzr-markup) —
   *  bỏ trống thì mọi nhóm dùng markupPercent của nhà cung cấp như trước. */
  markupFor?: (group: string) => number;
} = {}) {
  const groups: SyncItem[] = [];
  let skipped = 0;
  const push = (r: { items: SyncItem[]; skipped: number }) => { groups.push(...r.items); skipped += r.skipped; };
  const only = opts.groups ? new Set(opts.groups) : null;
  const want = (g: string) => !only || only.has(g);
  // Khu Steam bấm đồng bộ riêng thì lấy luôn gift games (vẫn là thao tác tay
  // như cờ includeSteamGifts, chỉ khác là gói trong nhóm của khu).
  const doSteamGifts = !!opts.includeSteamGifts || want("steam_gift") && !!only;

  if (want("gamekeys")) push(await collectGameKeys(provider));
  if (want("giftcards")) push(await collectGiftCards(provider));
  if (want("topups")) {
    const topupsRes = await collectTopups(provider);
    push(topupsRes);
    // Ghi nhận đường giao Telegram theo username cho provider này (hoặc xoá nếu
    // lần đồng bộ này không còn thấy) — luồng thực thi đơn Telegram đọc lại ở đây.
    try {
      const { setSetting } = await import("./settings");
      if (topupsRes.tgTopup) {
        await setSetting("telegram_topup_category_id", topupsRes.tgTopup.categoryId);
        await setSetting("telegram_topup_offer_id", topupsRes.tgTopup.offerId);
        await setSetting("telegram_topup_field", topupsRes.tgTopup.field);
        await setSetting("telegram_topup_provider_id", String(provider.id));
      } else if (String((await (await import("./settings")).getSettings()).telegram_topup_provider_id || "") === String(provider.id)) {
        await setSetting("telegram_topup_category_id", "");
        await setSetting("telegram_topup_offer_id", "");
        await setSetting("telegram_topup_field", "");
        await setSetting("telegram_topup_provider_id", "");
      }
    } catch { /* ghi nhận đường Telegram là phụ trợ — lỗi không chặn đồng bộ catalog */ }
  }
  if (want("manual")) push(await collectManual(provider));
  if (want("telegram_stars") || want("telegram_premium") || want("steam_topup")) {
    groups.push(...(await collectSynthetic(provider)).filter((i) => want(i.group)));
  }
  const syncedGroups = new Set(groups.map((g) => g.group));
  if (doSteamGifts) {
    push(await collectSteamGifts(provider));
    syncedGroups.add("steam_gift");
  }

  let created = 0, updated = 0, variantCount = 0, deactivated = 0;
  const catCache = new Map<string, number>();
  async function categoryId(name: string): Promise<number> {
    if (catCache.has(name)) return catCache.get(name)!;
    let cat = await prisma.premiumCategory.findFirst({ where: { name } });
    if (!cat) cat = await prisma.premiumCategory.create({ data: { name, slug: `${slugify(name)}-${provider.id}` } });
    catCache.set(name, cat.id);
    return cat.id;
  }

  const seenVariantIds = new Set<number>();
  for (const item of groups) {
    const catId = await categoryId(item.categoryName);
    const existing = await prisma.premiumProduct.findFirst({
      where: { providerId: provider.id, providerProductId: item.productKey },
    });
    let productId: number;
    // Hai nhóm có trường phía NCC (topups/manual): khi sản phẩm ĐÃ có, gộp
    // trường theo key để giữ nhãn admin đã đổi (mergeSyncedFields); nhóm
    // khác giữ hành vi ghi đè như cũ.
    const fieldsJson = item.customFields
      ? JSON.stringify(
          existing && (item.group === "topups" || item.group === "manual")
            ? mergeSyncedFields(item.group, existing.customFields, item.customFields)
            : item.customFields
        )
      : undefined;
    if (existing) {
      await prisma.premiumProduct.update({
        where: { id: existing.id },
        data: {
          categoryId: catId,
          fulfillment: "API",
          ...(provider.syncContent ? { name: item.productName } : {}),
          ...(item.description && provider.syncContent ? { description: item.description } : {}),
          ...(item.image ? { imageUrl: item.image } : {}),
          ...(item.platform ? { providerPlatform: item.platform } : {}),
          ...(item.region ? { providerRegion: item.region } : {}),
          ...(item.kind ? { providerKind: item.kind } : {}),
          ...(fieldsJson ? { customFields: fieldsJson } : {}),
        },
      });
      productId = existing.id;
      updated++;
    } else {
      const np = await prisma.premiumProduct.create({
        data: {
          categoryId: catId,
          name: item.productName,
          slug: `fzr-${provider.id}-${item.group}-${slugify(item.productKey)}`.slice(0, 150),
          description: item.description || null,
          imageUrl: item.image || null,
          providerPlatform: item.platform || null,
          providerRegion: item.region || null,
          providerKind: item.kind || null,
          fulfillment: "API",
          providerId: provider.id,
          providerProductId: item.productKey,
          customFields: fieldsJson || null,
        },
      });
      productId = np.id;
      created++;
    }
    for (const v of item.variants) {
      const price = v.usd !== null ? fzrUsdToVnd(v.usd, provider.exchangeRate, opts.markupFor ? opts.markupFor(item.group) : provider.markupPercent) : 0;
      const cost = v.usd !== null ? fzrUsdCostVnd(v.usd, provider.exchangeRate) : 0;
      const ev = await prisma.premiumVariant.findFirst({
        where: { productId, providerGroup: item.group, providerItemId: v.itemId },
      });
      if (ev) {
        await prisma.premiumVariant.update({
          where: { id: ev.id },
          data: {
            providerId: provider.id,
            active: true,
            ...(provider.syncContent ? { name: v.name } : {}),
            // Gói admin tự thêm (dấu CUSTOM ở trang họ Telegram/Steam): sync
            // không ghi đè giá — admin toàn quyền giá gói đó.
            ...(provider.autoUpdatePrice && ev.deliveryType !== ADMIN_VARIANT_MARK ? { price, cost } : {}),
            ...(v.cycle ? { providerCycle: v.cycle } : {}),
            ...(v.stock !== undefined ? { providerStock: v.stock } : {}),
            ...(v.minutes !== undefined ? { deliveryMinutes: v.minutes } : {}),
            ...(v.note !== undefined ? { providerNote: v.note } : {}),
          },
        });
        seenVariantIds.add(ev.id);
      } else {
        const nv = await prisma.premiumVariant.create({
          data: {
            productId, name: v.name, price, cost, warrantyDays: 0,
            providerId: provider.id, providerGroup: item.group, providerItemId: v.itemId,
            providerCycle: v.cycle ?? null,
            providerStock: v.stock ?? null,
            deliveryMinutes: v.minutes ?? null,
            providerNote: v.note ?? null,
          },
        });
        seenVariantIds.add(nv.id);
      }
      variantCount++;
    }
  }

  // Item biến mất phía FZR -> tắt gói (không xoá) trong các nhóm đã đồng bộ đợt này
  if (syncedGroups.size) {
    const stale = await prisma.premiumVariant.findMany({
      where: { providerId: provider.id, providerGroup: { in: Array.from(syncedGroups) }, active: true },
      select: { id: true, deliveryType: true },
    });
    // Gói admin tự thêm (dấu CUSTOM) không nằm trong danh sách FZR nhưng vẫn
    // giữ nguyên — đồng bộ không tắt (xem lib/families).
    const staleIds = stale.filter((v) => !seenVariantIds.has(v.id) && v.deliveryType !== ADMIN_VARIANT_MARK).map((v) => v.id);
    if (staleIds.length) {
      const r = await prisma.premiumVariant.updateMany({ where: { id: { in: staleIds } }, data: { active: false } });
      deactivated = r.count;
    }
  }

  await prisma.provider.update({ where: { id: provider.id }, data: { lastSyncAt: new Date() } });
  await prisma.apiLog.create({
    data: { kind: "provider_sync", ref: provider.name, detail: `FZR catalog created=${created} updated=${updated} variants=${variantCount} deactivated=${deactivated} skipped=${skipped} steamGifts=${doSteamGifts}` },
  });
  return { created, updated, variants: variantCount, deactivated, skipped, total: groups.length, steamGifts: doSteamGifts };
}
