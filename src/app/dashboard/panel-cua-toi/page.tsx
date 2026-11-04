import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PageHead, Flash, Badge } from "@/components/ui";
import { vnd, num, dt } from "@/lib/format";
import { updatePanelAction, setPanelMemberLevelAction, setPanelServicePricesAction, deletePanelServicePriceAction } from "@/app/actions/user";
import { PanelPriceEditor } from "@/components/client";

export const dynamic = "force-dynamic";

const ACCENTS = [
  { id: "blue", label: "Xanh dương" },
  { id: "violet", label: "Tím" },
  { id: "emerald", label: "Xanh lá" },
  { id: "orange", label: "Cam" },
  { id: "rose", label: "Hồng" },
  { id: "teal", label: "Ngọc" },
];

export default async function MyPanelPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const user = (await getCurrentUser())!;
  const panel = await prisma.childPanel.findUnique({ where: { ownerId: user.id } });

  // Chưa có panel -> đưa thẳng tới trang cấu hình lần đầu (wizard)
  if (!panel) redirect("/dashboard/panel-cua-toi/thiet-lap");

  const [memberCount, orderAgg, commissionAgg, members, orders, priceOverrides, allServices] = await Promise.all([
    prisma.user.count({ where: { panelId: panel.id } }),
    prisma.smmOrder.aggregate({ where: { panelId: panel.id }, _count: true, _sum: { charge: true } }),
    prisma.transaction.aggregate({ where: { userId: user.id, type: "PANEL_COMMISSION", amount: { gt: 0 } }, _sum: { amount: true } }),
    prisma.user.findMany({ where: { panelId: panel.id }, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, username: true, createdAt: true, balance: true, level: true } }),
    prisma.smmOrder.findMany({ where: { panelId: panel.id }, orderBy: { createdAt: "desc" }, take: 8, include: { user: { select: { username: true } }, service: { select: { name: true } } } }),
    prisma.panelServicePrice.findMany({ where: { panelId: panel.id }, orderBy: { id: "asc" } }),
    prisma.smmService.findMany({ where: { active: true }, orderBy: { id: "asc" }, select: { id: true, name: true, rate: true } }),
  ]);

  return (
    <div>
      <PageHead title="Panel con của tôi" desc="Quản lý gian hàng riêng, khách hàng và hoa hồng của bạn.">
        <Link href={`/cua-hang/${panel.slug}`} className="btn-primary btn-sm !px-4 !py-2">Xem gian hàng</Link>
      </PageHead>
      <Flash msg={searchParams.msg} err={searchParams.err} />
      {!panel.setupDone && (
        <div className="card px-5 py-4 mb-6 flex flex-wrap items-center gap-3 border !border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-800 flex-1 min-w-[240px]">Panel của bạn chưa qua <b>cấu hình lần đầu</b> — hoàn tất để đặt giá theo cấp bậc, tên miền riêng và liên hệ hỗ trợ cho gian hàng.</p>
          <Link href="/dashboard/panel-cua-toi/thiet-lap" className="btn-primary btn-sm !px-4 !py-2 shrink-0">Cấu hình ngay</Link>
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          ["Trạng thái", panel.status === "ACTIVE" ? "Đang mở bán" : "Đã tạm ngưng"],
          ["Khách của panel", num(memberCount)],
          ["Đơn qua panel", num(orderAgg._count)],
          ["Hoa hồng đã nhận", vnd(commissionAgg._sum.amount || 0)],
        ].map(([k, v]) => (
          <div key={k} className="card p-5"><div className="text-xs text-slate-400 font-semibold uppercase tracking-wide">{k}</div><div className="mt-1.5 text-xl font-extrabold text-slate-900">{v}</div></div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        <form action={updatePanelAction} className="card p-6 lg:col-span-2 space-y-4">
          <div className="font-bold text-slate-900">Cài đặt panel</div>
          <div><label className="lbl">Tên panel</label><input className="inp" name="name" required minLength={3} defaultValue={panel.name} /></div>
          <div><label className="lbl">Đường dẫn</label><input className="inp bg-slate-50" value={`/cua-hang/${panel.slug}`} readOnly /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="lbl">Phụ phí (%)</label><input className="inp" name="markup" type="number" min={0} max={200} defaultValue={panel.markup} /></div>
            <div><label className="lbl">Màu chủ đạo</label><select className="inp" name="accent" defaultValue={panel.accent}>{ACCENTS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></div>
          </div>
          <div>
            <label className="lbl">Giảm giá theo cấp bậc khách (%)</label>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="lbl !mb-1">Thành viên</label><input className="inp" name="discountMember" type="number" min={0} max={90} defaultValue={panel.discountMember} /></div>
              <div><label className="lbl !mb-1">Đại lý</label><input className="inp" name="discountReseller" type="number" min={0} max={90} defaultValue={panel.discountReseller} /></div>
              <div><label className="lbl !mb-1">Tổng đại lý</label><input className="inp" name="discountAgency" type="number" min={0} max={90} defaultValue={panel.discountAgency} /></div>
              <div><label className="lbl !mb-1">VIP</label><input className="inp" name="discountVip" type="number" min={0} max={90} defaultValue={panel.discountVip} /></div>
            </div>
          </div>
          <div><label className="lbl">Liên hệ hỗ trợ của panel</label><input className="inp" name="support" maxLength={255} defaultValue={panel.support || ""} placeholder="Zalo 0901... hoặc link Telegram" /></div>
          <div>
            <label className="lbl">API key liên kết web mẹ</label>
            <input className="inp font-mono !text-[13px]" name="apiKey" defaultValue={panel.apiKey || ""} placeholder="Để trống = giữ key hiện tại" autoComplete="off" />
            <p className="text-xs text-slate-400 mt-1.5">Panel đang liên kết bằng key của tài khoản <b>{panel.apiUserId ? `#${panel.apiUserId}` : "—"}</b>. Nhập key khác để đổi tài khoản liên kết — hệ thống kiểm tra ngay khi lưu. Muốn sửa chi tiết (giá theo bậc, tên miền...) theo từng bước, dùng trang Cấu hình lần đầu.</p>
          </div>
          <div><label className="lbl">Câu giới thiệu</label><input className="inp" name="tagline" maxLength={255} defaultValue={panel.tagline || ""} /></div>
          <div><label className="lbl">Tên miền riêng</label><input className="inp" name="domain" defaultValue={panel.domain || ""} placeholder="shop.tenmiencuaban.com" /><p className="text-xs text-slate-400 mt-1.5">Trỏ CNAME về máy chủ hệ thống để dùng tên miền này.</p></div>
          <div><label className="lbl">Trạng thái</label><select className="inp" name="status" defaultValue={panel.status}><option value="ACTIVE">Đang mở bán</option><option value="SUSPENDED">Tạm ngưng (khách mua theo giá gốc, không hoa hồng)</option></select></div>
          <button className="btn-primary w-full !py-2.5" type="submit">Lưu cài đặt</button>
        </form>
        <div className="lg:col-span-3 space-y-6">
          <div className="card p-6">
            <div className="font-bold text-slate-900 mb-4">Khách mới nhất của panel</div>
            {members.length === 0 ? <p className="text-sm text-slate-400">Chưa có khách nào. Chia sẻ link gian hàng của bạn để bắt đầu có hoa hồng.</p> : (
              <div className="divide-y divide-slate-100">{members.map((m) => (
                <div key={m.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-slate-800">{m.username}</span>
                  <form action={setPanelMemberLevelAction} className="flex items-center gap-2">
                    <input type="hidden" name="memberId" value={m.id} />
                    <select name="level" defaultValue={m.level} className="inp !w-auto !py-1.5 !px-2.5 text-xs font-semibold">
                      <option value="MEMBER">Thành viên</option>
                      <option value="RESELLER">Đại lý</option>
                      <option value="AGENCY">Tổng đại lý</option>
                      <option value="VIP">VIP</option>
                    </select>
                    <button className="btn-ghost btn-sm !py-1.5" type="submit">Đặt bậc</button>
                  </form>
                </div>
              ))}</div>
            )}
          </div>
          <div className="card p-6">
            <div className="font-bold text-slate-900 mb-4">Đơn mới nhất qua panel</div>
            {orders.length === 0 ? <p className="text-sm text-slate-400">Chưa có đơn nào qua panel.</p> : (
              <div className="divide-y divide-slate-100">{orders.map((o) => (
                <div key={o.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0"><span className="font-mono font-semibold text-slate-700">{o.code}</span> <span className="text-slate-400">· {o.user.username}</span><div className="text-slate-500 truncate">{o.service.name}</div></div>
                  <div className="text-right shrink-0"><div className="font-semibold">{vnd(o.charge)}</div><div className="text-xs text-emerald-600 font-semibold">+{vnd(o.commission)} hoa hồng</div></div>
                </div>
              ))}</div>
            )}
          </div>
        </div>
      </div>
      <div className="card p-6 mt-6">
        <div className="font-bold text-slate-900">Giá riêng từng dịch vụ theo cấp bậc</div>
        <p className="text-sm text-slate-500 mt-1 mb-4">Đặt giá cố định cho từng dịch vụ ứng với từng bậc khách — giống bảng giá nhiều cột cấp bậc của các panel lớn. Dịch vụ nào chưa đặt giá riêng sẽ dùng giá panel chuẩn (markup + % giảm theo bậc ở cột cài đặt).</p>
        <PanelPriceEditor
          services={allServices.map((s) => ({ id: s.id, name: s.name, panelRate: Math.round(s.rate * (1 + panel.markup / 100)) }))}
          overrides={priceOverrides}
          action={setPanelServicePricesAction}
          deleteAction={deletePanelServicePriceAction}
        />
      </div>
    </div>
  );
}
