import { requireAdminPage } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PageHead, Flash } from "@/components/ui";
import { sendMarketingEmailAction, testSmtpAction } from "@/app/actions/admin-features";

export const dynamic = "force-dynamic";

export default async function AdminEmailMarketing({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  await requireAdminPage();
  const s = await getSettings();
  const configured = !!(s.smtp_host && s.smtp_user && s.smtp_from);
  return (
    <div>
      <PageHead title="Email Marketing" desc="Gửi email thông báo / khuyến mãi tới nhóm người dùng. Email gửi theo lô, ẩn danh sách người nhận (BCC)." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      {!configured && (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          SMTP chưa được cấu hình — vào <b>Cấu hình → tab Email</b> điền máy chủ SMTP trước thì mới gửi được.
        </div>
      )}
      <form action={testSmtpAction} className="card mb-6 flex flex-wrap items-end gap-3 p-5">
        <div className="min-w-[240px] flex-1">
          <label className="lbl">Gửi email thử kiểm tra SMTP</label>
          <input className="inp" name="to" type="email" placeholder="Địa chỉ email của bạn" required />
        </div>
        <button className="btn-ghost">Gửi thử</button>
      </form>
      <form action={sendMarketingEmailAction} className="card space-y-4 p-6">
        <div>
          <label className="lbl">Người nhận</label>
          <select className="inp" name="segment" defaultValue="all">
            <option value="all">Tất cả người dùng đang hoạt động</option>
            <option value="deposited">Người dùng đã từng nạp tiền</option>
            <option value="new">Người dùng mới (đăng ký 30 ngày gần đây)</option>
          </select>
        </div>
        <div><label className="lbl">Tiêu đề email</label><input className="inp" name="subject" required placeholder="VD: Khuyến mãi tháng này — giảm 10% mọi dịch vụ" /></div>
        <div><label className="lbl">Nội dung</label><textarea className="inp" name="body" rows={12} required placeholder={"Xin chào bạn,\n\nNội dung email...\n\nMỗi dòng trống là một đoạn mới."} /></div>
        <button className="btn-primary" disabled={!configured}>Gửi email</button>
      </form>
    </div>
  );
}
