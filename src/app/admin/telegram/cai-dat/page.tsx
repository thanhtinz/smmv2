import { prisma } from "@/lib/db";
import { PageHead, Flash } from "@/components/ui";
import { getSettings } from "@/lib/settings";
import { getServerI18n } from "@/lib/lang-server";
import { getTelegramProvider } from "@/lib/tg";
import { fzrBalance, fzrMe } from "@/lib/fzr";
import { adminTelegramSettingsAction, adminTelegramTestAction } from "@/app/actions/telegram";

export const dynamic = "force-dynamic";

/** Cài đặt Telegram (khu riêng): công tắc bật/tắt mục Telegram, chọn nhà cung
 *  cấp FZR phục vụ, số dư + gói phía FZR và nút kiểm tra kết nối. */
export default async function AdminTelegramSettingsPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const { L, Ld } = await getServerI18n();
  const s = await getSettings();
  const providers = await prisma.provider.findMany({ where: { driver: "FZR" }, orderBy: { id: "asc" }, select: { id: true, name: true, active: true } });
  const selected = await getTelegramProvider();
  let balanceText = "";
  let meText = "";
  if (selected) {
    const bal = await fzrBalance(selected).catch(() => null);
    if (bal) balanceText = `${bal.balance} ${bal.currency}`;
    const me: any = await fzrMe(selected).catch(() => null);
    if (me) meText = String(me.plan || me.subscription?.plan || me.email || me.username || me.id || "");
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHead title={L("Cài đặt Telegram")} desc={L("Cấu hình riêng cho mục Telegram Stars & Premium.")} />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <form action={adminTelegramSettingsAction} className="card space-y-4 p-6">
        <div>
          <label className="lbl">{L("Mục Telegram phía khách")}</label>
          <select className="inp" name="telegram_enabled" defaultValue={s.telegram_enabled === "0" ? "0" : "1"}>
            <option value="1">{L("Bật — hiện menu và trang đặt đơn Telegram")}</option>
            <option value="0">{L("Tắt — ẩn toàn bộ mục Telegram")}</option>
          </select>
          <p className="mt-1.5 text-xs text-slate-400">{L("Công tắc duy nhất của mục Telegram, không nằm trong Mô-đun chung.")}</p>
        </div>
        <div>
          <label className="lbl">{L("Nhà cung cấp FazerCards phục vụ Telegram")}</label>
          <select className="inp" name="telegram_provider_id" defaultValue={s.telegram_provider_id || ""}>
            <option value="">{L("Tự chọn nhà cung cấp FZR đang bật đầu tiên")}</option>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.name}{p.active ? "" : L(" (đang tắt)")}</option>)}
          </select>
          <p className="mt-1.5 text-xs text-slate-400">{L("Đơn Telegram chạy qua nhà cung cấp này và các gói đã đồng bộ của nó.")}</p>
          <p className="mt-1.5 text-xs text-slate-400">{L("API key lấy tại panel FazerCards → Settings → API, nhập ở trang Nhà cung cấp.")}</p>
        </div>
        <div>
          <label className="lbl">{L("Webhook secret của FazerCards")}</label>
          <input className="inp" type="password" name="fzr_webhook_secret" placeholder={s.fzr_webhook_secret ? "•••••••• (đã đặt — nhập để thay)" : "whsec_..."} autoComplete="off" />
          <p className="mt-1.5 text-xs text-slate-400">{L("Secret lấy tại panel FazerCards → Settings → Webhooks, dùng để xác thực thông báo trạng thái đơn.")}</p>
        </div>
        <div>
          <label className="lbl">{L("URL webhook (dán vào panel FazerCards)")}</label>
          <input className="inp" readOnly value="https://smmv2-zeta.vercel.app/api/webhooks/fzr" />
          <p className="mt-1.5 text-xs text-slate-400">{L("Trạng thái đơn vẫn được đồng bộ bằng kiểm tra định kỳ kể cả khi webhook chưa cấu hình.")}</p>
        </div>
        <button className="btn-primary">{L("Lưu cài đặt")}</button>
      </form>

      <div className="card mt-5 p-6">
        <div className="font-bold text-slate-900">{L("Trạng thái kết nối FazerCards")}</div>
        {selected ? (
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-slate-500">{L("Nhà cung cấp đang dùng")}</dt><dd className="font-semibold text-slate-800">{selected.name}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">{L("Số dư FZR")}</dt><dd className="font-semibold text-slate-800">{balanceText || L("Không đọc được")}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">{L("Tài khoản / gói FZR")}</dt><dd className="font-semibold text-slate-800">{meText || "—"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">{L("Đường giao Telegram")}</dt><dd className="font-semibold text-slate-800">{s.telegram_topup_offer_id && String(s.telegram_topup_provider_id) === String(selected.id) ? L("Theo username (offer top-up Telegram)") + ` · ${s.telegram_topup_offer_id}` : L("Theo Telegram ID số (API riêng)")}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">{L("Webhook FZR")}</dt><dd className="font-semibold text-slate-800">{s.fzr_webhook_secret ? L("Đã cấu hình secret") : L("Chưa cấu hình")}</dd></div>
          </dl>
        ) : (
          <p className="mt-2 text-sm text-slate-500">{L("Chưa có nhà cung cấp FazerCards nào đang bật.")}</p>
        )}
        <form action={adminTelegramTestAction} className="mt-4">
          <button className="btn-ghost">{L("Kiểm tra kết nối")}</button>
        </form>
      </div>
    </div>
  );
}
