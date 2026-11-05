import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHead, Flash, Badge, Empty } from "@/components/ui";
import { createCampaignAction } from "@/app/actions/growth";
import { vnd, num, dt } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CampaignsPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const user = (await getCurrentUser())!;
  const campaigns = await prisma.campaign.findMany({
    where: { userId: user.id },
    orderBy: { id: "desc" },
    include: { orders: { where: { status: { notIn: ["REFUNDED", "CANCELED"] } }, select: { charge: true } } },
  });
  return (
    <div>
      <PageHead title="Chiến dịch" desc="Gom các đơn hàng theo từng chiến dịch để theo dõi tổng chi và ngân sách." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {campaigns.length === 0 ? <Empty text="Chưa có chiến dịch nào" /> : campaigns.map((c) => {
            const spent = c.orders.reduce((a, o) => a + o.charge, 0);
            const pct = c.budget > 0 ? Math.min(100, Math.round((spent / c.budget) * 100)) : 0;
            return (
              <Link key={c.id} href={`/dashboard/chien-dich/${c.id}`} className="card block p-5 transition hover:shadow-md">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold text-slate-900">{c.name}</div>
                    <div className="mt-0.5 text-sm text-slate-400">{num(c.orders.length)} đơn · tạo {dt(c.createdAt)}{c.note ? ` · ${c.note}` : ""}</div>
                  </div>
                  {c.active ? <Badge cls="bg-emerald-100 text-emerald-700">Đang chạy</Badge> : <Badge cls="bg-slate-200 text-slate-500">Đã đóng</Badge>}
                  <div className="text-right">
                    <div className="text-xs text-slate-400">Đã chi</div>
                    <div className="font-extrabold text-slate-900">{vnd(spent)}</div>
                  </div>
                </div>
                {c.budget > 0 && (
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-xs text-slate-400"><span>Ngân sách {vnd(c.budget)}</span><span>{pct}%</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${pct >= 100 ? "bg-rose-500" : "bg-brand-500"}`} style={{ width: `${pct}%` }} /></div>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
        <form action={createCampaignAction} className="card space-y-4 p-5">
          <div className="font-bold text-slate-900">Tạo chiến dịch</div>
          <div><label className="lbl">Tên chiến dịch</label><input className="inp" name="name" required placeholder="VD: Ra mắt sản phẩm tháng 11" /></div>
          <div><label className="lbl">Ngân sách dự kiến (đ)</label><input className="inp" name="budget" type="number" min={0} defaultValue={0} /></div>
          <div><label className="lbl">Ghi chú</label><input className="inp" name="note" placeholder="Không bắt buộc" /></div>
          <button className="btn-primary w-full">Tạo chiến dịch</button>
        </form>
      </div>
    </div>
  );
}
