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
  if (p === "/giftcards") {
    return send(res, 200, {
      ok: true, total: 2,
      categories: [{
        id: 1, name: "US Gift Cards", giftcards: [
          { id: "gc-1", name: "Amazon US $10", brand: "Amazon", price: "10.00" },
          { id: "gc-refund", name: "Refund Card $5", brand: "Mock", price: "5.00" },
        ],
      }],
    });
  }
  if (p === "/topups") {
    return send(res, 200, {
      ok: true, total: 2,
      categories: [
        { id: 1, name: "Mobile Legends", offers: [{ id: "tp-1", name: "MLBB 86 Diamonds", price: "1.85", amount: "1.85" }] },
        { id: 2, name: "Telegram (V2)", offers: [{ id: "tp-tg", name: "Telegram Stars by username", price: "0.02", amount: "0.02", fields: [{ name: "username", label: "Telegram username", required: true }] }] },
      ],
    });
  }
  if (p === "/manual-services") {
    return send(res, 200, { ok: true, categories: [{ id: 1, name: "Social Services", services: [{ id: "ms-1", name: "TikTok Followers Boost" }] }] });
  }
  if (p === "/manual-services/ms-1/offers") {
    return send(res, 200, { ok: true, offers: [{ id: "of-1", name: "100 followers", price: "2.50" }, { id: "of-2", name: "1000 followers", price: "19.99" }] });
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
    const poll = body.giftCardId === "gc-refund" ? { status: "refunded" } : { status: "completed", extra: { codes: ["GC-CODE-1"] } };
    const o = newOrder("giftcard", { giftCardId: body.giftCardId }, poll);
    return send(res, 201, { ok: true, orderId: o.id, order: o });
  }
  if (p === "/topups/validate-id") {
    return send(res, 200, { ok: true, valid: body.value !== "bad-id", player_name: "PlayerOne" });
  }
  if (p === "/topups/order") {
    const o = newOrder("topup", { offerId: body.offerId }, { status: "completed" });
    return send(res, 201, { ok: true, orderId: o.id, order: o });
  }
  if (p === "/manual-services/order") {
    const o = newOrder("manual", { manualServiceId: body.manualServiceId, offerId: body.offerId }, { status: "processing" });
    // Nhóm manual trả order_id ở top-level, status "created" (theo docs)
    return send(res, 200, { ok: true, order_id: o.id, kind: "manual_transfer", status: "created", category_id: 1 });
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
