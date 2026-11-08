import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth";
import { PageHead, Badge, Empty } from "@/components/ui";
import { dt } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

export default async function AdminLogs({ searchParams }: { searchParams: { kind?: string } }) {
  await requireAdminPage();
  const { L } = await getServerI18n(null);
  const where: any = searchParams.kind ? { kind: searchParams.kind } : {};
  const logs = await prisma.apiLog.findMany({ where, orderBy: { id: "desc" }, take: 100 });
  const kinds = ["provider_out", "provider_sync", "reseller_in", "webhook"];
  return (
    <div>
      <PageHead title={L("Nhật ký API & Webhook")} desc={L("Tra cứu lỗi đấu API, đồng bộ dịch vụ, refill từ đại lý và webhook nạp tiền.")} />
      <form className="flex gap-2 mb-5">
        <select className="inp !w-56" name="kind" defaultValue={searchParams.kind || ""}>
          <option value="">{L("Tất cả loại")}</option>
          {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <button className="btn-dark">{L("Lọc")}</button>
      </form>
      {logs.length === 0 ? <Empty text={L("Chưa có nhật ký")} /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="bg-slate-50 border-b border-slate-200"><tr><th className="th">{L("Thời gian")}</th><th className="th">{L("Loại")}</th><th className="th">{L("Tham chiếu")}</th><th className="th">{L("Chi tiết")}</th><th className="th">{L("Kết quả")}</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="td text-xs text-slate-500 whitespace-nowrap">{dt(l.createdAt)}</td>
                  <td className="td font-mono text-xs">{l.kind}</td>
                  <td className="td font-mono text-xs">{l.ref || "—"}</td>
                  <td className="td text-slate-500"><span className="block max-w-[420px] truncate" title={l.detail || ""}>{l.detail || "—"}</span></td>
                  <td className="td"><Badge cls={l.ok ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}>{l.ok ? "OK" : L("Lỗi")}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
