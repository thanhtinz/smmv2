import { getSettings } from "@/lib/settings";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { syncPremiumOrderStatus } from "@/lib/orders";
import { syncProviderPremium, providerBalance } from "@/lib/provider";
import { pollFzrPremiumOrder } from "@/lib/fzr-orders";
import { syncFzrCatalog } from "@/lib/fzr-sync";

/**
 * Cron đồng bộ (gọi mỗi 5-10 phút bởi crontab / Vercel Cron):
 *  GET /api/cron/sync?secret=<CRON_SECRET>           -> đồng bộ trạng thái đơn API đang chạy
 *  GET /api/cron/sync?secret=...&services=1          -> kèm đồng bộ dịch vụ + số dư provider
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  // GĐ3: chấp nhận khoá cron ở MỘT TRONG HAI nơi — env CRON_SECRET hoặc setting
  // cron_secret trong DB (admin xoay vòng ở Trung tâm bảo mật mà không cần sửa env).
  const candidates = Array.from(new Set([process.env.CRON_SECRET || "", (await getSettings()).cron_secret || ""].filter(Boolean)));
  const given =
    req.headers.get("x-cron-secret") ||
    (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  // Fail-closed: chưa cấu hình secret ở cả DB lẫn env thì TỪ CHỐI mọi cuộc gọi
  // (trước đây trống secret = ai cũng gọi được vòng đồng bộ nặng). Chỉ nhận qua
  // header, không nhận ?secret= (tránh lọt vào access log).
  if (!candidates.length) return NextResponse.json({ error: "Cron secret not configured" }, { status: 503 });
  const { timingSafeEqual } = await import("crypto");
  const a = Buffer.from(given || "");
  const matched = candidates.some((c) => {
    const b = Buffer.from(c);
    return a.length === b.length && timingSafeEqual(a, b);
  });
  if (!matched) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result: any = { premiumSynced: 0, premiumFailed: 0, providers: [] };

  // Đơn SMM + drip-feed + auto-refill ĐÃ GỠ (lệnh Tín 2026-11-12 — web tách
  // thành Digital Shop thuần, SMM làm web riêng): cron không còn xử lý đơn
  // SMM; dữ liệu cũ giữ nguyên trong DB, không xử lý nữa.

  // Service Health Monitor: kiểm tra số dư/kết nối mọi provider đang bật; lỗi thì ghi log cảnh báo
  try {
    const providers = await prisma.provider.findMany({ where: { active: true } });
    result.providerHealth = [];
    for (const p of providers) {
      try {
        const bal = await providerBalance(p);
        result.providerHealth.push({ name: p.name, ok: true, balanceVnd: bal.vnd });
      } catch (e: any) {
        result.providerHealth.push({ name: p.name, ok: false });
        await prisma.apiLog.create({ data: { kind: "provider_health", ref: p.name, ok: false, detail: String(e?.message || e) } });
      }
    }
  } catch {}

  // Cảnh báo số dư nhà cung cấp thấp (mỗi nhà cung cấp tối đa 1 lần/ngày)
  try {
    const { alertMother } = await import("@/lib/alerts");
    const { getSettings, setSetting } = await import("@/lib/settings");
    const st = await getSettings();
    const todayKey = new Date().toISOString().slice(0, 10);
    const lowProviders = await prisma.provider.findMany({ where: { active: true } });
    for (const p of lowProviders) {
      const threshold = p.minBalanceAlert > 0 ? p.minBalanceAlert : (parseInt(st.provider_low_balance_default || "") || 200000);
      if (p.balanceCache > 0 && p.balanceCache < threshold && st[`lb_alert_${p.id}`] !== todayKey) {
        await alertMother("low_balance", "Số dư nhà cung cấp sắp hết", `${p.name} còn ${p.balanceCache.toLocaleString("vi-VN")}đ (ngưỡng cảnh báo ${threshold.toLocaleString("vi-VN")}đ)`);
        await setSetting(`lb_alert_${p.id}`, todayKey);
      }
    }
  } catch {}

  // Báo cáo ngày tự động (đến giờ cấu hình thì gửi qua Email/Telegram/Discord)
  try {
    const { maybeSendDailyReports } = await import("@/lib/report");
    result.dailyReports = await maybeSendDailyReports();
  } catch (e: any) {
    result.dailyReportsError = String(e?.message || e);
  }

  // Đơn premium đấu API đang chờ giao -> hỏi trạng thái phía provider.
  // Driver FZR poll bằng GET /orders/{id} (tối đa 50 đơn/vòng, bỏ qua đơn < 1 phút);
  // chuẩn ThaTim giữ nguyên đường history cũ.
  const preOrders = await prisma.premiumOrder.findMany({
    where: { providerId: { not: null }, providerOrderId: { not: null }, status: "PENDING" },
    take: 100,
    orderBy: { updatedAt: "asc" },
    include: { provider: { select: { driver: true } } },
  });
  let fzrPolled = 0;
  for (const o of preOrders) {
    try {
      if (o.provider?.driver === "FZR") {
        if (fzrPolled >= 50) continue;
        fzrPolled++;
        await pollFzrPremiumOrder(o, { skipYoung: true });
      } else {
        await syncPremiumOrderStatus(o);
      }
      result.premiumSynced++;
    } catch {
      result.premiumFailed++;
    }
  }
  result.fzrPolled = fzrPolled;

  // BoltUtil: poll là đường dự phòng khi webhook trễ/mất (webhook có gửi lại nhưng không đảm bảo tức thời).
  // Đối soát tối đa 30 yêu cầu nạp USDT-BoltUtil đang PENDING trong 24 giờ qua;
  // gặp 429 thì dừng phần còn lại tới lượt sau.
  try {
    const boltDeps = await prisma.deposit.findMany({
      where: { method: "USDT", status: "PENDING", externalId: { startsWith: "bolt:" }, createdAt: { gt: new Date(Date.now() - 24 * 3600 * 1000) } },
      orderBy: { id: "asc" }, take: 30, select: { id: true },
    });
    const { pollBoltutilDeposit, BoltError } = await import("@/lib/boltutil");
    let boltPolled = 0;
    for (const d of boltDeps) {
      try { await pollBoltutilDeposit(d.id); boltPolled++; }
      catch (e: any) { if (e instanceof BoltError && e.httpStatus === 429) break; }
    }
    (result as any).boltPolled = boltPolled;
  } catch { /* lỗi poll BoltUtil không chặn các job khác */ }

  // Thanh toán trực tiếp mua giỏ: quét phiên quá hạn + hỏi lại BoltUtil cho
  // phiên đang chờ (poll là đường dự phòng khi webhook trễ/mất).
  try {
    const { expireStalePurchases, settleBoltPurchase } = await import("@/lib/purchase");
    const stale = await prisma.purchasePayment.findMany({ where: { status: "PENDING", method: "BOLTUTIL" }, take: 10, orderBy: { id: "asc" }, select: { id: true, code: true } });
    let polled = 0;
    if (stale.length) {
      const { getBoltConfig, boltGetStatus } = await import("@/lib/boltutil");
      const cfg = await getBoltConfig().catch(() => null);
      if (cfg?.enabled) {
        for (const p of stale) {
          const st = await boltGetStatus(cfg, p.code).catch(() => null);
          if (st) { await settleBoltPurchase(p.id, st).catch(() => {}); polled++; }
        }
      }
    }
    const expired = await expireStalePurchases();
    (result as any).purchases = { polled, expired };
  } catch { /* lỗi phiên mua không chặn các job khác */ }

  if (req.nextUrl.searchParams.get("services") === "1") {
    const providers = await prisma.provider.findMany({ where: { active: true } });
    for (const p of providers) {
      try {
        const bal = await providerBalance(p);
        const entry: any = { name: p.name, balanceVnd: bal.vnd };
        if (p.driver === "FZR") {
          // FZR: chỉ đồng bộ catalog Premium; Steam gift KHÔNG đồng bộ ở cron
          // (endpoint danh sách bị rate-limit 1 lần/3 phút — chỉ admin bấm tay).
          try {
            entry.fzr = await syncFzrCatalog(p);
          } catch (e: any) {
            entry.fzrError = String(e?.message || e);
          }
        } else {
          if (p.kind === "PREMIUM" || p.kind === "BOTH") {
            try {
              entry.premium = await syncProviderPremium(p);
            } catch (e: any) {
              entry.premiumError = String(e?.message || e);
            }
          }
        }
        result.providers.push(entry);
      } catch (e: any) {
        result.providers.push({ name: p.name, error: String(e?.message || e) });
      }
    }
  }
  // GĐ3: tính lại điểm rủi ro hàng loạt cho tài khoản hoạt động 30 ngày gần nhất
  try {
    const { recalcActiveUsersRisk } = await import("@/lib/risk");
    result.riskRecalculated = await recalcActiveUsersRisk(200);
  } catch (e: any) {
    result.riskError = String(e?.message || e);
  }

  // Tỉ giá thị trường tự động (Admin → Cấu hình nạp tiền → Tỉ giá): chỉ chạy
  // khi admin bật; applyMarketRates tự throttle 1 giờ và không ghi đè đồng
  // nào nguồn không trả.
  try {
    const st = await getSettings();
    if (st.rates_auto_enabled === "1") {
      const { applyMarketRates } = await import("@/lib/rates");
      result.rates = await applyMarketRates();
    }
  } catch (e: any) {
    result.ratesError = String(e?.message || e);
  }

  // Ghi nhận lần chạy cron cho trang Sức khoẻ hệ thống (Admin → Hệ thống)
  await prisma.apiLog.create({ data: { kind: "cron_sync", ok: true, detail: JSON.stringify({ premiumSynced: result.premiumSynced, premiumFailed: result.premiumFailed }).slice(0, 900) } }).catch(() => {});
  return NextResponse.json(result);
}
