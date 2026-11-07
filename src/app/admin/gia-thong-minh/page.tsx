import { requireAdminPage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHead, Flash } from "@/components/ui";
import { bulkPriceAction } from "@/app/actions/admin-features";
import { vnd, num } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminSmartPricing({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  await requireAdminPage();
  const [providers, categories, total, withCost, avg] = await Promise.all([
    prisma.provider.findMany({ orderBy: { id: "asc" }, select: { id: true, name: true } }),
    prisma.smmCategory.findMany({ orderBy: { sort: "asc" }, select: { id: true, name: true } }),
    prisma.smmService.count(),
    prisma.smmService.count({ where: { costRate: { gt: 0 } } }),
    prisma.smmService.aggregate({ _avg: { rate: true, costRate: true } }),
  ]);
  const avgRate = Math.round(avg._avg.rate || 0);
  const avgCost = Math.round(avg._avg.costRate || 0);
  const margin = avgRate > 0 ? Math.round(((avgRate - avgCost) / avgRate) * 100) : 0;
  return (
    <div>
      <PageHead title="Giá thông minh" desc="Chỉnh giá bán hàng loạt theo tỉ lệ lãi trên giá vốn hoặc tăng/giảm % trên giá hiện tại. Giá mới làm tròn tới hàng chục." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[380px_1fr]">
        <form action={bulkPriceAction} className="card space-y-4 p-5">
          <div className="font-bold text-slate-900">Chỉnh giá hàng loạt</div>
          <div>
            <label className="lbl">Phạm vi áp dụng</label>
            <select className="inp" name="scope" defaultValue="all">
              <option value="all">Tất cả dịch vụ ({num(total)})</option>
              <option value="manual">Chỉ dịch vụ thủ công</option>
              {providers.map((p) => <option key={p.id} value={`provider:${p.id}`}>Nguồn: {p.name}</option>)}
              {categories.map((c) => <option key={c.id} value={`category:${c.id}`}>Danh mục: {c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="lbl">Cách tính giá mới</label>
            <select className="inp" name="mode" defaultValue="markup">
              <option value="markup">Theo giá vốn + % lãi (bỏ qua dịch vụ chưa có giá vốn)</option>
              <option value="percent">Tăng / giảm % trên giá bán hiện tại</option>
            </select>
          </div>
          <div><label className="lbl">Giá trị % (âm = giảm khi ở chế độ tăng/giảm)</label><input className="inp" name="value" type="number" defaultValue={30} required /></div>
          <button className="btn-primary w-full">Áp dụng giá mới</button>
        </form>
        <div className="card p-6">
          <div className="mb-4 font-bold text-slate-900">Tổng quan giá hiện tại</div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 px-4 py-3"><div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Tổng dịch vụ</div><div className="mt-0.5 text-lg font-bold">{num(total)}</div></div>
            <div className="rounded-xl bg-slate-50 px-4 py-3"><div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Có giá vốn</div><div className="mt-0.5 text-lg font-bold">{num(withCost)}</div></div>
            <div className="rounded-xl bg-slate-50 px-4 py-3"><div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Biên lãi trung bình</div><div className="mt-0.5 text-lg font-bold">{margin}%</div></div>
            <div className="rounded-xl bg-slate-50 px-4 py-3"><div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Giá bán TB / 1000</div><div className="mt-0.5 text-lg font-bold">{vnd(avgRate)}</div></div>
            <div className="rounded-xl bg-slate-50 px-4 py-3"><div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Giá vốn TB / 1000</div><div className="mt-0.5 text-lg font-bold">{vnd(avgCost)}</div></div>
            <div className="rounded-xl bg-slate-50 px-4 py-3"><div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Chưa có giá vốn</div><div className="mt-0.5 text-lg font-bold">{num(total - withCost)}</div></div>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-slate-500">
            Chế độ <b>theo giá vốn + % lãi</b> là cách các panel thường dùng khi đồng bộ dịch vụ từ nhà cung cấp: giá vốn thay đổi thì chỉ cần áp lại tỉ lệ lãi là toàn bộ bảng giá cập nhật theo. Dịch vụ thủ công chưa có giá vốn sẽ bị bỏ qua ở chế độ này.
          </p>
          <p className="mt-4 rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs font-medium leading-relaxed text-amber-700">
            Lưu ý: thao tác chỉnh giá áp ngay lên giá bán và không hoàn tác tự động được. Nên chỉnh theo từng nguồn/danh mục thay vì toàn bộ.
          </p>
        </div>
      </div>
    </div>
  );
}
