import { prisma } from "./db";
import { getSettings, DEFAULT_SETTINGS } from "./settings";
import { applyBalance } from "./wallet";
import { affDayKey } from "./affiliate";
import { notifyUser } from "./notify";
import { vnd } from "./format";
import { sendCustomerMail } from "./customer-mail";

/**
 * PASS — gói thành viên trả phí (trang bán /pass, mẫu ldshop Pass; lệnh Tín
 * 2026-11-12). Mua bằng SỐ DƯ VÍ; khi còn hạn, mỗi đơn trong PHẠM VI cấu hình
 * được (a) GIẢM THÊM % và (b) HOÀN % tiền về ví (cashback).
 *
 * THỨ TỰ ÁP DỤNG (cố định, mọi đường tạo đơn đều theo):
 *   giá gốc → chiết khấu cấp bậc (SMM) / giá gói → FLASH SALE → MÃ GIẢM GIÁ
 *   → GIẢM THÊM CỦA PASS (tính trên số tiền sau flash + promo).
 * Cashback tính trên SỐ TIỀN THỰC TRẢ CUỐI CÙNG (sau giảm Pass) và cộng vào
 * ví trong CÙNG transaction tạo đơn (Transaction type PASS_CASHBACK).
 * Đơn mua Pass tự nó KHÔNG hưởng giảm/cashback của Pass; đơn quà tháng (0đ)
 * cũng không. Đơn bị hoàn tiền → cashback bị thu hồi theo đúng tỉ lệ phần
 * tiền hoàn, không vượt phần cashback ròng đã cộng cho đơn đó (cùng semantics
 * với thu hồi hoa hồng giới thiệu — clawbackReferralCommission).
 *
 * MỌI giá trị thương mại (giá từng kỳ, % hoàn, % giảm, phạm vi, quà tháng)
 * nằm ở settings do admin đặt tại Cấu hình → tab Pass — không hardcode.
 *
 * TRẠNG THÁI THÀNH VIÊN (lệnh Tín 2026-11-13) nằm trên bản ghi User:
 * passTermMonths (kỳ đang dùng), passCancelledAt (đã huỷ — dùng tiếp tới
 * hết hạn đã trả, không hoàn tiền), passAutoRenew (tự gia hạn bằng ví,
 * mặc định TẮT) và passRenewAttemptFor (mốc chống trừ trùng của cron).
 */

export type PassKind = "PREMIUM";
export type PassScope = "ALL" | "PREMIUM";

export interface PassConfig {
  enabled: boolean;
  name: string;
  terms: { months: number; price: number }[]; // chỉ các kỳ có giá > 0
  cashbackPercent: number;
  discountPercent: number;
  scope: PassScope;
  giftProductId: number | null;
  giftVariantId: number | null;
}

function pctOf(v: string | undefined, key: string): number {
  const n = parseFloat(v ?? DEFAULT_SETTINGS[key] ?? "0");
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
}

function priceOf(v: string | undefined): number {
  const n = parseInt(v || "0");
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Dựng cấu hình Pass từ một bản settings (getSettings hoặc DEFAULT). */
export function passConfigFromSettings(s: Record<string, string>): PassConfig {
  const terms = [
    { months: 1, price: priceOf(s.pass_price_1m) },
    { months: 3, price: priceOf(s.pass_price_3m) },
    { months: 12, price: priceOf(s.pass_price_12m) },
  ].filter((t) => t.price > 0);
  const scopeRaw = String(s.pass_scope || DEFAULT_SETTINGS.pass_scope).toUpperCase();
  const gid = parseInt(s.pass_gift_product_id || "");
  const vid = parseInt(s.pass_gift_variant_id || "");
  return {
    enabled: s.pass_enabled === "1",
    name: (s.pass_name || "").trim() || "Pass",
    terms,
    cashbackPercent: pctOf(s.pass_cashback_percent, "pass_cashback_percent"),
    discountPercent: pctOf(s.pass_discount_percent, "pass_discount_percent"),
    // Giá trị "SMM" còn sót trong DB từ trước đợt gỡ SMM rơi về "ALL" (áp mọi đơn còn lại = Premium).
    scope: scopeRaw === "PREMIUM" ? scopeRaw : "ALL",
    giftProductId: Number.isFinite(gid) && gid > 0 ? gid : null,
    giftVariantId: Number.isFinite(vid) && vid > 0 ? vid : null,
  };
}

export async function getPassConfig(): Promise<PassConfig> {
  return passConfigFromSettings(await getSettings());
}

/** Giá của một kỳ (tháng) theo cấu hình; 0 = kỳ đó không bán. */
export function passPriceFor(cfg: PassConfig, months: number): number {
  return cfg.terms.find((t) => t.months === months)?.price || 0;
}

export function passAppliesTo(scope: PassScope, kind: PassKind): boolean {
  return scope === "ALL" || scope === kind;
}

/** Pass còn hạn tại thời điểm `at` (mặc định hiện tại)? */
export function passActiveAt(expiresAt: Date | null | undefined, at = new Date()): boolean {
  return !!expiresAt && expiresAt.getTime() > at.getTime();
}

/** Số tiền GIẢM THÊM của Pass trên `amount` (số tiền sau flash + promo):
 *  floor(amount × %), nhưng luôn chừa lại ít nhất 1đ phải trả như mã giảm giá. */
export function passDiscountAmount(amount: number, pct: number): number {
  if (amount <= 1 || pct <= 0) return 0;
  return Math.min(Math.floor((amount * pct) / 100), amount - 1);
}

/** Số tiền CASHBACK trên số tiền thực trả cuối cùng. */
export function passCashbackAmount(finalAmount: number, pct: number): number {
  if (finalAmount <= 0 || pct <= 0) return 0;
  return Math.floor((finalAmount * pct) / 100);
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Đọc cấu hình Pass NGAY TRONG transaction (đọc Setting qua tx như
 *  creditReferralCommission vẫn làm) để % áp dụng là % tại thời điểm chốt đơn. */
async function passConfigTx(tx: Tx): Promise<PassConfig> {
  const keys = ["pass_enabled", "pass_name", "pass_price_1m", "pass_price_3m", "pass_price_12m", "pass_cashback_percent", "pass_discount_percent", "pass_scope", "pass_gift_product_id", "pass_gift_variant_id"];
  const rows = await tx.setting.findMany({ where: { key: { in: keys } } });
  const s: Record<string, string> = {};
  for (const r of rows) s[r.key] = r.value;
  return passConfigFromSettings({ ...DEFAULT_SETTINGS, ...s });
}

/**
 * Số tiền giảm thêm của Pass cho một đơn SẮP tạo (đọc tươi ngoài transaction —
 * cùng vị trí với bước kiểm tra mã giảm giá hiện tại). Trả 0 khi Pass tắt /
 * khách không còn hạn / đơn ngoài phạm vi / % giảm = 0.
 */
export async function passDiscountFor(userId: number, kind: PassKind, amountAfterPromo: number): Promise<number> {
  const cfg = await getPassConfig();
  if (!cfg.enabled || cfg.discountPercent <= 0 || !passAppliesTo(cfg.scope, kind)) return 0;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { passExpiresAt: true } });
  if (!passActiveAt(u?.passExpiresAt)) return 0;
  return passDiscountAmount(amountAfterPromo, cfg.discountPercent);
}

/**
 * Cộng CASHBACK vào ví trong transaction tạo đơn (gọi sau khi đơn đã có mã).
 * Tự kiểm tra lại điều kiện ngay trong tx (Pass bật + còn hạn + đúng phạm vi)
 * nên nơi gọi chỉ cần truyền số tiền thực trả cuối cùng. Trả số đã cộng.
 */
export async function creditPassCashback(tx: Tx, userId: number, kind: PassKind, finalAmount: number, ref: string): Promise<number> {
  if (finalAmount <= 0) return 0;
  const cfg = await passConfigTx(tx);
  if (!cfg.enabled || cfg.cashbackPercent <= 0 || !passAppliesTo(cfg.scope, kind)) return 0;
  const u = await tx.user.findUnique({ where: { id: userId }, select: { passExpiresAt: true } });
  if (!passActiveAt(u?.passExpiresAt)) return 0;
  const cashback = passCashbackAmount(finalAmount, cfg.cashbackPercent);
  if (cashback <= 0) return 0;
  await applyBalance(tx, userId, cashback, "PASS_CASHBACK", ref, `Hoàn tiền Pass ${cfg.cashbackPercent}% — đơn ${ref}`);
  return cashback;
}

/**
 * Thu hồi cashback Pass theo tỉ lệ số tiền đơn bị hoàn — mirror
 * clawbackReferralCommission: tính theo % HIỆN TẠI trong cấu hình, chặn trên
 * bởi cashback RÒNG đã thật sự cộng cho đúng mã đơn đó (sổ Transaction
 * PASS_CASHBACK theo ref), best-effort (lỗi chỉ ghi log, không chặn hoàn tiền).
 * Chân trừ ghi thủ công (không qua applyBalance) để KHÔNG đội totalSpent của
 * khách — thu hồi hoàn tiền không phải chi tiêu.
 */
export async function clawbackPassCashback(userId: number, refundAmount: number, ref?: string) {
  if (refundAmount <= 0 || !ref) return;
  try {
    const cfg = await getPassConfig();
    if (cfg.cashbackPercent <= 0) return;
    const due0 = passCashbackAmount(refundAmount, cfg.cashbackPercent);
    if (due0 <= 0) return;
    const agg = await prisma.transaction.aggregate({
      where: { userId, type: "PASS_CASHBACK", ref },
      _sum: { amount: true },
    });
    const due = Math.min(due0, Math.max(0, agg._sum.amount || 0));
    if (due <= 0) return;
    await prisma.$transaction(async (tx) => {
      const res = await tx.user.updateMany({
        where: { id: userId, balance: { gte: due } },
        data: { balance: { increment: -due } },
      });
      if (res.count === 0) throw new Error("Số dư không đủ để thu hồi cashback Pass");
      const fresh = await tx.user.findUnique({ where: { id: userId }, select: { balance: true } });
      await tx.transaction.create({
        data: { userId, type: "PASS_CASHBACK", amount: -due, balanceAfter: fresh!.balance, ref, note: `Thu hồi hoàn tiền Pass — đơn ${ref} hoàn tiền` },
      });
    });
  } catch (e: any) {
    await prisma.apiLog.create({ data: { kind: "pass_cashback", ref, ok: false, detail: `clawback failed: ${String(e?.message || e)}` } }).catch(() => {});
  }
}

/** Cộng tháng dương lịch có kẹp ngày cuối tháng (31/1 + 1 tháng -> 28/2). */
export function addMonths(from: Date, months: number): Date {
  const d = new Date(from.getTime());
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
}

/** Khoá tháng nhận quà YYYY-MM theo giờ Việt Nam (cùng quy ước affDayKey). */
export function passMonthKey(d = new Date()): string {
  return affDayKey(d).slice(0, 7);
}

/** Trạng thái Pass đầy đủ của một khách (trang bán + hồ sơ): còn hạn?,
 *  hạn tới ngày, KỲ đang dùng, đã huỷ?, tự gia hạn đang bật?. */
export interface PassState {
  active: boolean;
  expiresAt: Date | null;
  termMonths: number | null;
  cancelledAt: Date | null;
  autoRenew: boolean;
}

export async function getPassState(userId: number): Promise<PassState> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { passExpiresAt: true, passTermMonths: true, passCancelledAt: true, passAutoRenew: true },
  });
  return {
    active: passActiveAt(u?.passExpiresAt),
    expiresAt: u?.passExpiresAt ?? null,
    termMonths: u?.passTermMonths ?? null,
    cancelledAt: u?.passCancelledAt ?? null,
    autoRenew: !!u?.passAutoRenew,
  };
}

/**
 * Lõi TRỪ VÍ + DỜI HẠN dùng chung cho mua mới / gia hạn / đổi gói: mọi đường
 * đều vào đây để trạng thái ghi kèm luôn nhất quán — hạn mới = max(hiện tại,
 * hạn cũ còn hiệu lực) + số tháng của kỳ (cộng tiếp từ ngày hết hạn cũ,
 * không mất ngày đã trả); ghi nhận KỲ đang dùng; XOÁ trạng thái huỷ và mốc
 * đã-thử-tự-gia-hạn (chu kỳ mới bắt đầu sạch). Số dư không đủ -> applyBalance
 * tự ném lỗi và cả transaction huỷ, không trạng thái dở dang. Giao dịch ghi
 * sổ là PASS_PURCHASE — không qua đường tạo đơn nên tự nó không hưởng
 * giảm/cashback của Pass.
 */
async function chargePassTerm(userId: number, months: number, note: string): Promise<{ price: number; expiry: Date; name: string }> {
  const cfg = await getPassConfig();
  if (!cfg.enabled) throw new Error("Gói thành viên đang tắt");
  const price = passPriceFor(cfg, months);
  if (!price) throw new Error("Kỳ hạn không hợp lệ hoặc chưa được mở bán");
  const expiry = await prisma.$transaction(async (tx) => {
    const fresh = await tx.user.findUnique({ where: { id: userId }, select: { passExpiresAt: true } });
    if (!fresh) throw new Error("Tài khoản không tồn tại");
    const base = passActiveAt(fresh.passExpiresAt) ? fresh.passExpiresAt! : new Date();
    const exp = addMonths(base, months);
    await applyBalance(tx, userId, -price, "PASS_PURCHASE", undefined, note);
    await tx.user.update({
      where: { id: userId },
      data: { passExpiresAt: exp, passTermMonths: months, passCancelledAt: null, passRenewAttemptFor: null },
    });
    return exp;
  });
  return { price, expiry, name: cfg.name };
}

/** MUA / GIA HẠN Pass bằng số dư ví (hạn cộng dồn từ hạn cũ — xem chargePassTerm). */
export async function buyPass(userId: number, months: number): Promise<{ price: number; expiry: Date; name: string }> {
  const cfg = await getPassConfig();
  const r = await chargePassTerm(userId, months, `Mua ${cfg.name} — ${months} tháng`);
  // Đợt 119: mail xác nhận mua/gia hạn Pass (lõi tự nuốt lỗi).
  void sendCustomerMail(userId, "pass_purchased", {
    pass_name: r.name, months, price: vnd(r.price), expiry_date: r.expiry.toLocaleDateString("vi-VN"),
  });
  return r;
}

/**
 * ĐỔI GÓI (lệnh Tín 2026-11-13): thành viên còn hạn chọn sang KỲ KHÁC — trừ
 * ví theo giá kỳ mới (giá admin đang cấu hình), hạn dùng mới = hạn hiện tại
 * + thời lượng kỳ mới (cộng dồn, không mất ngày đã trả), kỳ đang dùng chuyển
 * thành kỳ mới. Đang ở trạng thái đã huỷ thì đổi gói cũng xoá trạng thái huỷ
 * (qua chargePassTerm). Đổi sang đúng kỳ đang dùng -> báo dùng Gia hạn.
 */
export async function switchPass(userId: number, months: number): Promise<{ price: number; expiry: Date; name: string }> {
  const cfg = await getPassConfig();
  if (!cfg.enabled) throw new Error("Gói thành viên đang tắt");
  const st = await getPassState(userId);
  if (!st.active) throw new Error(`Bạn chưa có ${cfg.name} đang còn hạn — hãy mua gói trước`);
  if (st.termMonths === months) throw new Error("Bạn đang dùng kỳ này rồi — hãy bấm Gia hạn gói này");
  const r = await chargePassTerm(userId, months, `Đổi gói ${cfg.name} — sang kỳ ${months} tháng`);
  // Đợt 119: mail xác nhận đổi gói Pass (cùng sự kiện pass_purchased).
  void sendCustomerMail(userId, "pass_purchased", {
    pass_name: r.name, months, price: vnd(r.price), expiry_date: r.expiry.toLocaleDateString("vi-VN"),
  });
  return r;
}

/**
 * HUỶ GÓI (lệnh Tín 2026-11-13): chỉ ghi trạng thái đã huỷ — quyền lợi dùng
 * tiếp tới hết hạn ĐÃ TRẢ, KHÔNG hoàn tiền, tự gia hạn bị tắt cưỡng bức.
 * Mua/gia hạn/đổi gói lại bất cứ lúc nào cũng xoá trạng thái huỷ. Bấm huỷ
 * lần nữa khi đã huỷ = không đổi gì thêm (idempotent).
 */
export async function cancelPass(userId: number): Promise<{ expiresAt: Date; name: string }> {
  const cfg = await getPassConfig();
  const st = await getPassState(userId);
  if (!st.active || !st.expiresAt) throw new Error(`Bạn chưa có ${cfg.name} đang còn hạn`);
  if (!st.cancelledAt) {
    await prisma.user.update({ where: { id: userId }, data: { passCancelledAt: new Date(), passAutoRenew: false } });
  }
  return { expiresAt: st.expiresAt, name: cfg.name };
}

/**
 * Bật/tắt TỰ GIA HẠN cho từng thành viên (mặc định TẮT). Bật lên chỉ khi:
 * module Pass đang mở, gói còn hạn, chưa huỷ (đã huỷ thì mua/gia hạn lại
 * trước) và hệ thống đã ghi nhận kỳ đang dùng (để biết trừ giá kỳ nào).
 */
export async function setPassAutoRenew(userId: number, on: boolean): Promise<void> {
  const cfg = await getPassConfig();
  if (!cfg.enabled) throw new Error("Gói thành viên đang tắt");
  const st = await getPassState(userId);
  if (!st.active) throw new Error(`Bạn chưa có ${cfg.name} đang còn hạn`);
  if (on && st.cancelledAt) throw new Error("Gói đã huỷ — hãy mua, gia hạn hoặc đổi gói lại để bật tự gia hạn");
  if (on && !st.termMonths) throw new Error("Hãy gia hạn một lần để hệ thống ghi nhận kỳ gói, rồi bật tự gia hạn");
  await prisma.user.update({ where: { id: userId }, data: { passAutoRenew: on } });
}

/**
 * VÒNG TỰ GIA HẠN — chạy trong cron /api/cron/sync (lệnh Tín 2026-11-13):
 * quét thành viên bật tự gia hạn + chưa huỷ + còn biết kỳ đang dùng, có hạn
 * rơi vào cửa sổ [hết hạn chưa quá 24 giờ trước, sắp hết trong 24 giờ tới]
 * rồi trừ ví theo GIÁ HIỆN TẠI của kỳ đang dùng; nối hạn TỪ HẠN CŨ + thời
 * lượng kỳ (kể cả khi đã lố vào khoảng ân hạn 24 giờ).
 *
 * CHỐNG TRỪ TRÙNG + KHÔNG THỬ LẠI VÔ HẠN: trước khi đụng tiền, vòng chạy
 * GIỮ CHỖ nguyên tử bằng passRenewAttemptFor = đúng giá trị hạn đang xử lý —
 * chỉ một vòng cron giữ được chỗ cho một chu kỳ hạn; giữ chỗ xong mà trừ
 * tiền thất bại (thiếu số dư…) thì chu kỳ đó cũng không thử lại nữa, khách
 * chỉ nhận 1 thông báo. Đủ tiền -> Transaction PASS_PURCHASE với ghi chú
 * "Tự gia hạn" + thông báo; thiếu tiền -> thông báo, không trừ, gói hết hạn
 * tự nhiên. Module Pass tắt ở admin -> bỏ qua toàn bộ.
 */
export async function processPassAutoRenewals(now = new Date()): Promise<{ renewed: number; failed: number; skipped?: string }> {
  const cfg = await getPassConfig();
  if (!cfg.enabled) return { renewed: 0, failed: 0, skipped: "disabled" };
  const DAY = 86400_000;
  const candidates = await prisma.user.findMany({
    where: {
      passAutoRenew: true,
      passCancelledAt: null,
      passTermMonths: { not: null },
      passExpiresAt: { gt: new Date(now.getTime() - DAY), lte: new Date(now.getTime() + DAY) },
    },
    select: { id: true, passExpiresAt: true, passTermMonths: true },
    orderBy: { passExpiresAt: "asc" },
    take: 200,
  });
  let renewed = 0, failed = 0;
  for (const c of candidates) {
    const exp0 = c.passExpiresAt!;
    const months = c.passTermMonths!;
    // Giữ chỗ nguyên tử cho ĐÚNG chu kỳ hạn này (vòng cron chạy trùng song
    // song chỉ một vòng giữ được; chu kỳ đã thử — dù thành công hay thất
    // bại — không xử lý lại).
    const claim = await prisma.user.updateMany({
      where: {
        id: c.id, passAutoRenew: true, passCancelledAt: null, passExpiresAt: exp0,
        OR: [{ passRenewAttemptFor: null }, { passRenewAttemptFor: { not: exp0 } }],
      },
      data: { passRenewAttemptFor: exp0 },
    });
    if (claim.count === 0) continue;
    const price = passPriceFor(cfg, months);
    try {
      if (!price) throw new Error("TERM_CLOSED");
      const exp = await prisma.$transaction(async (tx) => {
        const fresh = await tx.user.findUnique({
          where: { id: c.id },
          select: { passExpiresAt: true, passAutoRenew: true, passCancelledAt: true },
        });
        if (!fresh || !fresh.passAutoRenew || fresh.passCancelledAt || !fresh.passExpiresAt || fresh.passExpiresAt.getTime() !== exp0.getTime()) {
          throw new Error("STATE_CHANGED");
        }
        const next = addMonths(exp0, months);
        await applyBalance(tx, c.id, -price, "PASS_PURCHASE", undefined, `Tự gia hạn ${cfg.name} — ${months} tháng`);
        await tx.user.update({ where: { id: c.id }, data: { passExpiresAt: next } });
        return next;
      });
      renewed++;
      await notifyUser(c.id, `${cfg.name} đã tự gia hạn`, `${cfg.name} kỳ ${months} tháng vừa tự gia hạn bằng số dư ví (${vnd(price)}) — hạn dùng mới tới ${exp.toLocaleDateString("vi-VN")}.`, "/pass", "system");
      // Đợt 119: mail xác nhận tự gia hạn thành công.
      void sendCustomerMail(c.id, "pass_auto_renew", {
        pass_name: cfg.name, months, price: vnd(price), expiry_date: exp.toLocaleDateString("vi-VN"),
      });
    } catch (e: any) {
      failed++;
      const reason = String(e?.message || e);
      if (reason === "STATE_CHANGED") continue; // khách vừa tự mua/huỷ giữa chừng — không phải lỗi gia hạn
      if (reason === "TERM_CLOSED") {
        await notifyUser(c.id, `Không thể tự gia hạn ${cfg.name}`, `Kỳ ${months} tháng của bạn không còn mở bán nên ${cfg.name} không tự gia hạn được. Hãy chọn kỳ khác trên trang Pass trước khi hết hạn.`, "/pass", "system");
      } else {
        await notifyUser(c.id, `Không đủ số dư để tự gia hạn ${cfg.name}`, `Số dư ví không đủ ${vnd(price)} để tự gia hạn ${cfg.name} kỳ ${months} tháng. Gói sẽ hết hạn vào ${exp0.toLocaleDateString("vi-VN")} — nạp thêm tiền rồi mua/gia hạn lại trên trang Pass.`, "/pass", "system");
        // Đợt 119: mail báo tự gia hạn THẤT BẠI vì thiếu số dư (biến thể
        // riêng pass_auto_renew_failed theo lệnh — TERM_CLOSED chỉ báo
        // trong app như trước, không gửi biến thể này).
        void sendCustomerMail(c.id, "pass_auto_renew_failed", {
          pass_name: cfg.name, months, price: vnd(price), expiry_date: exp0.toLocaleDateString("vi-VN"),
        });
      }
    }
  }
  return { renewed, failed };
}

/**
 * NHẬN QUÀ THÁNG của Pass: lượt nhận được GIỮ CHỖ bằng bản ghi PassGiftClaim
 * với khoá duy nhất (userId, monthKey) TRƯỚC khi tạo đơn — hai lượt bấm đồng
 * thời chỉ một lượt qua được. Đơn quà là đơn Premium 0đ qua createPremiumOrder
 * (đúng đường kho + giao tự động/giao tay như đơn thường, buyerInfo = email
 * của khách như các khu giao-vào-tài-khoản vẫn làm); tạo đơn lỗi thì nhả
 * lượt giữ chỗ để khách thử lại.
 */
export async function claimPassGift(userId: number): Promise<{ orderCode: string; productName: string; variantName: string }> {
  const cfg = await getPassConfig();
  if (!cfg.enabled) throw new Error("Gói thành viên đang tắt");
  if (!cfg.giftProductId || !cfg.giftVariantId) throw new Error("Tháng này chưa có quà tặng");
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) throw new Error("Tài khoản không tồn tại");
  if (!passActiveAt(me.passExpiresAt)) throw new Error(`Quà tháng chỉ dành cho thành viên ${cfg.name} còn hạn`);
  const variant = await prisma.premiumVariant.findUnique({
    where: { id: cfg.giftVariantId },
    include: { product: true },
  });
  if (!variant || !variant.active || !variant.product.active || variant.productId !== cfg.giftProductId) {
    throw new Error("Quà tháng đang tạm ngưng — vui lòng quay lại sau");
  }
  let claimId: number;
  try {
    const claim = await prisma.passGiftClaim.create({ data: { userId, monthKey: passMonthKey() } });
    claimId = claim.id;
  } catch {
    throw new Error("Bạn đã nhận quà tháng này rồi");
  }
  try {
    const { createPremiumOrder } = await import("./orders");
    const order = await createPremiumOrder({ user: me, variantId: variant.id, quantity: 1, buyerInfo: me.email, gift: true });
    await prisma.passGiftClaim.update({ where: { id: claimId }, data: { orderCode: order.code } });
    return { orderCode: order.code, productName: variant.product.name, variantName: variant.name };
  } catch (e) {
    await prisma.passGiftClaim.delete({ where: { id: claimId } }).catch(() => {});
    throw e;
  }
}
