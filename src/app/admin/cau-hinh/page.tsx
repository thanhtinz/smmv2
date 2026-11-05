import { getSettings } from "@/lib/settings";
import { requireAdminPage } from "@/lib/auth";
import { PageHead, Flash } from "@/components/ui";
import { adminSaveSettings } from "@/app/actions/admin";
import SettingsTabs from "@/components/settings-tabs";
import { BonusTiersEditor, TelegramBotsEditor } from "@/components/settings-editors";

export const dynamic = "force-dynamic";

export default async function AdminSettings({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  await requireAdminPage();
  const s = await getSettings();
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://your-domain.vn";
  const cronUrl = `${base}/api/cron/sync?secret=<CRON_SECRET>&services=1`;
  const webhookUrl = `${base}/api/webhooks/sepay`;

  const googleSection = (
    <section className="card p-6 space-y-4">
      <div className="font-bold text-slate-900">Đăng nhập bằng Google</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label className="lbl">Bật đăng nhập Google</label>
          <select className="inp" name="google_enabled" defaultValue={s.google_enabled === "1" ? "1" : "0"}><option value="0">Tắt</option><option value="1">Bật</option></select></div>
        <div><label className="lbl">Client ID</label><input className="inp" name="google_client_id" defaultValue={s.google_client_id} placeholder="...apps.googleusercontent.com" /></div>
        <div><label className="lbl">Client Secret</label><input className="inp" name="google_client_secret" defaultValue={s.google_client_secret} autoComplete="off" /></div>
        <div><label className="lbl">Redirect URI cần khai trong Google Cloud</label><input className="inp font-mono" readOnly value="https://<domain-của-bạn>/api/auth/google/callback" /></div>
      </div>
      <p className="text-xs text-slate-400">Khách bấm nút Google ở trang đăng nhập: nếu email đã có tài khoản thì vào thẳng, chưa có thì hệ thống tạo tài khoản mới (khi mô-đun Đăng ký đang bật).</p>
    </section>
  );

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
          <div><label className="lbl">Email liên hệ</label><input className="inp" name="contact_email" defaultValue={s.contact_email} placeholder="support@domain.vn" /></div>
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
        <div className="font-bold text-slate-900">NameServer cho website con</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="lbl">NameServer 1 (NS1)</label><input className="inp" name="child_ns1" defaultValue={s.child_ns1} placeholder="vd: ns1.tenmienchinh.vn" /></div>
          <div><label className="lbl">NameServer 2 (NS2)</label><input className="inp" name="child_ns2" defaultValue={s.child_ns2} placeholder="vd: ns2.tenmienchinh.vn" /></div>
        </div>
        <div className="rounded-xl bg-slate-50 p-4 text-[13px] leading-relaxed text-slate-600">
          <div className="mb-1.5 font-semibold text-slate-800">Cách cấu hình NameServer:</div>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Đây là cặp nameserver của hệ thống. Lấy giá trị từ nơi đang quản lý DNS của tên miền chính (Cloudflare hoặc nhà đăng ký tên miền) — dùng đúng cặp NS mà tên miền chính của bạn đang trỏ tới.</li>
            <li>Sau khi lưu, khách đăng ký website con sẽ thấy đúng 2 giá trị này trong thẻ &quot;Thông tin NameServer&quot; ở trang Đăng ký website con và trỏ tên miền của họ về đây.</li>
            <li>Khách trỏ xong, tên miền cần khoảng 15 phút – 24 giờ để cập nhật; sau đó website con tự chạy trên tên miền của khách, hệ thống nhận diện theo tên miền nên bạn không cần thao tác gì thêm.</li>
            <li>Nếu để trống, trang của khách sẽ hiện &quot;—&quot; và khách chưa trỏ được tên miền — hãy điền 2 giá trị này trước khi mở cho khách đăng ký website con.</li>
          </ol>
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
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">Logo, SEO & chân trang</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="lbl">Logo (URL ảnh — để trống dùng chữ viết tắt)</label><input className="inp" name="logo_url" defaultValue={s.logo_url} placeholder="https://.../logo.png" /></div>
          <div><label className="lbl">Favicon (URL ảnh)</label><input className="inp" name="favicon_url" defaultValue={s.favicon_url} placeholder="https://.../favicon.png" /></div>
          <div><label className="lbl">Từ khoá SEO (Meta Keywords, cách nhau dấu phẩy)</label><input className="inp" name="meta_keywords" defaultValue={s.meta_keywords} /></div>
          <div><label className="lbl">Ảnh OG khi chia sẻ (URL)</label><input className="inp" name="og_image_url" defaultValue={s.og_image_url} placeholder="https://.../og.jpg" /></div>
        </div>
        <div><label className="lbl">Mô tả SEO (Meta Description)</label><textarea className="inp" name="meta_description" rows={2} defaultValue={s.meta_description} placeholder="Mô tả ngắn hiển thị trên Google..." /></div>
        <div><label className="lbl">Chữ chân trang (footer) — để trống dùng mặc định</label><input className="inp" name="footer_text" defaultValue={s.footer_text} /></div>
      </section>
      {googleSection}
    </>
  );

  const landing = (
    <>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">Trang giới thiệu (Landing Page)</div>
        <div>
          <label className="lbl">Hiển thị Landing Page ở trang chủ</label>
          <select className="inp" name="landing_enabled" defaultValue={s.landing_enabled === "0" ? "0" : "1"}>
            <option value="1">Bật — khách vào trang chủ thấy trang giới thiệu</option>
            <option value="0">Tắt — vào thẳng trang đăng nhập / bảng điều khiển</option>
          </select>
        </div>
        <div><label className="lbl">Tiêu đề chính (H1) — để trống dùng câu mặc định</label><input className="inp" name="landing_headline" defaultValue={s.landing_headline} placeholder="VD: SMM Panel Số 1 Việt Nam" /></div>
        <div><label className="lbl">Mô tả ngắn dưới tiêu đề — để trống dùng khẩu hiệu của site</label><input className="inp" name="landing_subtitle" defaultValue={s.landing_subtitle} /></div>
        <a href="/" target="_blank" className="btn-ghost btn-sm inline-block">Xem trước Landing Page</a>
      </section>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">Kiểu trang Đăng nhập / Đăng ký</div>
        <div>
          <label className="lbl">Kiểu hiển thị khung đăng nhập</label>
          <select className="inp" name="auth_style" defaultValue={s.auth_style || "classic"}>
            <option value="classic">CLASSIC — thẻ trắng truyền thống</option>
            <option value="glass">GLASS — kính mờ trên nền gradient</option>
            <option value="minimal">MINIMAL — tối giản, không khung</option>
            <option value="app">APP — thẻ bo tròn lớn kiểu ứng dụng</option>
          </select>
        </div>
      </section>
    </>
  );

  const khuyenmai = (
    <section className="card p-6 space-y-4">
      <div className="font-bold text-slate-900">Khuyến mãi nạp tiền (áp dụng cho khách của web mẹ)</div>
      <BonusTiersEditor initial={s.deposit_bonus_tiers} />
      <p className="text-xs text-slate-400">Khách panel con dùng mốc thưởng RIÊNG do chủ panel tự đặt ở Panel Admin — không tính chung với bảng này.</p>
    </section>
  );

  const gioithieu = (
    <section className="card p-6 space-y-4">
      <div className="font-bold text-slate-900">Chương trình giới thiệu (Affiliate)</div>
      <div>
        <label className="lbl">Bật chương trình giới thiệu</label>
        <select className="inp" name="module_affiliate" defaultValue={s.module_affiliate === "0" ? "0" : "1"}><option value="1">Bật</option><option value="0">Tắt</option></select>
      </div>
      <div><label className="lbl">Tỷ lệ hoa hồng (%) — tính trên mỗi giao dịch mua của người được giới thiệu</label><input className="inp" name="affiliate_percent" type="number" step="0.5" min="0" max="50" defaultValue={s.affiliate_percent} /></div>
    </section>
  );

  const thongbao = (
    <>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">Thanh thông báo & modal trang chủ</div>
        <div><label className="lbl">Thanh thông báo trên cùng (để trống = tắt)</label><input className="inp" name="announcement_bar" defaultValue={s.announcement_bar} /></div>
        <div>
          <label className="lbl">Modal thông báo khi khách vào khu vực tài khoản</label>
          <select className="inp" name="home_modal_enabled" defaultValue={s.home_modal_enabled === "1" ? "1" : "0"}><option value="0">Tắt</option><option value="1">Bật</option></select>
        </div>
        <div><label className="lbl">Nội dung modal thông báo</label><textarea className="inp" name="home_modal_content" rows={4} defaultValue={s.home_modal_content} placeholder="Nội dung hiện trong modal..." /></div>
        <p className="text-xs text-slate-400">Khách bấm "Đã hiểu" thì modal ẩn 2 giờ rồi mới hiện lại.</p>
      </section>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">Điều khoản bắt buộc</div>
        <div>
          <label className="lbl">Bắt khách xác nhận điều khoản khi vào khu vực tài khoản</label>
          <select className="inp" name="terms_enabled" defaultValue={s.terms_enabled === "1" ? "1" : "0"}><option value="0">Tắt</option><option value="1">Bật</option></select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="lbl">Tiêu đề điều khoản</label><input className="inp" name="terms_title" defaultValue={s.terms_title} /></div>
          <div><label className="lbl">Phiên bản (tăng số này để bắt toàn bộ khách xác nhận lại)</label><input className="inp" name="terms_version" type="number" min={1} defaultValue={s.terms_version} /></div>
          <div><label className="lbl">Chữ cạnh ô tick xác nhận</label><input className="inp" name="terms_checkbox_text" defaultValue={s.terms_checkbox_text} /></div>
          <div><label className="lbl">Chữ trên nút xác nhận</label><input className="inp" name="terms_button_text" defaultValue={s.terms_button_text} /></div>
        </div>
        <div><label className="lbl">Nội dung điều khoản</label><textarea className="inp" name="terms_content" rows={8} defaultValue={s.terms_content} placeholder="1. Điều khoản sử dụng...&#10;2. Chính sách hoàn tiền..." /></div>
      </section>
    </>
  );

  const apiTab = (
    <section className="card p-6 space-y-4 text-sm">
      <div className="font-bold text-slate-900">API đại lý (chuẩn SMM v2)</div>
      <div>
        <div className="text-slate-500 mb-1">Base URL:</div>
        <code className="block bg-slate-950 text-slate-100 rounded-xl px-4 py-3 break-all">{base}/api/v2</code>
      </div>
      <p className="text-slate-600">Xác thực: gửi kèm <span className="font-mono">key</span> = API key riêng của từng tài khoản (khách tự lấy ở mục API đại lý trong tài khoản). Các action: <span className="font-mono">services · add · status · orders · balance · refill · refills · refill_status · cancel</span>.</p>
      <p className="text-slate-600">Đơn hàng qua API tự ẩn khỏi danh sách khi đã hoàn thành/huỷ/hoàn tiền theo chuẩn các panel SMM. Tài liệu đầy đủ cho khách ở trang <a className="text-brand-600 font-semibold" href="/api-docs" target="_blank">Tài liệu API</a>.</p>
    </section>
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
        <p className="text-xs text-slate-400">Mốc thưởng nạp chỉnh ở tab <b>Khuyến mãi</b>, hoa hồng giới thiệu ở tab <b>Giới thiệu</b>.</p>
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
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">Nạp USDT (duyệt tay)</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="lbl">Bật nạp USDT</label>
            <select className="inp" name="usdt_enabled" defaultValue={s.usdt_enabled === "1" ? "1" : "0"}><option value="0">Tắt</option><option value="1">Bật</option></select></div>
          <div><label className="lbl">Mạng</label>
            <select className="inp" name="usdt_network" defaultValue={s.usdt_network || "TRC20"}><option value="TRC20">TRC20 (Tron)</option><option value="BEP20">BEP20 (BSC)</option><option value="ERC20">ERC20 (Ethereum)</option></select></div>
          <div><label className="lbl">Địa chỉ ví nhận USDT</label><input className="inp" name="usdt_address" defaultValue={s.usdt_address} placeholder="Địa chỉ ví của bạn" /></div>
          <div><label className="lbl">Tỉ giá riêng 1 USDT = (VND) — để trống dùng tỉ giá USD</label><input className="inp" name="usdt_rate" type="number" defaultValue={s.usdt_rate} placeholder="VD: 25500" /></div>
        </div>
        <p className="text-xs text-slate-400">Khách chuyển USDT rồi khai mã giao dịch; yêu cầu vào hàng chờ ở mục Nạp tiền, admin đối chiếu ví rồi duyệt.</p>
      </section>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">Tỉ giá hiển thị tiền tệ</div>
        <p className="text-xs text-slate-400">Khách có thể chọn hiển thị giá theo ngoại tệ ở nút Cài đặt — quy đổi theo tỉ giá dưới đây (1 đơn vị ngoại tệ = ? VND). Tiền thật trong hệ thống vẫn là VND.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div><label className="lbl">1 EUR =</label><input className="inp" name="rate_eur" type="number" defaultValue={s.rate_eur} /></div>
          <div><label className="lbl">1 CNY =</label><input className="inp" name="rate_cny" type="number" defaultValue={s.rate_cny} /></div>
          <div><label className="lbl">1 THB =</label><input className="inp" name="rate_thb" type="number" defaultValue={s.rate_thb} /></div>
          <div><label className="lbl">1 JPY =</label><input className="inp" name="rate_jpy" type="number" defaultValue={s.rate_jpy} /></div>
          <div><label className="lbl">1 KRW =</label><input className="inp" name="rate_krw" type="number" defaultValue={s.rate_krw} /></div>
        </div>
      </section>
    </>
  );

  const ai = (
    <section className="card p-6 space-y-4">
      <div className="font-bold text-slate-900">Kết nối nhà cung cấp AI</div>
      <p className="text-xs leading-relaxed text-slate-400">Dùng cho trang <b>Tìm dịch vụ bằng AI</b> phía khách: khách mô tả nhu cầu bằng câu chữ thường, hệ thống gợi ý dịch vụ phù hợp. Chỉ danh mục dịch vụ và câu hỏi của khách được gửi tới nhà cung cấp AI. Chưa có key thì trang đó tự chạy chế độ tìm kiếm thường.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label className="lbl">Bật AI</label>
          <select className="inp" name="ai_enabled" defaultValue={s.ai_enabled === "1" ? "1" : "0"}><option value="0">Tắt</option><option value="1">Bật</option></select></div>
        <div><label className="lbl">Nhà cung cấp</label>
          <select className="inp" name="ai_provider" defaultValue={s.ai_provider || "openai"}><option value="openai">OpenAI / endpoint tương thích</option><option value="gemini">Google Gemini</option></select></div>
        <div><label className="lbl">API key</label><input className="inp" name="ai_api_key" defaultValue={s.ai_api_key} placeholder="Dán API key của bạn" autoComplete="off" /></div>
        <div><label className="lbl">Model</label><input className="inp" name="ai_model" defaultValue={s.ai_model} placeholder="VD: gpt-4o-mini / gemini-2.0-flash" /></div>
        <div className="sm:col-span-2"><label className="lbl">Base URL tuỳ chỉnh (để trống = mặc định)</label><input className="inp" name="ai_base_url" defaultValue={s.ai_base_url} placeholder="https://api.openai.com/v1" /></div>
      </div>
      <a href="/api/admin/ai-test" className="btn-ghost btn-sm inline-block">Kiểm tra kết nối AI</a>
    </section>
  );

  const email = (
    <section className="card p-6 space-y-4">
      <div className="font-bold text-slate-900">Máy chủ Email (SMTP)</div>
      <div>
        <label className="lbl">Gửi email qua SMTP</label>
        <select className="inp" name="smtp_enabled" defaultValue={s.smtp_enabled === "0" ? "0" : "1"}><option value="1">Bật</option><option value="0">Tắt — hệ thống không gửi email</option></select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label className="lbl">SMTP Host</label><input className="inp" name="smtp_host" defaultValue={s.smtp_host} placeholder="VD: smtp.gmail.com" /></div>
        <div><label className="lbl">SMTP Port</label><input className="inp" name="smtp_port" type="number" defaultValue={s.smtp_port} /></div>
        <div><label className="lbl">Tài khoản SMTP</label><input className="inp" name="smtp_user" defaultValue={s.smtp_user} /></div>
        <div><label className="lbl">Mật khẩu SMTP / App Password</label><input className="inp" name="smtp_pass" defaultValue={s.smtp_pass} /></div>
        <div><label className="lbl">Địa chỉ gửi (From)</label><input className="inp" name="smtp_from" defaultValue={s.smtp_from} placeholder="VD: SMMv2 <no-reply@domain.vn>" /></div>
        <div><label className="lbl">Tên người gửi (From Name)</label><input className="inp" name="smtp_from_name" defaultValue={s.smtp_from_name} placeholder="VD: SMMv2 Support" /></div>
        <div><label className="lbl">Bảo mật SSL/TLS (cổng 465)</label>
          <select className="inp" name="smtp_secure" defaultValue={s.smtp_secure === "1" ? "1" : "0"}><option value="0">Tắt (STARTTLS — cổng 587)</option><option value="1">Bật (SSL — cổng 465)</option></select></div>
      </div>
      <p className="text-xs text-slate-400">Dùng cho Email Marketing. Gmail cần bật xác minh 2 bước và tạo App Password.</p>
    </section>
  );

  const telegram = (
    <>
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
    <section className="card p-6 space-y-4">
      <div className="font-bold text-slate-900">Danh sách Bot Telegram theo dịch vụ (đa bot)</div>
      <TelegramBotsEditor initial={s.telegram_bots} />
    </section>
    </>
  );

  const baomat = (
    <>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">Chính sách mật khẩu</div>
        <div><label className="lbl">Độ dài mật khẩu tối thiểu khi đăng ký / đổi mật khẩu</label><input className="inp" name="password_min_length" type="number" min={4} max={32} defaultValue={s.password_min_length} /></div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div><label className="lbl">Bắt buộc chữ hoa</label>
            <select className="inp" name="pw_require_upper" defaultValue={s.pw_require_upper === "1" ? "1" : "0"}><option value="0">Không</option><option value="1">Có</option></select></div>
          <div><label className="lbl">Bắt buộc chữ số</label>
            <select className="inp" name="pw_require_number" defaultValue={s.pw_require_number === "1" ? "1" : "0"}><option value="0">Không</option><option value="1">Có</option></select></div>
          <div><label className="lbl">Bắt buộc ký tự đặc biệt</label>
            <select className="inp" name="pw_require_special" defaultValue={s.pw_require_special === "1" ? "1" : "0"}><option value="0">Không</option><option value="1">Có</option></select></div>
        </div>
        <p className="text-xs text-slate-400">Chặn IP và các tuỳ chọn nâng cao khác ở mục <b>Bảo mật nâng cao</b> trong menu.</p>
      </section>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">Google reCAPTCHA v2</div>
        <div>
          <label className="lbl">Bật reCAPTCHA</label>
          <select className="inp" name="recaptcha_enabled" defaultValue={s.recaptcha_enabled === "1" ? "1" : "0"}><option value="0">Tắt</option><option value="1">Bật</option></select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="lbl">Site Key</label><input className="inp" name="recaptcha_site_key" defaultValue={s.recaptcha_site_key} placeholder="6Lc..." /></div>
          <div><label className="lbl">Secret Key</label><input className="inp" name="recaptcha_secret" defaultValue={s.recaptcha_secret} placeholder="6Lc..." autoComplete="off" /></div>
          <div><label className="lbl">Áp dụng cho Đăng nhập</label>
            <select className="inp" name="recaptcha_login" defaultValue={s.recaptcha_login === "1" ? "1" : "0"}><option value="0">Không</option><option value="1">Có</option></select></div>
          <div><label className="lbl">Áp dụng cho Đăng ký</label>
            <select className="inp" name="recaptcha_register" defaultValue={s.recaptcha_register === "1" ? "1" : "0"}><option value="0">Không</option><option value="1">Có</option></select></div>
        </div>
        <p className="text-xs text-slate-400">Lấy key miễn phí tại google.com/recaptcha (loại reCAPTCHA v2 "Tôi không phải người máy") cho đúng tên miền của site.</p>
      </section>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">Phòng chống Brute Force (đoán mật khẩu)</div>
        <div>
          <label className="lbl">Bật chống brute-force</label>
          <select className="inp" name="bf_enabled" defaultValue={s.bf_enabled === "0" ? "0" : "1"}><option value="1">Bật</option><option value="0">Tắt</option></select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="lbl">Số lần đăng nhập sai tối đa</label><input className="inp" name="bf_max_attempts" type="number" min={3} max={100} defaultValue={s.bf_max_attempts} /></div>
          <div><label className="lbl">Thời gian khoá (giây)</label><input className="inp" name="bf_lock_seconds" type="number" min={30} max={86400} defaultValue={s.bf_lock_seconds} /></div>
        </div>
        <p className="text-xs text-slate-400">Vượt quá số lần sai, cặp IP + tài khoản đó bị khoá đăng nhập tạm trong thời gian trên.</p>
      </section>
    </>
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
        <div className="text-slate-500 mb-1">Danh sách công việc nền chạy qua cron:</div>
        <ul className="list-disc space-y-1 pl-5 text-slate-600">
          <li>Đồng bộ trạng thái đơn hàng API — mỗi vòng cron</li>
          <li>Thả đơn Drip-feed + đăng ký định kỳ tới hạn — mỗi vòng cron</li>
          <li>Đồng bộ dịch vụ & giá từ nhà cung cấp — theo lịch trong vòng cron (tôn trọng giới hạn từng nguồn)</li>
          <li>Kiểm tra số dư nhà cung cấp + cảnh báo số dư thấp — tối đa 1 lần/ngày/nguồn</li>
          <li>Auto Refill đơn tụt số + Price Monitor — mỗi vòng cron</li>
          <li>Gửi báo cáo doanh thu ngày — theo giờ đặt ở mục Báo cáo & Thông báo</li>
        </ul>
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
    <div>
      <PageHead title="Cấu hình hệ thống" desc="Mọi thay đổi áp dụng ngay trên toàn site." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <form action={adminSaveSettings}>
        <SettingsTabs tabs={[
          { id: "chung", label: "Chung", content: chung },
          { id: "landing", label: "Landing Page", content: landing },
          { id: "thanhtoan", label: "Thanh toán", content: thanhtoan },
          { id: "khuyenmai", label: "Khuyến mãi", content: khuyenmai },
          { id: "gioithieu", label: "Giới thiệu", content: gioithieu },
          { id: "email", label: "Email", content: email },
          { id: "telegram", label: "Telegram", content: telegram },
          { id: "thongbao", label: "Thông báo", content: thongbao },
          { id: "baomat", label: "Bảo mật", content: baomat },
          { id: "cron", label: "Cron & Webhook", content: cron },
          { id: "api", label: "API", content: apiTab },
          { id: "ai", label: "AI", content: ai },
          { id: "script", label: "Script / HTML", content: script },
        ]} />
        <button className="btn-primary w-full !py-3 mt-6">Lưu toàn bộ cấu hình</button>
      </form>
    </div>
  );
}
