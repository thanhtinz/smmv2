import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PageHead, Flash, Badge } from "@/components/ui";
import { createPanelAction } from "@/app/actions/user";

export const dynamic = "force-dynamic";

/** Trang đăng ký panel con (ở web mẹ): chưa có panel -> form đăng ký gọn;
 *  đã có panel -> thẻ thông tin panel + lối vào gian hàng / quản trị trên site con.
 *  Quản trị panel KHÔNG nằm ở web mẹ: chủ panel vào /admin trên tên miền của chính panel. */
export default async function PanelRegisterPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const user = (await getCurrentUser())!;
  const settings = await getSettings();
  const panel = await prisma.childPanel.findUnique({ where: { ownerId: user.id } });
  const [memberCount, orderCount] = panel
    ? await Promise.all([
        prisma.user.count({ where: { panelId: panel.id } }),
        prisma.smmOrder.count({ where: { panelId: panel.id } }),
      ])
    : [0, 0];
  const perks = [
    "Gian hàng riêng trên tên miền của bạn, giao diện như web chính",
    "Bán lại toàn bộ dịch vụ SMM + Premium, tự set giá bán và % hoa hồng",
    "Khách, đơn hàng, tiền nạp của panel tách riêng hoàn toàn với web chính",
    "Quản trị ngay trên site con của bạn (đường /admin), không qua web chính",
  ];
  return (
    <div>
      <PageHead title="Đăng ký panel con" />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      {settings.module_panels === "0" ? (
        <div className="card p-8 text-center">
          <div className="text-lg font-bold text-slate-900">Tính năng mở panel con đang tạm đóng</div>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">Hệ thống đang tạm ngưng cho đăng ký panel con mới. Vui lòng quay lại sau.</p>
        </div>
      ) : panel ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5 items-start">
          <div className="card p-6 lg:col-span-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-lg font-extrabold text-slate-900">{panel.name}</div>
              <Badge cls={panel.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}>{panel.status === "ACTIVE" ? "Đang hoạt động" : panel.status}</Badge>
            </div>
            <div className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between gap-4"><span className="text-slate-500">Gian hàng</span><Link href={`/cua-hang/${panel.slug}`} className="font-semibold text-brand-700 hover:underline">/cua-hang/{panel.slug}</Link></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Tên miền riêng</span><span className="font-medium text-slate-800">{panel.domain || "Chưa gắn"}</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Phụ phí (hoa hồng)</span><span className="font-medium text-slate-800">{panel.markup}%</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Khách hàng của panel</span><span className="font-medium text-slate-800">{memberCount}</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Đơn qua panel</span><span className="font-medium text-slate-800">{orderCount}</span></div>
            </div>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <Link href={`/cua-hang/${panel.slug}`} className="btn-primary btn-sm">Xem gian hàng</Link>
              {panel.domain ? (
                <a href={`https://${panel.domain}/admin`} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">Vào quản trị trên site con</a>
              ) : null}
              <Link href="/dashboard/panel-cua-toi/thiet-lap" className="btn-ghost btn-sm">Cấu hình panel</Link>
            </div>
            {!panel.domain && <p className="mt-3 text-xs leading-relaxed text-slate-400">Gắn tên miền riêng trong mục Cấu hình panel để khách vào gian hàng và quản trị bằng /admin ngay trên domain của bạn.</p>}
          </div>
          <div className="card p-6 lg:col-span-2">
            <div className="mb-3 font-bold text-slate-900">Quyền lợi panel con</div>
            <ul className="space-y-2.5">
              {perks.map((p) => (
                <li key={p} className="flex items-start gap-2.5 text-sm leading-relaxed text-slate-600">
                  <span className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md bg-emerald-500"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5 items-start">
          <form action={createPanelAction} className="card p-6 lg:col-span-3 space-y-4">
            <div>
              <label className="lbl">Tên gian hàng</label>
              <input className="inp" name="name" required minLength={3} placeholder="Vd: Shop Tăng Tương Tác ABC" />
            </div>
            <div>
              <label className="lbl">Đường dẫn gian hàng</label>
              <div className="flex items-stretch overflow-hidden rounded-xl border border-slate-200 focus-within:border-brand-400">
                <span className="flex items-center bg-slate-50 px-3 text-sm text-slate-400">/cua-hang/</span>
                <input className="min-w-0 flex-1 px-3 py-2.5 text-[15px] outline-none" name="slug" required minLength={3} maxLength={40} placeholder="shop-abc" />
              </div>
              <p className="mt-1.5 text-xs text-slate-400">Chữ thường, số và dấu gạch ngang. Sau này gắn thêm tên miền riêng của bạn được.</p>
            </div>
            <div>
              <label className="lbl">Tên miền riêng (tuỳ chọn)</label>
              <input className="inp" name="domain" placeholder="panelcuaban.com" />
            </div>
            <div>
              <label className="lbl">Phụ phí bán lại (%)</label>
              <input className="inp" name="markup" type="number" min={0} max={200} defaultValue={20} />
              <p className="mt-1.5 text-xs text-slate-400">Giá bán tại gian hàng = giá web chính + phụ phí này. Chỉnh lại sau tuỳ ý.</p>
            </div>
            <input type="hidden" name="accent" value="blue" />
            <input type="hidden" name="discountMember" value="0" />
            <input type="hidden" name="discountReseller" value="5" />
            <input type="hidden" name="discountAgency" value="10" />
            <input type="hidden" name="discountVip" value="15" />
            <button type="submit" className="btn-primary w-full !py-3">Tạo panel con</button>
            <p className="text-xs leading-relaxed text-slate-400">Miễn phí, mỗi tài khoản tạo tối đa 1 panel. Sau khi tạo, bạn vào quản trị tại đường /admin trên tên miền của panel để thiết lập giá, ngân hàng và các cấu hình còn lại.</p>
          </form>
          <div className="card p-6 lg:col-span-2">
            <div className="mb-3 font-bold text-slate-900">Quyền lợi panel con</div>
            <ul className="space-y-2.5">
              {perks.map((p) => (
                <li key={p} className="flex items-start gap-2.5 text-sm leading-relaxed text-slate-600">
                  <span className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md bg-emerald-500"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
