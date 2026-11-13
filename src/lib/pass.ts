import { prisma } from "./db";
import { getSettings, DEFAULT_SETTINGS } from "./settings";
import { applyBalance } from "./wallet";
import { affDayKey } from "./affiliate";

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

/** Trạng thái Pass của một khách (cho trang bán + hồ sơ + menu). */
export async function getPassState(userId: number): Promise<{ active: boolean; expiresAt: Date | null }> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { passExpiresAt: true } });
  return { active: passActiveAt(u?.passExpiresAt), expiresAt: u?.passExpiresAt ?? null };
}

/**
 * MUA / GIA HẠN Pass bằng số dư ví — trừ tiền + dời hạn trong MỘT transaction:
 * hạn mới = max(hiện tại, hạn cũ còn hiệu lực) + số tháng của kỳ (gia hạn
 * cộng tiếp từ ngày hết hạn cũ, không mất ngày đã trả). Số dư không đủ ->
 * applyBalance tự ném lỗi và cả transaction huỷ, không trạng thái dở dang.
 * Đơn mua Pass là Transaction PASS_PURCHASE — không qua đường tạo đơn nên
 * tự nó không hưởng giảm/cashback của Pass.
 */
export async function buyPass(userId: number, months: number): Promise<{ price: number; expiry: Date; name: string }> {
  const cfg = await getPassConfig();
  if (!cfg.enabled) throw new Error("Gói thành viên đang tắt");
  const price = passPriceFor(cfg, months);
  if (!price) throw new Error("Kỳ hạn không hợp lệ hoặc chưa được mở bán");
  const expiry = await prisma.$transaction(async (tx) => {
    const fresh = await tx.user.findUnique({ where: { id: userId }, select: { passExpiresAt: true } });
    if (!fresh) throw new Error("Tài khoản không tồn tại");
    const base = passActiveAt(fresh.passExpiresAt) ? fresh.passExpiresAt! : new Date();
    const exp = addMonths(base, months);
    await applyBalance(tx, userId, -price, "PASS_PURCHASE", undefined, `Mua ${cfg.name} — ${months} tháng`);
    await tx.user.update({ where: { id: userId }, data: { passExpiresAt: exp } });
    return exp;
  });
  return { price, expiry, name: cfg.name };
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
