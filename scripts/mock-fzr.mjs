/**
 * Mock FazerCards (api.fzr.cards) để test đấu API FZR mà không cần key thật:
 *   node scripts/mock-fzr.mjs   (port 3998)
 * Bề mặt theo tài liệu công khai 2026-11-07: envelope {ok}, tiền là chuỗi,
 * tạo đơn theo nhóm, đơn là object tự do (không schema cố định).
 * Điều khiển hành vi qua POST /__control {starsBehavior, flip:{orderId,status,delivery}}
 * và xem log request qua GET /__log.
 */
import http from "node:http";

const PORT = 3998;
const KEY = "fc_test_mock";
export const log = [];
const orders = new Map();
let seq = 0;
let starsBehavior = "ok"; // ok | hang (giữ response quá timeout nhưng VẪN tạo đơn)

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => {
      try { resolve(JSON.parse(d || "{}")); } catch { resolve({}); }
    });
  });
}

function newOrder(kind, fields, poll) {
  const id = `ord_${kind}_${++seq}`;
  const order = { id, status: "processing", kind, ...fields };
  orders.set(id, { order, poll: poll || { status: "completed" } });
  return order;
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  const path = u.pathname;

  if (path === "/__log") return send(res, 200, { log });
  if (path === "/__control" && req.method === "POST") {
    const b = await readBody(req);
    if (b.starsBehavior) starsBehavior = b.starsBehavior;
    if (b.flip && orders.has(b.flip.orderId)) {
      const rec = orders.get(b.flip.orderId);
      rec.poll = { status: b.flip.status, delivery: b.flip.delivery };
    }
    return send(res, 200, { ok: true });
  }
  if (path === "/__reset" && req.method === "POST") {
    log.length = 0;
    return send(res, 200, { ok: true });
  }

  const body = req.method === "POST" ? await readBody(req) : {};
  log.push({ method: req.method, path, query: Object.fromEntries(u.searchParams), body, idem: req.headers["idempotency-key"] || null });

  if (!path.startsWith("/api/v2/")) return send(res, 404, { ok: false, error: "not found", code: "NOT_FOUND" });
  if (req.headers["x-api-key"] !== KEY) return send(res, 401, { ok: false, error: "Invalid API key", code: "UNAUTHORIZED" });

  const p = path.replace("/api/v2", "");

  if (p === "/balance") return send(res, 200, { ok: true, balance: "250.5000", currency: "USD" });
  if (p === "/me") return send(res, 200, { ok: true, id: 42, email: "mock@fzr.cards" });

  /* ----- catalog ----- */
  // Game Keys theo OpenAPI thật (sửa 2026-11-08): danh sách phẳng + phân
  // trang cursor; giá/tồn kho ở /gamekeys/keys theo từng game_id.
  const GK_GAMES = [
    { game_id: "gk-1", name: "Elden Ring", platform: "Steam", region: "GLOBAL", region_restriction: false, appid: 1245620, imageurl: "https://cdn.example.com/gk-elden.jpg" },
    { game_id: "gk-2", name: "Baldur's Gate 3", platform: "Steam", region: "GLOBAL", region_restriction: false, appid: 1086940, imageurl: "https://cdn.example.com/gk-bg3.jpg" },
    { game_id: "gk-3", name: "Cyberpunk 2077", platform: "Steam", region: "CIS", region_restriction: true, appid: 1091500, imageurl: "https://cdn.example.com/gk-cp2077.jpg" },
    { game_id: "gk-4", name: "EA SPORTS FC 25", platform: "EA App", region: "GLOBAL", region_restriction: false, appid: null, imageurl: "https://cdn.example.com/gk-fc25.jpg" },
    { game_id: "gk-5", name: "Xbox Game Pass Key", platform: "Xbox", region: "EU", region_restriction: true, appid: null, imageurl: "https://cdn.example.com/gk-xgp.jpg" },
  ];
  const GK_KEYS = {
    "gk-1": [
      { key_id: "gk-1-std", name: "Elden Ring", price_usd: "59.99", stock: 101, min_order_quantity: 1, max_order_quantity: 10 },
      { key_id: "gk-1-dlx", name: "Elden Ring Deluxe Edition", price_usd: "79.99", stock: 12, min_order_quantity: 1, max_order_quantity: 5 },
      { key_id: "gk-402", name: "Elden Ring (lỗi số dư)", price_usd: "999.00", stock: 3, min_order_quantity: 1, max_order_quantity: 1 },
    ],
    "gk-2": [
      { key_id: "gk-2-std", name: "Baldur's Gate 3", price_usd: "49.50", stock: 0, min_order_quantity: 1, max_order_quantity: 10 },
      { key_id: "gk-weird", name: "Baldur's Gate 3 (payload lạ)", price_usd: "45.00", stock: 7, min_order_quantity: 1, max_order_quantity: 10 },
    ],
    "gk-3": [
      { key_id: "gk-3-std", name: "Cyberpunk 2077", price_usd: "29.99", stock: 44, min_order_quantity: 1, max_order_quantity: 10 },
    ],
    "gk-4": [
      { key_id: "gk-4-std", name: "EA SPORTS FC 25", price_usd: "69.99", stock: 20, min_order_quantity: 1, max_order_quantity: 3 },
    ],
    "gk-5": [
      { key_id: null, name: "Xbox Game Pass Ultimate 1 tháng", price_usd: "16.99", stock: 55, min_order_quantity: 1, max_order_quantity: 10 },
    ],
  };
  if (p === "/gamekeys") {
    const limit = Math.min(100, parseInt(u.searchParams.get("limit") || "100") || 100);
    const start = Math.max(0, parseInt(u.searchParams.get("cursor") || "0") || 0);
    const slice = GK_GAMES.slice(start, start + limit);
    const nextIdx = start + slice.length;
    return send(res, 200, {
      ok: true, kind: "game_key", items: slice,
      meta: { total: GK_GAMES.length, limit, next_cursor: nextIdx < GK_GAMES.length ? String(nextIdx) : null, has_more: nextIdx < GK_GAMES.length },
    });
  }
  if (p === "/gamekeys/keys") {
    const gid = u.searchParams.get("game_id") || "";
    const game = GK_GAMES.find((g) => g.game_id === gid);
    if (!game) return send(res, 404, { ok: false, error: "Game not found", code: "NOT_FOUND" });
    return send(res, 200, {
      ok: true, kind: "game_key", game_id: gid, GameName: game.name, region: game.region, platform: game.platform,
      region_restriction: game.region_restriction, appid: game.appid, imageurl: game.imageurl, keys: GK_KEYS[gid] || [],
    });
  }
  if (p === "/gamekeys/region-restriction") {
    const gid = u.searchParams.get("game_id") || "";
    const game = GK_GAMES.find((g) => g.game_id === gid);
    if (!game) return send(res, 404, { ok: false, error: "Game not found", code: "NOT_FOUND" });
    return send(res, 200, {
      ok: true, kind: "game_key", game_id: gid, region_type: game.region, has_availability: true,
      available: [{ code: game.region, name: game.region }], unavailable: [],
    });
  }
  // Gift Cards theo OpenAPI thật (sửa 2026-11-08): danh sách category phẳng
  // + phân trang cursor; giá/tồn kho ở /giftcards/cards theo category_id.
  const GC_CATS = [
    { category_id: "gcat-apple-tr", name: "App Store & iTunes (TR) · Instant use", note: "Region: TR\nApp Store & iTunes gift cards (same Apple wallet product). Discounted codes. Not for storage — redeem right after purchase.", imageurl: "https://cdn.example.com/gc-apple.jpg" },
    { category_id: "gcat-amazon-us", name: "Amazon (US)", note: "Region: US\nAmazon.com gift cards.", imageurl: "https://cdn.example.com/gc-amazon.jpg" },
    { category_id: "gcat-ps-us", name: "PlayStation (US) · Instant use", imageurl: null },
  ];
  const GC_OFFERS = {
    "gcat-apple-tr": [
      { card_id: "gc-tr-10", name: "10 TRY", price_usd: "0.18", stock: 250, min_order_quantity: 1, max_order_quantity: 100 },
      { card_id: "gc-tr-50", name: "50 TRY", price_usd: "0.89", stock: 80, min_order_quantity: 1, max_order_quantity: 100 },
    ],
    "gcat-amazon-us": [
      { card_id: "gc-amz-10", name: "Amazon $10", price_usd: "10.00", stock: 40, min_order_quantity: 1, max_order_quantity: 10 },
      { card_id: "gc-refund", name: "Refund Card $5", price_usd: "5.00", stock: 5, min_order_quantity: 1, max_order_quantity: 1 },
      { card_id: "gc-402", name: "Balance Error Card", price_usd: "999.00", stock: 2, min_order_quantity: 1, max_order_quantity: 1 },
    ],
    "gcat-ps-us": [
      { card_id: "gc-ps-25", name: "PlayStation $25", price_usd: "24.50", stock: 0, min_order_quantity: 1, max_order_quantity: 10 },
      { card_id: null, name: "PlayStation $50 (name-only)", price_usd: "49.00", stock: 15, min_order_quantity: 1, max_order_quantity: 10 },
    ],
  };
  if (p === "/giftcards") {
    const limit = Math.min(100, parseInt(u.searchParams.get("limit") || "100") || 100);
    const start = Math.max(0, parseInt(u.searchParams.get("cursor") || "0") || 0);
    const slice = GC_CATS.slice(start, start + limit);
    const nextIdx = start + slice.length;
    return send(res, 200, {
      ok: true, kind: "gift_card", items: slice,
      meta: { total: GC_CATS.length, limit, next_cursor: nextIdx < GC_CATS.length ? String(nextIdx) : null, has_more: nextIdx < GC_CATS.length },
    });
  }
  if (p === "/giftcards/cards") {
    const cid = u.searchParams.get("category_id") || "";
    const cat = GC_CATS.find((c) => c.category_id === cid);
    if (!cat) return send(res, 404, { ok: false, error: "Category not found", code: "NOT_FOUND" });
    return send(res, 200, {
      ok: true, kind: "gift_card", category_id: cid, name: cat.name,
      ...(cat.note ? { note: cat.note } : {}), imageurl: cat.imageurl, offers: GC_OFFERS[cid] || [],
    });
  }
  // Top-Ups theo OpenAPI thật (sửa 2026-11-08): danh sách category phẳng +
  // phân trang cursor; offers + fields (của category) ở /topups/offers.
  const TP_CATS = [
    { category_id: "tp-1", name: "Mobile Legends: Bang Bang", note: "Nạp kim cương MLBB theo ID người chơi.", imageurl: "https://cdn.example.com/tp-mlbb.jpg" },
    { category_id: "tp-2", name: "Genshin Impact", note: "Nạp Genesis Crystal theo UID.", imageurl: "https://cdn.example.com/tp-gi.jpg" },
    { category_id: "tp-tg", name: "Telegram (V2)", imageurl: null },
  ];
  const TP_OFFERS = {
    "tp-1": {
      offers: [
        { offer_id: "tp-1-86", name: "86 Diamonds", price_usd: "1.85" },
        { offer_id: "tp-1-172", name: "172 Diamonds", price_usd: "3.70" },
      ],
      fields: [
        { key: "player_id", label: "Player ID", type: "text" },
        { key: "zone_id", label: "Zone ID", type: "text" },
      ],
    },
    "tp-2": {
      offers: [{ offer_id: "tp-2-60", name: "60 Genesis Crystal", price_usd: "0.99" }],
      fields: [
        { key: "uid", label: "UID", type: "text" },
        { key: "server", label: "Server", type: "select", options: [{ value: "asia", label: "Asia" }, { value: "america", label: "America" }, { value: "europe", label: "Europe" }] },
      ],
    },
    "tp-tg": {
      offers: [{ offer_id: "tp-tg-stars", name: "Telegram Stars by username", price_usd: "0.02" }],
      fields: [{ key: "username", label: "Telegram username", type: "text" }],
    },
  };
  if (p === "/topups" && req.method === "GET") {
    const limit = Math.min(100, parseInt(u.searchParams.get("limit") || "100") || 100);
    const start = Math.max(0, parseInt(u.searchParams.get("cursor") || "0") || 0);
    const slice = TP_CATS.slice(start, start + limit);
    const nextIdx = start + slice.length;
    return send(res, 200, {
      ok: true, kind: "topup", items: slice,
      meta: { total: TP_CATS.length, limit, next_cursor: nextIdx < TP_CATS.length ? String(nextIdx) : null, has_more: nextIdx < TP_CATS.length },
    });
  }
  if (p === "/topups/offers") {
    const cid = u.searchParams.get("category_id") || "";
    const cat = TP_CATS.find((c) => c.category_id === cid);
    if (!cat) return send(res, 404, { ok: false, error: "Category not found", code: "NOT_FOUND" });
    const data = TP_OFFERS[cid] || { offers: [], fields: [] };
    return send(res, 200, {
      ok: true, kind: "topup", category_id: cid, name: cat.name,
      ...(cat.note ? { note: cat.note } : {}), imageurl: cat.imageurl, offers: data.offers, fields: data.fields,
    });
  }
  if (p === "/topups/validate-id" && req.method === "GET") {
    // Chỉ tp-1 (MLBB) hỗ trợ kiểm tra ID trong mock này
    return send(res, 200, {
      ok: true, kind: "topup",
      items: [{ category_id: "tp-1", name: "Mobile Legends: Bang Bang", fields: TP_OFFERS["tp-1"].fields }],
    });
  }
  // Manual services theo OpenAPI thật (sửa 2026-11-08): items[] phẳng ở
  // list; offers ở items[] của /offers kèm info; fields {code, name} CHỈ
  // cho category kind=replenishment (ms-2).
  const MS_CATS = [
    { id: "ms-1", name: "TikTok Followers Boost", kind: "standard", chat: true, info: "", imageurl: null },
    { id: "ms-2", name: "MLBB Diamonds (Manual Recharge)", kind: "replenishment", chat: false, info: "Nhập đúng ID người chơi và máy chủ.", imageurl: null },
  ];
  const MS_OFFERS = {
    "ms-1": {
      items: [
        { id: "of-1", name: "100 followers", price_usd: "2.50", delivery_minutes: 60 },
        { id: "of-2", name: "1000 followers", price_usd: "19.99", delivery_minutes: 240 },
      ],
      fields: null,
    },
    "ms-2": {
      items: [{ id: "of-m1", name: "86 Diamonds", price_usd: "1.90", delivery_minutes: 30 }],
      fields: [
        { code: "player_id", name: "Player ID" },
        { code: "server", name: "Server" },
      ],
    },
  };
  if (p === "/manual-services") {
    return send(res, 200, { ok: true, items: MS_CATS });
  }
  if (p.startsWith("/manual-services/") && p.endsWith("/offers")) {
    const mid = decodeURIComponent(p.split("/")[2] || "");
    const cat = MS_CATS.find((c) => c.id === mid);
    if (!cat) return send(res, 404, { ok: false, error: "Category not found", code: "NOT_FOUND" });
    const data = MS_OFFERS[mid] || { items: [], fields: null };
    return send(res, 200, {
      ok: true, manual_service_id: mid,
      category: { id: cat.id, name: cat.name, kind: cat.kind, chat: cat.chat },
      items: data.items, info: cat.info || "",
      ...(data.fields ? { fields: data.fields } : {}),
    });
  }
  if (p === "/telegram/stars") {
    return send(res, 200, { ok: true, pricePerStar: "0.0150000", price: "0.0150000", minAmount: 50, maxAmount: 10000, currency: "USD", balanceEnough: true });
  }
  if (p === "/telegram/premium") {
    return send(res, 200, {
      ok: true, plans: [
        { durationMonths: 3, price: "12.99", finalPrice: "11.99" },
        { durationMonths: 6, price: "23.99", finalPrice: "21.99" },
        { durationMonths: 12, price: "39.99", finalPrice: "35.99" },
      ],
    });
  }
  if (p === "/steam-topup/rates") return send(res, 200, { ok: true, rates: { RUB: "90.50", UAH: "41.20", KZT: "470" }, rates_updated_at: "2026-11-07T00:00:00Z" });
  if (p === "/steam-gifts/games") {
    // KHÔNG kèm giá trong danh sách — giá phải lấy từ offers tại thời điểm mua
    return send(res, 200, { ok: true, games: [{ appid: 1245620, name: "ELDEN RING", header_image: "https://example.com/er.jpg" }, { appid: 1086940, name: "Baldur's Gate 3" }] });
  }
  if (p === "/steam-gifts/games/1245620") return send(res, 200, { ok: true, offers: [{ price: "45.99" }, { price: "47.50" }] });
  if (p.startsWith("/steam-gifts/games/")) return send(res, 200, { ok: true, offers: [{ price: "39.99" }] });

  /* ----- tạo đơn ----- */
  if (p === "/gamekeys/order") {
    // Body theo OpenAPI: { game_id, key_id, quantity } — thiếu là 400.
    if (!body.game_id || !body.key_id) return send(res, 400, { ok: false, error: "game_id and key_id are required", code: "VALIDATION" });
    if (body.key_id === "gk-402") return send(res, 402, { ok: false, error: "Insufficient balance", code: "INSUFFICIENT_BALANCE" });
    if (body.key_id === "gk-weird") {
      const o = newOrder("gamekey", { game_id: body.game_id, key_id: body.key_id }, { status: "completed", extra: { voucher_payload: "WEIRD-CODE-123" } });
      return send(res, 200, { ok: true, order: o });
    }
    const o = newOrder("gamekey", { game_id: body.game_id, key_id: body.key_id, quantity: body.quantity }, { status: "completed", extra: { keys: ["XXXX-YYYY-ZZZZ"] } });
    return send(res, 200, { ok: true, order: o });
  }
  if (p === "/giftcards/order") {
    // Body theo OpenAPI: { category_id, card_id, quantity } — thiếu là 400.
    if (!body.category_id || !body.card_id) return send(res, 400, { ok: false, error: "category_id and card_id are required", code: "VALIDATION" });
    if (body.card_id === "gc-402") return send(res, 402, { ok: false, error: "Insufficient balance", code: "INSUFFICIENT_BALANCE" });
    const poll = body.card_id === "gc-refund" ? { status: "refunded" } : { status: "completed", extra: { codes: ["GC-CODE-1"] } };
    const o = newOrder("giftcard", { category_id: body.category_id, card_id: body.card_id, quantity: body.quantity }, poll);
    return send(res, 200, { ok: true, order: o });
  }
  if (p === "/topups/validate-id" && req.method === "POST") {
    // Body theo tài liệu: { category_id, fields }; player_id "bad-id" = ID sai
    const pid = String(body.fields?.player_id || "");
    const valid = pid !== "bad-id";
    return send(res, 200, { ok: true, category_id: body.category_id, valid, player_name: valid ? "PlayerOne" : null, player_id: pid || null, region: "VN" });
  }
  if (p === "/topups/order") {
    // Body theo tài liệu: { category_id, offer_id, fields (bắt buộc, là object) }
    if (!body.category_id || !body.offer_id || typeof body.fields !== "object" || body.fields === null) {
      return send(res, 400, { ok: false, error: "Missing params", code: "BAD_REQUEST" });
    }
    const o = newOrder("topup", { category_id: body.category_id, offer_id: body.offer_id, fields: body.fields }, { status: "completed" });
    return send(res, 201, { ok: true, orderId: o.id, order: o });
  }
  if (p === "/manual-services/order") {
    // Body theo tài liệu: { manual_service_id, product_id, fields? } —
    // response PHẲNG { order_id, kind, status, ... } không bọc trong order.
    if (!body.manual_service_id || !body.product_id) return send(res, 400, { ok: false, error: "Missing params", code: "BAD_REQUEST" });
    const o = newOrder("manual", { manual_service_id: body.manual_service_id, product_id: body.product_id, fields: body.fields || null }, { status: "processing" });
    return send(res, 200, {
      ok: true, order_id: o.id,
      kind: body.manual_service_id === "ms-2" ? "manual_replenishment" : "manual_transfer",
      status: "created", category_id: body.manual_service_id, product_id: body.product_id,
      price_usd: "2.50", deadline_at: new Date(Date.now() + 3600e3).toISOString(),
      chat_required: false, chat_status: "none",
    });
  }
  if (p === "/telegram/stars/buy") {
    const o = newOrder("stars", { quantity: body.quantity, userId: body.userId }, { status: "completed" });
    if (starsBehavior === "hang") {
      // Đã tạo đơn + trừ tiền phía FZR nhưng response về quá chậm -> phía mình timeout (mơ hồ)
      return setTimeout(() => send(res, 201, { ok: true, orderId: o.id, order: o }), 33000);
    }
    return send(res, 201, { ok: true, orderId: o.id, order: o });
  }
  if (p === "/telegram/premium/buy") {
    const o = newOrder("tgpremium", { userId: body.userId, months: body.months }, { status: "completed" });
    return send(res, 201, { ok: true, orderId: o.id, order: o });
  }
  if (p === "/steam-topup/check-login") {
    return send(res, 200, { ok: true, valid: body.login !== "badlogin", region: "CIS" });
  }
  if (p === "/steam-topup/order") {
    const o = newOrder("steamtopup", { login: body.login }, { status: "completed" });
    return send(res, 201, { ok: true, order: o });
  }
  if (p === "/steam-gifts/order") {
    const o = newOrder("steamgift", { appid: body.appid }, { status: "completed" });
    return send(res, 201, { ok: true, order: o });
  }

  /* ----- tra đơn ----- */
  const m = p.match(/^\/orders\/(.+)$/);
  if (m && req.method === "GET") {
    const rec = orders.get(decodeURIComponent(m[1]));
    if (!rec) return send(res, 404, { ok: false, error: "Order not found", code: "NOT_FOUND" });
    const out = { ...rec.order, status: rec.poll.status, ...(rec.poll.extra || {}), ...(rec.poll.delivery ? { keys: rec.poll.delivery } : {}) };
    return send(res, 200, { ok: true, order: out });
  }

  return send(res, 404, { ok: false, error: "Unknown endpoint", code: "NOT_FOUND" });
});

server.listen(PORT, "127.0.0.1", () => console.log(`mock-fzr listening on ${PORT}`));
