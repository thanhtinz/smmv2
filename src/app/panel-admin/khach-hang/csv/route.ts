import { getPanelAccess } from "@/lib/panel-access";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Xuất CSV danh sách khách của panel (chỉ chủ panel tải được, dữ liệu của panel mình). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const panel = (await getPanelAccess(user.id))?.panel ?? null;
  if (!panel) return new Response("Forbidden", { status: 403 });
  const members = await prisma.user.findMany({
    where: { panelId: panel.id },
    orderBy: { createdAt: "desc" },
    take: 5000,
    select: { id: true, username: true, email: true, balance: true, level: true, createdAt: true },
  });
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = ["ID,Tên đăng nhập,Email,Số dư,Cấp bậc,Ngày đăng ký"];
  for (const m of members) lines.push([m.id, esc(m.username), esc(m.email), m.balance, m.level, m.createdAt.toISOString()].join(","));
  return new Response("\uFEFF" + lines.join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="khach-hang-panel-${panel.slug}.csv"` },
  });
}
