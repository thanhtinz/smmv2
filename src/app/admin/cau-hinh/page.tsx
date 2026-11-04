import { getSettings } from "@/lib/settings";
import { requireAdminPage } from "@/lib/auth";
import { PageHead, Flash } from "@/components/ui";
import { adminSaveSettings } from "@/app/actions/admin";

export const dynamic = "force-dynamic";

export default async function AdminSettings({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  await requireAdminPage();
  const s = await getSettings();
  const cronUrl = `${process.env.NEXT_PUBLIC_SITE_URL || "https://your-domain.vn"}/api/cron/sync?secret=<CRON_SECRET>&services=1`;
  const webhookUrl = `${process.env.NEXT_PUBLIC_SITE_URL || "https://your-domain.vn"}/api/webhooks/sepay`;
  return (
    <div className="max-w-3xl">
      <PageHead title="Cấu hình hệ thống" desc="Mọi thay đổi áp dụng ngay trên toàn site." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <form action={adminSaveSettings} className="space-y-6">
        <section className="card p-6 space-y-4">
          <div className="font-bold text-slate-900">Thương hiệu & hỗ trợ</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="lbl">Tên website</label><input className="inp" name="site_name" defaultValue={s.site_name} /></div>
            <div><label className="lbl">Khẩu hiệu (tagline)</label><input className="inp" name="site_tagline" defaultValue={s.site_tagline} /></div>
            <div><label className="lbl">Telegram hỗ trợ</label><input className="inp" name="support_telegram" defaultValue={s.support_telegram} placeholder="@username" /></div>
            <div><label className="lbl">Zalo hỗ trợ (số điện thoại hoặc link)</label><input className="inp" name="support_zalo" defaultValue={s.support_zalo} placeholder="09xx xxx xxx hoặc https://zalo.me/..." /></div>
            <div><label className="lbl">Facebook hỗ trợ</label><input className="inp" name="support_facebook" defaultValue={s.support_facebook} /></div>
            <div><label className="lbl">Hotline</label><input className="inp" name="support_hotline" defaultValue={s.support_hotline} /></div>
            <div><label className="lbl">Thanh thông báo trên cùng (để trống = tắt)</label><input className="inp" name="announcement_bar" defaultValue={s.announcement_bar} /></div>
          </div>
          <div>
            <label className="lbl">Chế độ bảo trì (chặn khách, admin vẫn vào được)</label>
            <select className="inp" name="maintenance" defaultValue={s.maintenance === "1" ? "1" : "0"}>
              <option value="0">Tắt — site hoạt động bình thường</option>
              <option value="1">Bật — đang bảo trì</option>
            </select>
          </div>
        </section>

        <section className="card p-6 space-y-4">
          <div className="font-bold text-slate-900">Giao diện mặc định</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="lbl">Màu chủ đạo mặc định (khách mới)</label>
              <select className="inp" name="default_accent" defaultValue={s.default_accent || "blue"}>
                <option value="blue">Xanh dương (kiểu thatim)</option>
                <option value="violet">Tím</option>
                <option value="emerald">Xanh lá</option>
                <option value="orange">Cam</option>
                <option value="rose">Hồng</option>
                <option value="teal">Ngọc</option>
              </select>
            </div>
            <div>
              <label className="lbl">Chế độ nền mặc định</label>
              <select className="inp" name="default_mode" defaultValue={s.default_mode || "light"}>
                <option value="light">Sáng</option>
                <option value="dark">Tối</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-slate-400">Khách luôn tự đổi được 6 tông màu + sáng/tối bằng nút "Giao diện" trên thanh trên cùng; lựa chọn của họ lưu trên thiết bị của họ.</p>
        </section>

        <section className="card p-6 space-y-4">
          <div className="font-bold text-slate-900">Tài khoản nhận tiền</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="lbl">Ngân hàng</label><input className="inp" name="bank_name" defaultValue={s.bank_name} placeholder="Vd: MB Bank, Vietcombank..." /></div>
            <div><label className="lbl">Số tài khoản</label><input className="inp" name="bank_account" defaultValue={s.bank_account} /></div>
            <div><label className="lbl">Chủ tài khoản</label><input className="inp" name="bank_holder" defaultValue={s.bank_holder} /></div>
            <div><label className="lbl">Chi nhánh</label><input className="inp" name="bank_branch" defaultValue={s.bank_branch} /></div>
            <div><label className="lbl">Số MoMo</label><input className="inp" name="momo_phone" defaultValue={s.momo_phone} /></div>
            <div><label className="lbl">Tên MoMo</label><input className="inp" name="momo_name" defaultValue={s.momo_name} /></div>
          </div>
          <p className="text-xs text-slate-400">Mã QR ở trang Nạp tiền được tạo bằng VietQR theo ngân hàng + số tài khoản ở trên.</p>
        </section>

        <section className="card p-6 space-y-4">
          <div className="font-bold text-slate-900">Chính sách nạp tiền</div>
          <div><label className="lbl">Nạp tối thiểu (VND)</label><input className="inp" name="deposit_min" type="number" defaultValue={s.deposit_min} /></div>
          <div>
            <label className="lbl">Mốc thưởng nạp (JSON)</label>
            <textarea className="inp font-mono" name="deposit_bonus_tiers" rows={3} defaultValue={s.deposit_bonus_tiers} />
            <p className="text-xs text-slate-400 mt-1.5">Định dạng: [{"{"}"from":500000,"percent":2{"}"},{"{"}"from":2000000,"percent":5{"}"}] — nạp đạt mốc được cộng thêm % thưởng. Để [] nếu không thưởng.</p>
          </div>
          <div><label className="lbl">Hoa hồng giới thiệu — % trên mỗi giao dịch mua của người được giới thiệu</label><input className="inp" name="affiliate_percent" type="number" step="0.5" min="0" max="50" defaultValue={s.affiliate_percent} /></div>
        </section>
        <button className="btn-primary w-full !py-3">Lưu toàn bộ cấu hình</button>
      </form>

      <section className="card p-6 mt-6 space-y-4 text-sm">
        <div className="font-bold text-slate-900">Tích hợp tự động (thông tin kỹ thuật)</div>
        <div>
          <div className="text-slate-500 mb-1">Webhook cộng tiền tự động (SePay / Casso / ngân hàng):</div>
          <code className="block bg-slate-950 text-slate-100 rounded-xl px-4 py-3 break-all">{webhookUrl}</code>
          <p className="text-xs text-slate-400 mt-1.5">Header: <span className="font-mono">Authorization: Apikey &lt;SEPAY_WEBHOOK_SECRET&gt;</span> (đặt trong biến môi trường). Hệ thống nhận diện khách qua mã nạp trong nội dung chuyển khoản và chống cộng trùng theo mã giao dịch.</p>
        </div>
        <div>
          <div className="text-slate-500 mb-1">Cron đồng bộ đơn API + dịch vụ nhà cung cấp (gọi mỗi 5-10 phút):</div>
          <code className="block bg-slate-950 text-slate-100 rounded-xl px-4 py-3 break-all">{cronUrl}</code>
          <p className="text-xs text-slate-400 mt-1.5">Trên VPS: thêm vào crontab <span className="font-mono">*/5 * * * * curl -s "URL trên"</span>. Trên Vercel: khai báo trong vercel.json mục crons với header x-cron-secret.</p>
        </div>
      </section>
    </div>
  );
}
