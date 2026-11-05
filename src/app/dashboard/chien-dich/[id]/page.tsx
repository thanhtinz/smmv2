import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHead, Flash, Badge, Empty } from "@/components/ui";
import { updateCampaignAction } from "@/app/actions/growth";
import { vnd, num, dt, SMM_STATUS } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CampaignDetail({ params, searchParams }: { params: { id: string }; searchParams: { msg?: string; err?: string } }) {
  const user = (await getCurrentUser())!;
  const id = parseInt(params.id);
  const campaign = await prisma.campaign.findFirst({
    where: { id, userId: user.id },
    include: { orders: { orderBy: { id: "desc" }, take: 100, include: { service: true } } },
  });
  if (!campaign) notFound();
  const valid = campaign.orders.filter((o) => !["REFUNDED", "CANCELED"].includes(o.status));
  const spent = valid.reduce((a, o) => a + o.charge, 0);
  const pct = campaign.budget > 0 ? Math.min(100, Math.round((spent / campaign.budget) * 100)) : 0;
  return (
    <div>
      <PageHead title={campaign.name} desc={`Chiến dịch tạo ${dt(campaign.createdAt)} · ${num(valid.length)} đơn hợp lệ`}>
        <Link href="/dashboard/chien-dich" className="btn-ghost">← Tất cả chiến dịch</Link>
        <Link href={`/dashboard/dat-hang?campaign=${campaign.id}`} className="btn-primary">+ Đặt đơn vào chiến dịch</Link>
      </PageHead>
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className="card mb-6 p-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div><div className="text-xs text-slate-400">Đã chi</div><div className="text-xl font-extrabold">{vnd(spent)}</div></div>
          <div><div className="text-xs text-slate-400">Ngân sách</div><div className="text-xl font-extrabold">{campaign.budget > 0 ? vnd(campaign.budget) : "Không đặt"}</div></div>
          <div><div className="text-xs text-slate-400">Còn lại</div><div className="text-xl font-extrabold">{campaign.budget > 0 ? vnd(Math.max(0, campaign.budget - spent)) : "—"}</div></div>
          <div><div className="text-xs text-slate-400">Trạng thái</div><div className="mt-1">{campaign.active ? <Badge cls="bg-emerald-100 text-emerald-700">Đang chạy</Badge> : <Badge cls="bg-slate-200 text-slate-500">Đã đóng</Badge>}</div></div>
        </div>
        {campaign.budget > 0 && (
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs text-slate-400"><span>Tiến độ ngân sách</span><span>{pct}%</span></div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${pct >= 100 ? "bg-rose-500" : "bg-brand-500"}`} style={{ width: `${pct}%` }} /></div>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[1fr_340px]">
        <div className="card overflow-x-auto">
          <div className="border-b border-slate-100 px-5 py-4 font-bold text-slate-900">Đơn trong chiến dịch</div>
          {campaign.orders.length === 0 ? <Empty text="Chưa có đơn nào — bấm Đặt đơn vào chiến dịch để bắt đầu" /> : (
            <table className="w-full min-w-[620px]">
              <thead><tr><th className="th">Mã đơn</th><th className="th">Dịch vụ</th><th className="th">Số lượng</th><th className="th">Tiền</th><th className="th">Trạng thái</th><th className="th">Thời gian</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {campaign.orders.map((o) => (
                  <tr key={o.id}>
                    <td className="td"><Link href={`/dashboard/don-hang/${o.id}`} className="font-mono text-xs font-semibold text-brand-700">{o.code}</Link></td>
                    <td className="td"><div className="max-w-[240px] truncate">{o.service.name}</div></td>
                    <td className="td">{num(o.quantity)}</td>
                    <td className="td font-semibold">{vnd(o.charge)}</td>
                    <td className="td"><Badge cls={SMM_STATUS[o.status].cls}>{SMM_STATUS[o.status].label}</Badge></td>
                    <td className="td whitespace-nowrap text-slate-500">{dt(o.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <form action={updateCampaignAction} className="card space-y-4 p-5">
          <div className="font-bold text-slate-900">Cài đặt chiến dịch</div>
          <input type="hidden" name="id" value={campaign.id} />
          <div><label className="lbl">Tên chiến dịch</label><input className="inp" name="name" defaultValue={campaign.name} /></div>
          <div><label className="lbl">Ngân sách (đ)</label><input className="inp" name="budget" type="number" min={0} defaultValue={campaign.budget} /></div>
          <div><label className="lbl">Ghi chú</label><input className="inp" name="note" defaultValue={campaign.note || ""} /></div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" name="active" defaultChecked={campaign.active} className="h-4 w-4 accent-brand-600" /> Đang chạy</label>
          <button className="btn-primary w-full">Lưu</button>
          <button name="delete" value="1" className="btn-ghost w-full !text-rose-600">Xoá chiến dịch</button>
        </form>
      </div>
    </div>
  );
}
