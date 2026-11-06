import { requireAdminPage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHead, Badge, Empty, Stat, I } from "@/components/ui";
import { dt } from "@/lib/format";
import * as fs from "fs";
import * as path from "path";

export const dynamic = "force-dynamic";

type MigRow = { migration_name: string; finished_at: Date | null; applied_steps_count: number };

/** Cập nhật hệ thống — phiên bản đang chạy + lịch sử migration database (giống panel mẫu).
 *  Cập nhật code thực tế qua Git: trang này trỏ tới kho GitHub của dự án. */
export default async function AdminUpdate() {
  await requireAdminPage();
  let version = "—";
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
    version = pkg.version || "—";
  } catch { /* bỏ qua */ }
  let dbVersion = "—";
  let dbOk = false;
  try {
    const r = await prisma.$queryRawUnsafe<{ v: string }[]>("SELECT VERSION() AS v");
    const v = r[0]?.v || "—";
    dbVersion = v.includes("PostgreSQL") ? v.split(" ").slice(0, 2).join(" ") : `MariaDB ${v.split("-")[0]}`;
    dbOk = true;
  } catch { /* bỏ qua */ }
  let migrations: MigRow[] = [];
  try {
    migrations = await prisma.$queryRawUnsafe<MigRow[]>(
      "SELECT migration_name, finished_at, applied_steps_count FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 30",
    );
  } catch { migrations = []; }
  const lastMig = migrations[0]?.finished_at || null;
  return (
    <div>
      <PageHead title="Cập nhật hệ thống" desc="Phiên bản nền tảng đang chạy và lịch sử cập nhật cơ sở dữ liệu.">
        <a href="https://github.com/thanhtinz/smmv2/commits/main" target="_blank" rel="noreferrer" className="btn-primary !py-2.5">Kiểm tra cập nhật</a>
      </PageHead>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Phiên bản" value={`v${version}`} icon={I.cpu} tone="brand" />
        <Stat label="Cập nhật lần cuối" value={lastMig ? dt(lastMig) : "—"} icon={I.clock} tone="blue" />
        <Stat label="Node.js" value={process.version} icon={I.server} tone="violet" />
        <Stat label="Database" value={dbOk ? dbVersion : "Mất kết nối"} icon={I.landmark} tone={dbOk ? "emerald" : "rose"} />
      </div>
      <div className="card mt-5 p-6">
        <div className="font-bold text-slate-900">Tiến trình cập nhật</div>
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-800">
          Nền tảng cập nhật bằng cách triển khai phiên bản mới từ kho Git — trước khi cập nhật hãy sao lưu cơ sở dữ liệu, hệ thống sẽ tự chạy các migration còn thiếu khi khởi động bản mới.
        </div>
        <a href="https://github.com/thanhtinz/smmv2" target="_blank" rel="noreferrer" className="btn-primary mt-4 w-full !py-3 text-center">Mở kho mã nguồn & hướng dẫn triển khai</a>
      </div>
      <div className="card mt-5 overflow-x-auto p-0">
        <div className="border-b border-slate-100 px-6 py-4 font-bold text-slate-900">Lịch sử cập nhật</div>
        {migrations.length === 0 ? (
          <Empty text="Chưa có bản ghi migration (cơ sở dữ liệu đang đồng bộ bằng db push)." />
        ) : (
          <table className="tbl">
            <thead>
              <tr><th>Phiên bản (migration)</th><th>Trạng thái</th><th>Bước áp dụng</th><th>Thời gian</th></tr>
            </thead>
            <tbody>
              {migrations.map((m) => (
                <tr key={m.migration_name}>
                  <td className="font-mono text-[13px] text-slate-700">{m.migration_name}</td>
                  <td><Badge cls="bg-emerald-50 text-emerald-600">Đã áp dụng</Badge></td>
                  <td className="text-slate-500">{m.applied_steps_count}</td>
                  <td className="whitespace-nowrap text-slate-500">{m.finished_at ? dt(m.finished_at) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
