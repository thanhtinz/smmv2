import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPanelAccess } from "@/lib/panel-access";

export const dynamic = "force-dynamic";

const TX_LABEL: Record<string, string> = {
  DEPOSIT: "Nạp tiền", SMM_ORDER: "Đặt đơn SMM", PREMIUM_ORDER: "Mua Premium",
  REFUND: "Hoàn tiền", ADJUST: "Điều chỉnh", BONUS: "Thưởng nạp",
  PANEL_COMMISSION: "Hoa hồng panel", REFERRAL_COMMISSION: "Hoa hồng giới thiệu",
};

/** Xuất CSV biến động số dư của panel (chỉ chủ panel). */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const acc = await getPanelAccess(user.id);
  if (!acc || !acc.isOwner) return new NextResponse("Forbidden", { status: 403 });
  const panel = acc.panel;
  const q = req.nextUrl.searchParams.get("q") || "";
  const type = req.nextUrl.searchParams.get("type") || "";
  const where: any = { AND: [{ OR: [{ user: { panelId: panel.id } }, { userId: panel.ownerId, type: "PANEL_COMMISSION" }] }] };
  if (type) where.AND.push({ type });
  if (q) where.AND.push({ OR: [{ note: { contains: q } }, { ref: { contains: q } }, { user: { username: { contains: q } } }] });
  const rows = await prisma.transaction.findMany({ where, orderBy: { id: "desc" }, take: 5000, include: { user: true } });
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [["ID", "Nguoi dung", "Loai", "So tien", "So du truoc", "So du sau", "Mo ta", "Thoi gian"].join(",")];
  for (const t of rows) {
    lines.push([t.id, t.user.username, TX_LABEL[t.type] || t.type, t.amount, t.balanceAfter - t.amount, t.balanceAfter, esc(t.note || t.ref || ""), t.createdAt.toISOString()].join(","));
  }
  return new NextResponse("﻿" + lines.join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="bien-dong-panel-${panel.slug}.csv"` },
  });
}
