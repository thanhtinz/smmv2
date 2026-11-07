import { requireAdminPage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { PageHead, Flash, Badge } from "@/components/ui";
import { saveLevelsAction } from "@/app/actions/admin-features";
import { LEVEL_NAME, num } from "@/lib/format";

export const dynamic = "force-dynamic";

const LEVELS = ["MEMBER", "RESELLER", "AGENCY", "VIP"] as const;
const LEVEL_CLS: Record<string, string> = {
  MEMBER: "bg-slate-100 text-slate-600", RESELLER: "bg-blue-100 text-blue-700",
  AGENCY: "bg-violet-100 text-violet-700", VIP: "bg-amber-100 text-amber-700",
};

export default async function AdminLevels({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  await requireAdminPage();
  const s = await getSettings();
  const counts = await prisma.user.groupBy({ by: ["level"], _count: true });
  const countOf = (lv: string) => counts.find((c) => c.level === lv)?._count || 0;
  return (
    <div>
      <PageHead title="Cấp bậc" desc="Chiết khấu theo cấp bậc áp trên giá dịch vụ SMM khi khách đặt đơn (không áp cho khách thuộc panel con — panel có bảng giảm riêng)." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead><tr><th className="th">Cấp bậc</th><th className="th">Giảm giá</th><th className="th">Số người dùng</th><th className="th">Mô tả</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {LEVELS.map((lv) => (
                <tr key={lv}>
                  <td className="td"><Badge cls={LEVEL_CLS[lv]}>{LEVEL_NAME[lv]}</Badge></td>
                  <td className="td font-bold">{s["level_discount_" + lv]}%</td>
                  <td className="td">{num(countOf(lv))} người dùng</td>
                  <td className="td text-slate-500">{lv === "MEMBER" ? "Khách thường, không giảm" : lv === "RESELLER" ? "Cộng tác viên bán lại" : lv === "AGENCY" ? "Đại lý" : "Khách VIP, ưu đãi cao nhất"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form action={saveLevelsAction} className="card mt-6 p-5">
          <div className="font-bold text-slate-900">Chỉnh % giảm theo cấp</div>
          <div className="mt-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
            {LEVELS.map((lv) => (
              <div key={lv}>
                <label className="lbl">{LEVEL_NAME[lv]} (%)</label>
                <input className="inp" name={"level_discount_" + lv} type="number" min={0} max={90} defaultValue={s["level_discount_" + lv]} />
              </div>
            ))}
          </div>
          <button className="btn-primary mt-4">Lưu chiết khấu</button>
        </form>
      </div>
    </div>
  );
}
