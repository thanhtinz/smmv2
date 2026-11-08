import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PageHead, Flash, Badge } from "@/components/ui";
import { CopyBtn } from "@/components/client";
import { adminSaveMethodsAction, adminBoltPingAction, adminStripeTestAction, adminPaypalTestAction, adminSepayTestAction, adminFetchRatesNowAction } from "@/app/actions/admin";
import { saveRatesAction } from "@/app/actions/admin-features";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

const onOff = (v: string, L: (t: string) => string) => (
  <>
    <option value="1">{L("Bật")}</option>
    <option value="0">{L("Tắt")}</option>
  </>
);

/** Cấu hình các phương thức nạp tiền của web mẹ: SePay (ngân hàng/MoMo), USDT, PayPal, Stripe. */
export default async function AdminMethodConfig({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  await requireAdminPage();
  const { L, Ld } = await getServerI18n(null);
  const s = await getSettings();
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://your-domain.vn";
  const banks = await prisma.bankAccount.findMany({ where: { active: true }, orderBy: { id: "asc" } });
  const back = "/admin/cau-hinh-nap-tien";
  return (
    <div>
      <PageHead title={L("Cấu hình nạp tiền")} desc={L("Bật/tắt và cấu hình từng phương thức nạp tiền của hệ thống.")} />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <form action={adminSaveMethodsAction} className="card space-y-4 p-6">
          <input type="hidden" name="back" value={back} />
          <div className="flex items-center justify-between">
            <div className="font-bold text-slate-900">{L("QR ngân hàng (SePay)")}</div>
            {s.sepay_secret ? <Badge cls="bg-emerald-100 text-emerald-800">{L("Đã có secret")}</Badge> : <Badge cls="bg-rose-100 text-rose-700">{L("Chưa có secret")}</Badge>}
          </div>
          <p className="text-sm text-slate-500">{L("Ngân hàng và MoMo dùng chung kênh này — khách chuyển đúng nội dung là tiền cộng tự động.")}</p>
          <div>
            <label className="lbl">{L("Webhook URL (dán vào SePay)")}</label>
            <div className="flex items-center gap-2">
              <input className="inp font-mono !text-xs" readOnly value={`${base}/api/webhooks/sepay`} />
              <CopyBtn text={`${base}/api/webhooks/sepay`} />
            </div>
          </div>
          <div>
            <label className="lbl">{L("Secret webhook (API Key của SePay)")} {s.sepay_secret && <span className="font-semibold text-emerald-600">{L("— đã lưu")}</span>}</label>
            <input className="inp" name="sepay_secret" type="password" autoComplete="off" placeholder={s.sepay_secret ? L("Để trống = giữ nguyên") : L("Dán API Key từ SePay vào đây")} />
          </div>
          <p className="text-sm text-slate-500">
            {L("Đang có") + " " + banks.length + " " + L("tài khoản nhận tiền") + (banks.length ? `: ${banks.map((b) => b.bankName).join(", ")}` : "") + " " + L("— quản lý ở trang Ngân hàng.")}
          </p>
          <p className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-slate-500">{L("Khách ghi đúng nội dung chứa mã nạp thì hệ thống tự đối soát và cộng tiền trong vài phút; sai nội dung sẽ chờ duyệt tay ở trang Quản lý nạp tiền.")}</p>
          <div className="flex gap-2">
            <button className="btn-primary !py-2.5">{L("Lưu SePay")}</button>
            <button formAction={adminSepayTestAction} className="btn-ghost !py-2.5" title={L("Gọi thử API dữ liệu SePay bằng API key ở trên (hoặc key đã lưu)")}>{L("Kiểm tra kết nối")}</button>
            <a href="/admin/ngan-hang" className="btn-ghost !py-2.5">{L("Mở trang Ngân hàng")}</a>
          </div>
        </form>

        <form action={adminSaveMethodsAction} className="card space-y-4 p-6">
          <input type="hidden" name="back" value={back} />
          <div className="flex items-center justify-between">
            <div className="font-bold text-slate-900">USDT qua BoltUtil</div>
            {s.boltutil_enabled === "1" ? <Badge cls="bg-emerald-100 text-emerald-800">{L("Đang bật")}</Badge> : <Badge cls="bg-slate-100 text-slate-500">{L("Đang tắt")}</Badge>}
          </div>
          <div>
            <label className="lbl">{L("Trạng thái")}</label>
            <select className="inp" name="boltutil_enabled" defaultValue={s.boltutil_enabled || "0"}>{onOff(s.boltutil_enabled || "0", L)}</select>
          </div>
          <div><label className="lbl">{L("API key (X-Bolt-Key)")}</label><input className="inp" type="password" name="boltutil_api_key" placeholder={s.boltutil_api_key ? "•••••••• (đã đặt — nhập để thay)" : "bolt_..."} autoComplete="off" /></div>
          <div><label className="lbl">{L("Webhook secret (khoá ký HMAC)")}</label><input className="inp" type="password" name="boltutil_webhook_secret" placeholder={s.boltutil_webhook_secret ? "•••••••• (đã đặt — nhập để thay)" : "whsec_..."} autoComplete="off" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="lbl">{L("Mạng mặc định")}</label>
              <select className="inp" name="boltutil_default_network" defaultValue={s.boltutil_default_network || "TRON"}>
                {["TRON", "BSC", "ETHEREUM", "SOLANA", "ARBITRUM", "BASE"].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div><label className="lbl">{L("Phiên hết hạn sau (phút)")}</label><input className="inp" name="boltutil_expires_minutes" type="number" min={5} max={60} defaultValue={s.boltutil_expires_minutes || "30"} /></div>
          </div>
          <div>
            <label className="lbl">{L("Các mạng cho phép nạp (phẩy ngăn cách)")}</label>
            <input className="inp" name="boltutil_networks" defaultValue={s.boltutil_networks || "TRON"} placeholder="TRON,BSC,SOLANA" />
            <p className="mt-1.5 text-xs text-slate-400">{L("Chỉ hiện các mạng đã cấu hình ví nhận trong dashboard BoltUtil.")}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="lbl">{L("Hình thức thanh toán")}</label>
              <select className="inp" name="boltutil_payment_method" defaultValue={s.boltutil_payment_method || "MANUAL_TRANSFER"}>
                <option value="WALLET">WALLET</option><option value="MANUAL_TRANSFER">MANUAL_TRANSFER</option>
              </select>
            </div>
            <div><label className="lbl">{L("Tỉ giá 1 USDT (đ)")}</label><input className="inp" name="usdt_rate" type="number" min={0} defaultValue={s.usdt_rate} placeholder={s.usd_rate || "25000"} /></div>
          </div>
          <div>
            <label className="lbl">{L("URL webhook (dán vào BoltUtil → Integrations → API)")}</label>
            <input className="inp" readOnly value="https://smmv2-zeta.vercel.app/api/webhooks/boltutil" />
          </div>
          <p className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-slate-500">{L("BoltUtil không giữ tiền — USDT về thẳng ví nhận đã cấu hình trong dashboard BoltUtil; tiền cộng cho khách theo số thực nhận khi giao dịch đủ xác nhận.")}</p>
          <div className="flex flex-wrap gap-3">
            <button className="btn-primary !py-2.5">{L("Lưu BoltUtil")}</button>
          </div>
        </form>
        <form action={adminBoltPingAction} className="card flex items-center justify-between gap-4 p-6">
          <div>
            <div className="font-bold text-slate-900">{L("Kiểm tra kết nối BoltUtil")}</div>
            <p className="mt-0.5 text-sm text-slate-500">{L("Gọi thử endpoint ping bằng API key và khoá ký đã lưu.")}</p>
          </div>
          <button className="btn-ghost !py-2.5">{L("Kiểm tra kết nối")}</button>
        </form>

        <form action={adminSaveMethodsAction} className="card space-y-4 p-6">
          <input type="hidden" name="back" value={back} />
          <div className="flex items-center justify-between">
            <div className="font-bold text-slate-900">PayPal</div>
            {s.paypal_enabled === "1" ? <Badge cls="bg-emerald-100 text-emerald-800">{L("Đang bật")}</Badge> : <Badge cls="bg-slate-100 text-slate-500">{L("Đang tắt")}</Badge>}
          </div>
          <div>
            <label className="lbl">{L("Trạng thái")}</label>
            <select className="inp" name="paypal_enabled" defaultValue={s.paypal_enabled}>{onOff(s.paypal_enabled, L)}</select>
          </div>
          <div><label className="lbl">Client ID</label><input className="inp" name="paypal_client_id" defaultValue={s.paypal_client_id} /></div>
          <div><label className="lbl">Client Secret</label><input className="inp" name="paypal_client_secret" type="password" autoComplete="off" placeholder={s.paypal_client_secret ? L("Để trống = giữ nguyên") : ""} /></div>
          <div>
            <label className="lbl">{L("Môi trường")}</label>
            <select className="inp" name="paypal_mode" defaultValue={s.paypal_mode}>
              <option value="sandbox">{L("Sandbox (thử nghiệm)")}</option><option value="live">{L("Live (thật)")}</option>
            </select>
          </div>
          <p className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-slate-500">{L("Lấy Client ID / Secret tại PayPal Developer → Apps & Credentials, chọn đúng môi trường khớp ô Môi trường ở trên. PayPal không cần cấu hình webhook.")}</p>
          <div className="flex gap-2">
            <button className="btn-primary !py-2.5">{L("Lưu PayPal")}</button>
            <button formAction={adminPaypalTestAction} className="btn-ghost !py-2.5" title={L("Xin thử access token OAuth bằng Client ID/Secret ở trên (hoặc đã lưu)")}>{L("Kiểm tra kết nối")}</button>
          </div>
        </form>

        <form action={adminSaveMethodsAction} className="card space-y-4 p-6">
          <input type="hidden" name="back" value={back} />
          <div className="flex items-center justify-between">
            <div className="font-bold text-slate-900">Stripe</div>
            {s.stripe_enabled === "1" ? <Badge cls="bg-emerald-100 text-emerald-800">{L("Đang bật")}</Badge> : <Badge cls="bg-slate-100 text-slate-500">{L("Đang tắt")}</Badge>}
          </div>
          <div>
            <label className="lbl">{L("Trạng thái")}</label>
            <select className="inp" name="stripe_enabled" defaultValue={s.stripe_enabled}>{onOff(s.stripe_enabled, L)}</select>
          </div>
          <div><label className="lbl">Publishable Key (pk_...)</label><input className="inp" name="stripe_publishable_key" defaultValue={s.stripe_publishable_key} /></div>
          <div><label className="lbl">Secret Key (sk_...)</label><input className="inp" name="stripe_secret_key" type="password" autoComplete="off" placeholder={s.stripe_secret_key ? L("Để trống = giữ nguyên") : ""} /></div>
          <div><label className="lbl">Webhook Secret (whsec_...)</label><input className="inp" name="stripe_webhook_secret" type="password" autoComplete="off" placeholder={s.stripe_webhook_secret ? L("Để trống = giữ nguyên") : ""} /></div>
          <div>
            <label className="lbl">{L("Webhook URL (dán vào Stripe)")}</label>
            <div className="flex items-center gap-2">
              <input className="inp font-mono !text-xs" readOnly value={`${base}/api/webhooks/stripe`} />
              <CopyBtn text={`${base}/api/webhooks/stripe`} />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary !py-2.5">{L("Lưu Stripe")}</button>
            <button formAction={adminStripeTestAction} className="btn-ghost !py-2.5" title={L("Gọi thử API số dư Stripe bằng Secret Key ở trên (hoặc key đã lưu)")}>{L("Kiểm tra kết nối")}</button>
          </div>
        </form>

        <form action={saveRatesAction} className="card space-y-4 p-6 xl:col-span-2">
          <input type="hidden" name="back" value={back} />
          <input type="hidden" name="rates_form_full" value="1" />
          <div className="font-bold text-slate-900">{L("Tỉ giá & tiền tệ")}</div>
          <p className="text-sm text-slate-500">{L("Tỉ giá quy đổi VNĐ cho nạp quốc tế (PayPal/Stripe theo USD, BoltUtil theo USDT) và cho hiển thị ngoại tệ phía khách. Tiền thật trong hệ thống luôn là VNĐ.")}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {([
              { code: "USD", key: "usd_rate", note: L("Nạp PayPal / Stripe") },
              { code: "USDT", key: "usdt_rate", note: L("Nạp BoltUtil — trống = theo USD") },
              { code: "EUR", key: "rate_eur", note: L("Chỉ quy đổi hiển thị") },
              { code: "CNY", key: "rate_cny", note: L("Chỉ quy đổi hiển thị") },
              { code: "THB", key: "rate_thb", note: L("Chỉ quy đổi hiển thị") },
              { code: "JPY", key: "rate_jpy", note: L("Chỉ quy đổi hiển thị") },
              { code: "KRW", key: "rate_krw", note: L("Chỉ quy đổi hiển thị") },
            ] as const).map((r) => (
              <div key={r.key}>
                <label className="lbl">1 {r.code} = ? đ</label>
                <input className="inp" name={r.key} type="number" step="any" min={0} defaultValue={s[r.key]} placeholder={r.code === "USDT" ? s.usd_rate || "25000" : undefined} />
                <p className="mt-1 text-xs text-slate-400">{r.note}</p>
              </div>
            ))}
            <div>
              <label className="lbl">{L("Số tiền nạp quốc tế tối thiểu (USD)")}</label>
              <input className="inp" name="intl_min_usd" type="number" min={1} defaultValue={s.intl_min_usd} />
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 px-4 py-3.5">
            <label className="flex cursor-pointer items-start gap-3">
              <input type="checkbox" name="rates_auto_enabled" defaultChecked={s.rates_auto_enabled === "1"} className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600" />
              <span>
                <span className="block text-sm font-bold text-slate-800">{L("Tự động cập nhật tỉ giá thị trường")}</span>
                <span className="mt-0.5 block text-[13px] leading-relaxed text-slate-500">{L("Khi bật, vòng đồng bộ (cron) tự kéo tỉ giá từ {source} và ghi vào các ô trên; USDT theo tỉ giá USD. Đồng nào nguồn không có dữ liệu thì giữ nguyên. Khi tắt, tỉ giá nhập tay là tỉ giá hiệu lực.").replace("{source}", "open.er-api.com")}</span>
              </span>
            </label>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-slate-500">
              <span>{L("Nguồn")}: <b className="text-slate-700">{s.rates_auto_source || "open.er-api.com (ExchangeRate-API, gốc USD)"}</b></span>
              <span>{L("Cập nhật lần cuối")}: <b className="text-slate-700">{s.rates_auto_updated_at ? new Date(s.rates_auto_updated_at).toLocaleString("vi-VN") : L("Chưa cập nhật lần nào")}</b></span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary !py-2.5">{L("Lưu tỉ giá")}</button>
            <button formAction={adminFetchRatesNowAction} className="btn-ghost !py-2.5" title={L("Kéo tỉ giá thị trường về ngay, không chờ cron")} >{L("Cập nhật ngay")}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
