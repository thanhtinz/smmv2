import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { pollBoltutilDeposit, parseBoltData } from "@/lib/boltutil";

export const dynamic = "force-dynamic";

/** Trạng thái phiên nạp BoltUtil cho chính khách (trang nạp tiền tự hỏi mỗi
 *  10 giây): nếu còn PENDING và lần hỏi cổng trước đã quá 10 giây thì hỏi thẳng
 *  BoltUtil + đối soát ngay — khách thấy tiền cộng mà không cần webhook. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const code = req.nextUrl.searchParams.get("code") || "";
  const dep = await prisma.deposit.findFirst({ where: { code, userId: session.id, method: "USDT" } });
  if (!dep) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (dep.status === "PENDING") {
    const data = parseBoltData(dep);
    const last = Number(data.lastCheck || 0);
    if (Date.now() - last > 10000) {
      await prisma.deposit.update({ where: { id: dep.id }, data: { providerData: JSON.stringify({ ...data, lastCheck: Date.now() }) } }).catch(() => {});
      await pollBoltutilDeposit(dep.id).catch(() => {});
    }
  }
  const fresh = await prisma.deposit.findUnique({ where: { id: dep.id }, select: { status: true, amount: true, bonus: true } });
  return NextResponse.json({ ok: true, status: fresh?.status, amount: fresh?.amount, bonus: fresh?.bonus });
}
