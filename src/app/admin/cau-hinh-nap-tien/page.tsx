import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PageHead, Flash, Badge } from "@/components/ui";
import { CopyBtn } from "@/components/client";
import { adminSaveMethodsAction } from "@/app/actions/admin";

export const dynamic = "force-dynamic";

const onOff = (v: string) => (
  <>
    <option value="1">Bật</option>
    <option value="0">Tắt</option>
  </>
);

/** Cấu hình các phương thức nạp tiền của web mẹ: SePay (ngân hàng/MoMo), USDT, PayPal, Stripe. */
export default async function AdminMethodConfig({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  await requireAdminPage();
  const s = await getSettings();
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://your-domain.vn";
  const banks = await prisma.bankAccount.findMany({ where: { active: true }, orderBy: { id: "asc" } });
  const back = "/admin/cau-hinh-nap-tien";
  return (
    <div>
      <PageHead title="Cấu hình nạp tiền" desc="Bật/tắt và cấu hình từng phương thức nạp tiền của hệ thống." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <form action={adminSaveMethodsAction} className="card space-y-4 p-6">
          <input type="hidden" name="back" value={back} />
          <div className="flex items-center justify-between">
            <div className="font-bold text-slate-900">QR ngân hàng (SePay)</div>
            {s.sepay_secret ? <Badge cls="bg-emerald-100 text-emerald-800">Đã có secret</Badge> : <Badge cls="bg-rose-100 text-rose-700">Chưa có secret</Badge>}
          </div>
          <p className="text-sm text-slate-500">Ngân hàng và MoMo dùng chung kênh này — khách chuyển đúng nội dung là tiền cộng tự động.</p>
          <div>
            <label className="lbl">Webhook URL (dán vào SePay)</label>
            <div className="flex items-center gap-2">
              <input className="inp font-mono !text-xs" readOnly value={`${base}/api/webhooks/sepay`} />
              <CopyBtn text={`${base}/api/webhooks/sepay`} />
            </div>
          </div>
          <div>
            <label className="lbl">Secret webhook (API Key của SePay) {s.sepay_secret && <span className="font-semibold text-emerald-600">— đã lưu</span>}</label>
            <input className="inp" name="sepay_secret" type="password" autoComplete="off" placeholder={s.sepay_secret ? "Để trống = giữ nguyên" : "Dán API Key từ SePay vào đây"} />
          </div>
          <p className="text-sm text-slate-500">
            Đang có {banks.length} tài khoản nhận tiền{banks.length ? `: ${banks.map((b) => b.bankName).join(", ")}` : ""} — quản lý ở trang Ngân hàng.
          </p>
          <div className="flex gap-2">
            <button className="btn-primary !py-2.5">Lưu SePay</button>
            <a href="/admin/ngan-hang" className="btn-ghost !py-2.5">Mở trang Ngân hàng</a>
          </div>
        </form>

        <form action={adminSaveMethodsAction} className="card space-y-4 p-6">
          <input type="hidden" name="back" value={back} />
          <div className="flex items-center justify-between">
            <div className="font-bold text-slate-900">USDT (Crypto)</div>
            {s.usdt_enabled === "1" ? <Badge cls="bg-emerald-100 text-emerald-800">Đang bật</Badge> : <Badge cls="bg-slate-100 text-slate-500">Đang tắt</Badge>}
          </div>
          <div>
            <label className="lbl">Trạng thái</label>
            <select className="inp" name="usdt_enabled" defaultValue={s.usdt_enabled}>{onOff(s.usdt_enabled)}</select>
          </div>
          <div><label className="lbl">Địa chỉ ví nhận</label><input className="inp" name="usdt_address" defaultValue={s.usdt_address} placeholder="T..." /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="lbl">Mạng</label>
              <select className="inp" name="usdt_network" defaultValue={s.usdt_network}>
                <option value="TRC20">TRC20</option><option value="BEP20">BEP20</option><option value="ERC20">ERC20</option>
              </select>
            </div>
            <div><label className="lbl">Tỉ giá 1 USDT (đ)</label><input className="inp" name="usdt_rate" type="number" min={0} defaultValue={s.usdt_rate} placeholder={s.usd_rate || "25000"} /></div>
          </div>
          <button className="btn-primary !py-2.5">Lưu USDT</button>
        </form>

        <form action={adminSaveMethodsAction} className="card space-y-4 p-6">
          <input type="hidden" name="back" value={back} />
          <div className="flex items-center justify-between">
            <div className="font-bold text-slate-900">PayPal</div>
            {s.paypal_enabled === "1" ? <Badge cls="bg-emerald-100 text-emerald-800">Đang bật</Badge> : <Badge cls="bg-slate-100 text-slate-500">Đang tắt</Badge>}
          </div>
          <div>
            <label className="lbl">Trạng thái</label>
            <select className="inp" name="paypal_enabled" defaultValue={s.paypal_enabled}>{onOff(s.paypal_enabled)}</select>
          </div>
          <div><label className="lbl">Client ID</label><input className="inp" name="paypal_client_id" defaultValue={s.paypal_client_id} /></div>
          <div><label className="lbl">Client Secret</label><input className="inp" name="paypal_client_secret" type="password" autoComplete="off" placeholder={s.paypal_client_secret ? "Để trống = giữ nguyên" : ""} /></div>
          <div>
            <label className="lbl">Môi trường</label>
            <select className="inp" name="paypal_mode" defaultValue={s.paypal_mode}>
              <option value="sandbox">Sandbox (thử nghiệm)</option><option value="live">Live (thật)</option>
            </select>
          </div>
          <button className="btn-primary !py-2.5">Lưu PayPal</button>
        </form>

        <form action={adminSaveMethodsAction} className="card space-y-4 p-6">
          <input type="hidden" name="back" value={back} />
          <div className="flex items-center justify-between">
            <div className="font-bold text-slate-900">Stripe</div>
            {s.stripe_enabled === "1" ? <Badge cls="bg-emerald-100 text-emerald-800">Đang bật</Badge> : <Badge cls="bg-slate-100 text-slate-500">Đang tắt</Badge>}
          </div>
          <div>
            <label className="lbl">Trạng thái</label>
            <select className="inp" name="stripe_enabled" defaultValue={s.stripe_enabled}>{onOff(s.stripe_enabled)}</select>
          </div>
          <div><label className="lbl">Publishable Key (pk_...)</label><input className="inp" name="stripe_publishable_key" defaultValue={s.stripe_publishable_key} /></div>
          <div><label className="lbl">Secret Key (sk_...)</label><input className="inp" name="stripe_secret_key" type="password" autoComplete="off" placeholder={s.stripe_secret_key ? "Để trống = giữ nguyên" : ""} /></div>
          <div><label className="lbl">Webhook Secret (whsec_...)</label><input className="inp" name="stripe_webhook_secret" type="password" autoComplete="off" placeholder={s.stripe_webhook_secret ? "Để trống = giữ nguyên" : ""} /></div>
          <div>
            <label className="lbl">Webhook URL (dán vào Stripe)</label>
            <div className="flex items-center gap-2">
              <input className="inp font-mono !text-xs" readOnly value={`${base}/api/webhooks/stripe`} />
              <CopyBtn text={`${base}/api/webhooks/stripe`} />
            </div>
          </div>
          <button className="btn-primary !py-2.5">Lưu Stripe</button>
        </form>

        <form action={adminSaveMethodsAction} className="card space-y-4 p-6">
          <input type="hidden" name="back" value={back} />
          <div className="font-bold text-slate-900">Tỉ giá USD → VNĐ</div>
          <p className="text-sm text-slate-500">Tỉ giá quy đổi cho PayPal và Stripe.</p>
          <div><label className="lbl">1 USD = ? đ</label><input className="inp" name="usd_rate" type="number" min={0} defaultValue={s.usd_rate} /></div>
          <button className="btn-primary !py-2.5">Lưu tỉ giá</button>
        </form>
      </div>
    </div>
  );
}
