/**
 * Mock FZR BIẾN ĐỘNG cho đợt kiểm chứng nút "Đồng bộ từ nguồn" theo sản
 * phẩm + "Thêm hàng loạt từ nguồn" (2026-11-09): catalog gamekeys nằm trong
 * state sửa được qua POST /__control { gameId, region?, platform?, keys? }
 * (thay keys/region/platform của 1 game) để giả lập NCC đổi giá/tồn kho/
 * thuộc tính sau lần đồng bộ đầu. Chỉ gồm bề mặt gamekeys mà đợt này dùng.
 *   node scripts/mock-fzr-mutable.mjs   (port 3999, key fc_test_mock)
 */
import http from "node:http";

const PORT = 3999;
const KEY = "fc_test_mock";

const state = {
  games: [
    { game_id: "gk-1", name: "Elden Ring", platform: "Steam", region: "GLOBAL", region_restriction: false, appid: 1245620, imageurl: "https://cdn.example.com/gk-elden.jpg" },
    { game_id: "gk-2", name: "Baldur's Gate 3", platform: "Steam", region: "GLOBAL", region_restriction: false, appid: 1086940, imageurl: "https://cdn.example.com/gk-bg3.jpg" },
    { game_id: "gk-3", name: "Cyberpunk 2077", platform: "Steam", region: "CIS", region_restriction: true, appid: 1091500, imageurl: "https://cdn.example.com/gk-cp2077.jpg" },
  ],
  keys: {
    "gk-1": [
      { key_id: "gk-1-std", name: "Elden Ring", price_usd: "59.99", stock: 101, min_order_quantity: 1, max_order_quantity: 10 },
      { key_id: "gk-1-dlx", name: "Elden Ring Deluxe Edition", price_usd: "79.99", stock: 12, min_order_quantity: 1, max_order_quantity: 5 },
    ],
    "gk-2": [
      { key_id: "gk-2-std", name: "Baldur's Gate 3", price_usd: "49.50", stock: 7, min_order_quantity: 1, max_order_quantity: 10 },
    ],
    "gk-3": [
      { key_id: "gk-3-std", name: "Cyberpunk 2077", price_usd: "29.99", stock: 44, min_order_quantity: 1, max_order_quantity: 10 },
    ],
  },
};

function send(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => { try { resolve(JSON.parse(d || "{}")); } catch { resolve({}); } });
  });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  const path = u.pathname;
  if (path === "/__log") return send(res, 200, { ok: true });
  if (path === "/__control" && req.method === "POST") {
    const b = await readBody(req);
    const g = state.games.find((x) => x.game_id === b.gameId);
    if (!g) return send(res, 404, { ok: false, error: "no game" });
    if (b.region !== undefined) g.region = b.region;
    if (b.platform !== undefined) g.platform = b.platform;
    if (Array.isArray(b.keys)) state.keys[b.gameId] = b.keys;
    return send(res, 200, { ok: true, game: g, keys: state.keys[b.gameId] });
  }
  if (!path.startsWith("/api/v2/")) return send(res, 404, { ok: false, error: "not found" });
  if (req.headers["x-api-key"] !== KEY) return send(res, 401, { ok: false, error: "Invalid API key" });
  const p = path.replace("/api/v2", "");
  if (p === "/balance") return send(res, 200, { ok: true, balance: "250.5000", currency: "USD" });
  if (p === "/me") return send(res, 200, { ok: true, id: 42, email: "mock@fzr.cards" });
  if (p === "/gamekeys") {
    const limit = Math.min(100, parseInt(u.searchParams.get("limit") || "100") || 100);
    const start = Math.max(0, parseInt(u.searchParams.get("cursor") || "0") || 0);
    const slice = state.games.slice(start, start + limit);
    const nextIdx = start + slice.length;
    return send(res, 200, {
      ok: true, kind: "game_key", items: slice,
      meta: { total: state.games.length, limit, next_cursor: nextIdx < state.games.length ? String(nextIdx) : null, has_more: nextIdx < state.games.length },
    });
  }
  if (p === "/gamekeys/keys") {
    const gid = u.searchParams.get("game_id") || "";
    const game = state.games.find((g) => g.game_id === gid);
    if (!game) return send(res, 404, { ok: false, error: "Game not found", code: "NOT_FOUND" });
    return send(res, 200, {
      ok: true, kind: "game_key", game_id: gid, GameName: game.name, region: game.region, platform: game.platform,
      region_restriction: game.region_restriction, appid: game.appid, imageurl: game.imageurl, keys: state.keys[gid] || [],
    });
  }
  return send(res, 404, { ok: false, error: "Unknown endpoint", code: "NOT_FOUND" });
});

server.listen(PORT, "127.0.0.1", () => console.log(`mock-fzr-mutable listening on ${PORT}`));
