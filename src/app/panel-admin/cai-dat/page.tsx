import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PageHead, Flash } from "@/components/ui";
import { updatePanelAction } from "@/app/actions/user";

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
  const user = (await getCurrentUser())!;
  const panel = (await prisma.childPanel.findUnique({ where: { ownerId: user.id } }))!;
  const linked = panel.apiUserId ? await prisma.user.findUnique({ where: { id: panel.apiUserId }, select: { username: true } }) : null;
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
          <div><label className="lbl">Liên hệ hỗ trợ của panel</label><input className="inp" name="support" maxLength={255} defaultValue={panel.support || ""} placeholder="Zalo 0901... hoặc link Telegram" /></div>
          <div><label className="lbl">Tên miền riêng</label><input className="inp" name="domain" defaultValue={panel.domain || ""} placeholder="shop.tenmiencuaban.com" /><p className="text-xs text-slate-400 mt-1.5">Trỏ CNAME của tên miền về máy chủ hệ thống để khách vào thẳng gian hàng bằng tên miền của bạn.</p></div>
          <div>
            <label className="lbl">API key liên kết web mẹ</label>
            <input className="inp font-mono !text-[13px]" name="apiKey" defaultValue={panel.apiKey || ""} placeholder="Để trống = giữ key hiện tại" autoComplete="off" />
            <p className="text-xs text-slate-400 mt-1.5">Panel đang liên kết bằng key của tài khoản <b>{linked ? `${linked.username} (#${panel.apiUserId})` : "—"}</b>. Đây là cách panel con kết nối về web mẹ — đúng mô hình các panel lớn: tạo web con xong vào Cài đặt nhập API token. Hệ thống kiểm tra key ngay khi lưu.</p>
          </div>
          <div><label className="lbl">Trạng thái bán</label><select className="inp" name="status" defaultValue={panel.status}><option value="ACTIVE">Đang mở bán</option><option value="SUSPENDED">Tạm ngưng (khách mua theo giá gốc, không hoa hồng)</option></select></div>
          <button className="btn-primary w-full !py-2.5" type="submit">Lưu cài đặt</button>
        </form>
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-6">
            <div className="font-bold text-slate-900">Cấu hình lần đầu</div>
            <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">Muốn chỉnh lại toàn bộ theo từng bước (thông tin → giá & cấp bậc → API key → tên miền & hỗ trợ), mở lại trang cấu hình lần đầu.</p>
            <Link href="/dashboard/panel-cua-toi/thiet-lap" className="btn-ghost w-full mt-4">Mở trang cấu hình lần đầu</Link>
          </div>
          <div className="card p-6">
            <div className="font-bold text-slate-900">Panel con hoạt động thế nào?</div>
            <ul className="text-sm text-slate-500 mt-2 space-y-2 leading-relaxed list-disc pl-5">
              <li>Dịch vụ và nguồn hàng do <b>web mẹ</b> cung cấp — panel không tự đấu nguồn riêng.</li>
              <li>Bạn chỉ quyết định <b>giá bán</b>: phụ phí, giảm theo bậc và giá riêng từng dịch vụ.</li>
              <li>Chênh lệch giữa giá khách trả và giá web mẹ là <b>hoa hồng</b> của bạn, cộng vào ví ngay khi đơn được tạo.</li>
              <li>Khách của panel dùng chung ví, đơn và API key trên toàn hệ thống.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
