import { prisma } from "./db";
import { getSettings } from "./settings";
import { notifyUser } from "./notify";
import { alertMother } from "./alerts";

/* Fraud Detection + Risk Score 0-100 (bảo mật Enterprise GĐ3).
   Điểm tính từ dữ liệu THẬT của hệ thống (LoginEvent, Deposit, SmmOrder,
   PremiumOrder, Transaction, ApiLog, IpBan, LoginThrottle). Trọng số + ngưỡng
   hành động đều nằm trong Settings (Admin chỉnh ở Trung tâm bảo mật) — code chỉ
   giữ TRẦN điểm mỗi tín hiệu để một tín hiệu không nuốt trọn thang 100.
   Hành động theo ngưỡng:
   - >= risk_watch (40): theo dõi — hiện ở Trung tâm bảo mật.
   - >= risk_restrict (70): CHẶN tạo đơn SMM/Premium + tạo lệnh nạp mới.
   - >= risk_critical (90): cấp CRITICAL chờ admin duyệt — KHÔNG tự khoá tiền,
     KHÔNG tự ban tài khoản.
   Admin/chủ panel "đánh dấu đã duyệt" (riskReviewedAt): tài khoản không bị hạn
   chế lại cho tới khi xuất hiện TÍN HIỆU MỚI (RiskEvent kind=signal) sau mốc đó. */

export type RiskFactor = { key: string; label: string; points: number; vars?: Record<string, number> };
export type RiskThresholds = { watch: number; restrict: number; critical: number };

export const RISK_RESTRICT_MESSAGE =
  "Tài khoản của bạn đang được kiểm tra an toàn nên tạm thời chưa thể tạo đơn/nạp tiền mới. Vui lòng liên hệ hỗ trợ nếu cần gấp.";

function w(s: Record<string, string>, key: string, dflt: number): number {
  const n = parseInt(s[key] || "");
  return Number.isFinite(n) && n >= 0 ? n : dflt;
}

export async function riskThresholds(): Promise<RiskThresholds> {
  const s = await getSettings().catch(() => ({} as Record<string, string>));
  return {
    watch: w(s, "risk_watch", 40),
    restrict: w(s, "risk_restrict", 70),
    critical: w(s, "risk_critical", 90),
  };
}

export function levelForScore(score: number, th: RiskThresholds): string {
  if (score >= th.critical) return "CRITICAL";
  if (score >= th.restrict) return "HIGH";
  if (score >= th.watch) return "MEDIUM";
  return "LOW";
}

/** Có tín hiệu rủi ro MỚI sau mốc admin đã duyệt không (điều kiện để hạn chế lại) */
async function hasSignalAfter(userId: number, since: Date | null): Promise<boolean> {
  if (!since) return true;
  const n = await prisma.riskEvent.count({ where: { userId, kind: "signal", createdAt: { gt: since } } });
  return n > 0;
}

/** Tài khoản có đang bị hạn chế giao dịch theo điểm rủi ro không.
 *  Quản trị (ADMIN/STAFF) không bị hạn chế; đã được duyệt + chưa có tín hiệu mới
 *  thì không hạn chế dù điểm vẫn cao. */
export async function isRiskRestricted(userId: number): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, riskScore: true, riskReviewedAt: true },
  }).catch(() => null);
  if (!user || user.role === "ADMIN" || user.role === "STAFF") return false;
  const th = await riskThresholds();
  if (user.riskScore < th.restrict) return false;
  return hasSignalAfter(userId, user.riskReviewedAt);
}

/** Chốt chặn dùng trong các luồng tạo đơn/nạp: ném lỗi thân thiện khi bị hạn chế */
export async function assertNotRiskRestricted(userId: number): Promise<void> {
  if (await isRiskRestricted(userId)) throw new Error(RISK_RESTRICT_MESSAGE);
}

/** Tính lại điểm rủi ro cho 1 tài khoản. KHÔNG bao giờ ném lỗi ra ngoài — lỗi tính
 *  điểm không được làm hỏng luồng đăng nhập/đặt đơn đang gọi nó. */
export async function evaluateUserRisk(userId: number): Promise<{ score: number; level: string; factors: RiskFactor[]; restricted: boolean } | null> {
  try {
    return await evaluateInner(userId);
  } catch (e) {
    console.error("[risk] evaluateUserRisk lỗi:", e);
    return null;
  }
}

async function evaluateInner(userId: number) {
  const s = await getSettings();
  const th = { watch: w(s, "risk_watch", 40), restrict: w(s, "risk_restrict", 70), critical: w(s, "risk_critical", 90) };
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, createdAt: true, riskScore: true, riskFactors: true, riskReviewedAt: true },
  });
  if (!user) return null;
  const now = Date.now();
  const h1 = new Date(now - 3600 * 1000);
  const h24 = new Date(now - 24 * 3600 * 1000);
  const d7 = new Date(now - 7 * 24 * 3600 * 1000);
  const d30 = new Date(now - 30 * 24 * 3600 * 1000);
  const d90 = new Date(now - 90 * 24 * 3600 * 1000);
  const factors: RiskFactor[] = [];
  const add = (key: string, label: string, points: number, vars?: Record<string, number>) => { if (points > 0) factors.push({ key, label, points, vars }); };

  // (a) Nhiều tài khoản dùng chung IP / thiết bị đăng nhập (30 ngày)
  const myLogins = await prisma.loginEvent.findMany({
    where: { userId, success: true, createdAt: { gte: d30 } },
    select: { ip: true, deviceHash: true }, take: 100,
  });
  const ips = Array.from(new Set(myLogins.map((e) => e.ip).filter(Boolean)));
  const hashes = Array.from(new Set(myLogins.map((e) => e.deviceHash).filter(Boolean) as string[]));
  if (ips.length || hashes.length) {
    const others = await prisma.loginEvent.findMany({
      where: {
        userId: { not: userId }, success: true, createdAt: { gte: d30 },
        OR: [...(ips.length ? [{ ip: { in: ips } }] : []), ...(hashes.length ? [{ deviceHash: { in: hashes } }] : [])],
      },
      select: { userId: true }, distinct: ["userId"], take: 50,
    });
    const shared = others.filter((e) => e.userId != null).length;
    add("shared_identity", "{n} tài khoản khác dùng chung IP/thiết bị đăng nhập", Math.min(30, shared * w(s, "risk_w_shared", 10)), { n: shared });
  }

  // (b) Đăng nhập thất bại dồn dập + đang bị khoá tạm
  const fails = await prisma.loginEvent.count({ where: { userId, success: false, createdAt: { gte: d7 } } });
  add("failed_logins", "Đăng nhập thất bại {n} lần trong 7 ngày", Math.min(20, fails * w(s, "risk_w_faillogin", 3)), { n: fails });
  const throttle = await prisma.loginThrottle.findUnique({ where: { key: `user|${user.username.toLowerCase()}` } }).catch(() => null);
  if (throttle?.lockedUntil && throttle.lockedUntil.getTime() > now) {
    add("login_locked", "Tài khoản đang bị khoá tạm vì đăng nhập sai nhiều lần", w(s, "risk_w_login_locked", 15));
  }

  // (b2) IP đăng nhập gần đây nằm trong danh sách cấm IP
  if (ips.length) {
    const banned = await prisma.ipBan.count({ where: { ip: { in: ips } } });
    if (banned > 0) add("ip_banned", "IP đăng nhập của tài khoản nằm trong danh sách cấm IP", w(s, "risk_w_ipban", 25));
  }

  // (c) Bất thường nạp tiền
  const depTotal = await prisma.deposit.count({ where: { userId, createdAt: { gte: d90 } } });
  const depRejected = await prisma.deposit.count({ where: { userId, status: "REJECTED", createdAt: { gte: d90 } } });
  if (depTotal >= 3 && depRejected / depTotal >= 0.5) {
    add("deposit_reject_ratio", "Tỉ lệ lệnh nạp bị từ chối cao ({a}/{b} lệnh)", Math.round(w(s, "risk_w_deposit_reject", 30) * (depRejected / depTotal)), { a: depRejected, b: depTotal });
  }
  const dep24 = await prisma.deposit.count({ where: { userId, createdAt: { gte: h24 } } });
  if (dep24 >= w(s, "risk_deposit_velocity_count", 8)) {
    add("deposit_velocity", "Tạo {n} lệnh nạp trong 24 giờ", w(s, "risk_w_deposit_velocity", 20), { n: dep24 });
  }
  const ageDays = (now - user.createdAt.getTime()) / 86400000;
  if (ageDays < w(s, "risk_young_days", 7)) {
    const big = await prisma.deposit.count({ where: { userId, status: "APPROVED", amount: { gte: w(s, "risk_big_deposit_vnd", 5000000) } } });
    if (big > 0) add("young_big_deposit", "Tài khoản mới nhưng đã nạp một lần số tiền lớn", w(s, "risk_w_young_big", 15));
  }

  // (d) Spam đơn + tỉ lệ huỷ/hoàn cao
  const orders1h = await prisma.smmOrder.count({ where: { userId, createdAt: { gte: h1 } } })
    + await prisma.premiumOrder.count({ where: { userId, createdAt: { gte: h1 } } });
  if (orders1h >= w(s, "risk_order_burst_count", 20)) {
    add("order_burst", "Tạo {n} đơn trong 1 giờ", w(s, "risk_w_order_burst", 20), { n: orders1h });
  }
  const ordTotal = await prisma.smmOrder.count({ where: { userId, createdAt: { gte: d90 } } });
  if (ordTotal >= 10) {
    const ordBad = await prisma.smmOrder.count({ where: { userId, status: { in: ["CANCELED", "REFUNDED"] }, createdAt: { gte: d90 } } });
    if (ordBad / ordTotal >= 0.4) {
      add("cancel_ratio", "Tỉ lệ đơn huỷ/hoàn cao ({a}/{b} đơn)", Math.round(w(s, "risk_w_cancel_ratio", 20) * (ordBad / ordTotal)), { a: ordBad, b: ordTotal });
    }
  }

  // (e) Lạm dụng API: lỗi gọi /api/v2 (key bị chặn IP, gọi lỗi) trong 24 giờ
  const apiErr = await prisma.apiLog.count({ where: { kind: "reseller_in", ref: `user:${userId}`, ok: false, createdAt: { gte: h24 } } });
  if (apiErr >= w(s, "risk_api_error_count", 50)) {
    add("api_errors", "API key bị lỗi/chặn {n} lần trong 24 giờ", w(s, "risk_w_api_errors", 20), { n: apiErr });
  }

  // (f) Lạm dụng hoàn tiền / bảo hành trong 30 ngày
  const refunds = await prisma.transaction.count({ where: { userId, type: "REFUND", createdAt: { gte: d30 } } })
    + await prisma.premiumOrder.count({ where: { userId, status: "REFUNDED", updatedAt: { gte: d30 } } });
  if (refunds >= 3) add("refund_abuse", "Hoàn tiền/bảo hành {n} lần trong 30 ngày", w(s, "risk_w_refunds", 20), { n: refunds });

  factors.sort((a, b) => b.points - a.points);
  const score = Math.min(100, factors.reduce((sum, f) => sum + f.points, 0));
  const level = levelForScore(score, th);
  const prevScore = user.riskScore;
  const prevKeys = new Set(((user.riskFactors as RiskFactor[] | null) || []).map((f) => f.key));
  const newKeys = factors.map((f) => f.key).filter((k) => !prevKeys.has(k));
  const wasRestricted = prevScore >= th.restrict && (await hasSignalAfter(userId, user.riskReviewedAt));

  await prisma.user.update({
    where: { id: userId },
    data: { riskScore: score, riskLevel: level, riskFactors: factors as any, riskUpdatedAt: new Date() },
  });

  // Tín hiệu đáng ghi: điểm lệch >= 5 hoặc xuất hiện yếu tố mới
  if (Math.abs(score - prevScore) >= 5 || newKeys.length > 0) {
    await prisma.riskEvent.create({
      data: {
        userId, kind: "signal", points: score - prevScore, score,
        detail: factors.slice(0, 3).map((f) => `${riskFactorLabelVi(f)} (+${f.points})`).join("; ") || "Không còn yếu tố rủi ro",
      },
    }).catch(() => {});
  }

  const restricted = score >= th.restrict && (await hasSignalAfter(userId, user.riskReviewedAt));
  if (restricted && !wasRestricted) {
    await prisma.riskEvent.create({
      data: { userId, kind: "restricted", points: 0, score, detail: `Điểm rủi ro ${score} vượt ngưỡng hạn chế ${th.restrict} — đã chặn tạo đơn/nạp mới` },
    }).catch(() => {});
    const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } }).catch(() => []);
    for (const a of admins) {
      await notifyUser(a.id, "Tài khoản rủi ro cao đã bị hạn chế", `${user.username} đạt ${score} điểm rủi ro — hệ thống đã chặn tạo đơn/nạp mới, chờ duyệt ở Trung tâm bảo mật.`, "/admin/trung-tam-bao-mat", "security").catch(() => {});
    }
    void alertMother("risk", `Tài khoản rủi ro cao: ${user.username}`, `Điểm rủi ro ${score}/100 — đã tự động hạn chế tạo đơn/nạp mới. Vào Trung tâm bảo mật để duyệt.`);
  }
  return { score, level, factors, restricted };
}

/** Đánh dấu admin/chủ panel đã duyệt: gỡ hạn chế cho tới khi có tín hiệu mới */
export async function markRiskReviewed(userId: number, byLabel: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { riskScore: true } });
  if (!user) return;
  await prisma.user.update({ where: { id: userId }, data: { riskReviewedAt: new Date() } });
  await prisma.riskEvent.create({
    data: { userId, kind: "reviewed", points: 0, score: user.riskScore, detail: `Đã duyệt bởi ${byLabel} — gỡ hạn chế cho tới khi có tín hiệu mới` },
  }).catch(() => {});
}

/* ---------- Hiển thị đa ngôn ngữ cho nhãn rủi ro ----------
   Từ GĐ3 đợt quét ngôn ngữ: label của yếu tố lưu dạng MẪU có biến ({n}, {a}, {b})
   + vars riêng, để dịch lúc HIỂN THỊ theo ngôn ngữ đang chọn thay vì nướng cứng
   tiếng Việt vào DB. Dữ liệu cũ (label đã nướng số, detail của RiskEvent) được
   nhận diện bằng mẫu regex và dịch tương đương — không cần migrate. */

export const RISK_LEVEL_LABEL: Record<string, string> = {
  LOW: "Thấp", MEDIUM: "Trung bình", HIGH: "Cao", CRITICAL: "Nghiêm trọng",
};

function fillTpl(tpl: string, vars?: Record<string, number | string>): string {
  if (!vars) return tpl;
  return tpl.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
}

/** Nhãn tiếng Việt đã thay số — dùng khi GHI RiskEvent.detail (giữ nguyên định dạng cũ) */
export function riskFactorLabelVi(f: RiskFactor): string {
  return fillTpl(f.label, f.vars);
}

const LEGACY_FACTOR_PATTERNS: { re: RegExp; tpl: string; names: string[] }[] = [
  { re: /^(\d+) tài khoản khác dùng chung IP\/thiết bị đăng nhập$/, tpl: "{n} tài khoản khác dùng chung IP/thiết bị đăng nhập", names: ["n"] },
  { re: /^Đăng nhập thất bại (\d+) lần trong 7 ngày$/, tpl: "Đăng nhập thất bại {n} lần trong 7 ngày", names: ["n"] },
  { re: /^Tỉ lệ lệnh nạp bị từ chối cao \((\d+)\/(\d+) lệnh\)$/, tpl: "Tỉ lệ lệnh nạp bị từ chối cao ({a}/{b} lệnh)", names: ["a", "b"] },
  { re: /^Tạo (\d+) lệnh nạp trong 24 giờ$/, tpl: "Tạo {n} lệnh nạp trong 24 giờ", names: ["n"] },
  { re: /^Tạo (\d+) đơn trong 1 giờ$/, tpl: "Tạo {n} đơn trong 1 giờ", names: ["n"] },
  { re: /^Tỉ lệ đơn huỷ\/hoàn cao \((\d+)\/(\d+) đơn\)$/, tpl: "Tỉ lệ đơn huỷ/hoàn cao ({a}/{b} đơn)", names: ["a", "b"] },
  { re: /^API key bị lỗi\/chặn (\d+) lần trong 24 giờ$/, tpl: "API key bị lỗi/chặn {n} lần trong 24 giờ", names: ["n"] },
  { re: /^Hoàn tiền\/bảo hành (\d+) lần trong 30 ngày$/, tpl: "Hoàn tiền/bảo hành {n} lần trong 30 ngày", names: ["n"] },
];

/** Dịch 1 nhãn yếu tố rủi ro sang ngôn ngữ đang chọn (t = Ld/trd của trang).
 *  Yếu tố mới có vars -> dịch mẫu rồi thay số; yếu tố cũ nướng số -> khớp mẫu cũ. */
export function riskFactorText(f: { label: string; vars?: Record<string, number> }, t: (s: string) => string): string {
  if (f.vars && Object.keys(f.vars).length) return fillTpl(t(f.label), f.vars);
  for (const p of LEGACY_FACTOR_PATTERNS) {
    const m = f.label.match(p.re);
    if (m) {
      const vars: Record<string, number> = {};
      p.names.forEach((name, i) => { vars[name] = parseInt(m[i + 1], 10); });
      return fillTpl(t(p.tpl), vars);
    }
  }
  return t(f.label);
}

/** Dịch RiskEvent.detail (chuỗi đã ghi sẵn tiếng Việt) sang ngôn ngữ đang chọn */
export function riskDetailText(detail: string, t: (s: string) => string): string {
  if (!detail) return detail;
  if (detail === "Không còn yếu tố rủi ro") return t(detail);
  let m = detail.match(/^Điểm rủi ro (\d+) vượt ngưỡng hạn chế (\d+) — đã chặn tạo đơn\/nạp mới$/);
  if (m) return fillTpl(t("Điểm rủi ro {score} vượt ngưỡng hạn chế {n} — đã chặn tạo đơn/nạp mới"), { score: m[1], n: m[2] });
  m = detail.match(/^Đã duyệt bởi (.+) — gỡ hạn chế cho tới khi có tín hiệu mới$/);
  if (m) return fillTpl(t("Đã duyệt bởi {by} — gỡ hạn chế cho tới khi có tín hiệu mới"), { by: m[1] });
  // kind=signal: các đoạn "nhãn (+điểm)" nối bằng "; "
  if (detail.includes("(+")) {
    return detail.split("; ").map((seg) => {
      const sm = seg.match(/^(.+) \(\+(\d+)\)$/);
      if (!sm) return t(seg);
      return `${riskFactorText({ label: sm[1] }, t)} (+${sm[2]})`;
    }).join("; ");
  }
  return t(detail);
}

/** Cron: tính lại hàng loạt cho tài khoản hoạt động trong 30 ngày gần nhất */
export async function recalcActiveUsersRisk(limit = 200): Promise<number> {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const users = await prisma.user.findMany({
    where: { lastLoginAt: { gte: since } },
    select: { id: true }, orderBy: { lastLoginAt: "desc" }, take: limit,
  }).catch(() => []);
  let n = 0;
  for (const u of users) {
    const r = await evaluateUserRisk(u.id);
    if (r) n++;
  }
  return n;
}
