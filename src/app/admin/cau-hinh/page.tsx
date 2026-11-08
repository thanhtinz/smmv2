import { getSettings } from "@/lib/settings";
import { requireAdminPage } from "@/lib/auth";
import { PageHead, Flash, I } from "@/components/ui";
import { CopyBtn } from "@/components/client";
import { adminSaveSettings } from "@/app/actions/admin";
import SettingsTabs from "@/components/settings-tabs";
import { BonusTiersEditor, TelegramBotsEditor, ToolKeyField } from "@/components/settings-editors";
import { RichTextEditor } from "@/components/rich-editor";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

/** Trang Cài đặt admin — dựng theo bố cục panel mẫu: 15 tab gạch chân cuộn ngang đúng
 *  thứ tự (Landing Page → Chung → Thanh toán → Email → Telegram → Thông báo → Google →
 *  Khuyến mãi → Giới thiệu → Bảo mật → Cron Job → SMM Tool API → AI Kiểm tra → USDT →
 *  Script/HTML), MỘT nút Lưu cài đặt ở góc phải header cho toàn trang. */
export default async function AdminSettings({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  await requireAdminPage();
  const { L, Ld } = await getServerI18n(null);
  const s = await getSettings();
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://your-domain.vn";
  const cronUrl = `${base}/api/cron/sync?secret=${s.cron_secret || "<CRON_SECRET>"}&services=1`;
  const webhookUrl = `${base}/api/webhooks/sepay`;

  const infoBox = "rounded-xl bg-brand-50 px-4 py-3 text-[13px] leading-relaxed text-slate-600";
  const warnBox = "rounded-xl bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-700";

  /* ---------------- Landing Page ---------------- */
  const authStyles = [
    { code: "CLASSIC", value: "classic", name: L("Cổ điển"), tag: L("Thẻ giữa màn hình"), desc: L("Thẻ trắng truyền thống, lịch sự, dễ dùng.") },
    { code: "GLASS", value: "glass", name: L("Kính mờ"), tag: L("Nền tối"), desc: L("Kính mờ trên nền gradient — phong cách hiện đại.") },
    { code: "MINIMAL", value: "minimal", name: L("Tối giản"), tag: L("Thẻ giữa màn hình"), desc: L("Không khung, ít chi tiết, tập trung vào form.") },
    { code: "APP", value: "app", name: L("Kiểu App"), tag: L("Thẻ giữa màn hình"), desc: L("Thẻ bo tròn lớn kiểu ứng dụng điện thoại.") },
    { code: "SPLIT", value: "split", name: L("Chia đôi"), tag: L("Hai cột"), desc: L("Cột thương hiệu bên trái, form bên phải — kiểu panel quốc tế.") },
  ];
  const landingTemplates = [
    { code: L("HIỆN ĐẠI"), value: "hien-dai", name: L("Hiện đại"), desc: L("Nền tối, header dạng pill, hero lớn — mẫu đang dùng mặc định.") },
    { code: L("SÁNG RỰC"), value: "sang", name: L("Sáng rực"), desc: L("Nền sáng, dải số liệu, thẻ nền tảng — kiểu SMMFlare quốc tế.") },
    { code: L("CỔ ĐIỂN"), value: "co-dien", name: L("Cổ điển"), desc: L("Nền navy đậm, bảng nền tảng dạng bảng — kiểu panel SMM truyền thống.") },
  ];
  const landing = (
    <>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">{L("Trang giới thiệu (Landing Page)")}</div>
        <div>
          <label className="lbl">{L("Hiển thị Landing Page ở trang chủ")}</label>
          <select className="inp" name="landing_enabled" defaultValue={s.landing_enabled === "0" ? "0" : "1"}>
            <option value="1">{L("Bật — khách vào trang chủ thấy trang giới thiệu")}</option>
            <option value="0">{L("Tắt — vào thẳng trang đăng nhập / bảng điều khiển")}</option>
          </select>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div><label className="lbl">{L("Tiêu đề Hero (H1)")}</label><input className="inp" name="landing_headline" defaultValue={s.landing_headline} placeholder={L("VD: SMM Panel Số 1 Việt Nam")} /><p className="mt-1 text-xs text-slate-400">{L("Tiêu đề chính hiển thị ở trang Landing Page — để trống dùng câu mặc định.")}</p></div>
          <div><label className="lbl">{L("Phụ đề (Subtitle)")}</label><input className="inp" name="landing_subtitle" defaultValue={s.landing_subtitle} /><p className="mt-1 text-xs text-slate-400">{L("Phụ đề hiển thị ngay dưới tiêu đề chính — để trống dùng khẩu hiệu của site.")}</p></div>
        </div>
        <a href="/?preview=1" target="_blank" className="btn-ghost btn-sm inline-block">{L("Xem trước Landing Page")}</a>
        <div>
          <label className="lbl">{L("Mẫu Landing Page")}</label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {landingTemplates.map((a) => (
              <label key={a.value} className="cursor-pointer">
                <input type="radio" name="landing_template" value={a.value} defaultChecked={(s.landing_template || "hien-dai") === a.value} className="peer sr-only" />
                <div className="h-full rounded-2xl border-2 border-slate-200 p-4 transition peer-checked:border-brand-600 peer-checked:bg-brand-50/60">
                  <span className="rounded-md bg-slate-900 px-2 py-0.5 text-[11px] font-extrabold tracking-wide text-white">{a.code}</span>
                  <div className="mt-2.5 text-sm font-bold text-slate-900">{a.name}</div>
                  <p className="mt-2 text-[13px] leading-relaxed text-slate-500">{a.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
      </section>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">{L("Giao diện trang Đăng nhập / Đăng ký")}</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {authStyles.map((a) => (
            <label key={a.value} className="cursor-pointer">
              <input type="radio" name="auth_style" value={a.value} defaultChecked={(s.auth_style || "classic") === a.value} className="peer sr-only" />
              <div className="h-full rounded-2xl border-2 border-slate-200 p-4 transition peer-checked:border-brand-600 peer-checked:bg-brand-50/60">
                <span className="rounded-md bg-slate-900 px-2 py-0.5 text-[11px] font-extrabold tracking-wide text-white">{a.code}</span>
                <div className="mt-2.5 text-sm font-bold text-slate-900">{a.name}</div>
                <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">{a.tag}</span>
                <p className="mt-2 text-[13px] leading-relaxed text-slate-500">{a.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </section>
    </>
  );

  /* ---------------- Chung ---------------- */
  const chung = (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <section className="card p-6 space-y-4">
          <div className="font-bold text-slate-900">{L("Thương hiệu")}</div>
          <div><label className="lbl">{L("Tên website")}</label><input className="inp" name="site_name" defaultValue={s.site_name} /></div>
          <div><label className="lbl">{L("Khẩu hiệu (tagline)")}</label><input className="inp" name="site_tagline" defaultValue={s.site_tagline} /></div>
          <div><label className="lbl">{L("Logo (URL ảnh — để trống dùng chữ viết tắt)")}</label><input className="inp" name="logo_url" defaultValue={s.logo_url} placeholder="https://.../logo.png" /><p className="mt-1 text-xs text-slate-400">{L("PNG, JPG — hiển thị ở header và trang giới thiệu.")}</p></div>
          <div><label className="lbl">{L("Favicon (URL ảnh)")}</label><input className="inp" name="favicon_url" defaultValue={s.favicon_url} placeholder="https://.../favicon.png" /><p className="mt-1 text-xs text-slate-400">{L("Ảnh vuông (tỉ lệ 1x1) hiển thị trên tab trình duyệt, ICO hoặc PNG.")}</p></div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="lbl">{L("Màu chủ đạo mặc định (khách mới)")}</label>
              <select className="inp" name="default_accent" defaultValue={s.default_accent || "blue"}>
                <option value="blue">{L("Xanh dương")}</option><option value="violet">{L("Tím")}</option><option value="emerald">{L("Xanh lá")}</option>
                <option value="orange">{L("Cam")}</option><option value="rose">{L("Hồng")}</option><option value="teal">{L("Ngọc")}</option>
              </select>
            </div>
            <div>
              <label className="lbl">{L("Chế độ nền mặc định")}</label>
              <select className="inp" name="default_mode" defaultValue={s.default_mode || "light"}>
                <option value="light">{L("Sáng")}</option><option value="dark">{L("Tối")}</option>
              </select>
            </div>
          </div>
          <div>
            <label className="lbl">{L("Chế độ bảo trì (chặn khách, admin vẫn vào được)")}</label>
            <select className="inp" name="maintenance" defaultValue={s.maintenance === "1" ? "1" : "0"}>
              <option value="0">{L("Tắt — site hoạt động bình thường")}</option>
              <option value="1">{L("Bật — đang bảo trì")}</option>
            </select>
          </div>
        </section>
        <section className="card p-6 space-y-4">
          <div className="font-bold text-slate-900">{L("Thông tin khác")}</div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div><label className="lbl">{L("Email liên hệ")}</label><input className="inp" name="contact_email" defaultValue={s.contact_email} placeholder="support@domain.vn" /></div>
            <div><label className="lbl">Hotline</label><input className="inp" name="support_hotline" defaultValue={s.support_hotline} /></div>
            <div><label className="lbl">{L("Telegram hỗ trợ")}</label><input className="inp" name="support_telegram" defaultValue={s.support_telegram} placeholder="@username" /></div>
            <div><label className="lbl">{L("Zalo hỗ trợ (số điện thoại hoặc link)")}</label><input className="inp" name="support_zalo" defaultValue={s.support_zalo} placeholder={L("09xx xxx xxx hoặc https://zalo.me/...")} /></div>
            <div><label className="lbl">{L("Facebook hỗ trợ")}</label><input className="inp" name="support_facebook" defaultValue={s.support_facebook} /></div>
          </div>
          <div><label className="lbl">{L("Chữ chân trang (footer) — để trống dùng mặc định")}</label><input className="inp" name="footer_text" defaultValue={s.footer_text} /></div>
        </section>
      </div>
      <div className="space-y-6">
        <section className="card p-6 space-y-4">
          <div className="font-bold text-slate-900">SEO & Meta Tags</div>
          <div><label className="lbl">{L("Mô tả SEO (Meta Description)")}</label><textarea className="inp" name="meta_description" rows={3} defaultValue={s.meta_description} placeholder={L("Mô tả ngắn hiển thị trên Google...")} /><p className="mt-1 text-xs text-slate-400">{L("Khuyến nghị tối đa ~160 ký tự.")}</p></div>
          <div><label className="lbl">{L("Từ khoá SEO (Meta Keywords, cách nhau dấu phẩy)")}</label><input className="inp" name="meta_keywords" defaultValue={s.meta_keywords} /></div>
          <div><label className="lbl">{L("Ảnh chia sẻ (OG Image — URL)")}</label><input className="inp" name="og_image_url" defaultValue={s.og_image_url} placeholder="https://.../og.jpg" /><p className="mt-1 text-xs text-slate-400">{L("Ảnh hiển thị khi chia sẻ link website lên mạng xã hội (Zalo, Facebook...). Kích thước khuyến nghị: 1200x630.")}</p></div>
          <div><label className="lbl">{L("Google Analytics — GA4 Measurement ID")}</label><input className="inp" name="ga_id" defaultValue={s.ga_id} placeholder="G-XXXXXXXXXX" /><p className="mt-1 text-xs text-slate-400">{L("Điền ID đo lường GA4, hệ thống tự chèn mã theo dõi vào mọi trang.")}</p></div>
          <div><label className="lbl">{L("Google Search Console — mã xác minh")}</label><input className="inp" name="gsc_verification" defaultValue={s.gsc_verification} placeholder={L("Mã trong thẻ meta google-site-verification")} /><p className="mt-1 text-xs text-slate-400">{L("Chỉ dán phần mã (content), hệ thống tự sinh thẻ meta xác minh.")}</p></div>
        </section>
        <section className="card p-6 space-y-3">
          <div className="font-bold text-slate-900">{L("Xem trước SEO (Google)")}</div>
          <div className="rounded-xl border border-slate-200 px-4 py-3">
            <div className="truncate text-lg leading-snug text-[#1a0dab]">{s.site_name || L("Tên website")}{s.site_tagline ? ` — ${s.site_tagline}` : ""}</div>
            <div className="truncate text-sm text-[#006621]">{base.replace(/^https?:\/\//, "")}</div>
            <p className="mt-0.5 line-clamp-2 text-sm leading-relaxed text-slate-600">{s.meta_description || L("Chưa có mô tả SEO — điền ở thẻ SEO & Meta Tags phía trên để kết quả tìm kiếm hiển thị đẹp hơn.")}</p>
          </div>
          <p className="text-xs text-slate-400">{L("Bản xem trước theo giá trị đang lưu hiện tại.")}</p>
        </section>
        <section className="card p-6 space-y-4">
          <div className="font-bold text-slate-900">{L("NameServer cho website con")}</div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div><label className="lbl">{L("NameServer 1 (NS1)")}</label><input className="inp" name="child_ns1" defaultValue={s.child_ns1} placeholder="vd: ns1.tenmienchinh.vn" /></div>
            <div><label className="lbl">{L("NameServer 2 (NS2)")}</label><input className="inp" name="child_ns2" defaultValue={s.child_ns2} placeholder="vd: ns2.tenmienchinh.vn" /></div>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 text-[13px] leading-relaxed text-slate-600">
            <div className="mb-1.5 font-semibold text-slate-800">{L("Cách cấu hình NameServer:")}</div>
            <ol className="list-decimal space-y-1 pl-5">
              <li>{L("Đây là cặp nameserver của hệ thống. Lấy giá trị từ nơi đang quản lý DNS của tên miền chính (Cloudflare hoặc nhà đăng ký tên miền) — dùng đúng cặp NS mà tên miền chính của bạn đang trỏ tới.")}</li>
              <li>{L("Sau khi lưu, khách đăng ký website con sẽ thấy đúng 2 giá trị này trong thẻ \"Thông tin NameServer\" ở trang Đăng ký website con và trỏ tên miền của họ về đây.")}</li>
              <li>{L("Khách trỏ xong, tên miền cần khoảng 15 phút – 24 giờ để cập nhật; sau đó website con tự chạy trên tên miền của khách, hệ thống nhận diện theo tên miền nên bạn không cần thao tác gì thêm.")}</li>
              <li>{L("Nếu để trống, trang của khách sẽ hiện \"—\" và khách chưa trỏ được tên miền — hãy điền 2 giá trị này trước khi mở cho khách đăng ký website con.")}</li>
            </ol>
          </div>
        </section>
      </div>
    </div>
  );

  /* ---------------- Thanh toán ---------------- */
  const thanhtoan = (
    <>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">{L("Tài khoản nhận tiền (dự phòng)")}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="lbl">{L("Ngân hàng")}</label><input className="inp" name="bank_name" defaultValue={s.bank_name} placeholder={L("Vd: MB Bank, Vietcombank...")} /></div>
          <div><label className="lbl">{L("Số tài khoản")}</label><input className="inp" name="bank_account" defaultValue={s.bank_account} /></div>
          <div><label className="lbl">{L("Chủ tài khoản")}</label><input className="inp" name="bank_holder" defaultValue={s.bank_holder} /></div>
          <div><label className="lbl">{L("Chi nhánh")}</label><input className="inp" name="bank_branch" defaultValue={s.bank_branch} /></div>
          <div><label className="lbl">{L("Số MoMo")}</label><input className="inp" name="momo_phone" defaultValue={s.momo_phone} /></div>
          <div><label className="lbl">{L("Tên MoMo")}</label><input className="inp" name="momo_name" defaultValue={s.momo_name} /></div>
        </div>
        <p className="text-xs text-slate-400">{L("Nếu đã thêm ngân hàng ở mục")} <b>{L("Ngân hàng")}</b> {L("thì trang Nạp tiền ưu tiên danh sách đó; phần này là dự phòng khi chưa có ngân hàng nào.")}</p>
      </section>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">{L("Chính sách nạp tiền")}</div>
        <div><label className="lbl">{L("Nạp tối thiểu (VND)")}</label><input className="inp" name="deposit_min" type="number" defaultValue={s.deposit_min} /></div>
        <div><label className="lbl">{L("Phí website con theo kỳ (VNĐ /")} {s.panel_period_days} {L("ngày) — áp dụng cho khách của web mẹ, tự gia hạn trừ số dư")}</label><input className="inp" name="panel_fee" type="number" min="0" defaultValue={s.panel_fee} placeholder={L("0 = miễn phí")} /></div>
        <div><label className="lbl">{L("Markup mặc định cho website con mới (%)")}</label><input className="inp" name="panel_default_markup" type="number" min="0" max="200" defaultValue={s.panel_default_markup} /></div>
        <div><label className="lbl">{L("Độ dài 1 kỳ phí website con (ngày)")}</label><input className="inp" name="panel_period_days" type="number" min="1" defaultValue={s.panel_period_days} /></div>
        <div><label className="lbl">{L("Gia hạn website con: trừ phí trước hạn (giờ)")}</label><input className="inp" name="panel_renew_horizon_hours" type="number" min="1" defaultValue={s.panel_renew_horizon_hours} /></div>
        <div><label className="lbl">{L("Ngưỡng cảnh báo số dư nhà cung cấp mặc định (VNĐ) — khi nhà cung cấp chưa đặt riêng")}</label><input className="inp" name="provider_low_balance_default" type="number" min="0" defaultValue={s.provider_low_balance_default} /></div>
        <div><label className="lbl">{L("Tối đa gói định kỳ đang chạy / khách")}</label><input className="inp" name="subscription_max_active" type="number" min="1" defaultValue={s.subscription_max_active} /></div>
        <div><label className="lbl">{L("Auto-refill: cửa sổ xử lý sau khi đơn hoàn thành (ngày)")}</label><input className="inp" name="auto_refill_window_days" type="number" min="1" defaultValue={s.auto_refill_window_days} /></div>
        <div><label className="lbl">{L("Auto-refill: chờ sau hoàn thành (phút)")}</label><input className="inp" name="auto_refill_settle_minutes" type="number" min="0" defaultValue={s.auto_refill_settle_minutes} /></div>
        <div><label className="lbl">{L("Dọn dẹp hệ thống: xoá dữ liệu cũ hơn (ngày)")}</label><input className="inp" name="cleanup_retention_days" type="number" min="1" defaultValue={s.cleanup_retention_days} /></div>
        <p className="text-xs text-slate-400">{L("Khách đăng ký website con sẽ bị trừ đúng số này vào số dư khi đăng ký thành công (0 = miễn phí như mặc định). Chủ panel con tự đặt phí riêng cho khách của họ trong Panel Admin — khách panel tạo website con thì phí đó thuộc về chủ panel. Mốc thưởng nạp chỉnh ở tab")} <b>{L("Khuyến mãi")}</b>{L(", hoa hồng giới thiệu ở tab")} <b>{L("Giới thiệu")}</b>{L(", nạp USDT ở tab")} <b>USDT</b>{L(".")}</p>
        <div>
          <label className="lbl">{L("Bảo vệ lợi nhuận (chặn đặt đơn khi giá bán sau chiết khấu thấp hơn giá vốn)")}</label>
          <select className="inp" name="profit_protection" defaultValue={s.profit_protection === "0" ? "0" : "1"}><option value="1">{L("Bật")}</option><option value="0">{L("Tắt")}</option></select>
        </div>
      </section>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">{L("Thanh toán quốc tế — PayPal & Stripe")}</div>
        <div><label className="lbl">{L("Tỉ giá quy đổi: 1 USD = ? VND")}</label><input className="inp" name="usd_rate" type="number" min="1000" defaultValue={s.usd_rate} /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="lbl">PayPal</label>
            <select className="inp" name="paypal_enabled" defaultValue={s.paypal_enabled === "1" ? "1" : "0"}><option value="0">{L("Tắt")}</option><option value="1">{L("Bật")}</option></select></div>
          <div><label className="lbl">{L("Môi trường PayPal")}</label>
            <select className="inp" name="paypal_mode" defaultValue={s.paypal_mode || "sandbox"}><option value="sandbox">{L("Sandbox (thử nghiệm)")}</option><option value="live">{L("Live (thật)")}</option></select></div>
          <div><label className="lbl">PayPal Client ID</label><input className="inp" name="paypal_client_id" defaultValue={s.paypal_client_id} /></div>
          <div><label className="lbl">PayPal Client Secret</label><input className="inp" name="paypal_client_secret" defaultValue={s.paypal_client_secret} /></div>
          <div><label className="lbl">Stripe</label>
            <select className="inp" name="stripe_enabled" defaultValue={s.stripe_enabled === "1" ? "1" : "0"}><option value="0">{L("Tắt")}</option><option value="1">{L("Bật")}</option></select></div>
          <div><label className="lbl">Stripe Publishable Key</label><input className="inp" name="stripe_publishable_key" defaultValue={s.stripe_publishable_key} /></div>
          <div><label className="lbl">Stripe Secret Key</label><input className="inp" name="stripe_secret_key" defaultValue={s.stripe_secret_key} /></div>
          <div><label className="lbl">Stripe Webhook Secret (whsec_...)</label><input className="inp" name="stripe_webhook_secret" defaultValue={s.stripe_webhook_secret} /></div>
        </div>
        <p className="text-xs text-slate-400">{L("Webhook Stripe trỏ về")} <span className="font-mono">/api/webhooks/stripe</span> {L("(sự kiện checkout.session.completed).")}</p>
      </section>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">{L("Tỉ giá hiển thị tiền tệ")}</div>
        <p className="text-xs text-slate-400">{L("Khách có thể chọn hiển thị giá theo ngoại tệ ở nút Cài đặt — quy đổi theo tỉ giá dưới đây (1 đơn vị ngoại tệ = ? VND). Tiền thật trong hệ thống vẫn là VND.")}</p>
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

  /* ---------------- Email ---------------- */
  const email = (
    <section className="card p-6 space-y-4">
      <div className="font-bold text-slate-900">{L("Cấu hình SMTP Email")}</div>
      <div>
        <label className="lbl">{L("Gửi email qua SMTP")}</label>
        <select className="inp" name="smtp_enabled" defaultValue={s.smtp_enabled === "0" ? "0" : "1"}><option value="1">{L("Bật")}</option><option value="0">{L("Tắt — hệ thống không gửi email")}</option></select>
      </div>
      {s.smtp_enabled === "0" && <div className={warnBox}>{L("SMTP đang tắt — Email xác minh và thông báo sẽ không được gửi.")}</div>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2"><label className="lbl">SMTP Host</label><input className="inp" name="smtp_host" defaultValue={s.smtp_host} placeholder="VD: smtp.gmail.com" /></div>
        <div><label className="lbl">Port</label><input className="inp" name="smtp_port" type="number" defaultValue={s.smtp_port} /></div>
        <div><label className="lbl">{L("Mã hóa")}</label>
          <select className="inp" name="smtp_secure" defaultValue={s.smtp_secure === "1" ? "1" : "0"}><option value="0">{L("STARTTLS (cổng 587)")}</option><option value="1">{L("SSL/TLS (cổng 465)")}</option></select></div>
        <div><label className="lbl">Username</label><input className="inp" name="smtp_user" defaultValue={s.smtp_user} /></div>
        <div><label className="lbl">Password</label><input className="inp" name="smtp_pass" defaultValue={s.smtp_pass} autoComplete="off" /></div>
        <div><label className="lbl">{L("Từ Email (From)")}</label><input className="inp" name="smtp_from" defaultValue={s.smtp_from} placeholder="VD: no-reply@domain.vn" /></div>
        <div><label className="lbl">{L("Từ Tên")}</label><input className="inp" name="smtp_from_name" defaultValue={s.smtp_from_name} placeholder="VD: SMMv2 Support" /></div>
      </div>
      <p className="text-xs text-slate-400">{L("Dùng cho Email Marketing và thông báo hệ thống. Gmail cần bật xác minh 2 bước và tạo App Password. Gửi email thử ở mục")} <b>{L("Email Marketing")}</b>{L(".")}</p>
    </section>
  );

  /* ---------------- Telegram ---------------- */
  const telegram = (
    <>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">{L("Thông báo qua Telegram")}</div>
        <div>
          <label className="lbl">{L("Báo tin qua Telegram")}</label>
          <select className="inp" name="telegram_notify" defaultValue={s.telegram_notify === "1" ? "1" : "0"}><option value="0">{L("Tắt")}</option><option value="1">{L("Bật — báo sự kiện hệ thống (đơn mới, nạp tiền, ticket...)")}</option></select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="lbl">Bot Token</label><input className="inp" name="telegram_bot_token" defaultValue={s.telegram_bot_token} placeholder="123456:ABC-..." autoComplete="off" /></div>
          <div><label className="lbl">Chat ID</label><input className="inp" name="telegram_chat_id" defaultValue={s.telegram_chat_id} placeholder={L("VD: -1001234567890 hoặc 123456789")} /></div>
        </div>
        <div className={infoBox}>{L("Tạo bot qua @BotFather, thêm bot vào nhóm/kênh hoặc nhắn tin cho bot trước, lấy Chat ID qua @userinfobot. Các loại sự kiện được báo và kênh nhận cấu hình thêm ở mục")} <b>{L("Báo cáo & Thông báo")}</b>{L(".")}</div>
      </section>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">{L("Thông báo qua Telegram (Nhiều bot)")}</div>
        <TelegramBotsEditor initial={s.telegram_bots} />
      </section>
    </>
  );

  /* ---------------- Thông báo ---------------- */
  const thongbao = (
    <>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">{L("Thông báo hệ thống")}</div>
        <div>
          <label className="lbl">{L("Hiện banner thông báo ở trang chủ của khách")}</label>
          <select className="inp" name="sys_announce_enabled" defaultValue={s.sys_announce_enabled === "1" ? "1" : "0"}><option value="0">{L("Tắt")}</option><option value="1">{L("Bật")}</option></select>
        </div>
        <div><label className="lbl">{L("Nội dung thông báo (hiện trong banner xanh ở đầu trang chủ của khách)")}</label><RichTextEditor name="sys_announce_content" defaultValue={s.sys_announce_content} minHeight={140} /></div>
        <div><label className="lbl">{L("Thanh thông báo trên cùng (để trống = tắt)")}</label><input className="inp" name="announcement_bar" defaultValue={s.announcement_bar} /></div>
      </section>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">{L("Modal thông báo trang chủ")}</div>
        <div>
          <label className="lbl">{L("Hiện modal khi khách vào khu vực tài khoản")}</label>
          <select className="inp" name="home_modal_enabled" defaultValue={s.home_modal_enabled === "1" ? "1" : "0"}><option value="0">{L("Tắt")}</option><option value="1">{L("Bật")}</option></select>
        </div>
        <div><label className="lbl">{L("Nội dung modal thông báo")}</label><RichTextEditor name="home_modal_content" defaultValue={s.home_modal_content} minHeight={140} /></div>
        <p className="text-xs text-slate-400">{L("Khách bấm \"Đã hiểu\" thì modal ẩn 2 giờ rồi mới hiện lại. Modal này độc lập với thanh thông báo phía trên.")}</p>
      </section>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">{L("Điều khoản bắt buộc")}</div>
        <div>
          <label className="lbl">{L("Bắt khách xác nhận điều khoản khi vào khu vực tài khoản")}</label>
          <select className="inp" name="terms_enabled" defaultValue={s.terms_enabled === "1" ? "1" : "0"}><option value="0">{L("Tắt")}</option><option value="1">{L("Bật")}</option></select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="lbl">{L("Tiêu đề Modal điều khoản")}</label><input className="inp" name="terms_title" defaultValue={s.terms_title} /></div>
          <div><label className="lbl">{L("Phiên bản điều khoản (tăng số này = yêu cầu xác nhận lại toàn bộ)")}</label><input className="inp" name="terms_version" type="number" min={1} defaultValue={s.terms_version} /></div>
          <div><label className="lbl">{L("Văn bản Checkbox xác nhận")}</label><input className="inp" name="terms_checkbox_text" defaultValue={s.terms_checkbox_text} /></div>
          <div><label className="lbl">{L("Văn bản Nút bấm xác nhận")}</label><input className="inp" name="terms_button_text" defaultValue={s.terms_button_text} /></div>
        </div>
        <div><label className="lbl">{L("Nội dung điều khoản")}</label><textarea className="inp" name="terms_content" rows={8} defaultValue={s.terms_content} placeholder={L("1. Điều khoản sử dụng...\n2. Chính sách hoàn tiền...")} /></div>
        <p className="text-xs text-slate-400">{L("Khi khách bấm xác nhận, hệ thống ghi lại thời gian và phiên bản điều khoản vào hồ sơ thành viên.")}</p>
      </section>
    </>
  );

  /* ---------------- Google ---------------- */
  const google = (
    <section className="card p-6 space-y-4">
      <div className="font-bold text-slate-900">OAuth 2.0 (Google Login)</div>
      <div className={infoBox}>{L("Cho phép người dùng đăng nhập/đăng ký bằng tài khoản Google. Cấu hình tại Google Cloud Console.")}</div>
      <div>
        <label className="lbl">{L("Bật đăng nhập Google")}</label>
        <select className="inp" name="google_enabled" defaultValue={s.google_enabled === "1" ? "1" : "0"}><option value="0">{L("Tắt")}</option><option value="1">{L("Bật")}</option></select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label className="lbl">Client ID</label><input className="inp" name="google_client_id" defaultValue={s.google_client_id} placeholder="...apps.googleusercontent.com" /><p className="mt-1 text-xs text-slate-400">{L("Lấy từ Google Cloud Console.")}</p></div>
        <div><label className="lbl">Client Secret</label><input className="inp" name="google_client_secret" defaultValue={s.google_client_secret} autoComplete="off" /></div>
        <div className="sm:col-span-2"><label className="lbl">{L("Redirect URI cần khai trong Google Cloud")}</label><input className="inp font-mono" readOnly value={`${base}/api/auth/google/callback`} /></div>
      </div>
      <p className="text-xs text-slate-400">{L("Khách bấm nút Google ở trang đăng nhập: nếu email đã có tài khoản thì vào thẳng, chưa có thì hệ thống tạo tài khoản mới (khi mô-đun Đăng ký đang bật).")}</p>
    </section>
  );

  /* ---------------- Khuyến mãi ---------------- */
  const khuyenmai = (
    <section className="card p-6 space-y-4">
      <div className="font-bold text-slate-900">{L("Khuyến mãi nạp tiền")}</div>
      <div className={infoBox}>{L("Phần thưởng được hiển thị công khai trên trang Nạp tiền khi khách truy cập. Nạp đúng hoặc hơn mốc sẽ nhận phần thưởng tương ứng.")}</div>
      <BonusTiersEditor initial={s.deposit_bonus_tiers} />
      <p className="text-xs text-slate-400">{L("Bảng này áp dụng cho khách của web mẹ. Khách panel con dùng mốc thưởng RIÊNG do chủ panel tự đặt ở Panel Admin — không tính chung với bảng này.")}</p>
    </section>
  );

  /* ---------------- Giới thiệu ---------------- */
  const gioithieu = (
    <section className="card p-6 space-y-4">
      <div className="font-bold text-slate-900">{L("Chương trình giới thiệu (Affiliate)")}</div>
      <div className={infoBox}>{L("Cho phép người dùng chia sẻ link giới thiệu và nhận hoa hồng trên mỗi giao dịch mua của người được giới thiệu (đặt đơn SMM + mua Premium), cộng thẳng vào số dư chính.")}</div>
      <div>
        <label className="lbl">{L("Bật chương trình giới thiệu")}</label>
        <select className="inp" name="module_affiliate" defaultValue={s.module_affiliate === "0" ? "0" : "1"}><option value="1">{L("Bật")}</option><option value="0">{L("Tắt")}</option></select>
      </div>
      <div><label className="lbl">{L("Tỷ lệ hoa hồng (%)")}</label><input className="inp" name="affiliate_percent" type="number" step="0.5" min="0" max="50" defaultValue={s.affiliate_percent} /></div>
      <p className="text-xs text-slate-400">{L("Ví dụ: người được giới thiệu mua 1.000.000₫, người giới thiệu nhận đúng tỷ lệ % này. Panel con tự đặt % riêng cho khách của mình ở Panel Admin.")}</p>
    </section>
  );

  /* ---------------- Bảo mật ---------------- */
  const baomat = (
    <>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">{L("Phiên đăng nhập & giới hạn")}</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div><label className="lbl">{L("Phiên đăng nhập (ngày)")}</label><input className="inp" name="session_days" type="number" min="1" max="90" defaultValue={s.session_days} /></div>
          <div><label className="lbl">{L("Số lượng mua Premium tối đa / đơn")}</label><input className="inp" name="premium_max_qty" type="number" min="1" defaultValue={s.premium_max_qty} /></div>
          <div><label className="lbl">{L("Số link tối đa / lần đặt (nhiều link & hàng loạt)")}</label><input className="inp" name="order_max_links" type="number" min="1" defaultValue={s.order_max_links} /></div>
        </div>
      </section>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">Google reCAPTCHA v2</div>
        <div>
          <label className="lbl">{L("Bật reCAPTCHA")}</label>
          <select className="inp" name="recaptcha_enabled" defaultValue={s.recaptcha_enabled === "1" ? "1" : "0"}><option value="0">{L("Tắt")}</option><option value="1">{L("Bật")}</option></select>
        </div>
        {s.recaptcha_enabled !== "1" && <div className={warnBox}>{L("reCAPTCHA đang tắt — Form đăng nhập, đăng ký và quên mật khẩu sẽ hiển thị không có CAPTCHA.")}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="lbl">Site Key</label><input className="inp" name="recaptcha_site_key" defaultValue={s.recaptcha_site_key} placeholder="6Lc..." /></div>
          <div><label className="lbl">Secret Key</label><input className="inp" name="recaptcha_secret" defaultValue={s.recaptcha_secret} placeholder="6Lc..." autoComplete="off" /></div>
          <div><label className="lbl">{L("Áp dụng cho Đăng nhập")}</label>
            <select className="inp" name="recaptcha_login" defaultValue={s.recaptcha_login === "1" ? "1" : "0"}><option value="0">{L("Không")}</option><option value="1">{L("Có")}</option></select></div>
          <div><label className="lbl">{L("Áp dụng cho Đăng ký")}</label>
            <select className="inp" name="recaptcha_register" defaultValue={s.recaptcha_register === "1" ? "1" : "0"}><option value="0">{L("Không")}</option><option value="1">{L("Có")}</option></select></div>
        </div>
        <p className="text-xs text-slate-400">{L("Lấy key miễn phí tại google.com/recaptcha (loại reCAPTCHA v2 \"Tôi không phải người máy\") cho đúng tên miền của site.")}</p>
      </section>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">{L("Phòng chống Brute Force")}</div>
        <div className={infoBox}>{L("Chặn tạm thời địa chỉ IP gây nhiều đăng nhập sai liên tục.")}</div>
        <div>
          <label className="lbl">{L("Bật chống brute-force")}</label>
          <select className="inp" name="bf_enabled" defaultValue={s.bf_enabled === "0" ? "0" : "1"}><option value="1">{L("Bật")}</option><option value="0">{L("Tắt")}</option></select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="lbl">{L("Số lần thử tối đa")}</label><input className="inp" name="bf_max_attempts" type="number" min={3} max={100} defaultValue={s.bf_max_attempts} /></div>
          <div><label className="lbl">{L("Thời gian khóa (giây)")}</label><input className="inp" name="bf_lock_seconds" type="number" min={30} max={86400} defaultValue={s.bf_lock_seconds} /></div>
        </div>
        <p className="text-xs text-slate-400">{L("Vượt quá số lần sai, cặp IP + tài khoản đó bị khoá đăng nhập tạm trong thời gian trên.")}</p>
      </section>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">{L("Chính sách mật khẩu")}</div>
        <div><label className="lbl">{L("Độ dài mật khẩu tối thiểu khi đăng ký / đổi mật khẩu")}</label><input className="inp" name="password_min_length" type="number" min={4} max={32} defaultValue={s.password_min_length} /></div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div><label className="lbl">{L("Bắt buộc chữ hoa")}</label>
            <select className="inp" name="pw_require_upper" defaultValue={s.pw_require_upper === "1" ? "1" : "0"}><option value="0">{L("Không")}</option><option value="1">{L("Có")}</option></select></div>
          <div><label className="lbl">{L("Bắt buộc chữ số")}</label>
            <select className="inp" name="pw_require_number" defaultValue={s.pw_require_number === "1" ? "1" : "0"}><option value="0">{L("Không")}</option><option value="1">{L("Có")}</option></select></div>
          <div><label className="lbl">{L("Bắt buộc ký tự đặc biệt")}</label>
            <select className="inp" name="pw_require_special" defaultValue={s.pw_require_special === "1" ? "1" : "0"}><option value="0">{L("Không")}</option><option value="1">{L("Có")}</option></select></div>
        </div>
        <p className="text-xs text-slate-400">{L("Chặn IP và các tuỳ chọn nâng cao khác ở mục")} <b>{L("Bảo mật nâng cao")}</b> {L("trong menu.")}</p>
      </section>
    </>
  );

  /* ---------------- Cron Job ---------------- */
  const cronRow = (title: string, freq: string, url: string, note?: string) => (
    <div className="rounded-xl border-2 border-dashed border-slate-200 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-slate-800">{L(title)}</span>
        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">{L(freq)}</span>
        <span className="ml-auto"><CopyBtn text={url} /></span>
      </div>
      <code className="mt-1.5 block break-all text-[13px] text-slate-600">{url}</code>
      {note && <p className="mt-1 text-xs text-slate-400">{L(note)}</p>}
    </div>
  );
  const cron = (
    <>
      <div className={warnBox}>{L("Hệ thống chạy nền qua MỘT đường dẫn cron duy nhất: mỗi lần gọi, hệ thống tự đồng bộ trạng thái đơn hàng, thả đơn drip-feed và đăng ký định kỳ tới hạn, đồng bộ dịch vụ & giá từ nhà cung cấp, kiểm tra số dư nhà cung cấp, auto refill và gửi báo cáo ngày. Cài cron gọi mỗi 5–10 phút là đủ.")}</div>
      <section className="card p-6 space-y-3.5">
        <div className="font-bold text-slate-900">{L("Khoá bí mật Cron")}</div>
        <div>
          <label className="lbl">{L("Khoá Cron (dùng trong URL cron bên dưới)")}</label>
          <ToolKeyField initial={s.cron_secret} name="cron_secret" />
        </div>
      </section>
      <section className="card p-6 space-y-3.5">
        <div className="font-bold text-slate-900">{L("Danh sách đường dẫn Cron & Webhook")}</div>
        {cronRow("Đồng bộ trạng thái đơn hàng, dịch vụ & refill", "mỗi 5–10 phút", cronUrl, "Trên VPS: crontab */5 * * * * curl -s \"URL trên\". Trên Vercel: vercel.json mục crons với header x-cron-secret.")}
        {cronRow("Webhook cộng tiền tự động (SePay / ngân hàng)", "theo giao dịch", webhookUrl, "Header: Authorization: Apikey <secret đặt ở trang Cấu hình nạp tiền>. Cộng tiền theo mã nạp trong nội dung chuyển khoản, chống cộng trùng theo mã giao dịch.")}
        {cronRow("Webhook Stripe", "theo sự kiện", `${base}/api/webhooks/stripe`, "Khai trong Stripe Dashboard, sự kiện checkout.session.completed, ký bằng Webhook Secret ở tab Thanh toán.")}
        {cronRow("Trang quay về sau thanh toán PayPal / Stripe", "sau thanh toán", `${base}/api/payments/paypal/return · ${base}/api/payments/stripe/return`)}
      </section>
    </>
  );

  /* ---------------- SMM Tool API ---------------- */
  const schemaRows: Array<[string, string, string]> = [
    ["id", "Int", "ID duy nhất của đơn hàng"],
    ["link", "String", "Link cần tăng (Facebook, TikTok,...)"],
    ["quantity", "Int", "Số lượng cần tăng cho đơn hàng"],
    ["start_count", "Int", "Số lượng ban đầu trước khi chạy (số tại thời điểm mua)"],
    ["remains", "Int", "Số lượng còn lại cần chạy"],
    ["external_order_id", "String", "ID đơn của phía tool (nếu cập nhật rồi thì giữ nguyên)"],
    ["status", "String", "Trạng thái đơn: processing, inprogress, completed, partial, canceled, refunded, error"],
  ];
  const toolapi = (
    <>
      <section className="card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="font-bold text-slate-900">{L("Cấu hình API Key")}</div>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">v1.0.0</span>
        </div>
        <div>
          <label className="lbl">{L("Tool API Key (Mã bí mật)")}</label>
          <ToolKeyField initial={s.tool_api_key} />
        </div>
        <div className="rounded-xl bg-rose-50 px-4 py-3 text-[13px] leading-relaxed text-rose-700">{L("Không chia sẻ Tool API Key này với bất kỳ ai. Người có key có thể xem các đơn hàng đang chờ và cập nhật trạng thái đơn hàng.")}</div>
      </section>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <section className="card p-6 space-y-3 text-sm">
          <div className="font-bold text-slate-900">{L("Thông tin chung")}</div>
          <div className="space-y-2 text-slate-600">
            <div className="flex flex-wrap gap-2"><span className="w-24 shrink-0 font-semibold text-slate-800">Base URL:</span><code className="rounded-lg bg-slate-100 px-2 py-0.5 text-[13px]">{base}/api/tool</code></div>
            <div className="flex flex-wrap gap-2"><span className="w-24 shrink-0 font-semibold text-slate-800">{L("Xác thực:")}</span><span>{L("Tham số key trên URL, header x-tool-key, hoặc field key trong body")}</span></div>
            <div className="flex flex-wrap gap-2"><span className="w-24 shrink-0 font-semibold text-slate-800">{L("Định dạng:")}</span><span>JSON</span></div>
            <div className="flex flex-wrap gap-2"><span className="w-24 shrink-0 font-semibold text-slate-800">{L("Mã hóa:")}</span><span>UTF-8</span></div>
          </div>
          <p className="text-[13px] leading-relaxed text-slate-500"><b className="text-slate-700">{L("Lưu ý quan trọng:")}</b> {L("Tool chỉ nhận đơn của dịch vụ")} <b>{L("Thủ công")}</b> {L("đang chờ xử lý (pending, processing, inprogress). Cập nhật thành công trả về")} <span className="font-mono">data: true</span>{L(". Trạng thái hợp lệ khi cập nhật: processing, inprogress, completed, partial, canceled, refunded, error. Huỷ/hoàn/một phần sẽ tự hoàn tiền theo phần chưa chạy.")}</p>
        </section>
        <section className="card p-6 space-y-3">
          <div className="font-bold text-slate-900">{L("Bảng tham số dữ liệu (Response Schema)")}</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400"><th className="py-2 pr-3">Field</th><th className="py-2 pr-3">{L("Kiểu")}</th><th className="py-2">{L("Mô tả chi tiết")}</th></tr></thead>
              <tbody>
                {schemaRows.map(([f, t, d]) => (
                  <tr key={f} className="border-b border-slate-100 last:border-0"><td className="py-2 pr-3 font-mono text-[13px] font-semibold text-slate-800">{f}</td><td className="py-2 pr-3 text-slate-500">{t}</td><td className="py-2 text-slate-600">{L(d)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <section className="card p-6 space-y-3">
        <div className="font-bold text-slate-900">{L("Danh sách Endpoint")}</div>
        <details className="group rounded-xl border border-slate-200 px-4 py-3" open>
          <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
            <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-extrabold text-emerald-700">GET</span>
            <span className="font-mono">/orders</span>
            <span className="font-normal text-slate-500">{L("— Lấy danh sách đơn hàng chờ xử lý")}</span>
          </summary>
          <div className="mt-3 space-y-2 text-sm text-slate-600">
            <p>{L("Tham số lọc:")} <span className="font-mono">status, service_id, search</span>{L(". Lấy đầy đủ thông tin của đơn hàng cần xử lý (link, số lượng cần tăng...).")}</p>
            <code className="block overflow-x-auto whitespace-pre rounded-xl bg-slate-950 px-4 py-3 text-[12.5px] leading-relaxed text-slate-100">{`GET ${base}/api/tool/orders?key=<TOOL_API_KEY>

[
  {
    "id": 123,
    "code": "SMM100123",
    "link": "https://www.facebook.com/...",
    "quantity": 1000,
    "start_count": 250,
    "remains": 1000,
    "external_order_id": "",
    "status": "pending",
    "service_id": 1
  }
]`}</code>
          </div>
        </details>
        <details className="group rounded-xl border border-slate-200 px-4 py-3">
          <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
            <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-extrabold text-emerald-700">GET</span>
            <span className="font-mono">/orders/{"{id}"}</span>
            <span className="font-normal text-slate-500">{L("— Xem chi tiết một đơn hàng cụ thể")}</span>
          </summary>
          <div className="mt-3">
            <code className="block overflow-x-auto whitespace-pre rounded-xl bg-slate-950 px-4 py-3 text-[12.5px] leading-relaxed text-slate-100">{`GET ${base}/api/tool/orders/123?key=<TOOL_API_KEY>

{
  "id": 123,
  "code": "SMM100123",
  "link": "https://www.facebook.com/...",
  "quantity": 1000,
  "start_count": 250,
  "remains": 400,
  "external_order_id": "EXT-999",
  "status": "inprogress",
  "service_id": 1,
  "admin_note": "",
  "service": { "id": 1, "name": "Follow Facebook" }
}`}</code>
          </div>
        </details>
        <details className="group rounded-xl border border-slate-200 px-4 py-3">
          <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
            <span className="rounded-md bg-brand-100 px-2 py-0.5 text-[11px] font-extrabold text-brand-700">POST</span>
            <span className="font-mono">/update</span>
            <span className="font-normal text-slate-500">{L("— Cập nhật trạng thái đơn hàng (ID & Key trong Body)")}</span>
          </summary>
          <div className="mt-3 space-y-2 text-sm text-slate-600">
            <p>{L("Tham số body:")} <span className="font-mono">id</span> {L("(bắt buộc),")} <span className="font-mono">external_order_id</span>{L(",")} <span className="font-mono">start_count</span>{L(",")} <span className="font-mono">remains</span> {L("(bắt buộc khi kết thúc),")} <span className="font-mono">status</span> {L("(bắt buộc): processing, inprogress, completed, partial, canceled, refunded, error.")}</p>
            <code className="block overflow-x-auto whitespace-pre rounded-xl bg-slate-950 px-4 py-3 text-[12.5px] leading-relaxed text-slate-100">{`POST ${base}/api/tool/update
Content-Type: application/json

{
  "key": "<TOOL_API_KEY>",
  "id": 123,
  "external_order_id": "EXT-999",
  "start_count": 250,
  "remains": 0,
  "status": "completed"
}`}</code>
          </div>
        </details>
      </section>
      <section className="card p-6 space-y-4 text-sm">
        <div className="font-bold text-slate-900">{L("API đại lý (chuẩn SMM v2)")}</div>
        <div>
          <div className="text-slate-500 mb-1">Base URL:</div>
          <code className="block bg-slate-950 text-slate-100 rounded-xl px-4 py-3 break-all">{base}/api/v2</code>
        </div>
        <p className="text-slate-600">{L("Xác thực: gửi kèm")} <span className="font-mono">key</span> {L("= API key riêng của từng tài khoản (khách tự lấy ở mục API đại lý trong tài khoản). Các action:")} <span className="font-mono">services · add · status · orders · balance · refill · refills · refill_status · cancel</span>{L(".")}</p>
        <p className="text-slate-600">{L("Tài liệu đầy đủ cho khách ở trang")} <a className="text-brand-600 font-semibold" href="/dashboard/api-docs" target="_blank">{L("Tài liệu API")}</a>{L(".")}</p>
      </section>
    </>
  );

  /* ---------------- AI Kiểm tra ---------------- */
  const aiCategories: Array<[string, string]> = [
    ["Cơ quan nhà nước", "Trang web mạo danh cơ quan chính phủ, bộ ngành, địa phương."],
    ["Nội dung khiêu dâm", "Hình ảnh, video, văn bản khiêu dâm, đồi trụy."],
    ["Cờ bạc", "Trang web cờ bạc, cá cược, xổ số, casino trực tuyến."],
    ["Ma tuý", "Mua bán, sử dụng, quảng cáo chất ma tuý, chất kích thích."],
    ["Lừa đảo", "Trang web lừa đảo, phishing, giả mạo, chiếm đoạt tài sản."],
    ["Bạo lực", "Nội dung bạo lực, đẫm máu, khủng bố, kích động thù hận."],
    ["Chống phá Nhà nước", "Nội dung chống phá Đảng, Nhà nước, xuyên tạc lịch sử."],
    ["Buôn bán vũ khí", "Mua bán súng đạn, vũ khí, vật liệu nổ trái phép."],
    ["Xâm phạm quyền trẻ em", "Nội dung xâm hại, bóc lột trẻ em dưới mọi hình thức."],
  ];
  const ai = (
    <>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">{L("Kiểm tra liên kết bằng AI")}</div>
        <div className={infoBox}>{L("Khi bật, mỗi đơn SMM mới sẽ được AI quét link ở chế độ nền: nếu link thuộc nhóm nội dung vi phạm ở danh sách bên dưới, đơn bị gắn cờ rủi ro và báo về cho admin (đơn vẫn chạy bình thường, admin tự quyết định xử lý). Kết nối AI này cũng dùng cho LiveChat tư vấn tìm dịch vụ phía khách.")}</div>
        <div>
          <label className="lbl">{L("Bật AI kiểm tra link đơn hàng")}</label>
          <select className="inp" name="ai_check_enabled" defaultValue={s.ai_check_enabled === "1" ? "1" : "0"}><option value="0">{L("Tắt")}</option><option value="1">{L("Bật — quét link mọi đơn SMM mới")}</option></select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="lbl">{L("Bật AI (tư vấn + kiểm tra)")}</label>
            <select className="inp" name="ai_enabled" defaultValue={s.ai_enabled === "1" ? "1" : "0"}><option value="0">{L("Tắt")}</option><option value="1">{L("Bật")}</option></select></div>
          <div><label className="lbl">{L("Nhà cung cấp")}</label>
            <select className="inp" name="ai_provider" defaultValue={s.ai_provider || "openai"}><option value="openai">{L("OpenAI / endpoint tương thích")}</option><option value="gemini">Google Gemini</option></select></div>
          <div><label className="lbl">{L("API URL (Base URL tuỳ chỉnh — để trống = mặc định)")}</label><input className="inp" name="ai_base_url" defaultValue={s.ai_base_url} placeholder="https://api.openai.com/v1" /></div>
          <div><label className="lbl">{L("Model AI")}</label><input className="inp" name="ai_model" defaultValue={s.ai_model} placeholder="VD: gpt-4o-mini / gemini-2.0-flash" /></div>
          <div className="sm:col-span-2"><label className="lbl">API Key</label><input className="inp" name="ai_api_key" defaultValue={s.ai_api_key} placeholder={L("Dán API key của bạn")} autoComplete="off" /><p className="mt-1 text-xs text-rose-500">{L("Không chia sẻ API key này với bất kỳ ai.")}</p></div>
        </div>
        <a href="/api/admin/ai-test" className="btn-ghost btn-sm inline-block">{L("Kiểm tra kết nối AI")}</a>
      </section>
      <section className="card p-6 space-y-3">
        <div className="font-bold text-slate-900">{L("Các nội dung AI sẽ kiểm tra")}</div>
        <ul className="divide-y divide-slate-100">
          {aiCategories.map(([t, d]) => (
            <li key={t} className="flex items-start gap-3 py-2.5">
              <span className="mt-0.5 flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-md bg-emerald-500"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></span>
              <span className="text-sm leading-relaxed"><b className="text-slate-800">{L(t)}</b> <span className="text-slate-500">— {L(d)}</span></span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );

  /* ---------------- USDT ---------------- */
  const usdt = (
    <section className="card p-6 space-y-4">
      <div className="font-bold text-slate-900">{L("Nạp tiền USDT")}</div>
      <div className={infoBox}>{L("Thêm phương thức nạp tiền USDT: khách chuyển USDT vào ví của bạn rồi khai mã giao dịch, yêu cầu vào hàng chờ ở mục Nạp tiền — admin đối chiếu ví rồi duyệt, tiền cộng ngay khi duyệt.")}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label className="lbl">{L("Bật nạp USDT")}</label>
          <select className="inp" name="usdt_enabled" defaultValue={s.usdt_enabled === "1" ? "1" : "0"}><option value="0">{L("Tắt")}</option><option value="1">{L("Bật")}</option></select></div>
        <div><label className="lbl">{L("Mạng")}</label>
          <select className="inp" name="usdt_network" defaultValue={s.usdt_network || "TRC20"}><option value="TRC20">TRC20 (Tron)</option><option value="BEP20">BEP20 (BSC)</option><option value="ERC20">ERC20 (Ethereum)</option></select></div>
        <div><label className="lbl">{L("Địa chỉ ví nhận USDT")}</label><input className="inp" name="usdt_address" defaultValue={s.usdt_address} placeholder={L("Địa chỉ ví của bạn")} /></div>
        <div><label className="lbl">{L("Tỉ giá riêng 1 USDT = (VND) — để trống dùng tỉ giá USD")}</label><input className="inp" name="usdt_rate" type="number" defaultValue={s.usdt_rate} placeholder="VD: 25500" /></div>
        <div><label className="lbl">{L("Số USDT tối thiểu mỗi lần nạp")}</label><input className="inp" name="usdt_min" type="number" min="0" step="0.1" defaultValue={s.usdt_min} /></div>
      </div>
      <p className="text-xs text-slate-400">{L("Trang Nạp tiền của khách sẽ hiện địa chỉ ví + mạng + tỉ giá này khi bạn bật. Panel con tự cấu hình ví USDT riêng trong Panel Admin.")}</p>
    </section>
  );

  /* ---------------- Script / HTML ---------------- */
  const script = (
    <>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">{L("Script/HTML Header trang khách")}</div>
        <div className={infoBox}>{L("Chèn đoạn mã HTML/Javascript vào thẻ <head> của trang khách. Đoạn mã sẽ được chèn vào trên mọi trang khách hoặc trang đăng nhập.")}</div>
        <textarea className="inp font-mono !bg-slate-950 !text-slate-100" name="custom_head_html" rows={6} defaultValue={s.custom_head_html} placeholder="<!-- VD: Google Analytics --><script async src='https://www.googletagmanager.com/gtag/js?id=G-XXXXX'></script>" />
      </section>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">{L("Script/HTML Footer trang khách")}</div>
        <div className={infoBox}>{L("Chèn đoạn mã HTML/Javascript trước thẻ </body> của trang khách. Đoạn mã sẽ được chèn vào trên mọi trang khách hoặc trang đăng nhập.")}</div>
        <textarea className="inp font-mono !bg-slate-950 !text-slate-100" name="custom_body_html" rows={6} defaultValue={s.custom_body_html} placeholder="<!-- VD: Tawk.to Live Chat --><script type='text/javascript'>...</script>" />
      </section>
      <p className="text-xs text-amber-600">{L("Chỉ dán mã từ nguồn tin cậy — mã ở đây chạy trên mọi trang của website.")}</p>
    </>
  );

  return (
    <div>
      <PageHead title={L("Cài đặt Website")} desc={L("Cấu hình SEO, logo, favicon và thông báo hệ thống.")}>
        <button type="submit" form="settings-form" className="btn-primary shrink-0">{L("Lưu cài đặt")}</button>
      </PageHead>
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <form id="settings-form" action={adminSaveSettings}>
        <SettingsTabs tabs={[
          { id: "landing", label: "Landing Page", icon: I.home, content: landing },
          { id: "chung", label: L("Chung"), icon: I.gear, content: chung },
          { id: "thanhtoan", label: L("Thanh toán"), icon: I.wallet, content: thanhtoan },
          { id: "email", label: "Email", icon: I.mail, content: email },
          { id: "telegram", label: "Telegram", icon: I.megaphone, content: telegram },
          { id: "thongbao", label: L("Thông báo"), icon: I.bell, content: thongbao },
          { id: "google", label: "Google", icon: I.users, content: google },
          { id: "khuyenmai", label: L("Khuyến mãi"), icon: I.gift, content: khuyenmai },
          { id: "gioithieu", label: L("Giới thiệu"), icon: I.percent, content: gioithieu },
          { id: "baomat", label: L("Bảo mật"), icon: I.shield, content: baomat },
          { id: "cron", label: "Cron Job", icon: I.clock, content: cron },
          { id: "toolapi", label: "SMM Tool API", icon: I.key, content: toolapi },
          { id: "ai", label: L("AI Kiểm tra"), icon: I.cpu, content: ai },
          { id: "usdt", label: "USDT", icon: I.money, content: usdt },
          { id: "script", label: "Script/HTML", icon: I.file, content: script },
        ]} />
      </form>
    </div>
  );
}
