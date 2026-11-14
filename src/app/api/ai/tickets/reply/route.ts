// Đấu nối BNT AI Company — POST /api/ai/tickets/reply { ticketId, body }.
// Ghi MỘT câu trả lời của nhân viên vào đúng luồng Ticket có sẵn (tin nhắn
// fromAdmin) và chuyển ticket sang ANSWERED. Đây là thao tác ghi thứ hai
// của hợp đồng /api/ai — HQ chỉ gọi sau khi việc trả lời đã qua cấp duyệt.
import { NextResponse } from "next/server";
import { aiAuthorized } from "@/lib/ai-knowledge";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!aiAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const ticketId = Number(body?.ticketId);
  const content = String(body?.body ?? "").trim();
  if (!Number.isInteger(ticketId) || ticketId <= 0 || !content) {
    return NextResponse.json(
      { error: "Cần ticketId hợp lệ và body", code: "MISSING_FIELDS" },
      { status: 422 },
    );
  }
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) {
    return NextResponse.json(
      { error: "Không tìm thấy ticket", code: "TICKET_NOT_FOUND" },
      { status: 404 },
    );
  }
  if (ticket.status === "CLOSED") {
    return NextResponse.json(
      { error: "Ticket đã đóng, không trả lời thêm được", code: "TICKET_CLOSED" },
      { status: 422 },
    );
  }
  await prisma.ticketMessage.create({
    data: { ticketId, fromAdmin: true, body: content.slice(0, 4000) },
  });
  const updated = await prisma.ticket.update({
    where: { id: ticketId },
    data: { status: "ANSWERED" },
  });
  return NextResponse.json({ ticketId: String(updated.id), status: updated.status });
}
