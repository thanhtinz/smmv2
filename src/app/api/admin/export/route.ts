import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { buildExportCsv, parseRange, EXPORT_TYPES, type ExportType } from "@/lib/export-csv";

export const dynamic = "force-dynamic";

/** Xuất CSV báo cáo web mẹ — chỉ ADMIN. ?type=smm|premium|deposits|transactions|users&from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser().catch(() => null);
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const type = (EXPORT_TYPES as readonly string[]).includes(sp.get("type") || "") ? (sp.get("type") as ExportType) : "smm";
  const r = parseRange(sp);
  const { csv, filename } = await buildExportCsv(type, r.from, r.to);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
