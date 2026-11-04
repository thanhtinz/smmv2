import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { failDeposit } from "@/lib/payments";

export const dynamic = "force-dynamic";

/** Khách bấm huỷ tại PayPal: đóng phiên nạp đang chờ */
export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get("token") || "";
  if (orderId) {
    const dep = await prisma.deposit.findUnique({ where: { externalId: orderId }, select: { id: true } });
    if (dep) await failDeposit(dep.id, "Người dùng huỷ tại PayPal");
  }
  return NextResponse.redirect(new URL(`/dashboard/nap-tien?err=${encodeURIComponent("Đã huỷ thanh toán PayPal")}`, req.nextUrl.origin));
}
