import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Trạng thái chờ cộng tiền của panel QR ngân hàng (trang nạp tiền tự hỏi mỗi
 *  3 GIÂY — đúng nhịp polling trong mẫu chính thức của SePay, trang tài liệu
 *  "Tạo trang QR thanh toán", developer.sepay.vn).
 *  Cách khớp: deposit BANK đã APPROVED của CHÍNH khách (nội dung CK là riêng
 *  theo từng khách nên userId + amount là đủ định danh), đúng số tiền khách
 *  đã xác nhận. Lần gọi đầu (không có afterId) trả latestId = id của deposit
 *  khớp mới nhất — panel lấy đó làm mốc; các lần sau paid=true khi có deposit
 *  khớp với id LỚN HƠN mốc (tức tiền mới về sau khi panel hiện). Dùng id tăng
 *  dần thay cho mốc thời gian để không lệ thuộc lệch đồng hồ máy khách/server.
 *  Route này CHỈ ĐỌC để hiển thị trạng thái — cộng tiền thật vẫn do webhook
 *  SePay xử lý như cũ. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const amount = parseInt(req.nextUrl.searchParams.get("amount") || "0", 10) || 0;
  if (!amount) return NextResponse.json({ ok: true, paid: false, latestId: 0 });
  const latest = await prisma.deposit.findFirst({
    where: { userId: session.id, method: "BANK", status: "APPROVED", amount },
    orderBy: { id: "desc" },
    select: { id: true },
  });
  const latestId = latest?.id || 0;
  const afterId = parseInt(req.nextUrl.searchParams.get("afterId") || "", 10);
  const paid = Number.isFinite(afterId) && latestId > afterId;
  return NextResponse.json({ ok: true, paid, latestId });
}
