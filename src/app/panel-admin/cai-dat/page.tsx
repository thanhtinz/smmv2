import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePanelOwnerPage } from "@/lib/panel-access";
import { PageHead, Flash } from "@/components/ui";
import { updatePanelAction } from "@/app/actions/user";
import { panelSaveModulesAction, panelSaveContactWidgetAction, panelDeleteContactWidgetAction, panelToggleContactWidgetAction, panelSeedContactWidgetsAction } from "@/app/actions/panel";
import { ContactWidgetsManager } from "@/components/contact-widgets";
import { listContactWidgets } from "@/lib/contact";
import { Switch } from "@/components/admin-catalog";


export const dynamic = "force-dynamic";

const ACCENTS = [
  { id: "blue", label: "Xanh dương" },
  { id: "violet", label: "Tím" },
  { id: "emerald", label: "Xanh lá" },
  { id: "orange", label: "Cam" },
  { id: "rose", label: "Hồng" },
  { id: "teal", label: "Ngọc" },
];

/** Cài đặt panel — thông tin gian hàng, tên miền, hỗ trợ, API key liên kết web mẹ, trạng thái. */
export default async function PanelSettingsPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const { user, panel } = await requirePanelOwnerPage();
  const linked = panel.apiUserId ? await prisma.user.findUnique({ where: { id: panel.apiUserId }, select: { username: true } }) : null;
  const contactItems = await listContactWidgets(panel.id);
  const panelHasLegacy = !!(panel.supportZalo || panel.supportTelegram || panel.supportFacebook || panel.supportHotline);
  return (
    <div>
      <PageHead title="Cài đặt panel" desc="Thông tin gian hàng, tên miền riêng, liên hệ hỗ trợ và kết nối với web mẹ." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        <form action={updatePanelAction} className="card p-6 lg:col-span-3 space-y-4">
          <input type="hidden" name="back" value="/panel-admin/cai-dat" />
          <div className="font-bold text-slate-900">Thông tin gian hàng</div>
          <div><label className="lbl">Tên panel</label><input className="inp" name="name" required minLength={3} defaultValue={panel.name} /></div>
          <div><label className="lbl">Đường dẫn gian hàng</label><input className="inp bg-slate-50" value={`/cua-hang/${panel.slug}`} readOnly /></div>
          <div><label className="lbl">Câu giới thiệu (tagline)</label><input className="inp" name="tagline" maxLength={255} defaultValue={panel.tagline || ""} placeholder="Câu giới thiệu ngắn hiển thị ở đầu landing của panel" /></div>
          <div><label className="lbl">Màu chủ đạo</label><select className="inp" name="accent" defaultValue={panel.accent}>{ACCENTS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></div>
          <div><label className="lbl">Liên hệ hỗ trợ của panel (hiển thị ở đầu landing)</label><input className="inp" name="support" maxLength={255} defaultValue={panel.support || ""} placeholder="Zalo 0901... hoặc link Telegram" /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="lbl">Zalo hỗ trợ riêng</label><input className="inp" name="supportZalo" maxLength={120} defaultValue={panel.supportZalo || ""} placeholder="Số Zalo hoặc link zalo.me" /></div>
            <div><label className="lbl">Telegram hỗ trợ riêng</label><input className="inp" name="supportTelegram" maxLength={120} defaultValue={panel.supportTelegram || ""} placeholder="@username hoặc link t.me" /></div>
            <div><label className="lbl">Fanpage Facebook riêng</label><input className="inp" name="supportFacebook" maxLength={120} defaultValue={panel.supportFacebook || ""} placeholder="Tên fanpage hoặc link facebook.com" /></div>
            <div><label className="lbl">Hotline riêng</label><input className="inp" name="supportHotline" maxLength={120} defaultValue={panel.supportHotline || ""} placeholder="Số hotline của panel" /></div>
          </div>
          <div><label className="lbl">Thông báo riêng của panel</label><input className="inp" name="announcement" maxLength={500} defaultValue={panel.announcement || ""} placeholder="VD: Khuyến mãi cuối tuần — giảm thêm cho khách VIP của shop" /></div>
          <div><label className="lbl">Tên miền riêng</label><input className="inp" name="domain" defaultValue={panel.domain || ""} placeholder="shop.tenmiencuaban.com" /><p className="text-xs text-slate-400 mt-1.5">Trỏ CNAME của tên miền về máy chủ hệ thống để khách vào thẳng gian hàng bằng tên miền của bạn.</p></div>
          <div>
            <label className="lbl">API key liên kết web mẹ</label>
            <input className="inp font-mono !text-[13px]" name="apiKey" defaultValue={panel.apiKey || ""} placeholder="Để trống = giữ key hiện tại" autoComplete="off" />
            <p className="text-xs text-slate-400 mt-1.5">Đang liên kết bằng key của tài khoản <b>{linked ? `${linked.username} (#${panel.apiUserId})` : "—"}</b>. Hệ thống kiểm tra key ngay khi lưu.</p>
          </div>
          <div><label className="lbl">Trạng thái bán</label><select className="inp" name="status" defaultValue={panel.status}><option value="ACTIVE">Đang mở bán</option><option value="SUSPENDED">Tạm ngưng (khách mua theo giá gốc, không hoa hồng)</option></select></div>
          <button className="btn-primary w-full !py-2.5" type="submit">Lưu cài đặt</button>
        </form>
        <div className="lg:col-span-2 space-y-6">
          <form action={panelSaveModulesAction} className="card p-6">
            <div className="font-bold text-slate-900">Mô-đun & mảng đang bán</div>
            <p className="mt-1 text-sm text-slate-400">Bán mảng nào thì bật mảng đó — tắt đi thì khách không thấy và không dùng được mô-đun đó tại gian hàng.</p>
            <div className="mt-4 space-y-1">
              <Switch name="sellSmm" label="Bán dịch vụ SMM" defaultChecked={panel.sellSmm} />
              <Switch name="sellPremium" label="Bán Premium" defaultChecked={panel.sellPremium} />
              <Switch name="moduleAffiliate" label="Kiếm tiền (hoa hồng giới thiệu cho khách)" defaultChecked={panel.moduleAffiliate} />
              <Switch name="moduleRegister" label="Cho phép đăng ký mới tại gian hàng" defaultChecked={panel.moduleRegister} />
              <Switch name="moduleBulk" label="Đặt hàng loạt cho khách của panel" defaultChecked={panel.moduleBulk} />
              <Switch name="moduleSubscriptions" label="Đăng ký định kỳ (hẹn giờ / lặp lại)" defaultChecked={panel.moduleSubscriptions} />
              <Switch name="moduleCampaigns" label="Chiến dịch cho khách của panel" defaultChecked={panel.moduleCampaigns} />
              <Switch name="modulePromo" label="Mã giảm giá cho khách của panel" defaultChecked={panel.modulePromo} />
              <Switch name="moduleTickets" label="Hỗ trợ / Ticket cho khách của panel" defaultChecked={panel.moduleTickets} />
              <Switch name="moduleApi" label="API đại lý cho khách của panel" defaultChecked={panel.moduleApi} />
              <Switch name="moduleBlog" label="Bài viết trên gian hàng" defaultChecked={panel.moduleBlog} />
            </div>
            <p className="mt-2 text-xs text-slate-400">Lưu ý: web mẹ tắt mô-đun nào ở trang Mô-đun hệ thống thì mô-đun đó tắt cho mọi gian hàng, kể cả khi ở đây đang bật.</p>
            <div className="mt-4">
              <label className="lbl">% hoa hồng giới thiệu riêng của panel (để trống = theo web mẹ)</label>
              <input name="affiliatePercent" type="number" min={0} max={100} defaultValue={panel.affiliatePercent ?? ""} placeholder="VD: 8" className="inp" />
            </div>
            <button className="btn-primary w-full mt-4 !py-2.5">Lưu mô-đun</button>
          </form>
          <div className="card p-6">
            <div className="font-bold text-slate-900">Cấu hình lần đầu</div>
            <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">Muốn chỉnh lại toàn bộ theo từng bước (thông tin → giá & cấp bậc → API key → tên miền & hỗ trợ), mở lại trang cấu hình lần đầu.</p>
            <Link href="/dashboard/panel-cua-toi/thiet-lap" className="btn-ghost w-full mt-4">Mở trang cấu hình lần đầu</Link>
          </div>
        </div>
      </div>
      <div className="card mt-6 p-6">
        <div className="font-bold text-slate-900">Widget Liên hệ</div>
        <p className="mt-1 text-sm text-slate-400">Các kênh liên hệ hiển thị trên gian hàng của bạn. Để trống thì khách thấy widget của web chính.</p>
        <div className="mt-4 max-w-3xl">
          <ContactWidgetsManager
            items={contactItems}
            saveAction={panelSaveContactWidgetAction}
            deleteAction={panelDeleteContactWidgetAction}
            toggleAction={panelToggleContactWidgetAction}
            seedAction={panelSeedContactWidgetsAction}
            hasLegacy={panelHasLegacy}
          />
        </div>
      </div>
    </div>
  );
}
