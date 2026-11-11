/**
 * Mock BoltUtil theo ĐÚNG hợp đồng tài liệu chính thức (OpenAPI 2.1.0,
 * github.com/changye0413/boltutil) — chạy: node scripts/mock-boltutil.mjs
 * Cổng 3997. API key "bolt_test_key", webhook secret "boltwhsec_test".
 * Chỉ có 2 path: POST /api/v1/order/create + POST /api/v1/order/status.
 * Mọi request kiểm chữ ký HMAC-SHA256(secret, "<ts>.<raw body>").
 * Envelope { code, message, timestamp, data } — lỗi nghiệp vụ vẫn có thể
 * đi kèm HTTP 200 nên code là mốc phân biệt. Webhook phẳng ký bằng header
 * X-Bolt-Webhook-Timestamp / X-Bolt-Webhook-Signature, có eventId dedupe.
 * Điều khiển test: POST /__control {externalOrderId, status, paidAmount
 * (chấp nhận cả tên cũ actualReceivedAmount), settlementType, txHash
 * (chấp nhận cả paidTxHash)}; POST /__emit {url, externalOrderId} bắn
 * webhook đã ký; GET /__log xem log.
 */
import http from "node:http";
import crypto from "node:crypto";

const PORT = 3997;
const API_KEY = "bolt_test_key";
const SECRET = "boltwhsec_test";
const NETWORKS = ["TRC20", "ERC20", "BEP20", "POLYGON", "SOLANA", "BASE"];
const orders = new Map();
const log = [];
let seq = 0;

const sign = (ts, raw) => crypto.createHmac("sha256", SECRET).update(`${ts}.${raw}`).digest("hex");
const envelope = (code, message, data) => ({ code, message, timestamp: Date.now(), ...(data !== undefined ? { data } : {}) });

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
function statusData(o) {
  return {
    status: o.status,
    amount: String(o.amount),
    paidAmount: o.paidAmount != null ? String(o.paidAmount) : null,
    shortfallAmount: "0",
    settlementType: o.settlementType || "EXACT",
    paymentRoute: "DIRECT",
    platformFee: "0",
    merchantNetAmount: o.paidAmount != null ? String(o.paidAmount) : null,
    manuallyAccepted: (o.settlementType || "") === "MANUAL_UNDERPAID",
    externalOrderId: o.externalOrderId,
    txHash: o.txHash || null,
    destinationAddress: o.paymentAddress,
    confirmations: o.status === "CONFIRMED" || o.status === "COMPLETED" ? 20 : 0,
    currency: o.currency,
    network: o.network,
    paidAt: o.paidAt || null,
    confirmedAt: o.status === "CONFIRMED" || o.status === "COMPLETED" ? o.paidAt : null,
    completedAt: o.status === "COMPLETED" ? o.paidAt : null,
    metadata: {},
  };
}
function webhookPayload(o) {
  const d = statusData(o);
  return {
    // eventId ổn định theo (đơn + trạng thái + số đã trả): lần gửi lại của
    // cùng một sự kiện mang cùng eventId như cổng thật.
    eventId: `evt_mock_${crypto.createHash("sha256").update(`${o.externalOrderId}|${o.status}|${d.paidAmount}`).digest("hex").slice(0, 24)}`,
    externalOrderId: o.externalOrderId,
    status: o.status,
    network: o.network,
    currency: o.currency,
    amount: d.amount,
    paidAmount: d.paidAmount,
    shortfallAmount: d.shortfallAmount,
    settlementType: d.settlementType,
    manuallyAccepted: d.manuallyAccepted,
    destinationAddress: o.paymentAddress,
    txHash: o.txHash || null,
    metadata: {},
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
    const paid = b.paidAmount !== undefined ? b.paidAmount : b.actualReceivedAmount;
    if (paid !== undefined) o.paidAmount = paid;
    if (b.settlementType) o.settlementType = b.settlementType;
    const tx = b.txHash !== undefined ? b.txHash : b.paidTxHash;
    if (tx) o.txHash = tx;
    if ((o.status === "CONFIRMED" || o.status === "COMPLETED") && o.paidAmount == null) o.paidAmount = o.amount;
    if (o.status === "CONFIRMED" || o.status === "COMPLETED") o.paidAt = "2026-11-07 21:00:00";
    return send(res, 200, { ok: true, order: statusData(o) });
  }
  if (p === "/__emit") {
    const b = JSON.parse(raw || "{}");
    const o = orders.get(b.externalOrderId);
    if (!o) return send(res, 404, { error: "no order" });
    const payload = JSON.stringify(webhookPayload(o));
    const ts = String(Date.now());
    const r = await fetch(b.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Bolt-Webhook-Timestamp": ts, "X-Bolt-Webhook-Signature": sign(ts, payload) },
      body: payload,
    }).catch((e) => ({ status: 0, text: async () => String(e) }));
    return send(res, 200, { ok: true, webhookStatus: r.status, webhookBody: await r.text().catch(() => "") });
  }

  // Từ đây là API thật theo tài liệu — bắt buộc key + chữ ký đúng
  log.push({ method: req.method, path: p, body: raw ? JSON.parse(raw) : null });
  if (req.headers["x-bolt-key"] !== API_KEY) return send(res, 401, envelope(401, "invalid api key"));
  const ts = req.headers["x-bolt-timestamp"] || "";
  const sig = req.headers["x-bolt-signature"] || "";
  if (!ts || sign(ts, raw) !== sig) return send(res, 401, envelope(401, "invalid signature"));

  if (p === "/api/v1/order/create" && req.method === "POST") {
    const b = JSON.parse(raw || "{}");
    if (!/^[a-zA-Z0-9_-]{6,64}$/.test(String(b.externalOrderId || ""))) return send(res, 400, envelope(400, "externalOrderId must be 6-64 chars [A-Za-z0-9_-]"));
    if (!(Number(b.amount) >= 1)) return send(res, 400, envelope(400, "amount must be at least 1"));
    if (!NETWORKS.includes(b.network)) return send(res, 400, envelope(400, "unsupported network"));
    if (!["USDT", "USDC"].includes(b.currency || "")) return send(res, 400, envelope(400, "unsupported currency"));
    const expMin = b.expiredMinutes === undefined ? 30 : Number(b.expiredMinutes);
    if (!Number.isInteger(expMin) || expMin < 15 || expMin > 60) return send(res, 400, envelope(400, "expiredMinutes must be 15-60"));
    if (orders.has(b.externalOrderId)) return send(res, 400, envelope(400, "externalOrderId already exists"));
    seq++;
    const now = Date.now();
    const o = {
      externalOrderId: b.externalOrderId, orderToken: `btl_mock_${seq}`,
      amount: Number(b.amount), network: b.network, currency: b.currency,
      status: "PENDING", paymentAddress: "TMockBoltAddress123456789",
      paidAmount: null, settlementType: "EXACT", txHash: null, paidAt: null,
      expireTimestamp: now + expMin * 60000,
    };
    orders.set(o.externalOrderId, o);
    return send(res, 200, envelope(200, "OK", {
      orderToken: o.orderToken,
      merchantExternalId: o.externalOrderId,
      status: o.status,
      checkoutUrl: `http://127.0.0.1:${PORT}/pay/${o.orderToken}`,
      payment: {
        address: o.paymentAddress,
        amount: String(o.amount),
        rawAmount: String(o.amount),
        currency: o.currency,
        network: o.network,
        qrData: o.paymentAddress,
        decimal: 6,
      },
      time: { expireTimestamp: o.expireTimestamp, serverTimestamp: now },
      metadata: {},
    }));
  }
  if (p === "/api/v1/order/status" && req.method === "POST") {
    const b = JSON.parse(raw || "{}");
    const o = orders.get(b.externalOrderId);
    if (!o) return send(res, 404, envelope(404, "order not found"));
    return send(res, 200, envelope(200, "OK", statusData(o)));
  }
  return send(res, 404, envelope(404, "unknown endpoint"));
});

server.listen(PORT, "127.0.0.1", () => console.log(`mock-boltutil listening on ${PORT}`));
