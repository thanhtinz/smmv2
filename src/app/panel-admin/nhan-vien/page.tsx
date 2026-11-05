import { prisma } from "@/lib/db";
import { requirePanelOwnerPage } from "@/lib/panel-access";
import { PageHead, Flash, I } from "@/components/ui";
import { dt } from "@/lib/format";
import { panelAddStaffAction, panelRemoveStaffAction } from "@/app/actions/panel";

export const dynamic = "force-dynamic";

const CAN_DO = ["Xem Tổng quan + Phân tích của panel", "Xử lý đơn hàng (bắt đầu / hoàn thành / huỷ đơn thủ công)", "Trả lời và đóng/mở ticket của khách panel", "Xem danh sách + chi tiết khách hàng", "Nhận chuông thông báo realtime của panel"];
const CANNOT_DO = ["Chỉnh giá, thêm dịch vụ, mã giảm giá", "Duyệt nạp tiền, cộng tiền tay cho khách", "Xem hoa hồng, đơn rủi ro", "Cấu hình panel (ngân hàng, SMTP, Telegram, Google...)", "Báo cáo đa kênh, email marketing, thông báo khách, bài viết, AI", "Thêm/gỡ nhân viên khác"];

/** Nhân viên & Phân quyền — chủ panel thêm tài khoản nhân viên vào Panel Admin
 *  với quyền giới hạn (đúng mô hình 2 tầng như web mẹ: chủ = toàn quyền,
 *  nhân viên = xử lý đơn + ticket + xem danh sách). */
export default async function PanelStaffPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const { panel } = await requirePanelOwnerPage();
  const staff = await prisma.panelStaff.findMany({
    where: { panelId: panel.id },
    include: { user: { select: { id: true, username: true, email: true, panelId: true, createdAt: true } } },
    orderBy: { id: "asc" },
  });
  return (
    <div>
      <PageHead title="Nhân viên & Phân quyền" desc="Thêm tài khoản nhân viên để họ phụ xử lý đơn và ticket trong Panel Admin — quyền của nhân viên bị giới hạn sẵn, không đụng được giá, tiền và cấu hình." />
      <Flash msg={searchParams.msg} err={searchParams.err} />

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white">{I.users}</span>
            <span className="font-bold text-slate-900">Nhân viên của panel</span>
            <span className="ml-auto rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-bold text-violet-700">{staff.length} người</span>
          </div>
          <div className="divide-y divide-slate-50">
            <div className="flex items-center gap-3 px-5 py-3.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-violet-600 text-xs font-bold text-white">{panel.name.charAt(0).toUpperCase()}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-slate-800">Chủ panel (bạn)</div>
                <div className="text-xs text-slate-400">Toàn quyền trong panel này</div>
              </div>
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">CHỦ PANEL</span>
            </div>
            {staff.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-5 py-3.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">{s.user.username.charAt(0).toUpperCase()}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-slate-800">{s.user.username}</div>
                  <div className="truncate text-xs text-slate-400">{s.user.email} · thêm {dt(s.createdAt)}{s.user.panelId === panel.id ? " · là khách của panel" : ""}</div>
                </div>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">NHÂN VIÊN</span>
                <form action={panelRemoveStaffAction}>
                  <input type="hidden" name="id" value={s.id} />
                  <button className="btn-ghost btn-sm !border-rose-200 !text-rose-600 hover:!bg-rose-50">Gỡ quyền</button>
                </form>
              </div>
            ))}
            {staff.length === 0 && <p className="px-5 py-6 text-sm text-slate-400">Chưa có nhân viên nào — thêm bằng form bên cạnh.</p>}
          </div>
        </div>

        <div className="space-y-6">
          <form action={panelAddStaffAction} className="card space-y-4 p-6">
            <div className="font-bold text-slate-900">Thêm nhân viên</div>
            <div>
              <label className="lbl">Tên đăng nhập hoặc email của nhân viên</label>
              <input name="q" className="inp" placeholder="VD: nhanvien1 hoặc nv@domain.vn" />
            </div>
            <p className="text-xs leading-relaxed text-slate-400">Người được thêm phải đã có tài khoản trên hệ thống. Sau khi thêm, họ đăng nhập như thường và vào mục <b>Panel Admin</b> — hệ thống tự nhận diện quyền Nhân viên của panel này.</p>
            <button className="btn-primary w-full !py-2.5">Thêm nhân viên</button>
          </form>

          <div className="card p-6">
            <div className="mb-3 font-bold text-slate-900">Nhân viên được làm gì?</div>
            <div className="space-y-1.5">
              {CAN_DO.map((t) => (
                <p key={t} className="flex gap-2 text-sm text-slate-600"><span className="mt-0.5 shrink-0 text-emerald-500">{I.check}</span>{t}</p>
              ))}
            </div>
            <div className="mb-3 mt-5 font-bold text-slate-900">Chỉ chủ panel mới làm được</div>
            <div className="space-y-1.5">
              {CANNOT_DO.map((t) => (
                <p key={t} className="flex gap-2 text-sm text-slate-600">
                  <span className="mt-0.5 shrink-0 text-rose-500">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                  </span>{t}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
