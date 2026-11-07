import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPanelAccess } from "@/lib/panel-access";
import { buildExportCsv, parseRange, EXPORT_TYPES, type ExportType } from "@/lib/export-csv";

export const dynamic = "force-dynamic";

/** Xuất CSV báo cáo của panel đang quản trị — phạm vi chỉ khách của panel đó. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const acc = await getPanelAccess(user.id).catch(() => null);
  if (!acc) return NextResponse.json({ error: "Không có quyền panel" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const type = (EXPORT_TYPES as readonly string[]).includes(sp.get("type") || "") ? (sp.get("type") as ExportType) : "smm";
  const r = parseRange(sp);
  const { csv, filename } = await buildExportCsv(type, acc.panel.id, r.from, r.to);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
