import Link from "next/link";
import { requirePanelOwnerPage } from "@/lib/panel-access";
import { prisma } from "@/lib/db";
import { PageHead, Badge, Empty, Stat, I } from "@/components/ui";
import { dt } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

/** Kiểm tra AI của panel — nhật ký AI rà soát link đơn của khách panel này. */
export default async function PanelAiCheck({ searchParams }: { searchParams: { verdict?: string; q?: string } }) {
  const { panel } = await requirePanelOwnerPage();
  const { L } = await getServerI18n((panel as { langConfig?: string | null }).langConfig ?? null);
  const verdict = searchParams.verdict === "VIOLATION" || searchParams.verdict === "SAFE" ? searchParams.verdict : undefined;
  const q = (searchParams.q || "").trim();
  const [total, safe, violation, rows] = await Promise.all([
    prisma.aiCheckLog.count({ where: { panelId: panel.id } }),
    prisma.aiCheckLog.count({ where: { panelId: panel.id, verdict: "SAFE" } }),
    prisma.aiCheckLog.count({ where: { panelId: panel.id, verdict: "VIOLATION" } }),
    prisma.aiCheckLog.findMany({
      where: {
        panelId: panel.id,
        ...(verdict ? { verdict } : {}),
        ...(q ? { OR: [{ link: { contains: q } }, { reason: { contains: q } }] } : {}),
      },
      orderBy: { id: "desc" },
      take: 100,
    }),
  ]);
  const userIds = Array.from(new Set(rows.map((r) => r.userId).filter((x): x is number => !!x)));
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true } }) : [];
  const nameOf = new Map(users.map((u) => [u.id, u.username]));
  return (
    <div>
      <PageHead title={L("Kiểm tra AI")} desc={L("Nhật ký AI rà soát link khách của panel gửi khi đặt đơn.")}>
        <Link href="/panel-admin/cau-hinh" className="btn-ghost">{L("Cấu hình AI kiểm tra")}</Link>
      </PageHead>
      {!panel.aiCheckEnabled && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {L("AI kiểm tra link của panel đang")} <b>{L("tắt")}</b> {L("— bật tại Cài đặt → tab AI Kiểm tra (dùng key AI riêng của panel nếu có).")}
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label={L("Tổng kiểm tra")} value={String(total)} icon={I.cpu} tone="brand" />
        <Stat label={L("An toàn")} value={String(safe)} icon={I.check} tone="emerald" />
        <Stat label={L("Vi phạm")} value={String(violation)} icon={I.shield} tone="rose" />
      </div>
      <form className="card mt-5 flex flex-wrap items-center gap-3 p-4" method="get">
        <select name="verdict" defaultValue={verdict || ""} className="inp !w-auto">
          <option value="">{L("Tất cả kết quả")}</option>
          <option value="SAFE">{L("An toàn")}</option>
          <option value="VIOLATION">{L("Vi phạm")}</option>
        </select>
        <input name="q" defaultValue={q} placeholder={L("Tìm link hoặc lý do...")} className="inp !w-72" />
        <button className="btn-primary !py-2">{L("Lọc")}</button>
      </form>
      <div className="card mt-4 overflow-x-auto p-0">
        {rows.length === 0 ? (
          <Empty text={L("Chưa có lượt kiểm tra nào.")} />
        ) : (
          <table className="tbl">
            <thead>
              <tr><th>{L("Người dùng")}</th><th>{L("Liên kết")}</th><th>{L("Kết quả")}</th><th>{L("Lý do")}</th><th>{L("Model")}</th><th>{L("Thời gian")}</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium text-slate-800">{r.userId ? nameOf.get(r.userId) || `#${r.userId}` : "—"}</td>
                  <td className="max-w-[320px] truncate text-slate-500">{r.link}</td>
                  <td>{r.verdict === "VIOLATION" ? <Badge cls="bg-rose-50 text-rose-600">{L("Vi phạm")}</Badge> : <Badge cls="bg-emerald-50 text-emerald-600">{L("An toàn")}</Badge>}</td>
                  <td className="max-w-[260px] truncate text-slate-500">{r.reason || "—"}</td>
                  <td className="text-slate-500">{r.model || "—"}</td>
                  <td className="whitespace-nowrap text-slate-500">{dt(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
