import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PageHead, Flash, Badge } from "@/components/ui";
import { vnd, num, dt } from "@/lib/format";
import { createPanelAction, updatePanelAction } from "@/app/actions/user";

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

  if (!panel) {
    return (
      <div>
        <PageHead title="Panel con của tôi" desc="Mở gian hàng riêng với tên, màu và giá của bạn — khách mua qua panel, bạn hưởng hoa hồng từ mỗi đơn." />
        <Flash msg={searchParams.msg} err={searchParams.err} />
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
          <form action={createPanelAction} className="card p-6 lg:col-span-3 space-y-4">
            <div><label className="lbl">Tên panel / gian hàng</label><input className="inp" name="name" required minLength={3} placeholder="Vd: Tăng Tương Tác Pro" /></div>
            <div>
              <label className="lbl">Đường dẫn (slug)</label>
              <div className="flex items-center gap-2"><span className="text-sm text-slate-400 whitespace-nowrap">/cua-hang/</span><input className="inp" name="slug" required placeholder="tang-tuong-tac-pro" /></div>
              <p className="text-xs text-slate-400 mt-1.5">Chỉ chữ thường, số và dấu gạch ngang. Không đổi được sau khi tạo.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="lbl">Phụ phí của panel (%)</label><input className="inp" name="markup" type="number" min={0} max={200} defaultValue={20} /><p className="text-xs text-slate-400 mt-1.5">Cộng trên giá gốc — phần này là hoa hồng của bạn.</p></div>
              <div><label className="lbl">Màu chủ đạo</label><select className="inp" name="accent">{ACCENTS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></div>
            </div>
            <div><label className="lbl">Câu giới thiệu (tuỳ chọn)</label><input className="inp" name="tagline" maxLength={255} placeholder="Dịch vụ nhanh — bảo hành rõ ràng" /></div>
            <div><label className="lbl">Tên miền riêng (tuỳ chọn)</label><input className="inp" name="domain" placeholder="shop.tenmiencuaban.com" /><p className="text-xs text-slate-400 mt-1.5">Trỏ bản ghi CNAME của tên miền về máy chủ của hệ thống, panel sẽ chạy ngay trên tên miền của bạn.</p></div>
            <button className="btn-primary w-full !py-3" type="submit">Tạo panel ngay</button>
          </form>
          <div className="card p-6 lg:col-span-2">
            <div className="font-bold text-slate-900 mb-3">Panel con hoạt động thế nào?</div>
            <ul className="text-sm text-slate-600 space-y-2.5 leading-relaxed">
              <li>— Bạn có một gian hàng riêng tại <b>/cua-hang/ten-panel</b> hoặc tên miền của bạn, mang thương hiệu và màu của bạn.</li>
              <li>— Khách đăng ký tại panel sẽ mua theo giá <b>đã cộng phụ phí %</b> bạn đặt; phần chênh lệch tự động về ví của bạn dưới dạng hoa hồng ngay khi có đơn.</li>
              <li>— Đơn vẫn do hệ thống chính chạy (nguồn API + đội xử lý), bạn không cần lo vận hành.</li>
              <li>— Đơn bị hoàn tiền thì hoa hồng được thu hồi đúng theo tỉ lệ đã hoàn.</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  const [memberCount, orderAgg, commissionAgg, members, orders] = await Promise.all([
    prisma.user.count({ where: { panelId: panel.id } }),
    prisma.smmOrder.aggregate({ where: { panelId: panel.id }, _count: true, _sum: { charge: true } }),
    prisma.transaction.aggregate({ where: { userId: user.id, type: "PANEL_COMMISSION", amount: { gt: 0 } }, _sum: { amount: true } }),
    prisma.user.findMany({ where: { panelId: panel.id }, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, username: true, createdAt: true, balance: true } }),
    prisma.smmOrder.findMany({ where: { panelId: panel.id }, orderBy: { createdAt: "desc" }, take: 8, include: { user: { select: { username: true } }, service: { select: { name: true } } } }),
  ]);

  return (
    <div>
      <PageHead title="Panel con của tôi" desc="Quản lý gian hàng riêng, khách hàng và hoa hồng của bạn.">
        <Link href={`/cua-hang/${panel.slug}`} className="btn-primary btn-sm !px-4 !py-2">Xem gian hàng</Link>
      </PageHead>
      <Flash msg={searchParams.msg} err={searchParams.err} />
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
                <div key={m.id} className="py-2.5 flex items-center justify-between text-sm"><span className="font-medium text-slate-800">{m.username}</span><span className="text-slate-400">{dt(m.createdAt)}</span></div>
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
    </div>
  );
}
