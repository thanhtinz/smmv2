import { requireAdminPage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { PageHead, Flash, Empty } from "@/components/ui";
import { saveIpBanAction, deleteIpBanAction } from "@/app/actions/admin-features";
import { dt } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminSecurity({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  await requireAdminPage();
  const [bans, s, activity] = await Promise.all([
    prisma.ipBan.findMany({ orderBy: { id: "desc" }, take: 200 }),
    getSettings(),
    prisma.apiLog.findMany({ where: { kind: { in: ["bulk_price", "email_marketing", "cleanup", "price_change"] } }, orderBy: { id: "desc" }, take: 15 }),
  ]);
  const KIND_LABEL: Record<string, string> = { bulk_price: "Chỉnh giá hàng loạt", email_marketing: "Gửi email marketing", cleanup: "Dọn dẹp hệ thống", price_change: "Nguồn đổi giá vốn" };
  return (
    <div>
      <PageHead title="Bảo mật nâng cao" desc="Chặn IP lạm dụng và chính sách mật khẩu. IP bị chặn sẽ không đăng nhập / đăng ký được." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <form action={saveIpBanAction} className="card space-y-4 p-5">
            <div className="font-bold text-slate-900">Chặn một IP</div>
            <div><label className="lbl">Địa chỉ IP</label><input className="inp" name="ip" required placeholder="VD: 203.0.113.10" /></div>
            <div><label className="lbl">Lý do</label><textarea className="inp" name="reason" rows={2} placeholder="Spam đăng ký, dò mật khẩu..." /></div>
            <button className="btn-primary">Thêm vào danh sách chặn</button>
          </form>
        </div>
        <div className="card overflow-x-auto">
          <div className="border-b border-slate-100 px-5 py-4 font-bold text-slate-900">Danh sách IP bị chặn ({bans.length})</div>
          {bans.length === 0 ? <Empty text="Chưa chặn IP nào" /> : (
            <table className="w-full min-w-[480px]">
              <thead><tr><th className="th">IP</th><th className="th">Lý do</th><th className="th">Thời gian chặn</th><th className="th"></th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {bans.map((b) => (
                  <tr key={b.id}>
                    <td className="td font-mono text-sm font-semibold">{b.ip}</td>
                    <td className="td text-slate-500">{b.reason || "—"}</td>
                    <td className="td whitespace-nowrap text-slate-500">{dt(b.createdAt)}</td>
                    <td className="td"><form action={deleteIpBanAction}><input type="hidden" name="id" value={b.id} /><button className="btn-ghost btn-sm !text-rose-600">Bỏ chặn</button></form></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <div className="card mt-6 p-5">
        <div className="font-bold text-slate-900">Chính sách mật khẩu hiện tại</div>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          Độ dài tối thiểu khi đăng ký / đổi mật khẩu: <b className="text-slate-800">{s.password_min_length} ký tự</b>.
          Sửa trong Admin → Cấu hình → tab Bảo mật. Đăng nhập sai nhiều lần liên tiếp sẽ bị khoá tạm theo cơ chế sẵn có của hệ thống.
        </p>
      </div>
      <div className="card mt-6 overflow-x-auto">
        <div className="border-b border-slate-100 px-5 py-4 font-bold text-slate-900">Nhật ký hoạt động hệ thống</div>
        {activity.length === 0 ? <Empty text="Chưa có hoạt động nào được ghi" /> : (
          <table className="w-full min-w-[560px]">
            <thead><tr><th className="th">Loại</th><th className="th">Chi tiết</th><th className="th">Thời gian</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {activity.map((a) => (
                <tr key={a.id}>
                  <td className="td font-medium">{KIND_LABEL[a.kind] || a.kind}</td>
                  <td className="td"><span className="text-slate-500">{a.detail || a.ref || "—"}</span></td>
                  <td className="td whitespace-nowrap text-slate-500">{dt(a.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
