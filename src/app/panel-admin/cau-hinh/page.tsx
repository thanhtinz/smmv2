import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePanelOwnerPage } from "@/lib/panel-access";
import { PageHead, Flash } from "@/components/ui";
import { panelSaveConfigAction } from "@/app/actions/panel";

export const dynamic = "force-dynamic";

const mask = (v: string | null | undefined) => (v ? "••••••••••••" : "");

/** Cấu hình riêng của panel: tài khoản nhận tiền, ví USDT, máy chủ thư,
 *  Telegram báo đơn và Google đăng nhập — tất cả của chính chủ panel. */
export default async function PanelConfigPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const { user, panel } = await requirePanelOwnerPage();
  return (
    <div>
      <PageHead title="Cấu hình panel" desc="Các cấu hình riêng của gian hàng bạn: nhận tiền, gửi thư, báo đơn và đăng nhập Google." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">

        <form action={panelSaveConfigAction} className="card space-y-4 p-6">
          <input type="hidden" name="section" value="bank" />
          <div className="font-bold text-slate-900">Ngân hàng nhận tiền của panel</div>
          <p className="text-sm text-slate-400">Khách của panel thấy tài khoản này ở trang Nạp tiền và gửi yêu cầu — bạn duyệt ở mục Nạp tiền của khách.</p>
          <div><label className="lbl">Tên ngân hàng</label><input name="bankName" defaultValue={panel.bankName || ""} placeholder="VD: Vietcombank" className="inp" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="lbl">Số tài khoản</label><input name="bankAccount" defaultValue={panel.bankAccount || ""} className="inp" /></div>
            <div><label className="lbl">Chủ tài khoản</label><input name="bankHolder" defaultValue={panel.bankHolder || ""} className="inp" /></div>
          </div>
          <button className="btn-primary !py-2.5">Lưu ngân hàng</button>
        </form>

        <form action={panelSaveConfigAction} className="card space-y-4 p-6">
          <input type="hidden" name="section" value="usdt" />
          <div className="font-bold text-slate-900">Ví USDT của panel</div>
          <p className="text-sm text-slate-400">Điền ví của bạn thì khách panel nạp USDT sẽ chuyển về ví này, theo tỉ giá bạn đặt — bạn duyệt ở mục Nạp tiền của khách.</p>
          <div><label className="lbl">Địa chỉ ví</label><input name="usdtAddress" defaultValue={panel.usdtAddress || ""} className="inp" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="lbl">Mạng</label><input name="usdtNetwork" defaultValue={panel.usdtNetwork || ""} placeholder="TRC20" className="inp" /></div>
            <div><label className="lbl">Tỉ giá 1 USDT (đ)</label><input name="usdtRate" type="number" min={0} defaultValue={panel.usdtRate || ""} placeholder="25400" className="inp" /></div>
          </div>
          <button className="btn-primary !py-2.5">Lưu ví USDT</button>
        </form>

        <form action={panelSaveConfigAction} className="card space-y-4 p-6">
          <input type="hidden" name="section" value="smtp" />
          <div className="font-bold text-slate-900">Thư SMTP của panel</div>
          <p className="text-sm text-slate-400">Email marketing của panel sẽ gửi qua máy chủ thư này (trống thì dùng thư hệ thống của web chính).</p>
          <div className="grid grid-cols-[1fr_110px] gap-4">
            <div><label className="lbl">Máy chủ SMTP</label><input name="smtpHost" defaultValue={panel.smtpHost || ""} placeholder="smtp.gmail.com" className="inp" /></div>
            <div><label className="lbl">Cổng</label><input name="smtpPort" defaultValue={panel.smtpPort || ""} placeholder="587" className="inp" /></div>
          </div>
          <div><label className="lbl">Tài khoản</label><input name="smtpUser" defaultValue={panel.smtpUser || ""} className="inp" /></div>
          <div><label className="lbl">Mật khẩu / mật khẩu ứng dụng {panel.smtpPass && <span className="font-semibold text-emerald-600">— đã lưu (để trống nếu giữ nguyên)</span>}</label><input name="smtpPass" type="password" autoComplete="off" placeholder={mask(panel.smtpPass)} className="inp" /></div>
          <div><label className="lbl">Địa chỉ gửi (From)</label><input name="smtpFrom" defaultValue={panel.smtpFrom || ""} placeholder="Shop <shop@example.com>" className="inp" /></div>
          <label className="flex items-center justify-between gap-4"><span className="text-sm text-slate-600">Dùng SSL (cổng 465)</span><input type="checkbox" name="smtpSecure" defaultChecked={panel.smtpSecure} className="h-5 w-5 accent-slate-900" /></label>
          <button className="btn-primary !py-2.5">Lưu cấu hình thư</button>
        </form>

        <div className="space-y-6">
          <form action={panelSaveConfigAction} className="card space-y-4 p-6">
            <input type="hidden" name="section" value="telegram" />
            <div className="font-bold text-slate-900">Telegram báo đơn</div>
            <p className="text-sm text-slate-400">Có đơn mới qua gian hàng (SMM hoặc Premium), bot sẽ nhắn ngay cho bạn.</p>
            <div><label className="lbl">Bot token {panel.telegramBotToken && <span className="font-semibold text-emerald-600">— đã lưu</span>}</label><input name="telegramBotToken" defaultValue="" placeholder={mask(panel.telegramBotToken) || "123456:ABC-..."} className="inp" /></div>
            <div><label className="lbl">Chat ID của bạn</label><input name="telegramChatId" defaultValue={panel.telegramChatId || ""} className="inp" /></div>
            <button className="btn-primary !py-2.5">Lưu Telegram</button>
          </form>

          <form action={panelSaveConfigAction} className="card space-y-4 p-6">
            <input type="hidden" name="section" value="google" />
            <div className="font-bold text-slate-900">Đăng nhập Google của panel</div>
            <p className="text-sm text-slate-400">Khách vào bằng tên miền riêng của panel sẽ đăng nhập Google bằng ứng dụng này; tài khoản mới tự thuộc về panel của bạn.</p>
            <div><label className="lbl">Google Client ID</label><input name="googleClientId" defaultValue={panel.googleClientId || ""} className="inp" /></div>
            <div><label className="lbl">Google Client Secret {panel.googleClientSecret && <span className="font-semibold text-emerald-600">— đã lưu</span>}</label><input name="googleClientSecret" type="password" autoComplete="off" placeholder={mask(panel.googleClientSecret)} className="inp" /></div>
            <button className="btn-primary !py-2.5">Lưu Google</button>
          </form>

          <form action={panelSaveConfigAction} className="card space-y-4 p-6">
            <input type="hidden" name="section" value="paypal" />
            <div className="font-bold text-slate-900">PayPal của panel</div>
            <p className="text-sm text-slate-400">Method nạp như web mẹ nhưng bằng tài khoản của bạn: khách của panel nạp PayPal sẽ trả tiền vào tài khoản PayPal này và được cộng số dư tự động. Chưa bật thì khách dùng cổng của web mẹ (nếu mẹ có bật).</p>
            <label className="flex items-center justify-between gap-4"><span className="text-sm text-slate-600">Bật nạp PayPal của panel</span><input type="checkbox" name="paypalEnabled" defaultChecked={panel.paypalEnabled} className="h-5 w-5 accent-slate-900" /></label>
            <div><label className="lbl">Client ID</label><input name="paypalClientId" defaultValue={panel.paypalClientId || ""} className="inp" /></div>
            <div><label className="lbl">Client Secret {panel.paypalSecret && <span className="font-semibold text-emerald-600">— đã lưu</span>}</label><input name="paypalSecret" type="password" autoComplete="off" placeholder={mask(panel.paypalSecret)} className="inp" /></div>
            <div><label className="lbl">Môi trường</label><select name="paypalMode" defaultValue={panel.paypalMode || "sandbox"} className="inp"><option value="sandbox">Sandbox (thử nghiệm)</option><option value="live">Live (thật)</option></select></div>
            <button className="btn-primary !py-2.5">Lưu PayPal</button>
          </form>

          <form action={panelSaveConfigAction} className="card space-y-4 p-6">
            <input type="hidden" name="section" value="stripe" />
            <div className="font-bold text-slate-900">Stripe của panel</div>
            <p className="text-sm text-slate-400">Khách của panel nạp Stripe sẽ trả vào tài khoản Stripe này. Trong Stripe Dashboard, trỏ webhook về <b className="text-slate-600">/api/webhooks/stripe</b> của website và dán Webhook Secret vào đây — hệ thống tự nhận diện theo chữ ký.</p>
            <label className="flex items-center justify-between gap-4"><span className="text-sm text-slate-600">Bật nạp Stripe của panel</span><input type="checkbox" name="stripeEnabled" defaultChecked={panel.stripeEnabled} className="h-5 w-5 accent-slate-900" /></label>
            <div><label className="lbl">Secret Key (sk_...) {panel.stripeSecretKey && <span className="font-semibold text-emerald-600">— đã lưu</span>}</label><input name="stripeSecretKey" type="password" autoComplete="off" placeholder={mask(panel.stripeSecretKey)} className="inp" /></div>
            <div><label className="lbl">Webhook Secret (whsec_...) {panel.stripeWebhookSecret && <span className="font-semibold text-emerald-600">— đã lưu</span>}</label><input name="stripeWebhookSecret" type="password" autoComplete="off" placeholder={mask(panel.stripeWebhookSecret)} className="inp" /></div>
            <button className="btn-primary !py-2.5">Lưu Stripe</button>
          </form>
        </div>
      </div>
    </div>
  );
}
