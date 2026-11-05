import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PageHead, Flash } from "@/components/ui";
import { panelSaveConfigAction } from "@/app/actions/panel";

export const dynamic = "force-dynamic";

const mask = (v: string | null | undefined) => (v ? "••••••••••••" : "");

/** Cấu hình riêng của panel: tài khoản nhận tiền, ví USDT, máy chủ thư,
 *  Telegram báo đơn và Google đăng nhập — tất cả của chính chủ panel. */
export default async function PanelConfigPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const user = (await getCurrentUser())!;
  const panel = (await prisma.childPanel.findUnique({ where: { ownerId: user.id } }))!;
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
        </div>
      </div>
    </div>
  );
}
