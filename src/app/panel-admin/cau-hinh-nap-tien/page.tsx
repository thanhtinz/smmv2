import { prisma } from "@/lib/db";
import { requirePanelOwnerPage } from "@/lib/panel-access";
import { PageHead, Flash, Badge } from "@/components/ui";
import { CopyBtn } from "@/components/client";
import { panelSaveConfigAction } from "@/app/actions/panel";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

const mask = (v?: string | null) => (v ? "••••••••" : "");
const BACK = "/panel-admin/cau-hinh-nap-tien";

/** Cấu hình các phương thức nạp tiền của panel: SePay riêng, USDT, PayPal, Stripe của chính panel. */
export default async function PanelMethodConfig({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const { panel } = await requirePanelOwnerPage();
  const { L, Ld } = await getServerI18n((panel as { langConfig?: string | null }).langConfig ?? null);
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://your-domain.vn";
  const bankCount = await prisma.panelBankAccount.count({ where: { panelId: panel.id, active: true } });
  return (
    <div>
      <PageHead title={L("Cấu hình nạp tiền")} desc={L("Bật/tắt và cấu hình từng phương thức nạp tiền của website.")} />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <form action={panelSaveConfigAction} className="card space-y-4 p-6">
          <input type="hidden" name="section" value="sepay" />
          <input type="hidden" name="back" value={BACK} />
          <div className="flex items-center justify-between">
            <div className="font-bold text-slate-900">{L("QR ngân hàng (SePay riêng)")}</div>
            {panel.sepayEnabled ? <Badge cls="bg-emerald-100 text-emerald-800">{L("Đang bật")}</Badge> : <Badge cls="bg-slate-100 text-slate-500">{L("Đang tắt")}</Badge>}
          </div>
          <p className="text-sm text-slate-500">{L("Khách nạp vào tài khoản ngân hàng của bạn sẽ được cộng tự động qua SePay của chính bạn.")}</p>
          <label className="flex items-center justify-between gap-4"><span className="text-sm text-slate-600">{L("Bật SePay riêng của panel")}</span><input type="checkbox" name="sepayEnabled" defaultChecked={panel.sepayEnabled} className="h-5 w-5 accent-slate-900" /></label>
          <div><label className="lbl">{L("Secret webhook (API Key của SePay bạn)")} {panel.sepaySecret && <span className="font-semibold text-emerald-600">{L("— đã lưu")}</span>}</label><input name="sepaySecret" type="password" autoComplete="off" defaultValue={mask(panel.sepaySecret)} placeholder={L("Chưa lưu secret")} className="inp" /></div>
          <div>
            <label className="lbl">{L("Webhook URL (dán vào SePay)")}</label>
            <div className="flex items-center gap-2">
              <input className="inp font-mono !text-xs" readOnly value={`${base}/api/webhooks/sepay`} />
              <CopyBtn text={`${base}/api/webhooks/sepay`} />
            </div>
          </div>
          <p className="text-sm text-slate-500">{L("Đang có")} {bankCount} {L("tài khoản nhận tiền đang bật — quản lý ở trang Ngân hàng.")}</p>
          <div className="flex gap-2">
            <button className="btn-primary !py-2.5">{L("Lưu SePay")}</button>
            <a href="/panel-admin/ngan-hang" className="btn-ghost !py-2.5">{L("Mở trang Ngân hàng")}</a>
          </div>
        </form>

        <form action={panelSaveConfigAction} className="card space-y-4 p-6">
          <input type="hidden" name="section" value="usdt" />
          <input type="hidden" name="back" value={BACK} />
          <div className="flex items-center justify-between">
            <div className="font-bold text-slate-900">USDT (Crypto)</div>
            {panel.usdtAddress ? <Badge cls="bg-emerald-100 text-emerald-800">{L("Đã có ví")}</Badge> : <Badge cls="bg-slate-100 text-slate-500">{L("Chưa có ví")}</Badge>}
          </div>
          <div><label className="lbl">{L("Địa chỉ ví")}</label><input name="usdtAddress" defaultValue={panel.usdtAddress || ""} className="inp" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="lbl">{L("Mạng")}</label><input name="usdtNetwork" defaultValue={panel.usdtNetwork || ""} placeholder="TRC20" className="inp" /></div>
            <div><label className="lbl">{L("Tỉ giá 1 USDT (đ)")}</label><input name="usdtRate" type="number" min={0} defaultValue={panel.usdtRate || ""} placeholder="25400" className="inp" /></div>
          </div>
          <p className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-slate-500">{L("Địa chỉ ví phải đúng mạng đã khai — khách gửi sai mạng có thể mất tiền. Khách chuyển USDT xong sẽ báo đã chuyển ở trang Nạp tiền, giao dịch vào trang Quản lý nạp tiền chờ bạn duyệt cộng.")}</p>
          <p className="text-sm text-slate-500">{panel.usdtAddress ? L("Phương thức USDT đang hiện ở trang Nạp tiền của khách với địa chỉ ví và tỉ giá này.") : L("Chưa nhập địa chỉ ví nên khách chưa thấy phương thức USDT ở trang Nạp tiền.")}</p>
          <button className="btn-primary !py-2.5">{L("Lưu USDT")}</button>
        </form>

        <form action={panelSaveConfigAction} className="card space-y-4 p-6">
          <input type="hidden" name="section" value="paypal" />
          <input type="hidden" name="back" value={BACK} />
          <div className="flex items-center justify-between">
            <div className="font-bold text-slate-900">PayPal</div>
            {panel.paypalEnabled ? <Badge cls="bg-emerald-100 text-emerald-800">{L("Đang bật")}</Badge> : <Badge cls="bg-slate-100 text-slate-500">{L("Đang tắt")}</Badge>}
          </div>
          <label className="flex items-center justify-between gap-4"><span className="text-sm text-slate-600">{L("Bật nạp PayPal của panel")}</span><input type="checkbox" name="paypalEnabled" defaultChecked={panel.paypalEnabled} className="h-5 w-5 accent-slate-900" /></label>
          <div><label className="lbl">Client ID</label><input name="paypalClientId" defaultValue={panel.paypalClientId || ""} className="inp" /></div>
          <div><label className="lbl">Client Secret {panel.paypalSecret && <span className="font-semibold text-emerald-600">{L("— đã lưu")}</span>}</label><input name="paypalSecret" type="password" autoComplete="off" defaultValue={mask(panel.paypalSecret)} placeholder={L("Chưa lưu secret")} className="inp" /></div>
          <div>
            <label className="lbl">{L("Môi trường")}</label>
            <select name="paypalMode" defaultValue={panel.paypalMode || "sandbox"} className="inp"><option value="sandbox">{L("Sandbox (thử nghiệm)")}</option><option value="live">{L("Live (thật)")}</option></select>
          </div>
          <button className="btn-primary !py-2.5">{L("Lưu PayPal")}</button>
        </form>

        <form action={panelSaveConfigAction} className="card space-y-4 p-6">
          <input type="hidden" name="section" value="stripe" />
          <input type="hidden" name="back" value={BACK} />
          <div className="flex items-center justify-between">
            <div className="font-bold text-slate-900">Stripe</div>
            {panel.stripeEnabled ? <Badge cls="bg-emerald-100 text-emerald-800">{L("Đang bật")}</Badge> : <Badge cls="bg-slate-100 text-slate-500">{L("Đang tắt")}</Badge>}
          </div>
          <label className="flex items-center justify-between gap-4"><span className="text-sm text-slate-600">{L("Bật nạp Stripe của panel")}</span><input type="checkbox" name="stripeEnabled" defaultChecked={panel.stripeEnabled} className="h-5 w-5 accent-slate-900" /></label>
          <div><label className="lbl">{L("Secret Key (sk_...)")} {panel.stripeSecretKey && <span className="font-semibold text-emerald-600">{L("— đã lưu")}</span>}</label><input name="stripeSecretKey" type="password" autoComplete="off" defaultValue={mask(panel.stripeSecretKey)} placeholder={L("Chưa lưu key")} className="inp" /></div>
          <div><label className="lbl">{L("Webhook Secret (whsec_...)")} {panel.stripeWebhookSecret && <span className="font-semibold text-emerald-600">{L("— đã lưu")}</span>}</label><input name="stripeWebhookSecret" type="password" autoComplete="off" defaultValue={mask(panel.stripeWebhookSecret)} placeholder={L("Chưa lưu secret")} className="inp" /></div>
          <div>
            <label className="lbl">{L("Webhook URL (dán vào Stripe)")}</label>
            <div className="flex items-center gap-2">
              <input className="inp font-mono !text-xs" readOnly value={`${base}/api/webhooks/stripe`} />
              <CopyBtn text={`${base}/api/webhooks/stripe`} />
            </div>
          </div>
          <button className="btn-primary !py-2.5">{L("Lưu Stripe")}</button>
        </form>
      </div>
    </div>
  );
}
