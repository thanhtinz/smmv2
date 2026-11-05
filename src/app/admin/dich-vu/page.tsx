import Link from "next/link";
import { requireAdminPage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHead, Flash } from "@/components/ui";
import { AddServiceButton, ServiceRowActions, ServiceStatusToggle, type ServiceDTO2, type CategoryDTO, type ProviderOpt } from "@/components/admin-catalog";
import { adminSyncAllProviders } from "@/app/actions/admin";
import { vnd, num, dt } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { parseTelegramBots } from "@/lib/telegram";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function AdminServices({ searchParams }: { searchParams: { msg?: string; err?: string; q?: string; cat?: string; provider?: string; status?: string; page?: string } }) {
  await requireAdminPage();
  const q = (searchParams.q || "").trim();
  const cat = searchParams.cat ? parseInt(searchParams.cat) : undefined;
  const provider = searchParams.provider || "";
  const status = searchParams.status || "";
  const page = Math.max(1, parseInt(searchParams.page || "1"));

  const where: any = { panelId: null }; // trang này chỉ quản dịch vụ của web mẹ; dịch vụ riêng của panel do chủ panel tự quản
  if (q) where.OR = [{ name: { contains: q } }, ...(parseInt(q) ? [{ id: parseInt(q) }] : [])];
  if (cat) where.categoryId = cat;
  if (provider === "manual") where.providerId = null;
  else if (provider) where.providerId = parseInt(provider);
  if (status === "on") where.active = true;
  if (status === "off") where.active = false;

  const [total, services, categories, providers] = await Promise.all([
    prisma.smmService.count({ where }),
    prisma.smmService.findMany({
      where, orderBy: [{ categoryId: "asc" }, { sort: "asc" }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      include: { category: true, provider: { select: { name: true, markupPercent: true } } },
    }),
    prisma.smmCategory.findMany({ orderBy: [{ platform: "asc" }, { sort: "asc" }], include: { _count: { select: { services: true } } } }),
    prisma.provider.findMany({ orderBy: { id: "asc" }, select: { id: true, name: true, markupPercent: true } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const catDTOs: CategoryDTO[] = categories.map((c) => ({ id: c.id, platform: c.platform, name: c.name, sort: c.sort, active: c.active, serviceCount: c._count.services }));
  const provOpts: ProviderOpt[] = providers;
  const botOpts = parseTelegramBots((await getSettings()).telegram_bots).map((b) => ({ id: b.id, name: b.name }));
  const qs = (patch: Record<string, string>) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (cat) p.set("cat", String(cat));
    if (provider) p.set("provider", provider);
    if (status) p.set("status", status);
    for (const [k, v] of Object.entries(patch)) v ? p.set(k, v) : p.delete(k);
    const s = p.toString();
    return `/admin/dich-vu${s ? `?${s}` : ""}`;
  };

  return (
    <div>
      <PageHead title="Quản lý Dịch vụ" desc={`Tổng: ${num(total)} dịch vụ`} />
      <Flash msg={searchParams.msg} err={searchParams.err} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form className="flex flex-1 flex-wrap items-center gap-2" method="get">
          <input name="q" defaultValue={q} placeholder="Tìm kiếm theo tên, ID hoặc nhà cung cấp..." className="inp min-w-[240px] flex-1" />
          <select name="cat" defaultValue={cat || ""} className="inp w-auto">
            <option value="">Tất cả danh mục</option>
            {catDTOs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select name="provider" defaultValue={provider} className="inp w-auto">
            <option value="">Tất cả nhà cung cấp</option>
            <option value="manual">Thủ công</option>
            {provOpts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select name="status" defaultValue={status} className="inp w-auto">
            <option value="">Tất cả trạng thái</option>
            <option value="on">Đang bật</option>
            <option value="off">Đã tắt</option>
          </select>
          <button className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">Lọc</button>
          {(q || cat || provider || status) && <Link href="/admin/dich-vu" className="btn-ghost btn-sm !px-4 !py-2.5">Đặt lại</Link>}
        </form>
        <form action={adminSyncAllProviders}><button className="btn-ghost btn-sm !px-4 !py-2.5">Đồng bộ dịch vụ</button></form>
        <AddServiceButton categories={catDTOs} providers={provOpts} bots={botOpts} />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[920px]">
          <thead><tr className="border-b border-slate-100">
            <th className="th">Dịch vụ</th><th className="th">Nhà cung cấp</th><th className="th">Bảng giá (1k)</th><th className="th">Trạng thái</th><th className="th">Cập nhật</th><th className="th text-right">Tuỳ chọn</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {services.map((sv) => {
              const dto: ServiceDTO2 = {
                id: sv.id, categoryId: sv.categoryId, categoryName: sv.category.name, platform: sv.category.platform,
                name: sv.name, description: sv.description, rate: sv.rate, costRate: sv.costRate, min: sv.min, max: sv.max,
                avgTime: sv.avgTime, type: sv.type, customMarkup: sv.customMarkup, refill: sv.refill, cancelable: sv.cancelable,
                dripfeed: sv.dripfeed, autoRefill: sv.autoRefill, active: sv.active, providerId: sv.providerId,
                autoSyncPrice: sv.autoSyncPrice, qtyAdjustPercent: sv.qtyAdjustPercent, autoUid: sv.autoUid, telegramBot: sv.telegramBot, sort: sv.sort,
                providerName: sv.provider?.name || null, providerMarkup: sv.provider?.markupPercent ?? null,
                providerServiceId: sv.providerServiceId, backupProviderId: sv.backupProviderId,
                backupProviderServiceId: sv.backupProviderServiceId, backupCostRate: sv.backupCostRate, updatedAt: dt(sv.updatedAt),
              };
              const profit = sv.rate - sv.costRate;
              return (
                <tr key={sv.id} className="hover:bg-slate-50/60">
                  <td className="td max-w-[380px]">
                    <div className="font-bold leading-snug text-slate-800">{sv.name}</div>
                    <div className="mt-0.5 text-xs text-slate-400">ID: {sv.id} • Min: {num(sv.min)} • Max: {num(sv.max)}</div>
                    <div className="mt-1 flex gap-1">
                      {sv.refill && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-600">Refill</span>}
                      {sv.cancelable && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-600">Hủy</span>}
                      {sv.dripfeed && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-600">Dripfeed</span>}
                    </div>
                  </td>
                  <td className="td">
                    {sv.provider ? (
                      <div className="flex items-center gap-1.5 text-sm text-slate-600">
                        <span className="font-semibold">{sv.provider.name}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">NCC: +{sv.customMarkup ?? sv.provider.markupPercent}%</span>
                      </div>
                    ) : <span className="text-sm text-slate-400">Thủ công</span>}
                    <div className="text-xs text-slate-400">{sv.category.name}</div>
                  </td>
                  <td className="td whitespace-nowrap">
                    <div className="text-sm">Bán: <b className="text-rose-600">{vnd(sv.rate)}</b></div>
                    {sv.costRate > 0 && <div className="text-xs text-slate-400">Gốc: <span className="line-through">{vnd(sv.costRate)}</span></div>}
                    {sv.costRate > 0 && <div className={`text-xs font-semibold ${profit >= 0 ? "text-blue-600" : "text-rose-600"}`}>Lãi: {profit >= 0 ? "+" : ""}{vnd(profit)}</div>}
                  </td>
                  <td className="td"><ServiceStatusToggle service={dto} /></td>
                  <td className="td whitespace-nowrap text-sm text-slate-500">{dt(sv.updatedAt)}</td>
                  <td className="td"><ServiceRowActions service={dto} categories={catDTOs} providers={provOpts} bots={botOpts} /></td>
                </tr>
              );
            })}
            {services.length === 0 && <tr><td colSpan={6} className="td py-10 text-center text-slate-400">Không có dịch vụ nào khớp bộ lọc.</td></tr>}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 2).map((n, i, arr) => (
            <span key={n} className="flex items-center gap-1.5">
              {i > 0 && arr[i - 1] < n - 1 && <span className="text-slate-400">…</span>}
              <Link href={qs({ page: String(n) })} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${n === page ? "bg-blue-600 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{n}</Link>
            </span>
          ))}
          <span className="ml-2 text-sm text-slate-400">Trang {page} / {pages}</span>
        </div>
      )}
    </div>
  );
}
