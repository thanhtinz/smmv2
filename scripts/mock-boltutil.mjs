/**
 * Mock BoltUtil (không có sandbox thật) — chạy: node scripts/mock-boltutil.mjs
 * Cổng 3997. API key "bolt_test_key", webhook secret "boltwhsec_test".
 * Kiểm chữ ký HMAC-SHA256(secret, "<ts>.<raw body>") đúng như cổng thật.
 * Điều khiển test: POST /__control {externalOrderId, status, actualReceivedAmount,
 * settlementType, paidTxHash} để đổi trạng thái đơn; POST /__emit {url,
 * externalOrderId} để bắn webhook đã ký tới URL chỉ định; GET /__log xem log.
 */
import http from "node:http";
import crypto from "node:crypto";

const PORT = 3997;
const API_KEY = "bolt_test_key";
const SECRET = "boltwhsec_test";
const orders = new Map();
const log = [];
let seq = 0;

const sign = (ts, raw) => crypto.createHmac("sha256", SECRET).update(`${ts}.${raw}`).digest("hex");

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });
}
function send(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}
function statusPayload(o) {
  return {
    externalOrderId: o.externalOrderId, orderId: o.orderId, status: o.status,
    amount: o.amount, amountCurrency: "USD", cryptoAmount: o.cryptoAmount,
    currency: "USDT", network: o.network,
    paidAmount: o.status === "PENDING" || o.status === "EXPIRED" ? null : (o.actualReceivedAmount ?? o.amount),
    actualReceivedAmount: o.actualReceivedAmount ?? null,
    merchantNetAmount: o.actualReceivedAmount ?? null,
    settlementType: o.settlementType || "EXACT",
    paidTxHash: o.paidTxHash || null,
    paymentRoute: "DIRECT", platformFee: 0, manuallyAccepted: false,
    createdAt: o.createdAt, paidAt: o.paidAt || null, expiresAt: o.expiresAt,
  };
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const p = u.pathname;
  const raw = await readBody(req);

  if (p === "/__log") return send(res, 200, { log });
  if (p === "/__control") {
    const b = JSON.parse(raw || "{}");
    const o = orders.get(b.externalOrderId);
    if (!o) return send(res, 404, { error: "no order" });
    if (b.status) o.status = b.status;
    if (b.actualReceivedAmount !== undefined) o.actualReceivedAmount = b.actualReceivedAmount;
    if (b.settlementType) o.settlementType = b.settlementType;
    if (b.paidTxHash) o.paidTxHash = b.paidTxHash;
    if (o.status === "CONFIRMED" || o.status === "COMPLETED") o.paidAt = "2026-11-07 21:00:00";
    return send(res, 200, { ok: true, order: statusPayload(o) });
  }
  if (p === "/__emit") {
    const b = JSON.parse(raw || "{}");
    const o = orders.get(b.externalOrderId);
    if (!o) return send(res, 404, { error: "no order" });
    const payload = JSON.stringify(statusPayload(o));
    const ts = String(Date.now());
    const r = await fetch(b.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Bolt-Timestamp": ts, "X-Bolt-Signature": sign(ts, payload) },
      body: payload,
    }).catch((e) => ({ status: 0, text: async () => String(e) }));
    return send(res, 200, { ok: true, webhookStatus: r.status, webhookBody: await r.text().catch(() => "") });
  }

  // Từ đây là API thật — bắt buộc key + chữ ký đúng
  log.push({ method: req.method, path: p, body: raw ? JSON.parse(raw) : null });
  if (req.headers["x-bolt-key"] !== API_KEY) return send(res, 401, { error: "invalid api key" });
  const ts = req.headers["x-bolt-timestamp"] || "";
  const sig = req.headers["x-bolt-signature"] || "";
  if (!ts || sign(ts, raw) !== sig) return send(res, 401, { error: "invalid signature" });

  if (p === "/api/v1/ping") return send(res, 200, { ok: true, pong: true });
  if (p === "/api/v1/orders" && req.method === "POST") {
    const b = JSON.parse(raw || "{}");
    if (!b.externalOrderId || !(Number(b.amount) >= 0.01)) return send(res, 400, { error: "invalid order" });
    if (orders.has(b.externalOrderId)) return send(res, 400, { error: "duplicate externalOrderId" });
    seq++;
    const o = {
      externalOrderId: b.externalOrderId, orderId: `btl_mock_${seq}`,
      amount: b.amount, network: b.network || "TRON", currency: b.currency || "USDT",
      cryptoAmount: String(b.amount), status: "PENDING",
      paymentAddress: "TMockBoltAddress123456789", actualReceivedAmount: null, settlementType: "EXACT", paidTxHash: null,
      createdAt: "2026-11-07 20:00:00", paidAt: null,
      expiresAt: new Date(Date.now() + (b.expiresMinutes || 30) * 60000).toISOString(),
    };
    orders.set(o.externalOrderId, o);
    return send(res, 200, { orderId: o.orderId, checkoutUrl: `http://127.0.0.1:${PORT}/pay/${o.orderId}`, paymentUrl: `http://127.0.0.1:${PORT}/pay/${o.orderId}`, paymentAddress: o.paymentAddress, cryptoAmount: o.cryptoAmount, status: o.status, expiresAt: o.expiresAt });
  }
  const m = p.match(/^\/api\/v1\/orders\/(.+)\/status$/);
  if (m && req.method === "GET") {
    const o = orders.get(decodeURIComponent(m[1]));
    if (!o) return send(res, 404, { error: "not found" });
    return send(res, 200, statusPayload(o));
  }
  if (p === "/api/v1/webhooks/resend" && req.method === "POST") return send(res, 200, { ok: true, resent: true });
  return send(res, 404, { error: "unknown endpoint" });
});

server.listen(PORT, "127.0.0.1", () => console.log(`mock-boltutil listening on ${PORT}`));
