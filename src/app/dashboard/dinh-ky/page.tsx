import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHead, Flash, Badge, Empty, Stat, I } from "@/components/ui";
import { createSubscriptionAction, toggleSubscriptionAction, deleteSubscriptionAction } from "@/app/actions/growth";
import { vnd, num, dt } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SubscriptionsPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const user = (await getCurrentUser())!;
  const [subs, services] = await Promise.all([
    prisma.subscription.findMany({ where: { userId: user.id }, orderBy: { id: "desc" }, include: { service: true } }),
    prisma.smmService.findMany({ where: { active: true }, orderBy: { id: "asc" }, select: { id: true, name: true, rate: true, min: true, max: true } }),
  ]);
  const activeCount = subs.filter((x) => x.active).length;
  const totalDelivered = subs.reduce((a, x) => a + x.deliveredQty, 0);
  return (
    <div>
      <PageHead title="Đăng ký định kỳ" desc="Hệ thống tự đặt đơn theo lịch bạn đặt — có trần ngân sách mỗi ngày và tự dừng khi đạt mục tiêu." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Gói đang chạy" value={num(activeCount)} icon={I.clock} tone="blue" />
        <Stat label="Tổng số lượng đã đặt tự động" value={num(totalDelivered)} icon={I.cart} tone="emerald" />
        <Stat label="Tổng số gói đã tạo" value={num(subs.length)} icon={I.layers} tone="violet" />
      </div>
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {subs.length === 0 ? <Empty text="Chưa có gói định kỳ nào — tạo gói đầu tiên ở form bên cạnh" /> : subs.map((sub) => {
            const pct = sub.targetTotal > 0 ? Math.min(100, Math.round((sub.deliveredQty / sub.targetTotal) * 100)) : 0;
            return (
              <div key={sub.id} className="card p-5">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold text-slate-900">{sub.service.name}</div>
                    <div className="mt-0.5 truncate text-sm text-slate-400">{sub.link}</div>
                  </div>
                  {sub.active ? <Badge cls="bg-emerald-100 text-emerald-700">Đang chạy</Badge> : <Badge cls="bg-slate-200 text-slate-500">Tạm dừng</Badge>}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-4">
                  <div><span className="text-slate-400">Mỗi lượt:</span> <b>{num(sub.quantity)}</b></div>
                  <div><span className="text-slate-400">Chu kỳ:</span> <b>{sub.intervalDays} ngày/lần</b></div>
                  <div><span className="text-slate-400">Đã chạy:</span> <b>{num(sub.runs)} lượt</b></div>
                  <div><span className="text-slate-400">Đã đặt:</span> <b>{num(sub.deliveredQty)}</b></div>
                  <div><span className="text-slate-400">Trần/ngày:</span> <b>{sub.dailyBudget > 0 ? vnd(sub.dailyBudget) : "Không đặt"}</b></div>
                  <div><span className="text-slate-400">Lượt sau:</span> <b>{sub.active ? dt(sub.nextRunAt) : "—"}</b></div>
                  <div className="col-span-2"><span className="text-slate-400">Ước tính/lượt:</span> <b>{vnd(Math.round((sub.service.rate * sub.quantity) / 1000))}</b></div>
                </div>
                {sub.targetTotal > 0 && (
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-xs text-slate-400"><span>Tiến độ mục tiêu</span><span>{num(sub.deliveredQty)} / {num(sub.targetTotal)} ({pct}%)</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} /></div>
                  </div>
                )}
                {sub.lastError && <p className="mt-3 rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-700">{sub.lastError}</p>}
                <div className="mt-4 flex gap-2">
                  <form action={toggleSubscriptionAction}><input type="hidden" name="id" value={sub.id} /><button className="btn-ghost btn-sm">{sub.active ? "Tạm dừng" : "Bật lại"}</button></form>
                  <form action={deleteSubscriptionAction}><input type="hidden" name="id" value={sub.id} /><button className="btn-ghost btn-sm !text-rose-600">Xoá gói</button></form>
                </div>
              </div>
            );
          })}
        </div>
        <form action={createSubscriptionAction} className="card space-y-4 p-5">
          <div className="font-bold text-slate-900">Tạo gói định kỳ</div>
          <div><label className="lbl">Dịch vụ</label>
            <select className="inp" name="serviceId" required>
              {services.map((sv) => <option key={sv.id} value={sv.id}>#{sv.id} — {sv.name} ({vnd(sv.rate)}/1000)</option>)}
            </select></div>
          <div><label className="lbl">Link cần tăng</label><input className="inp" name="link" required placeholder="https://..." /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="lbl">Số lượng / lượt</label><input className="inp" name="quantity" type="number" required defaultValue={1000} /></div>
            <div><label className="lbl">Chu kỳ (ngày/lần)</label><input className="inp" name="intervalDays" type="number" min={1} max={30} defaultValue={1} /></div>
            <div><label className="lbl">Trần tiền / ngày (đ)</label><input className="inp" name="dailyBudget" type="number" min={0} defaultValue={0} /></div>
            <div><label className="lbl">Mục tiêu tổng số lượng</label><input className="inp" name="targetTotal" type="number" min={0} defaultValue={0} /></div>
          </div>
          <p className="text-xs leading-relaxed text-slate-400">Trần 0 = không giới hạn. Đạt mục tiêu tổng, gói tự tạm dừng. Thiếu số dư, gói cũng tạm dừng và báo cho bạn.</p>
          <button className="btn-primary w-full">Tạo gói định kỳ</button>
        </form>
      </div>
    </div>
  );
}
