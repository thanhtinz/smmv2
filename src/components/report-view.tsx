import { Stat, I, RankBadge, Badge } from "@/components/ui";
import { num, LEVEL_NAME } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";
import type { StatsBundle } from "@/lib/stats";

const BAR_COLORS = [
  "bg-gradient-to-r from-blue-500 to-sky-400",
  "bg-gradient-to-r from-violet-500 to-purple-400",
  "bg-gradient-to-r from-emerald-500 to-teal-400",
  "bg-gradient-to-r from-amber-500 to-yellow-400",
  "bg-gradient-to-r from-rose-500 to-pink-400",
  "bg-gradient-to-r from-cyan-500 to-sky-400",
  "bg-gradient-to-r from-indigo-500 to-blue-400",
  "bg-gradient-to-r from-orange-500 to-amber-400",
];

/** Khối thống kê dùng chung cho trang Báo cáo: thu nhập 4 kỳ, mặt hàng bán chạy
 *  (SMM + Premium), top khách chi tiêu và việc đang chờ — số liệu từ lib/stats. */
export async function ReportPreview({ st, profitLabel = "Lãi" }: { st: StatsBundle; profitLabel?: string }) {
  const { L, Ld, M } = await getServerI18n();
  const maxSmm = Math.max(1, ...st.bestSmm.map((b) => b.revenue));
  const maxPre = Math.max(1, ...st.bestPremium.map((b) => b.revenue));
  const maxSpend = Math.max(1, ...st.topUsers.map((u) => u.spend));
  const per = (p: StatsBundle["today"]) => `${L(profitLabel)} ${M(p.profit)}${L(" · ")}${num(p.orders)}${L(" đơn · ")}${L("Nạp ")}${M(p.deposits)}`;
  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={L("Thu nhập hôm nay")} value={M(st.today.revenue)} sub={per(st.today)} icon={I.money} tone="blue" />
        <Stat label={L("Thu nhập 7 ngày")} value={M(st.last7.revenue)} sub={per(st.last7)} icon={I.chart} tone="cyan" />
        <Stat label={L("Thu nhập 30 ngày")} value={M(st.last30.revenue)} sub={per(st.last30)} icon={I.chart} tone="violet" />
        <Stat label={L("Thu nhập tháng này")} value={M(st.month.revenue)} sub={per(st.month)} icon={I.wallet} tone="emerald" />
      </div>

      <div className="mt-6 flex flex-wrap gap-2 text-xs font-semibold">
        <span className="rounded-full bg-amber-100 px-3 py-1.5 text-amber-800">{`${num(st.pending.deposits)} ${L("yêu cầu nạp chờ duyệt")}`}</span>
        <span className="rounded-full bg-sky-100 px-3 py-1.5 text-sky-800">{`${num(st.pending.smmManual)} ${L("đơn SMM thủ công chờ xử lý")}`}</span>
        <span className="rounded-full bg-violet-100 px-3 py-1.5 text-violet-800">{`${num(st.pending.premium)} ${L("đơn Premium chờ giao")}`}</span>
        <span className="rounded-full bg-rose-100 px-3 py-1.5 text-rose-800">{`${num(st.pending.tickets)} ${L("ticket đang mở")}`}</span>
      </div>

      <div className="mt-6 grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 text-white">{I.cart}</span>
            <span className="font-bold text-slate-900">{L("Dịch vụ SMM bán chạy")}</span>
            <span className="ml-auto text-xs text-slate-400">{L("30 ngày · theo số đơn")}</span>
          </div>
          <div className="divide-y divide-slate-50 px-5">
            {st.bestSmm.map((b, i) => (
              <div key={b.name} className="py-3">
                <div className="flex items-center gap-3">
                  <RankBadge rank={i + 1} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">{b.name}</span>
                  <span className="shrink-0 text-sm"><b className="text-slate-900">{M(b.revenue)}</b> <span className="text-slate-400">{`· ${num(b.orders)} ${L("đơn")}`}</span></span>
                </div>
                <div className="ml-10 mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${BAR_COLORS[i % BAR_COLORS.length]}`} style={{ width: `${Math.max(4, Math.round((b.revenue / maxSmm) * 100))}%` }} />
                </div>
              </div>
            ))}
            {st.bestSmm.length === 0 && <p className="py-5 text-sm text-slate-400">{L("Chưa có đơn SMM nào trong 30 ngày.")}</p>}
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-fuchsia-500 to-violet-600 text-white">{I.gem}</span>
            <span className="font-bold text-slate-900">{L("Premium bán chạy")}</span>
            <span className="ml-auto text-xs text-slate-400">{L("30 ngày · theo số gói")}</span>
          </div>
          <div className="divide-y divide-slate-50 px-5">
            {st.bestPremium.map((b, i) => (
              <div key={b.name} className="py-3">
                <div className="flex items-center gap-3">
                  <RankBadge rank={i + 1} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">{b.name}</span>
                  <span className="shrink-0 text-sm"><b className="text-slate-900">{M(b.revenue)}</b> <span className="text-slate-400">{`· ${num(b.quantity)} ${L("gói")}`}</span></span>
                </div>
                <div className="ml-10 mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${BAR_COLORS[(i + 3) % BAR_COLORS.length]}`} style={{ width: `${Math.max(4, Math.round((b.revenue / maxPre) * 100))}%` }} />
                </div>
              </div>
            ))}
            {st.bestPremium.length === 0 && <p className="py-5 text-sm text-slate-400">{L("Chưa có đơn Premium nào trong 30 ngày.")}</p>}
          </div>
        </div>
      </div>

      <div className="card mt-6 overflow-hidden">
        <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white">{I.users}</span>
          <span className="font-bold text-slate-900">{L("Top khách chi tiêu")}</span>
          <span className="ml-auto text-xs text-slate-400">{L("SMM + Premium · mọi thời gian")}</span>
        </div>
        <div className="grid grid-cols-1 gap-x-8 px-5 md:grid-cols-2">
          {st.topUsers.map((u, i) => (
            <div key={u.id} className="flex items-center gap-3 border-b border-slate-50 py-3">
              <RankBadge rank={i + 1} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-slate-800">{u.username}</span>
                  <Badge cls={u.level === "VIP" ? "bg-amber-100 text-amber-800" : u.level === "AGENCY" ? "bg-violet-100 text-violet-800" : u.level === "RESELLER" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-600"}>{L(LEVEL_NAME[u.level] || u.level)}</Badge>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${BAR_COLORS[i % BAR_COLORS.length]}`} style={{ width: `${Math.max(4, Math.round((u.spend / maxSpend) * 100))}%` }} />
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-bold text-slate-900">{M(u.spend)}</div>
                <div className="text-[11px] text-slate-400">{`${num(u.orders)} ${L("đơn")} · ${L("đã nạp")} ${M(u.deposited)}`}</div>
              </div>
            </div>
          ))}
          {st.topUsers.length === 0 && <p className="py-5 text-sm text-slate-400">{L("Chưa có dữ liệu khách.")}</p>}
        </div>
      </div>
    </div>
  );
}
