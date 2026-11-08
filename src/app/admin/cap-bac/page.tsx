import { requireAdminPage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { PageHead, Flash, Badge } from "@/components/ui";
import { saveLevelsAction } from "@/app/actions/admin-features";
import { LEVEL_NAME, num } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

const LEVELS = ["MEMBER", "RESELLER", "AGENCY", "VIP"] as const;
const LEVEL_CLS: Record<string, string> = {
  MEMBER: "bg-slate-100 text-slate-600", RESELLER: "bg-blue-100 text-blue-700",
  AGENCY: "bg-violet-100 text-violet-700", VIP: "bg-amber-100 text-amber-700",
};

export default async function AdminLevels({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  await requireAdminPage();
  const { L, Ld } = await getServerI18n(null);
  const s = await getSettings();
  const counts = await prisma.user.groupBy({ by: ["level"], _count: true });
  const countOf = (lv: string) => counts.find((c) => c.level === lv)?._count || 0;
  return (
    <div>
      <PageHead title={L("Cấp bậc")} desc={L("Chiết khấu theo cấp bậc áp trên giá dịch vụ SMM khi khách đặt đơn (không áp cho khách thuộc panel con — panel có bảng giảm riêng).")} />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <div>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead><tr><th className="th">{L("Cấp bậc")}</th><th className="th">{L("Giảm giá")}</th><th className="th">{L("Số người dùng")}</th><th className="th">{L("Mô tả")}</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {LEVELS.map((lv) => (
                <tr key={lv}>
                  <td className="td"><Badge cls={LEVEL_CLS[lv]}>{L(LEVEL_NAME[lv])}</Badge></td>
                  <td className="td font-bold">{s["level_discount_" + lv]}%</td>
                  <td className="td">{Ld(`${num(countOf(lv))} người dùng`)}</td>
                  <td className="td text-slate-500">{lv === "MEMBER" ? L("Khách thường, không giảm") : lv === "RESELLER" ? L("Cộng tác viên bán lại") : lv === "AGENCY" ? L("Đại lý") : L("Khách VIP, ưu đãi cao nhất")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form action={saveLevelsAction} className="card mt-6 p-5">
          <div className="font-bold text-slate-900">{L("Chỉnh % giảm theo cấp")}</div>
          <div className="mt-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
            {LEVELS.map((lv) => (
              <div key={lv}>
                <label className="lbl">{L(LEVEL_NAME[lv])} (%)</label>
                <input className="inp" name={"level_discount_" + lv} type="number" min={0} max={90} defaultValue={s["level_discount_" + lv]} />
              </div>
            ))}
          </div>
          <button className="btn-primary mt-4">{L("Lưu chiết khấu")}</button>
        </form>
      </div>
    </div>
  );
}
