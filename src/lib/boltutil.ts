import crypto from "crypto";
import { prisma } from "./db";
import { applyBalance } from "./wallet";
import { getSettings, calcBonus, bonusTiersFor, withSubdomain } from "./settings";

/**
 * Cổng BoltUtil (boltutil.com) — thay cơ chế nạp USDT thủ công (2026-11-07).
 * Không giữ tiền: USDT về thẳng ví nhận của shop (cấu hình trong dashboard
 * BoltUtil). Hợp đồng theo tài liệu chính thức (OpenAPI 2.1.0 tại
 * github.com/changye0413/boltutil + boltutil.com/docs): CHỈ có hai path
 * POST /api/v1/order/create và POST /api/v1/order/status. Mọi yêu cầu ký
 * HMAC-SHA256 bằng WEBHOOK SECRET trên chuỗi "<timestamp_ms>.<raw body>"
 * (thân rỗng -> "<timestamp>."). Envelope { code, message, timestamp,
 * data }: thành công phải gồm CẢ HTTP 2xx VÀ code === 200. Webhook phẳng
 * ký bằng header riêng X-Bolt-Webhook-Timestamp / X-Bolt-Webhook-Signature
 * (cùng công thức), có eventId để dedupe và BoltUtil có gửi lại khi lỗi.
 */

export type BoltConfig = {
  /** Tick mục đích "Nạp vào ví" + đủ key. */
  enabled: boolean;
  /** Đủ API key + webhook secret (dùng cho thanh toán trực tiếp kể cả khi tick nạp ví tắt). */
  configured: boolean;
  apiKey: string;
  webhookSecret: string;
  apiUrl: string;
  defaultNetwork: string;
  expiresMinutes: number;
  paymentMethod: string;
};

/** Mã mạng nội bộ của web (giữ nguyên cho dữ liệu đã lưu + UI). */
export const BOLT_NETWORKS = ["TRON", "BSC", "ETHEREUM", "POLYGON", "SOLANA", "BASE"] as const;

/**
 * Ánh xạ sang mã mạng trong tài liệu BoltUtil: TRC20, ERC20, BEP20,
 * POLYGON, SOLANA, BASE (tài liệu KHÔNG hỗ trợ Arbitrum). Ánh xạ chỉ diễn
 * ra ở biên API — dữ liệu lưu trữ + giao diện vẫn dùng mã nội bộ.
 */
const BOLT_API_NETWORK: Record<string, string> = {
  TRON: "TRC20", ETHEREUM: "ERC20", BSC: "BEP20",
  POLYGON: "POLYGON", SOLANA: "SOLANA", BASE: "BASE",
};
export function boltApiNetwork(internal: string): string {
  return BOLT_API_NETWORK[String(internal || "").toUpperCase()] || "TRC20";
}

/** Các mạng BoltUtil đang được phép hiển thị cho khách (setting boltutil_networks). */
export function boltEnabledNetworks(s: Record<string, string>): string[] {
  const list = String(s.boltutil_networks || "TRON").split(",").map((x) => x.trim().toUpperCase()).filter((x) => (BOLT_NETWORKS as readonly string[]).includes(x));
  return list.length ? list : ["TRON"];
}

export async function getBoltConfig(): Promise<BoltConfig> {
  const s = await getSettings();
  const exp = parseInt(s.boltutil_expires_minutes || "30") || 30;
  return {
    enabled: s.boltutil_enabled === "1" && !!s.boltutil_api_key && !!s.boltutil_webhook_secret,
    configured: !!s.boltutil_api_key && !!s.boltutil_webhook_secret,
    apiKey: s.boltutil_api_key || "",
    webhookSecret: s.boltutil_webhook_secret || "",
    apiUrl: (s.boltutil_api_url || "https://api.boltutil.com").replace(/\/+$/, ""),
    defaultNetwork: BOLT_NETWORKS.includes((s.boltutil_default_network || "TRON") as any) ? s.boltutil_default_network : "TRON",
    // Tài liệu: expiredMinutes là số nguyên 15–60 (mặc định 30; gói free cố định 30).
    expiresMinutes: Math.min(60, Math.max(15, exp)),
    paymentMethod: s.boltutil_payment_method === "WALLET" ? "WALLET" : "MANUAL_TRANSFER",
  };
}

export function boltSign(secret: string, timestamp: string | number, rawBody: string): string {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export function boltVerifySignature(secret: string, timestamp: string, rawBody: string, signature: string): boolean {
  if (!secret || !timestamp || !signature) return false;
  const ts = parseInt(timestamp, 10);
  if (!ts || Math.abs(Date.now() - ts) > 5 * 60 * 1000) return false;
  const expected = boltSign(secret, timestamp, rawBody);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature.toLowerCase());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export class BoltError extends Error {
  httpStatus: number;
  constructor(message: string, httpStatus: number) { super(message); this.httpStatus = httpStatus; }
}

async function boltFetch<T = any>(cfg: BoltConfig, method: "GET" | "POST", path: string, body?: Record<string, unknown>): Promise<T> {
  const rawBody = body ? JSON.stringify(body) : "";
  const ts = String(Date.now());
  const res = await fetch(`${cfg.apiUrl}${path}`, {
    method,
    headers: {
      "X-Bolt-Key": cfg.apiKey,
      "X-Bolt-Timestamp": ts,
      "X-Bolt-Signature": boltSign(cfg.webhookSecret, ts, rawBody),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? rawBody : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  }).catch((e: any) => { throw new BoltError(`BoltUtil lỗi mạng: ${String(e?.message || e)}`, 0); });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* giữ null */ }
  if (!res.ok) throw new BoltError(String(json?.message || json?.error || `BoltUtil HTTP ${res.status}`), res.status);
  // Tài liệu: HTTP 200 vẫn có thể mang lỗi nghiệp vụ — chỉ thành công khi
  // envelope code === 200; payload thật nằm trong trường "data".
  if (json && typeof json.code === "number" && json.code !== 200) {
    throw new BoltError(String(json.message || `BoltUtil code ${json.code}`), json.code);
  }
  return ((json && typeof json === "object" && "data" in json) ? json.data : (json ?? {})) as T;
}

/**
 * Kiểm tra kết nối (nút Kiểm tra ở trang cấu hình). Tài liệu KHÔNG có
 * endpoint ping — dùng chính POST /api/v1/order/status với một mã dò cố
 * định: 404 (không thấy đơn) nghĩa là key + chữ ký đã được chấp nhận;
 * 401 mới là sai thông tin xác thực.
 */
export async function boltPing(cfg: BoltConfig): Promise<any> {
  try {
    await boltFetch(cfg, "POST", "/api/v1/order/status", { externalOrderId: "SMMV2PING000001" });
    return { ok: true, detail: "BoltUtil phản hồi (đơn dò tồn tại)" };
  } catch (e: any) {
    if (e instanceof BoltError && e.httpStatus === 404) return { ok: true, detail: "Kết nối + chữ ký hợp lệ (đơn dò không tồn tại — đúng như kỳ vọng)" };
    throw e;
  }
}

export type BoltOrderCreated = {
  orderId: string;
  checkoutUrl?: string;
  paymentUrl?: string;
  paymentAddress?: string;
  cryptoAmount?: string | number;
  status?: string;
  expiresAt?: string;
};

/**
 * Tạo đơn theo tài liệu: POST /api/v1/order/create. amount là số USDT
 * (tối thiểu 1, tối đa 6 chữ số thập phân); externalOrderId 6–64 ký tự
 * [A-Za-z0-9_-], trùng mã -> HTTP 400 (phải hỏi lại đơn gốc, không tạo
 * mã mới). notifyUrl phải là HTTPS công khai. Số phải trả CHÍNH XÁC lấy
 * từ payment.amount của phản hồi (BoltUtil có thể cộng một lệch thập
 * phân nhỏ để đối soát) — không tự làm tròn/cắt.
 */
export async function boltCreateOrder(cfg: BoltConfig, input: { externalOrderId: string; amountUsd: number; network: string; returnPath?: string }): Promise<BoltOrderCreated> {
  const { siteOrigin, gatewaySiteName } = await import("./payments");
  // Ngoài request scope (script kiểm thử) headers() không dùng được -> địa chỉ dự phòng.
  const origin = await siteOrigin().catch(() => (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, ""));
  const siteName = await gatewaySiteName().catch(() => "BNT Shop");
  const data: any = await boltFetch(cfg, "POST", "/api/v1/order/create", {
    amount: input.amountUsd,
    externalOrderId: input.externalOrderId,
    network: boltApiNetwork(input.network),
    currency: "USDT",
    // URL báo về chuẩn tên miền con (đợt 127): webhook.<gốc> — route vẫn
    // trả lời song song ở miền gốc nên đơn tạo trước đây không bị ảnh
    // hưởng; returnUrl giữ nguyên miền gốc (trang khách quay về).
    notifyUrl: `${withSubdomain(origin, "webhook")}/api/webhooks/boltutil`,
    returnUrl: `${origin}${input.returnPath || "/dashboard/nap-tien"}`,
    expiredMinutes: cfg.expiresMinutes,
    orderDesc: `${siteName} ${input.externalOrderId}`,
  });
  return {
    orderId: String(data?.orderToken || ""),
    checkoutUrl: data?.checkoutUrl || undefined,
    paymentAddress: data?.payment?.address || undefined,
    cryptoAmount: data?.payment?.amount != null ? String(data.payment.amount) : undefined,
    status: data?.status || "PENDING",
    expiresAt: data?.time?.expireTimestamp ? new Date(Number(data.time.expireTimestamp)).toISOString() : undefined,
  };
}

/** Hỏi trạng thái: POST /api/v1/order/status { externalOrderId } — trả trạng thái ĐÃ LƯU phía BoltUtil. */
export async function boltGetStatus(cfg: BoltConfig, externalOrderId: string): Promise<any> {
  return boltFetch(cfg, "POST", "/api/v1/order/status", { externalOrderId });
}

/* ---------------- Đối soát + cộng tiền ---------------- */

export function parseBoltData(dep: { providerData?: string | null }): Record<string, any> {
  try { return dep.providerData ? JSON.parse(dep.providerData) : {}; } catch { return {}; }
}

async function saveBoltData(depositId: number, patch: Record<string, unknown>) {
  const dep = await prisma.deposit.findUnique({ where: { id: depositId }, select: { providerData: true } });
  const merged = { ...parseBoltData(dep || {}), ...patch };
  await prisma.deposit.update({ where: { id: depositId }, data: { providerData: JSON.stringify(merged) } });
}

/**
 * Cộng tiền cho 1 yêu cầu nạp BoltUtil từ payload trạng thái (webhook hoặc poll
 * dùng CHUNG hàm này). Chỉ hành động ở CONFIRMED/COMPLETED; cộng đúng 1 lần nhờ
 * claim nguyên tử PENDING -> APPROVED. Số VND cộng từ SỐ THỰC NHẬN theo tài
 * liệu (paidAmount trên webhook/trạng thái; merchantNetAmount = số ròng sau
 * phí trên phản hồi trạng thái) × tỉ giá ĐÃ CHỤP trên yêu cầu lúc tạo — không
 * đọc lại setting lúc đối soát. Trường actualReceivedAmount KHÔNG có trong
 * tài liệu hiện hành — chỉ giữ làm dự phòng cuối cho dữ liệu cũ. Thưởng nạp
 * tính trên số VND thực cộng như nạp USDT thủ công trước đây.
 */
export async function settleBoltutilDeposit(depositId: number, payload: any): Promise<{ ok: boolean; reason: string }> {
  const dep = await prisma.deposit.findUnique({ where: { id: depositId } });
  if (!dep || dep.method !== "USDT") return { ok: false, reason: "not_found" };
  const data = parseBoltData(dep);
  const status = String(payload?.status || "").toUpperCase();

  if (status === "EXPIRED" || status === "FAILED") {
    await prisma.deposit.updateMany({
      where: { id: dep.id, status: "PENDING" },
      data: { status: "REJECTED", adminNote: `BoltUtil: ${status === "EXPIRED" ? "hết hạn thanh toán" : "giao dịch thất bại"}` },
    });
    await saveBoltData(dep.id, { boltStatus: status });
    return { ok: true, reason: status.toLowerCase() };
  }
  if (status !== "CONFIRMED" && status !== "COMPLETED") {
    await saveBoltData(dep.id, { boltStatus: status || data.boltStatus });
    return { ok: false, reason: "not_final" };
  }
  if (dep.status === "APPROVED") return { ok: true, reason: "already" };
  if (dep.status !== "PENDING") return { ok: false, reason: "not_pending" };

  const rate = Number(data.rateVndPerUsd) || 0;
  const actualUsd = [payload?.paidAmount, payload?.merchantNetAmount, payload?.actualReceivedAmount]
    .map((x) => (x === undefined || x === null || x === "" ? NaN : Number(x)))
    .find((x) => Number.isFinite(x) && x > 0);
  const expectedUsd = dep.usdCents != null ? dep.usdCents / 100 : NaN;
  let creditedVnd: number;
  if (actualUsd !== undefined && rate > 0) {
    creditedVnd = Math.abs(actualUsd - expectedUsd) < 0.005 ? dep.amount : Math.round(actualUsd * rate);
  } else {
    creditedVnd = dep.amount;
  }
  if (creditedVnd <= 0) return { ok: false, reason: "bad_amount" };

  const settings = await getSettings();
  const bonus = calcBonus(creditedVnd, bonusTiersFor(null, false, settings.deposit_bonus_tiers));
  const credited = await prisma.$transaction(async (tx) => {
    const claim = await tx.deposit.updateMany({
      where: { id: dep.id, status: "PENDING" },
      data: { status: "APPROVED", amount: creditedVnd, bonus, auto: true },
    });
    if (claim.count !== 1) return false;
    await applyBalance(tx, dep.userId, creditedVnd, "DEPOSIT", dep.code, "Nạp USDT qua BoltUtil");
    if (bonus > 0) await applyBalance(tx, dep.userId, bonus, "BONUS", dep.code, "Thưởng nạp tiền");
    return true;
  });
  await saveBoltData(dep.id, {
    boltStatus: status,
    // Tài liệu đặt tên trường là txHash (webhook + trạng thái); paidTxHash chỉ là dự phòng dữ liệu cũ.
    paidTxHash: payload?.txHash || payload?.paidTxHash || data.paidTxHash || null,
    settlementType: payload?.settlementType || data.settlementType || null,
    actualReceivedAmount: actualUsd ?? data.actualReceivedAmount ?? null,
    creditedVnd,
  });
  if (credited) {
    const { alertMother } = await import("./alerts");
    await alertMother("deposit_success", "Nạp USDT (BoltUtil) thành công", `+${creditedVnd.toLocaleString("vi-VN")}đ — mã ${dep.code}`).catch(() => {});
    const { notifyUser } = await import("./notify");
    await notifyUser(dep.userId, "Nạp tiền thành công", `Yêu cầu ${dep.code}: +${creditedVnd.toLocaleString("vi-VN")}đ vào ví`, "/dashboard/nap-tien").catch(() => {});
    // Đợt 119: mail nạp tiền thành công cho khách (BoltUtil USDT).
    const { sendCustomerMail } = await import("./customer-mail");
    const { vnd } = await import("./format");
    const u = await prisma.user.findUnique({ where: { id: dep.userId }, select: { balance: true } }).catch(() => null);
    void sendCustomerMail(dep.userId, "deposit_success", {
      deposit_code: dep.code, amount: vnd(creditedVnd), bonus: vnd(bonus), balance: vnd(u?.balance ?? 0),
    });
    const { evaluateUserRisk } = await import("./risk");
    void evaluateUserRisk(dep.userId).catch(() => {});
  }
  return { ok: credited, reason: credited ? "credited" : "raced" };
}

/** Hỏi trạng thái 1 yêu cầu nạp phía BoltUtil rồi đối soát (cron + nút admin + trang khách tự làm mới). */
export async function pollBoltutilDeposit(depositId: number): Promise<{ ok: boolean; reason: string }> {
  const dep = await prisma.deposit.findUnique({ where: { id: depositId } });
  if (!dep || dep.status !== "PENDING") return { ok: false, reason: "not_pending" };
  const data = parseBoltData(dep);
  const externalOrderId = String(data.externalOrderId || "");
  if (!externalOrderId) return { ok: false, reason: "no_external_id" };
  const cfg = await getBoltConfig();
  if (!cfg.apiKey || !cfg.webhookSecret) return { ok: false, reason: "not_configured" };
  const payload = await boltGetStatus(cfg, externalOrderId);
  return settleBoltutilDeposit(depositId, payload);
}
