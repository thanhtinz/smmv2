import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth";
import { PageHead, Flash, Stat, I } from "@/components/ui";
import { ProvidersClient, type ProviderDTO } from "@/components/admin-catalog";
import { dt } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";
import { getSettings } from "@/lib/settings";
import { getTelegramProvider } from "@/lib/tg";
import { fzrBalance, fzrMe, fzrTransactions, fzrWebhookConfig } from "@/lib/fzr";
import { adminFzrAssignmentAction, adminTelegramTestAction, adminFzrWebhookTestAction } from "@/app/actions/telegram";

export const dynamic = "force-dynamic";

export default async function AdminProviders({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  await requireAdminPage();
  const { L, Ld } = await getServerI18n(null);
  const [providers, totalServices, enabledServices] = await Promise.all([
    prisma.provider.findMany({ orderBy: { id: "asc" }, include: { _count: { select: { services: true } } } }),
    prisma.smmService.count(),
    prisma.smmService.count({ where: { active: true } }),
  ]);
  const dtos: ProviderDTO[] = providers.map((p) => ({
    id: p.id, kind: p.kind, driver: p.driver, name: p.name, apiUrl: p.apiUrl, currency: p.currency, exchangeRate: p.exchangeRate,
    markupPercent: p.markupPercent, balanceCache: p.balanceCache, active: p.active, note: p.note,
    syncServices: p.syncServices, syncCategories: p.syncCategories, autoUpdatePrice: p.autoUpdatePrice,
    syncContent: p.syncContent, filterHtml: p.filterHtml, syncAdvanced: p.syncAdvanced, coupon: p.coupon, cronSyncLimit: p.cronSyncLimit,
    minBalanceAlert: p.minBalanceAlert, dailyLimit: p.dailyLimit, serviceCount: p._count.services,
    lastSyncAt: p.lastSyncAt ? dt(p.lastSyncAt) : null,
  }));
  const activeCount = providers.filter((p) => p.active).length;
  // Cấu hình DÙNG CHUNG của FazerCards (chuyển từ trang "Cài đặt Telegram"
  // đã bỏ, 2026-11-08): nhà cung cấp FZR nào phục vụ khu Telegram. Khu Steam
  // không có phân công riêng — đơn Steam chạy theo nhà cung cấp của từng gói.
  const s = await getSettings();
  const fzrProviders = providers.filter((p) => p.driver === "FZR").map((p) => ({ id: p.id, name: p.name, active: p.active }));
  const tgProvider = await getTelegramProvider().catch(() => null);
  let tgBalance = "";
  let tgPlan = "";
  let fzrTx: any[] = [];
  let fzrHook: any = null;
  if (tgProvider) {
    const bal = await fzrBalance(tgProvider).catch(() => null);
    if (bal) tgBalance = `${bal.balance} ${bal.currency}`;
    // Sức khoẻ webhook + biến động số dư gần nhất phía tài khoản FZR (GET
    // /account/webhook + GET /transactions theo tài liệu) — chỉ đọc.
    fzrTx = await fzrTransactions(tgProvider, 6).catch(() => []);
    fzrHook = await fzrWebhookConfig(tgProvider).catch(() => null);
    const me: any = await fzrMe(tgProvider).catch(() => null);
    if (me) tgPlan = String(me.plan || me.subscription?.plan || me.email || me.username || me.id || "");
  }
  return (
    <div>
      <PageHead title={L("Quản lý nhà cung cấp")} desc={L("Nhà cung cấp đấu API theo chuẩn SMM v2 — hệ thống tự đồng bộ dịch vụ + giá (cộng markup), tự đẩy đơn và tự cập nhật trạng thái.")} />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={L("Tổng số nhà cung cấp")} value={String(providers.length)} icon={I.server} />
        <Stat label={L("Nhà cung cấp đang hoạt động")} value={String(activeCount)} icon={I.check} tone="emerald" />
        <Stat label={L("Tổng số dịch vụ")} value={String(totalServices)} icon={I.list} tone="violet" />
        <Stat label={L("Tổng số dịch vụ đang bật")} value={String(enabledServices)} icon={I.check} tone="cyan" />
      </div>
      <div className="card mt-5 p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <span className="text-brand-600">{I.send}</span>
          <h2 className="text-[15px] font-bold text-slate-900">{L("FazerCards — khu tách riêng")}</h2>
        </div>
        <p className="mt-1 text-sm text-slate-500">{L("Telegram và Steam là các khu tách riêng của cùng một nhà cung cấp FazerCards — dùng chung API và webhook, cấu hình tại đây thay vì mỗi khu một trang cài đặt.")}</p>
        {fzrProviders.length === 0 ? (
          <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">{L("Chưa có nhà cung cấp FazerCards nào — thêm bằng nút “Thêm nhà cung cấp FZR” ở danh sách bên dưới.")}</p>
        ) : (
          <>
            <form action={adminFzrAssignmentAction} className="mt-4 flex flex-wrap items-end gap-3">
              <div className="min-w-[240px] flex-1">
                <label className="lbl">{L("Nhà cung cấp phục vụ Telegram")}</label>
                <select className="inp" name="telegram_provider_id" defaultValue={s.telegram_provider_id || ""}>
                  <option value="">{L("Tự chọn nhà cung cấp FZR đang bật đầu tiên")}</option>
                  {fzrProviders.map((p) => <option key={p.id} value={p.id}>{p.name}{p.active ? "" : L(" (đang tắt)")}</option>)}
                </select>
              </div>
              <button className="btn-primary">{L("Lưu phân công")}</button>
              <span className="pb-2 text-xs text-slate-400">{L("Khu Steam không cần phân công riêng — đơn Steam chạy theo nhà cung cấp của từng gói. Webhook FZR đặt trong form nhà cung cấp FZR; công tắc mục Telegram ở trang Mô-đun.")}</span>
            </form>
            {tgProvider && (
              <dl className="mt-4 grid gap-x-8 gap-y-2 border-t border-slate-100 pt-4 text-sm sm:grid-cols-2">
                <div className="flex justify-between gap-3"><dt className="text-slate-500">{L("Đang phục vụ Telegram")}</dt><dd className="font-semibold text-slate-800">{tgProvider.name}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">{L("Số dư FZR")}</dt><dd className="font-semibold text-slate-800">{tgBalance || L("Không đọc được")}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">{L("Tài khoản / gói FZR")}</dt><dd className="font-semibold text-slate-800">{tgPlan || "—"}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">{L("Đường giao Telegram")}</dt><dd className="font-semibold text-slate-800">{L("Theo username (API Telegram)")}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">{L("Webhook FZR")}</dt><dd className="font-semibold text-slate-800">{s.fzr_webhook_secret ? L("Đã cấu hình secret") : L("Chưa cấu hình")}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">{L("Webhook phía FZR")}</dt><dd className="font-semibold text-slate-800">{fzrHook ? (fzrHook.enabled ? `${L("Đang bật")}${Number(fzrHook.consecutive_failures) > 0 ? ` · ${L("lỗi liên tiếp")} ${fzrHook.consecutive_failures}` : ""}` : L("Đang tắt")) : L("Không đọc được")}</dd></div>
                {fzrHook?.last_failure_reason ? (
                  <div className="flex justify-between gap-3"><dt className="text-slate-500">{L("Lỗi webhook gần nhất")}</dt><dd className="max-w-[420px] text-right font-medium text-rose-600">{String(fzrHook.last_failure_reason).slice(0, 160)}</dd></div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <form action={adminTelegramTestAction}>
                    <button className="btn-ghost btn-sm">{L("Kiểm tra kết nối")}</button>
                  </form>
                  <form action={adminFzrWebhookTestAction}>
                    <button className="btn-ghost btn-sm">{L("Gửi webhook test")}</button>
                  </form>
                </div>
              </dl>
            )}
            {tgProvider && fzrTx.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <h3 className="text-sm font-bold text-slate-800">{L("Biến động số dư FZR gần nhất")}</h3>
                <ul className="mt-2 divide-y divide-slate-100 text-sm">
                  {fzrTx.map((tx: any) => (
                    <li key={String(tx.id)} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-700">{String(tx.note || tx.type || "—")}</span>
                        <span className="block text-xs text-slate-400">{tx.createdAt ? dt(new Date(tx.createdAt)) : ""} · {L("Số dư sau")}: {String(tx.balanceAfter ?? "—")}</span>
                      </span>
                      <span className={`shrink-0 font-bold ${String(tx.amount || "").startsWith("-") ? "text-rose-600" : "text-emerald-600"}`}>{String(tx.amount ?? "—")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
      <div className="mt-2">
        <ProvidersClient
          providers={dtos}
          webhookSecretSet={Boolean(s.fzr_webhook_secret)}
          fzrMarkups={{
            gamekeys: s.fzr_markup_gamekeys || "",
            giftcards: s.fzr_markup_giftcards || "",
            topups: s.fzr_markup_topups || "",
            manual: s.fzr_markup_manual || "",
            telegram_stars: s.fzr_markup_telegram_stars || "",
            telegram_premium: s.fzr_markup_telegram_premium || "",
            steam_topup: s.fzr_markup_steam_topup || "",
            steam_gift: s.fzr_markup_steam_gift || "",
          }}
        />
      </div>
    </div>
  );
}
