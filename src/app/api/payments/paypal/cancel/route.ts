import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { failDeposit } from "@/lib/payments";

export const dynamic = "force-dynamic";

/** Khách bấm huỷ tại PayPal: đóng phiên nạp đang chờ */
export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get("token") || "";
  if (orderId) {
    // Chỉ CHÍNH CHỦ yêu cầu nạp (đang đăng nhập) mới huỷ được phiên của mình —
    // link/token lọt ra ngoài không được phép ép huỷ nạp của người khác.
    const { getCurrentUser } = await import("@/lib/auth");
    const me = await getCurrentUser().catch(() => null);
    const dep = await prisma.deposit.findUnique({ where: { externalId: orderId }, select: { id: true, userId: true } });
    if (dep && me && dep.userId === me.id) await failDeposit(dep.id, "Người dùng huỷ tại PayPal");
  }
  return NextResponse.redirect(new URL(`/dashboard/nap-tien?err=${encodeURIComponent("Đã huỷ thanh toán PayPal")}`, req.nextUrl.origin));
}
