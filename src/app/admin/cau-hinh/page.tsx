import { getSettings } from "@/lib/settings";
import { requireAdminPage } from "@/lib/auth";
import { PageHead, Flash } from "@/components/ui";
import { adminSaveSettings } from "@/app/actions/admin";
import SettingsTabs from "@/components/settings-tabs";

export const dynamic = "force-dynamic";

export default async function AdminSettings({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  await requireAdminPage();
  const s = await getSettings();
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://your-domain.vn";
  const cronUrl = `${base}/api/cron/sync?secret=<CRON_SECRET>&services=1`;
  const webhookUrl = `${base}/api/webhooks/sepay`;

  const chung = (
    <>
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
              <option value="blue">Xanh dương</option><option value="violet">Tím</option><option value="emerald">Xanh lá</option>
              <option value="orange">Cam</option><option value="rose">Hồng</option><option value="teal">Ngọc</option>
            </select>
          </div>
          <div>
            <label className="lbl">Chế độ nền mặc định</label>
            <select className="inp" name="default_mode" defaultValue={s.default_mode || "light"}>
              <option value="light">Sáng</option><option value="dark">Tối</option>
            </select>
          </div>
        </div>
      </section>
    </>
  );

  const thanhtoan = (
    <>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">Tài khoản nhận tiền (dự phòng)</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="lbl">Ngân hàng</label><input className="inp" name="bank_name" defaultValue={s.bank_name} placeholder="Vd: MB Bank, Vietcombank..." /></div>
          <div><label className="lbl">Số tài khoản</label><input className="inp" name="bank_account" defaultValue={s.bank_account} /></div>
          <div><label className="lbl">Chủ tài khoản</label><input className="inp" name="bank_holder" defaultValue={s.bank_holder} /></div>
          <div><label className="lbl">Chi nhánh</label><input className="inp" name="bank_branch" defaultValue={s.bank_branch} /></div>
          <div><label className="lbl">Số MoMo</label><input className="inp" name="momo_phone" defaultValue={s.momo_phone} /></div>
          <div><label className="lbl">Tên MoMo</label><input className="inp" name="momo_name" defaultValue={s.momo_name} /></div>
        </div>
        <p className="text-xs text-slate-400">Nếu đã thêm ngân hàng ở mục <b>Ngân hàng</b> thì trang Nạp tiền ưu tiên danh sách đó; phần này là dự phòng khi chưa có ngân hàng nào.</p>
      </section>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">Chính sách nạp tiền</div>
        <div><label className="lbl">Nạp tối thiểu (VND)</label><input className="inp" name="deposit_min" type="number" defaultValue={s.deposit_min} /></div>
        <div>
          <label className="lbl">Mốc thưởng nạp (JSON)</label>
          <textarea className="inp font-mono" name="deposit_bonus_tiers" rows={3} defaultValue={s.deposit_bonus_tiers} />
          <p className="text-xs text-slate-400 mt-1.5">Định dạng: [{"{\"from\":500000,\"percent\":2}"},{"{\"from\":2000000,\"percent\":5}"}] — nạp đạt mốc được cộng thêm % thưởng. Để [] nếu không thưởng.</p>
        </div>
        <div><label className="lbl">Hoa hồng giới thiệu — % trên mỗi giao dịch mua của người được giới thiệu</label><input className="inp" name="affiliate_percent" type="number" step="0.5" min="0" max="50" defaultValue={s.affiliate_percent} /></div>
        <div>
          <label className="lbl">Bảo vệ lợi nhuận (chặn đặt đơn khi giá bán sau chiết khấu thấp hơn giá vốn)</label>
          <select className="inp" name="profit_protection" defaultValue={s.profit_protection === "0" ? "0" : "1"}><option value="1">Bật</option><option value="0">Tắt</option></select>
        </div>
      </section>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">Thanh toán quốc tế — PayPal & Stripe</div>
        <div><label className="lbl">Tỉ giá quy đổi: 1 USD = ? VND</label><input className="inp" name="usd_rate" type="number" min="1000" defaultValue={s.usd_rate} /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="lbl">PayPal</label>
            <select className="inp" name="paypal_enabled" defaultValue={s.paypal_enabled === "1" ? "1" : "0"}><option value="0">Tắt</option><option value="1">Bật</option></select></div>
          <div><label className="lbl">Môi trường PayPal</label>
            <select className="inp" name="paypal_mode" defaultValue={s.paypal_mode || "sandbox"}><option value="sandbox">Sandbox (thử nghiệm)</option><option value="live">Live (thật)</option></select></div>
          <div><label className="lbl">PayPal Client ID</label><input className="inp" name="paypal_client_id" defaultValue={s.paypal_client_id} /></div>
          <div><label className="lbl">PayPal Client Secret</label><input className="inp" name="paypal_client_secret" defaultValue={s.paypal_client_secret} /></div>
          <div><label className="lbl">Stripe</label>
            <select className="inp" name="stripe_enabled" defaultValue={s.stripe_enabled === "1" ? "1" : "0"}><option value="0">Tắt</option><option value="1">Bật</option></select></div>
          <div><label className="lbl">Stripe Publishable Key</label><input className="inp" name="stripe_publishable_key" defaultValue={s.stripe_publishable_key} /></div>
          <div><label className="lbl">Stripe Secret Key</label><input className="inp" name="stripe_secret_key" defaultValue={s.stripe_secret_key} /></div>
          <div><label className="lbl">Stripe Webhook Secret (whsec_...)</label><input className="inp" name="stripe_webhook_secret" defaultValue={s.stripe_webhook_secret} /></div>
        </div>
        <p className="text-xs text-slate-400">Webhook Stripe trỏ về <span className="font-mono">/api/webhooks/stripe</span> (sự kiện checkout.session.completed).</p>
      </section>
    </>
  );

  const email = (
    <section className="card p-6 space-y-4">
      <div className="font-bold text-slate-900">Máy chủ Email (SMTP)</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label className="lbl">SMTP Host</label><input className="inp" name="smtp_host" defaultValue={s.smtp_host} placeholder="VD: smtp.gmail.com" /></div>
        <div><label className="lbl">SMTP Port</label><input className="inp" name="smtp_port" type="number" defaultValue={s.smtp_port} /></div>
        <div><label className="lbl">Tài khoản SMTP</label><input className="inp" name="smtp_user" defaultValue={s.smtp_user} /></div>
        <div><label className="lbl">Mật khẩu SMTP / App Password</label><input className="inp" name="smtp_pass" defaultValue={s.smtp_pass} /></div>
        <div><label className="lbl">Địa chỉ gửi (From)</label><input className="inp" name="smtp_from" defaultValue={s.smtp_from} placeholder="VD: SMMv2 <no-reply@domain.vn>" /></div>
        <div><label className="lbl">Bảo mật SSL/TLS (cổng 465)</label>
          <select className="inp" name="smtp_secure" defaultValue={s.smtp_secure === "1" ? "1" : "0"}><option value="0">Tắt (STARTTLS — cổng 587)</option><option value="1">Bật (SSL — cổng 465)</option></select></div>
      </div>
      <p className="text-xs text-slate-400">Dùng cho Email Marketing. Gmail cần bật xác minh 2 bước và tạo App Password.</p>
    </section>
  );

  const telegram = (
    <section className="card p-6 space-y-4">
      <div className="font-bold text-slate-900">Telegram báo tin cho admin</div>
      <div>
        <label className="lbl">Báo tin qua Telegram</label>
        <select className="inp" name="telegram_notify" defaultValue={s.telegram_notify === "1" ? "1" : "0"}><option value="0">Tắt</option><option value="1">Bật — báo nạp tiền thành công</option></select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label className="lbl">Bot Token</label><input className="inp" name="telegram_bot_token" defaultValue={s.telegram_bot_token} placeholder="123456:ABC-..." /></div>
        <div><label className="lbl">Chat ID nhận tin</label><input className="inp" name="telegram_chat_id" defaultValue={s.telegram_chat_id} placeholder="VD: -1001234567890 hoặc 123456789" /></div>
      </div>
      <p className="text-xs text-slate-400">Tạo bot qua @BotFather, thêm bot vào nhóm/kênh hoặc nhắn tin cho bot, lấy Chat ID qua @userinfobot.</p>
    </section>
  );

  const baomat = (
    <section className="card p-6 space-y-4">
      <div className="font-bold text-slate-900">Bảo mật</div>
      <div><label className="lbl">Độ dài mật khẩu tối thiểu khi đăng ký / đổi mật khẩu</label><input className="inp" name="password_min_length" type="number" min={4} max={32} defaultValue={s.password_min_length} /></div>
      <p className="text-xs text-slate-400">Chặn IP và các tuỳ chọn nâng cao khác ở mục <b>Bảo mật nâng cao</b> trong menu.</p>
    </section>
  );

  const cron = (
    <section className="card p-6 space-y-4 text-sm">
      <div className="font-bold text-slate-900">Tích hợp tự động (Cron & Webhook)</div>
      <div>
        <div className="text-slate-500 mb-1">Webhook cộng tiền tự động (SePay / ngân hàng):</div>
        <code className="block bg-slate-950 text-slate-100 rounded-xl px-4 py-3 break-all">{webhookUrl}</code>
        <p className="text-xs text-slate-400 mt-1.5">Header: <span className="font-mono">Authorization: Apikey &lt;SEPAY_WEBHOOK_SECRET&gt;</span> (biến môi trường). Cộng tiền theo mã nạp trong nội dung chuyển khoản, chống cộng trùng theo mã giao dịch.</p>
      </div>
      <div>
        <div className="text-slate-500 mb-1">Cron đồng bộ đơn API + dịch vụ + refill + sức khoẻ nhà cung cấp (mỗi 5–10 phút):</div>
        <code className="block bg-slate-950 text-slate-100 rounded-xl px-4 py-3 break-all">{cronUrl}</code>
        <p className="text-xs text-slate-400 mt-1.5">Trên VPS: crontab <span className="font-mono">*/5 * * * * curl -s "URL trên"</span>. Trên Vercel: vercel.json mục crons với header x-cron-secret.</p>
      </div>
      <div>
        <div className="text-slate-500 mb-1">Webhook Stripe:</div>
        <code className="block bg-slate-950 text-slate-100 rounded-xl px-4 py-3 break-all">{base}/api/webhooks/stripe</code>
      </div>
      <div>
        <div className="text-slate-500 mb-1">Trang quay về sau thanh toán PayPal / Stripe:</div>
        <code className="block bg-slate-950 text-slate-100 rounded-xl px-4 py-3 break-all">{base}/api/payments/paypal/return · {base}/api/payments/stripe/return</code>
      </div>
    </section>
  );

  const script = (
    <section className="card p-6 space-y-4">
      <div className="font-bold text-slate-900">Script / HTML tuỳ chỉnh</div>
      <div><label className="lbl">Chèn vào &lt;head&gt; (mã theo dõi, xác minh...)</label><textarea className="inp font-mono" name="custom_head_html" rows={5} defaultValue={s.custom_head_html} placeholder="<script>...</script>" /></div>
      <div><label className="lbl">Chèn cuối &lt;body&gt; (chat widget, analytics...)</label><textarea className="inp font-mono" name="custom_body_html" rows={5} defaultValue={s.custom_body_html} placeholder="<script>...</script>" /></div>
      <p className="text-xs text-amber-600">Chỉ dán mã từ nguồn tin cậy — mã ở đây chạy trên mọi trang của website.</p>
    </section>
  );

  return (
    <div className="max-w-4xl">
      <PageHead title="Cấu hình hệ thống" desc="Mọi thay đổi áp dụng ngay trên toàn site." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <form action={adminSaveSettings}>
        <SettingsTabs tabs={[
          { id: "chung", label: "Chung", content: chung },
          { id: "thanhtoan", label: "Thanh toán", content: thanhtoan },
          { id: "email", label: "Email", content: email },
          { id: "telegram", label: "Telegram", content: telegram },
          { id: "baomat", label: "Bảo mật", content: baomat },
          { id: "cron", label: "Cron & Webhook", content: cron },
          { id: "script", label: "Script / HTML", content: script },
        ]} />
        <button className="btn-primary w-full !py-3 mt-6">Lưu toàn bộ cấu hình</button>
      </form>
    </div>
  );
}
