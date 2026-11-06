import { getSettings } from "@/lib/settings";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { syncSmmOrderStatus, syncPremiumOrderStatus, processDripfeedOrders, processAutoRefills } from "@/lib/orders";
import { syncProviderServices, syncProviderPremium, providerBalance } from "@/lib/provider";
import { processSubscriptions } from "@/lib/subscriptions";

/**
 * Cron đồng bộ (gọi mỗi 5-10 phút bởi crontab / Vercel Cron):
 *  GET /api/cron/sync?secret=<CRON_SECRET>           -> đồng bộ trạng thái đơn API đang chạy
 *  GET /api/cron/sync?secret=...&services=1          -> kèm đồng bộ dịch vụ + số dư provider
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = (await getSettings()).cron_secret || process.env.CRON_SECRET || "";
  const given =
    req.nextUrl.searchParams.get("secret") ||
    req.headers.get("x-cron-secret") ||
    (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (secret && given !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result: any = { ordersSynced: 0, ordersFailed: 0, premiumSynced: 0, premiumFailed: 0, providers: [] };

  // Drip-feed: thả các lượt đến hạn trước khi đồng bộ trạng thái
  try {
    result.dripfeed = await processDripfeedOrders(10);
  } catch (e: any) {
    result.dripfeedError = String(e?.message || e);
  }

  // Đăng ký định kỳ: đặt đơn tự động cho các gói đến hạn
  try {
    result.subscriptions = await processSubscriptions(20);
  } catch (e: any) {
    result.subscriptionsError = String(e?.message || e);
  }

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
      const threshold = p.minBalanceAlert || 200000;
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

  // Auto Refill: tự gửi bảo hành cho đơn đã hoàn thành thuộc dịch vụ bật auto-refill
  try {
    result.autoRefill = await processAutoRefills(20);
  } catch (e: any) {
    result.autoRefillError = String(e?.message || e);
  }

  const orders = await prisma.smmOrder.findMany({
    where: { fulfillment: "API", providerOrderId: { not: null }, status: { in: ["PENDING", "PROCESSING", "IN_PROGRESS"] } },
    take: 200,
    orderBy: { updatedAt: "asc" },
  });
  for (const o of orders) {
    try {
      await syncSmmOrderStatus(o);
      result.ordersSynced++;
    } catch {
      result.ordersFailed++;
    }
  }

  // Đơn premium đấu API đang chờ giao -> hỏi history của provider
  const preOrders = await prisma.premiumOrder.findMany({
    where: { providerId: { not: null }, providerOrderId: { not: null }, status: "PENDING" },
    take: 100,
    orderBy: { updatedAt: "asc" },
  });
  for (const o of preOrders) {
    try {
      await syncPremiumOrderStatus(o);
      result.premiumSynced++;
    } catch {
      result.premiumFailed++;
    }
  }

  if (req.nextUrl.searchParams.get("services") === "1") {
    const providers = await prisma.provider.findMany({ where: { active: true } });
    for (const p of providers) {
      try {
        const bal = await providerBalance(p);
        const entry: any = { name: p.name, balanceVnd: bal.vnd };
        if (p.kind === "SMM" || p.kind === "BOTH") entry.smm = await syncProviderServices(p);
        if (p.kind === "PREMIUM" || p.kind === "BOTH") {
          try {
            entry.premium = await syncProviderPremium(p);
          } catch (e: any) {
            entry.premiumError = String(e?.message || e);
          }
        }
        result.providers.push(entry);
      } catch (e: any) {
        result.providers.push({ name: p.name, error: String(e?.message || e) });
      }
    }
  }
  return NextResponse.json(result);
}
