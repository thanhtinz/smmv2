import Link from "next/link";
import { requirePanelOwnerPage } from "@/lib/panel-access";
import { prisma } from "@/lib/db";
import { PageHead, Flash, I } from "@/components/ui";
import { panelSaveConfigAction } from "@/app/actions/panel";
import { updatePanelAction } from "@/app/actions/user";
import SettingsTabs from "@/components/settings-tabs";
import { ToolKeyField } from "@/components/settings-editors";
import { RichTextEditor } from "@/components/rich-editor";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

const mask = (v: string | null | undefined) => (v ? "••••••••••••" : "");

/** Cấu hình riêng của panel — ĐỦ tab như trang Cài đặt của web mẹ (chỉ trừ cấu hình
 *  nguồn dịch vụ, phần duy nhất thuộc về web mẹ). Mọi cấu hình là của chính panel. */
export default async function PanelConfigPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const { panel } = await requirePanelOwnerPage();
  const { L, Ld, M } = await getServerI18n((panel as { langConfig?: string | null }).langConfig ?? null);
  const linkedUser = panel.apiUserId ? await prisma.user.findUnique({ where: { id: panel.apiUserId }, select: { username: true } }) : null;
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://your-domain.vn";
  const infoBox = "rounded-xl bg-brand-50 px-4 py-3 text-[13px] leading-relaxed text-slate-600";

  const authStyles = [
    { code: "CLASSIC", value: "classic", name: "Cổ điển", tag: "Thẻ giữa màn hình", desc: "Thẻ trắng truyền thống, lịch sự, dễ dùng." },
    { code: "GLASS", value: "glass", name: "Kính mờ", tag: "Nền tối", desc: "Kính mờ trên nền gradient — phong cách hiện đại." },
    { code: "MINIMAL", value: "minimal", name: "Tối giản", tag: "Thẻ giữa màn hình", desc: "Không khung, ít chi tiết, tập trung vào form." },
    { code: "APP", value: "app", name: "Kiểu App", tag: "Thẻ giữa màn hình", desc: "Thẻ bo tròn lớn kiểu ứng dụng điện thoại." },
    { code: "SPLIT", value: "split", name: "Chia đôi", tag: "Hai cột", desc: "Cột thương hiệu bên trái, form bên phải — kiểu panel quốc tế." },
  ];
  const landingTemplates = [
    { code: "HIỆN ĐẠI", value: "hien-dai", name: "Hiện đại", desc: "Nền tối, header dạng pill, hero lớn — mẫu mặc định của web mẹ." },
    { code: "SÁNG RỰC", value: "sang", name: "Sáng rực", desc: "Nền sáng, dải số liệu, thẻ nền tảng — kiểu SMMFlare quốc tế." },
    { code: "CỔ ĐIỂN", value: "co-dien", name: "Cổ điển", desc: "Nền navy đậm, bảng nền tảng dạng bảng — kiểu panel SMM truyền thống." },
  ];

  /* ---------------- Landing Page ---------------- */
  const landing = (
    <form action={panelSaveConfigAction} className="space-y-6">
      <input type="hidden" name="section" value="landing" />
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">{L("Trang giới thiệu (Landing Page)")}</div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div><label className="lbl">{L("Tiêu đề Hero (H1)")}</label><input className="inp" name="landingHeadline" defaultValue={panel.landingHeadline || ""} placeholder={L("VD: Shop Tăng Tương Tác Số 1")} /><p className="mt-1 text-xs text-slate-400">{L("Tiêu đề chính ở trang giới thiệu của website — để trống dùng câu mặc định.")}</p></div>
          <div><label className="lbl">{L("Phụ đề (Subtitle)")}</label><input className="inp" name="landingSubtitle" defaultValue={panel.landingSubtitle || ""} /><p className="mt-1 text-xs text-slate-400">{L("Phụ đề ngay dưới tiêu đề chính — để trống dùng khẩu hiệu của website.")}</p></div>
        </div>
        <a href={`/cua-hang/${panel.slug}`} target="_blank" className="btn-ghost btn-sm inline-block">{L("Xem website của bạn")}</a>
        <div>
          <label className="lbl">{L("Mẫu Landing Page của website")}</label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {landingTemplates.map((a) => (
              <label key={a.value} className="cursor-pointer">
                <input type="radio" name="landingTemplate" value={a.value} defaultChecked={panel.landingTemplate === a.value} className="peer sr-only" />
                <div className="h-full rounded-2xl border-2 border-slate-200 p-4 transition peer-checked:border-brand-600 peer-checked:bg-brand-50/60">
                  <span className="rounded-md bg-slate-900 px-2 py-0.5 text-[11px] font-extrabold tracking-wide text-white">{L(a.code)}</span>
                  <div className="mt-2.5 text-sm font-bold text-slate-900">{L(a.name)}</div>
                  <p className="mt-2 text-[13px] leading-relaxed text-slate-500">{L(a.desc)}</p>
                </div>
              </label>
            ))}
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-500"><input type="radio" name="landingTemplate" value="" defaultChecked={!panel.landingTemplate} className="accent-slate-900" /> {L("Theo web mẹ")}</label>
        </div>
      </section>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">{L("Giao diện trang Đăng nhập / Đăng ký")}</div>
        <p className="text-sm text-slate-400">{L("Áp dụng khi khách vào bằng tên miền riêng của website. Để trống là theo kiểu của web mẹ.")}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {authStyles.map((a) => (
            <label key={a.value} className="cursor-pointer">
              <input type="radio" name="authStyle" value={a.value} defaultChecked={panel.authStyle === a.value} className="peer sr-only" />
              <div className="h-full rounded-2xl border-2 border-slate-200 p-4 transition peer-checked:border-brand-600 peer-checked:bg-brand-50/60">
                <span className="rounded-md bg-slate-900 px-2 py-0.5 text-[11px] font-extrabold tracking-wide text-white">{a.code}</span>
                <div className="mt-2.5 text-sm font-bold text-slate-900">{L(a.name)}</div>
                <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">{L(a.tag)}</span>
                <p className="mt-2 text-[13px] leading-relaxed text-slate-500">{L(a.desc)}</p>
              </div>
            </label>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-500"><input type="radio" name="authStyle" value="" defaultChecked={!panel.authStyle} className="accent-slate-900" /> {L("Theo web mẹ")}</label>
      </section>
      <button className="btn-primary !py-2.5">{L("Lưu trang giới thiệu")}</button>
    </form>
  );

  /* ---------------- Chung ---------------- */
  const chung = (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <form action={panelSaveConfigAction} className="card space-y-4 p-6">
          <input type="hidden" name="section" value="brand" />
          <div className="font-bold text-slate-900">{L("Thương hiệu")}</div>
          <div><label className="lbl">{L("Tên website")}</label><input name="name" defaultValue={panel.name} className="inp" /></div>
          <div><label className="lbl">{L("Khẩu hiệu (tagline)")}</label><input name="tagline" defaultValue={panel.tagline || ""} className="inp" /></div>
          <div><label className="lbl">{L("Màu chủ đạo")}</label>
            <select name="accent" defaultValue={panel.accent} className="inp">
              <option value="blue">{L("Xanh dương")}</option><option value="violet">{L("Tím")}</option><option value="emerald">{L("Xanh lục")}</option>
              <option value="orange">{L("Cam")}</option><option value="rose">{L("Hồng")}</option><option value="teal">{L("Ngọc")}</option>
            </select></div>
          <div><label className="lbl">{L("Đường dẫn logo (URL)")}</label><input name="logoUrl" defaultValue={panel.logoUrl || ""} placeholder="https://..." className="inp" /></div>
          <div><label className="lbl">{L("Đường dẫn favicon (URL)")}</label><input name="faviconUrl" defaultValue={panel.faviconUrl || ""} placeholder="https://..." className="inp" /></div>
          <div className="font-bold text-slate-900 pt-2">{L("Kênh hỗ trợ hiển thị cho khách")}</div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="lbl">Zalo</label><input name="supportZalo" defaultValue={panel.supportZalo || ""} className="inp" /></div>
            <div><label className="lbl">Telegram</label><input name="supportTelegram" defaultValue={panel.supportTelegram || ""} className="inp" /></div>
            <div><label className="lbl">Facebook</label><input name="supportFacebook" defaultValue={panel.supportFacebook || ""} className="inp" /></div>
            <div><label className="lbl">Hotline</label><input name="supportHotline" defaultValue={panel.supportHotline || ""} className="inp" /></div>
          </div>
          <button className="btn-primary !py-2.5">{L("Lưu thương hiệu")}</button>
        </form>
        <div className="card space-y-3 p-6">
          <div className="font-bold text-slate-900">{L("Cấu hình lần đầu")}</div>
          <p className="text-sm text-slate-500">{L("Muốn chỉnh lại toàn bộ theo từng bước (thông tin → giá & cấp bậc → API key → tên miền & hỗ trợ), mở lại trang cấu hình lần đầu.")}</p>
          <Link href="/dashboard/panel-cua-toi/thiet-lap" className="btn-ghost w-full">{L("Mở trang cấu hình lần đầu")}</Link>
        </div>
      </div>
      <div className="space-y-6">
        <form action={panelSaveConfigAction} className="card space-y-4 p-6">
          <input type="hidden" name="section" value="seo" />
          <div className="font-bold text-slate-900">SEO &amp; Meta Tags</div>
          <div><label className="lbl">{L("Mô tả (meta description)")}</label><textarea name="metaDescription" rows={3} defaultValue={panel.metaDescription || ""} className="inp" /></div>
          <div><label className="lbl">{L("Từ khoá (meta keywords, cách nhau dấu phẩy)")}</label><input name="metaKeywords" defaultValue={panel.metaKeywords || ""} className="inp" /></div>
          <div><label className="lbl">{L("Ảnh chia sẻ (OG image URL)")}</label><input name="ogImageUrl" defaultValue={panel.ogImageUrl || ""} placeholder="https://..." className="inp" /></div>
          <button className="btn-primary !py-2.5">{L("Lưu SEO")}</button>
        </form>
        <div className="card space-y-2 p-6">
          <div className="font-bold text-slate-900">{L("Xem trước kết quả Google")}</div>
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="text-xs text-slate-400">{panel.domain || "ten-mien-cua-ban.vn"}</div>
            <div className="mt-0.5 text-lg font-medium leading-snug text-[#1a0dab]">{panel.name} {L("— SMM Panel & Tài khoản Premium")}</div>
            <div className="mt-0.5 text-sm text-slate-500">{panel.metaDescription || panel.tagline || L("Tăng like, follow, view tự động + tài khoản premium giá tốt")}</div>
          </div>
          <p className="text-xs text-slate-400">{L("Áp dụng trên tên miền riêng của website.")}</p>
        </div>
        <form action={updatePanelAction} className="card space-y-4 p-6">
          <input type="hidden" name="back" value="/panel-admin/cau-hinh" />
          <div className="font-bold text-slate-900">{L("Kết nối & tên miền riêng")}</div>
          <div>
            <label className="lbl">{L("Tên miền riêng")}</label>
            <input className="inp" name="domain" defaultValue={panel.domain || ""} placeholder={L("vd: shopcuaban.vn")} />
            <p className="mt-1.5 text-xs text-slate-400">{L("Trỏ NameServer của tên miền về máy chủ hệ thống để khách vào thẳng website bằng tên miền của bạn.")}</p>
          </div>
          <div>
            <label className="lbl">{L("API key liên kết web mẹ")}</label>
            <input className="inp font-mono !text-[13px]" name="apiKey" defaultValue="" placeholder={panel.apiKey ? L("Đang dùng key ••••") + panel.apiKey.slice(-4) + L(" — để trống = giữ nguyên") : L("Dán API key của tài khoản mẹ")} autoComplete="off" />
            <p className="mt-1.5 text-xs text-slate-400">{L("Đang liên kết bằng key của tài khoản")} <b>{linkedUser ? `${linkedUser.username} (#${panel.apiUserId})` : "—"}</b>{L(". Hệ thống kiểm tra key ngay khi lưu.")}</p>
            <p className="mt-1.5 text-xs text-slate-400">{L("Nếu tài khoản liên kết đã đặt whitelist IP cho API key ở web mẹ, danh sách IP đó cũng áp dụng cho khoá liên kết của website này.")}</p>
          </div>
          <div>
            <label className="lbl">{L("Trạng thái bán")}</label>
            <select className="inp" name="status" defaultValue={panel.status}>
              <option value="ACTIVE">{L("Đang mở bán")}</option>
              <option value="SUSPENDED">{L("Tạm ngưng (khách mua theo giá gốc, không hoa hồng)")}</option>
            </select>
          </div>
          <button className="btn-primary !py-2.5">{L("Lưu kết nối")}</button>
        </form>
      </div>
    </div>
  );

  /* ---------------- Thanh toán ---------------- */
  const thanhtoan = (
    <>
      <form action={panelSaveConfigAction} className="card space-y-4 p-6">
        <input type="hidden" name="section" value="bank" />
        <div className="font-bold text-slate-900">{L("Ngân hàng nhận tiền của panel")}</div>
        <p className="text-sm text-slate-400">{L("Khách của panel thấy tài khoản này ở trang Nạp tiền và gửi yêu cầu — bạn duyệt ở mục Nạp tiền của khách.")}</p>
        <div><label className="lbl">{L("Tên ngân hàng")}</label><input name="bankName" defaultValue={panel.bankName || ""} placeholder={L("VD: Vietcombank")} className="inp" /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="lbl">{L("Số tài khoản")}</label><input name="bankAccount" defaultValue={panel.bankAccount || ""} className="inp" /></div>
          <div><label className="lbl">{L("Chủ tài khoản")}</label><input name="bankHolder" defaultValue={panel.bankHolder || ""} className="inp" /></div>
        </div>
        <button className="btn-primary !py-2.5">{L("Lưu ngân hàng")}</button>
      </form>

      <form action={panelSaveConfigAction} className="card space-y-4 p-6">
        <input type="hidden" name="section" value="sepay" />
        <div className="font-bold text-slate-900">{L("SePay của panel — nạp ngân hàng TỰ ĐỘNG")}</div>
        <p className="text-sm text-slate-400">{L("Như web mẹ: nối tài khoản SePay của chính bạn (gắn với ngân hàng nhận tiền của panel ở trang Ngân hàng) thì khách chuyển khoản đúng nội dung là tiền cộng TỰ ĐỘNG — không còn bước gửi yêu cầu duyệt. Trong SePay, đặt Webhook URL là")} <b className="text-slate-600">/api/webhooks/sepay</b> {L("của website và API Key chính là Secret bạn đặt ở đây. Chưa bật thì khách vẫn nạp qua cổng chung của web mẹ hoặc gửi yêu cầu duyệt tay.")}</p>
        <label className="flex items-center justify-between gap-4"><span className="text-sm text-slate-600">{L("Bật SePay riêng của panel")}</span><input type="checkbox" name="sepayEnabled" defaultChecked={panel.sepayEnabled} className="h-5 w-5 accent-slate-900" /></label>
        <div><label className="lbl">{L("Secret webhook (API Key của SePay bạn)")} {panel.sepaySecret && <span className="font-semibold text-emerald-600">{L("— đã lưu")}</span>}</label><input name="sepaySecret" type="password" autoComplete="off" placeholder={mask(panel.sepaySecret)} className="inp" /></div>
        <button className="btn-primary !py-2.5">{L("Lưu SePay")}</button>
      </form>

      <form action={panelSaveConfigAction} className="card space-y-4 p-6">
        <input type="hidden" name="section" value="paypal" />
        <div className="font-bold text-slate-900">{L("PayPal của panel")}</div>
        <p className="text-sm text-slate-400">{L("Method nạp như web mẹ nhưng bằng tài khoản của bạn: khách của panel nạp PayPal sẽ trả tiền vào tài khoản PayPal này và được cộng số dư tự động. Chưa bật thì khách dùng cổng của web mẹ (nếu mẹ có bật).")}</p>
        <label className="flex items-center justify-between gap-4"><span className="text-sm text-slate-600">{L("Bật nạp PayPal của panel")}</span><input type="checkbox" name="paypalEnabled" defaultChecked={panel.paypalEnabled} className="h-5 w-5 accent-slate-900" /></label>
        <div><label className="lbl">Client ID</label><input name="paypalClientId" defaultValue={panel.paypalClientId || ""} className="inp" /></div>
        <div><label className="lbl">Client Secret {panel.paypalSecret && <span className="font-semibold text-emerald-600">{L("— đã lưu")}</span>}</label><input name="paypalSecret" type="password" autoComplete="off" placeholder={mask(panel.paypalSecret)} className="inp" /></div>
        <div><label className="lbl">{L("Môi trường")}</label><select name="paypalMode" defaultValue={panel.paypalMode || "sandbox"} className="inp"><option value="sandbox">{L("Sandbox (thử nghiệm)")}</option><option value="live">{L("Live (thật)")}</option></select></div>
        <button className="btn-primary !py-2.5">{L("Lưu PayPal")}</button>
      </form>

      <form action={panelSaveConfigAction} className="card space-y-4 p-6">
        <input type="hidden" name="section" value="stripe" />
        <div className="font-bold text-slate-900">{L("Stripe của panel")}</div>
        <p className="text-sm text-slate-400">{L("Khách của panel nạp Stripe sẽ trả vào tài khoản Stripe này. Trong Stripe Dashboard, trỏ webhook về")} <b className="text-slate-600">/api/webhooks/stripe</b> {L("của website và dán Webhook Secret vào đây — hệ thống tự nhận diện theo chữ ký.")}</p>
        <label className="flex items-center justify-between gap-4"><span className="text-sm text-slate-600">{L("Bật nạp Stripe của panel")}</span><input type="checkbox" name="stripeEnabled" defaultChecked={panel.stripeEnabled} className="h-5 w-5 accent-slate-900" /></label>
        <div><label className="lbl">{L("Secret Key (sk_...)")} {panel.stripeSecretKey && <span className="font-semibold text-emerald-600">{L("— đã lưu")}</span>}</label><input name="stripeSecretKey" type="password" autoComplete="off" placeholder={mask(panel.stripeSecretKey)} className="inp" /></div>
        <div><label className="lbl">{L("Webhook Secret (whsec_...)")} {panel.stripeWebhookSecret && <span className="font-semibold text-emerald-600">{L("— đã lưu")}</span>}</label><input name="stripeWebhookSecret" type="password" autoComplete="off" placeholder={mask(panel.stripeWebhookSecret)} className="inp" /></div>
        <button className="btn-primary !py-2.5">{L("Lưu Stripe")}</button>
      </form>

      <form action={panelSaveConfigAction} className="card space-y-4 p-6">
        <input type="hidden" name="section" value="intl" />
        <div className="font-bold text-slate-900">{L("Nạp quốc tế của panel")}</div>
        <div><label className="lbl">{L("Số tiền nạp PayPal / Stripe tối thiểu (USD)")}</label><input name="intlMinUsd" type="number" min={0} defaultValue={panel.intlMinUsd || ""} className="inp" placeholder={L("Để trống = theo web mẹ")} /></div>
        <button className="btn-primary !py-2.5">{L("Lưu nạp quốc tế")}</button>
      </form>
    </>
  );

  /* ---------------- Email ---------------- */
  const email = (
    <form action={panelSaveConfigAction} className="card space-y-4 p-6">
      <input type="hidden" name="section" value="smtp" />
      <div className="font-bold text-slate-900">{L("Thư SMTP của panel")}</div>
      <p className="text-sm text-slate-400">{L("Email marketing của panel sẽ gửi qua máy chủ thư này (trống thì dùng thư hệ thống của web chính).")}</p>
      <div className="grid grid-cols-[1fr_110px] gap-4">
        <div><label className="lbl">{L("Máy chủ SMTP")}</label><input name="smtpHost" defaultValue={panel.smtpHost || ""} placeholder="smtp.gmail.com" className="inp" /></div>
        <div><label className="lbl">{L("Cổng")}</label><input name="smtpPort" defaultValue={panel.smtpPort || ""} placeholder="587" className="inp" /></div>
      </div>
      <div><label className="lbl">{L("Tài khoản")}</label><input name="smtpUser" defaultValue={panel.smtpUser || ""} className="inp" /></div>
      <div><label className="lbl">{L("Mật khẩu / mật khẩu ứng dụng")} {panel.smtpPass && <span className="font-semibold text-emerald-600">{L("— đã lưu (để trống nếu giữ nguyên)")}</span>}</label><input name="smtpPass" type="password" autoComplete="off" placeholder={mask(panel.smtpPass)} className="inp" /></div>
      <div><label className="lbl">{L("Địa chỉ gửi (From)")}</label><input name="smtpFrom" defaultValue={panel.smtpFrom || ""} placeholder="Shop <shop@example.com>" className="inp" /></div>
      <label className="flex items-center justify-between gap-4"><span className="text-sm text-slate-600">{L("Dùng SSL (cổng 465)")}</span><input type="checkbox" name="smtpSecure" defaultChecked={panel.smtpSecure} className="h-5 w-5 accent-slate-900" /></label>
      <button className="btn-primary !py-2.5">{L("Lưu cấu hình thư")}</button>
    </form>
  );

  /* ---------------- Telegram ---------------- */
  const telegram = (
    <form action={panelSaveConfigAction} className="card space-y-4 p-6">
      <input type="hidden" name="section" value="telegram" />
      <div className="font-bold text-slate-900">{L("Telegram báo đơn")}</div>
      <p className="text-sm text-slate-400">{L("Có đơn mới qua website (SMM hoặc Premium), bot sẽ nhắn ngay cho bạn.")}</p>
      <div><label className="lbl">Bot token {panel.telegramBotToken && <span className="font-semibold text-emerald-600">{L("— đã lưu")}</span>}</label><input name="telegramBotToken" defaultValue="" placeholder={mask(panel.telegramBotToken) || "123456:ABC-..."} className="inp" /></div>
      <div><label className="lbl">{L("Chat ID của bạn")}</label><input name="telegramChatId" defaultValue={panel.telegramChatId || ""} className="inp" /></div>
      <button className="btn-primary !py-2.5">{L("Lưu Telegram")}</button>
    </form>
  );

  /* ---------------- Thông báo ---------------- */
  const thongbao = (
    <form action={panelSaveConfigAction} className="space-y-6">
      <input type="hidden" name="section" value="thongbao" />
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">{L("Thanh thông báo của website")}</div>
        <div><label className="lbl">{L("Nội dung thanh thông báo")}</label><input name="announcement" defaultValue={panel.announcement || ""} className="inp" placeholder={L("VD: Khuyến mãi nạp lần đầu +10% hôm nay")} /><p className="mt-1 text-xs text-slate-400">{L("Hiện ở đầu trang giới thiệu của website. Để trống là tắt.")}</p></div>
      </section>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">{L("Thông báo hệ thống ở trang chủ khách")}</div>
        <label className="flex items-center justify-between gap-4"><span className="text-sm text-slate-600">{L("Bật banner thông báo của panel")}</span><input type="checkbox" name="sysAnnounceEnabled" defaultChecked={panel.sysAnnounceEnabled} className="h-5 w-5 accent-slate-900" /></label>
        <div><label className="lbl">{L("Nội dung banner (để trống = dùng banner của web mẹ)")}</label><RichTextEditor name="sysAnnounceContent" defaultValue={panel.sysAnnounceContent || ""} minHeight={120} /></div>
      </section>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">{L("Cửa sổ bật lên ở trang chủ (Modal)")}</div>
        <label className="flex items-center justify-between gap-4"><span className="text-sm text-slate-600">{L("Bật cửa sổ thông báo cho khách của panel")}</span><input type="checkbox" name="homeModalEnabled" defaultChecked={panel.homeModalEnabled} className="h-5 w-5 accent-slate-900" /></label>
        <div><label className="lbl">{L("Nội dung")}</label><RichTextEditor name="homeModalContent" defaultValue={panel.homeModalContent || ""} minHeight={120} /></div>
      </section>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">{L("Điều khoản bắt buộc xác nhận")}</div>
        <label className="flex items-center justify-between gap-4"><span className="text-sm text-slate-600">{L("Bật cổng điều khoản cho khách của panel")}</span><input type="checkbox" name="termsEnabled" defaultChecked={panel.termsEnabled} className="h-5 w-5 accent-slate-900" /></label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div><label className="lbl">{L("Tiêu đề")}</label><input name="termsTitle" defaultValue={panel.termsTitle || ""} placeholder={L("Điều khoản sử dụng")} className="inp" /></div>
          <div><label className="lbl">{L("Phiên bản (tăng số để bắt xác nhận lại)")}</label><input name="termsVersion" type="number" min={1} defaultValue={panel.termsVersion || 1} className="inp" /></div>
        </div>
        <div><label className="lbl">{L("Nội dung điều khoản")}</label><textarea name="termsContent" rows={6} defaultValue={panel.termsContent || ""} className="inp" /></div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div><label className="lbl">{L("Dòng chữ cạnh ô tích")}</label><input name="termsCheckboxText" defaultValue={panel.termsCheckboxText || ""} placeholder={L("Tôi đã đọc và đồng ý với điều khoản")} className="inp" /></div>
          <div><label className="lbl">{L("Chữ trên nút xác nhận")}</label><input name="termsButtonText" defaultValue={panel.termsButtonText || ""} placeholder={L("Đồng ý và tiếp tục")} className="inp" /></div>
        </div>
      </section>
      <button className="btn-primary !py-2.5">{L("Lưu thông báo & điều khoản")}</button>
    </form>
  );

  /* ---------------- Google ---------------- */
  const google = (
    <form action={panelSaveConfigAction} className="card space-y-4 p-6">
      <input type="hidden" name="section" value="google" />
      <div className="font-bold text-slate-900">{L("Đăng nhập Google của panel")}</div>
      <p className="text-sm text-slate-400">{L("Khách vào bằng tên miền riêng của panel sẽ đăng nhập Google bằng ứng dụng này; tài khoản mới tự thuộc về panel của bạn.")}</p>
      <div className={infoBox}>{L("Redirect URI cần khai trong Google Cloud Console:")} <b>{`${base}/api/auth/google/callback`}</b></div>
      <div><label className="lbl">Google Client ID</label><input name="googleClientId" defaultValue={panel.googleClientId || ""} className="inp" /></div>
      <div><label className="lbl">Google Client Secret {panel.googleClientSecret && <span className="font-semibold text-emerald-600">{L("— đã lưu")}</span>}</label><input name="googleClientSecret" type="password" autoComplete="off" placeholder={mask(panel.googleClientSecret)} className="inp" /></div>
      <button className="btn-primary !py-2.5">{L("Lưu Google")}</button>
    </form>
  );

  /* ---------------- Khuyến mãi ---------------- */
  let savedTiers: { from: number; percent: number }[] = [];
  try { savedTiers = JSON.parse(panel.depositBonusTiers || "[]"); } catch { savedTiers = []; }
  const khuyenmai = (
    <form action={panelSaveConfigAction} className="card space-y-4 p-6">
      <input type="hidden" name="section" value="promo" />
      <div className="font-bold text-slate-900">{L("Thưởng nạp tiền của panel")}</div>
      <div className={infoBox}>{L("Chỉ khách của panel được hưởng các mốc này — khách của web mẹ có chính sách riêng, hai bên không tính chung. Để trống cả 3 mốc là không thưởng.")}</div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="grid grid-cols-2 gap-4">
          <div><label className="lbl">{L("Mốc")} {i} {L("— nạp từ (VNĐ)")}</label><input name={`tierFrom${i}`} type="number" min={0} defaultValue={savedTiers[i - 1]?.from || ""} className="inp" placeholder="VD: 100000" /></div>
          <div><label className="lbl">{L("Thưởng (%)")}</label><input name={`tierPct${i}`} type="number" min={0} max={100} defaultValue={savedTiers[i - 1]?.percent || ""} className="inp" placeholder="VD: 10" /></div>
        </div>
      ))}
      <div><label className="lbl">{L("Số tiền nạp tối thiểu (VNĐ)")}</label><input name="depositMin" type="number" min={0} defaultValue={panel.depositMin || ""} className="inp" placeholder={L("Để trống = theo mặc định")} /></div>
      <button className="btn-primary !py-2.5">{L("Lưu khuyến mãi")}</button>
    </form>
  );

  /* ---------------- Giới thiệu ---------------- */
  const gioithieu = (
    <form action={panelSaveConfigAction} className="card space-y-4 p-6">
      <input type="hidden" name="section" value="affiliate" />
      <div className="font-bold text-slate-900">{L("Chương trình giới thiệu của panel")}</div>
      <div className={infoBox}>{L("Khách của panel giới thiệu người mới: người giới thiệu nhận % hoa hồng trên tiền MUA của người được giới thiệu (không tính tiền nạp), cộng thẳng vào số dư.")}</div>
      <label className="flex items-center justify-between gap-4"><span className="text-sm text-slate-600">{L("Bật mục Kiếm tiền cho khách của panel")}</span><input type="checkbox" name="moduleAffiliate" defaultChecked={panel.moduleAffiliate} className="h-5 w-5 accent-slate-900" /></label>
      <div><label className="lbl">{L("% hoa hồng giới thiệu")}</label><input name="affiliatePercent" type="number" min={0} max={50} defaultValue={panel.affiliatePercent ?? ""} className="inp" placeholder={L("Để trống = theo tỉ lệ của web mẹ")} /></div>
      <button className="btn-primary !py-2.5">{L("Lưu chương trình giới thiệu")}</button>
    </form>
  );

  /* ---------------- Bảo mật ---------------- */
  const baomat = (
    <>
      <div className="card space-y-4 p-6">
        <div className="font-bold text-slate-900">{L("Bảo mật của panel")}</div>
        <p className="text-sm leading-relaxed text-slate-500">{L("Panel có mục Bảo mật riêng: chặn IP theo phạm vi website của bạn và xem nhật ký hoạt động quản trị của panel. Chính sách mật khẩu, giới hạn đăng nhập sai và CAPTCHA là cấu hình bảo mật chung của toàn hệ thống do web mẹ quản lý.")}</p>
        <a href="/panel-admin/bao-mat" className="btn-primary inline-block !py-2.5">{L("Mở mục Bảo mật của panel")}</a>
      </div>
      <form action={panelSaveConfigAction} className="card mt-6 space-y-4 p-6">
        <input type="hidden" name="section" value="limits" />
        <div className="font-bold text-slate-900">{L("Giới hạn riêng của panel")}</div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div><label className="lbl">{L("Phiên đăng nhập (ngày)")}</label><input name="sessionDays" type="number" min={0} max={90} defaultValue={panel.sessionDays || ""} className="inp" placeholder={L("Theo web mẹ")} /></div>
          <div><label className="lbl">{L("Số lượng mua Premium tối đa / đơn")}</label><input name="premiumMaxQty" type="number" min={0} defaultValue={panel.premiumMaxQty || ""} className="inp" placeholder={L("Theo web mẹ")} /></div>
          <div><label className="lbl">{L("Số link tối đa / lần đặt")}</label><input name="orderMaxLinks" type="number" min={0} defaultValue={panel.orderMaxLinks || ""} className="inp" placeholder={L("Theo web mẹ")} /></div>
        </div>
        <button className="btn-primary !py-2.5">{L("Lưu giới hạn")}</button>
      </form>
    </>
  );

  /* ---------------- Cron Job ---------------- */
  const cron = (
    <div className="card space-y-4 p-6">
      <div className="font-bold text-slate-900">{L("Công việc tự động của panel")}</div>
      <p className="text-sm text-slate-500">{L("Đồng bộ đơn, báo cáo và đơn hẹn giờ của website chạy tự động theo lịch hệ thống.")}</p>
      <a href="/panel-admin/bao-cao" className="btn-ghost btn-sm inline-block">{L("Mở Báo cáo & Thông báo")}</a>
    </div>
  );

  /* ---------------- SMM Tool API ---------------- */
  const toolapi = (
    <form action={panelSaveConfigAction} className="space-y-6">
      <input type="hidden" name="section" value="toolapi" />
      <section className="card p-6 space-y-4">
        <div className="flex items-center gap-2"><div className="font-bold text-slate-900">{L("Tool API Key của panel")}</div><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">v1.0.0</span></div>
        <div className="rounded-xl bg-rose-50 px-4 py-3 text-[13px] leading-relaxed text-rose-700">{L("Giữ key này bí mật như mật khẩu: ai có key sẽ xem và cập nhật được các đơn THỦ CÔNG của khách panel bạn. Key của panel chỉ thấy đơn của panel — không thấy đơn của web mẹ hay panel khác.")}</div>
        <label className="lbl">Tool API Key</label>
        <ToolKeyField initial={panel.toolApiKey || ""} name="tool_api_key" />
        <button className="btn-primary !py-2.5">{L("Lưu Tool API Key")}</button>
      </section>
      <section className="card p-6 space-y-3">
        <div className="font-bold text-slate-900">{L("Thông tin chung")}</div>
        <div className="space-y-1.5 text-sm text-slate-500">
          <div>Base URL: <b className="text-slate-700">{base}/api/tool</b></div>
          <div>{L("Xác thực: truyền key qua tham số")} <b className="text-slate-700">?key=</b>{L(", header")} <b className="text-slate-700">x-tool-key</b> {L("hoặc field")} <b className="text-slate-700">key</b> {L("trong body.")}</div>
          <div>{L("Định dạng JSON, mã hoá UTF-8. Ba endpoint giống web mẹ:")} <b className="text-slate-700">GET /orders</b> {L("(đơn chờ),")} <b className="text-slate-700">GET /orders/{"{id}"}</b> {L("(chi tiết),")} <b className="text-slate-700">POST /update</b> {L("(cập nhật trạng thái: processing, inprogress, completed, partial, canceled, refunded, error).")}</div>
        </div>
      </section>
    </form>
  );

  /* ---------------- AI Kiểm tra ---------------- */
  const ai = (
    <form action={panelSaveConfigAction} className="space-y-6">
      <input type="hidden" name="section" value="aicheck" />
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">{L("AI kiểm tra link đơn của khách panel")}</div>
        <div className={infoBox}>{L("Khi bật, mỗi đơn mới của khách panel được AI của chính panel quét link; link thuộc nhóm cấm sẽ bị gắn cờ ở mục Đơn rủi ro để bạn xem trước khi xử lý. Dùng cấu hình AI riêng của panel — khai key ở mục AI tư vấn.")}</div>
        <label className="flex items-center justify-between gap-4"><span className="text-sm text-slate-600">{L("Bật AI kiểm tra link")}</span><input type="checkbox" name="aiCheckEnabled" defaultChecked={panel.aiCheckEnabled} className="h-5 w-5 accent-slate-900" /></label>
        <div className="flex flex-wrap gap-2.5">
          <button className="btn-primary !py-2.5">{L("Lưu cấu hình AI kiểm tra")}</button>
          <a href="/panel-admin/ai" className="btn-ghost inline-block !py-2.5">{L("Mở mục AI tư vấn (khai key)")}</a>
        </div>
      </section>
      <section className="card p-6 space-y-3">
        <div className="font-bold text-slate-900">{L("9 nhóm nội dung bị cấm")}</div>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {["Mạo danh cơ quan nhà nước", "Nội dung khiêu dâm", "Cờ bạc, cá cược, xổ số", "Ma tuý", "Lừa đảo, phishing", "Bạo lực, khủng bố", "Chống phá Nhà nước", "Buôn bán vũ khí", "Xâm phạm quyền trẻ em"].map((c) => (
            <li key={c} className="flex items-center gap-2 text-sm text-slate-600"><span className="text-emerald-500">{I.check}</span>{L(c)}</li>
          ))}
        </ul>
      </section>
    </form>
  );

  /* ---------------- USDT ---------------- */
  const usdt = (
    <form action={panelSaveConfigAction} className="card space-y-4 p-6">
      <input type="hidden" name="section" value="usdt" />
      <div className="font-bold text-slate-900">{L("Ví USDT của panel")}</div>
      <p className="text-sm text-slate-400">{L("Điền ví của bạn thì khách panel nạp USDT sẽ chuyển về ví này, theo tỉ giá bạn đặt — bạn duyệt ở mục Nạp tiền của khách.")}</p>
      <div><label className="lbl">{L("Địa chỉ ví")}</label><input name="usdtAddress" defaultValue={panel.usdtAddress || ""} className="inp" /></div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="lbl">{L("Mạng")}</label><input name="usdtNetwork" defaultValue={panel.usdtNetwork || ""} placeholder="TRC20" className="inp" /></div>
        <div><label className="lbl">{L("Tỉ giá 1 USDT (đ)")}</label><input name="usdtRate" type="number" min={0} defaultValue={panel.usdtRate || ""} placeholder="25400" className="inp" /></div>
      </div>
      <button className="btn-primary !py-2.5">{L("Lưu ví USDT")}</button>
    </form>
  );

  /* ---------------- Script/HTML ---------------- */
  const codeArea = "w-full rounded-xl bg-slate-900 p-4 font-mono text-[13px] leading-relaxed text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500";
  const scriptTab = (
    <form action={panelSaveConfigAction} className="space-y-6">
      <input type="hidden" name="section" value="script" />
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">{L("Mã chèn vào <head>")}</div>
        <div className={infoBox}>{L("Mã này chỉ chạy trên tên miền riêng của website bạn (mã của web mẹ không chạy ở đây và ngược lại). Hợp với mã thống kê, chat hỗ trợ ngoài, xác minh tên miền…")}</div>
        <textarea name="customHeadHtml" rows={6} defaultValue={panel.customHeadHtml || ""} className={codeArea} placeholder={L("<!-- Dán mã HTML/JS chèn vào <head> -->")} spellCheck={false} />
      </section>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">{L("Mã chèn cuối <body>")}</div>
        <textarea name="customBodyHtml" rows={6} defaultValue={panel.customBodyHtml || ""} className={codeArea} placeholder={L("<!-- Dán mã HTML/JS chèn cuối <body> -->")} spellCheck={false} />
      </section>
      <button className="btn-primary !py-2.5">{L("Lưu Script/HTML")}</button>
    </form>
  );

  /* ---------------- Website con ---------------- */
  const websitecon = (
    <>
      <form action={panelSaveConfigAction} className="card space-y-4 p-6">
        <input type="hidden" name="section" value="panelfee" />
        <div className="font-bold text-slate-900">{L("Phí tạo website con cho khách của panel")}</div>
        <p className="text-sm leading-relaxed text-slate-400">{L("Giống web mẹ: khách của panel cũng tạo được website con của riêng họ ngay tại trang Đăng ký website con. Bạn đặt phí ở đây — khi khách đăng ký thành công, phí được trừ vào số dư của khách và")} <b className="text-slate-600">{L("cộng thẳng vào số dư của bạn")}</b>{L(". Đặt 0₫ là miễn phí.")}</p>
        <div><label className="lbl">{L("Phí website con theo tháng (VNĐ / 30 ngày)")}</label><input name="panelFee" type="number" min={0} defaultValue={panel.panelFee || 0} className="inp" placeholder={L("0 = miễn phí")} /></div>
        <div><label className="lbl">{L("Markup mặc định cho website con mới (%)")}</label><input name="panelDefaultMarkup" type="number" min={0} max={200} defaultValue={panel.panelDefaultMarkup || ""} className="inp" placeholder={L("Để trống = theo web mẹ")} /></div>
        <p className="text-xs text-slate-400">{L("Đang áp dụng: ")}{panel.panelFee > 0 ? M(panel.panelFee) : L("Miễn phí")} {L("cho mỗi website con khách của bạn tạo, tính theo tháng và tự gia hạn trừ số dư của khách.")}</p>
        <button className="btn-primary !py-2.5">{L("Lưu phí tạo website con")}</button>
      </form>
    </>
  );

  return (
    <div>
      <PageHead title={L("Cấu hình")} desc={L("Đầy đủ cấu hình như web mẹ, áp cho riêng website của bạn — chỉ trừ cấu hình nguồn dịch vụ vốn thuộc về web mẹ.")} />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <SettingsTabs tabs={[
        { id: "landing", label: L("Landing Page"), icon: I.home, content: landing },
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
        { id: "script", label: "Script/HTML", icon: I.file, content: scriptTab },
        { id: "websitecon", label: L("Website con"), icon: I.panels, content: websitecon },
      ]} />
    </div>
  );
}
