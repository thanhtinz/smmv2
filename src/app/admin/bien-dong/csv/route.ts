import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const TX_LABEL: Record<string, string> = {
  DEPOSIT: "Nạp tiền", SMM_ORDER: "Đặt đơn SMM", PREMIUM_ORDER: "Mua Premium",
  REFUND: "Hoàn tiền", ADJUST: "Điều chỉnh", BONUS: "Thưởng nạp",
  PANEL_COMMISSION: "Hoa hồng panel", REFERRAL_COMMISSION: "Hoa hồng giới thiệu",
};

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return new NextResponse("Forbidden", { status: 403 });
  const q = req.nextUrl.searchParams.get("q") || "";
  const type = req.nextUrl.searchParams.get("type") || "";
  const where: any = {};
  if (type) where.type = type;
  if (q) where.OR = [{ note: { contains: q } }, { ref: { contains: q } }, { user: { username: { contains: q } } }];
  const rows = await prisma.transaction.findMany({ where, orderBy: { id: "desc" }, take: 5000, include: { user: true } });
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [["ID", "Nguoi dung", "Loai", "So tien", "So du truoc", "So du sau", "Mo ta", "Thoi gian"].join(",")];
  for (const t of rows) {
    lines.push([t.id, t.user.username, TX_LABEL[t.type] || t.type, t.amount, t.balanceAfter - t.amount, t.balanceAfter, esc(t.note || t.ref || ""), t.createdAt.toISOString()].join(","));
  }
  return new NextResponse("\uFEFF" + lines.join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=bien-dong-so-du.csv" },
  });
}
