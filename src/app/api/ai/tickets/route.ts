// KIT cho BNT Shop — chép vào src/app/api/ai/tickets/route.ts của repo bntshop.
// Tạo ticket THẬT vào đúng bảng Ticket + TicketMessage của web. Ticket bắt
// buộc có userId: HQ phải gửi kèm email tài khoản của khách (requester) để
// đối chiếu — không tìm thấy tài khoản thì trả 422, không tạo ticket mồ côi.
import { NextResponse } from "next/server";
import { aiAuthorized } from "@/lib/ai-knowledge";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/ai/tickets?status=OPEN — HQ đọc SỐNG các ticket đang mở kèm
// luồng tin nhắn để phòng CSKH soạn trả lời (chỉ đọc).
export async function GET(req: Request) {
  if (!aiAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const statusParam = new URL(req.url).searchParams.get("status") ?? "OPEN";
  const status = ["OPEN", "ANSWERED", "CLOSED"].includes(statusParam) ? statusParam : "OPEN";
  try {
    const rows = await prisma.ticket.findMany({
      where: { status: status as "OPEN" | "ANSWERED" | "CLOSED" },
      include: {
        user: { select: { email: true } },
        messages: { orderBy: { createdAt: "asc" }, take: 50 },
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
    });
    return NextResponse.json({
      tickets: rows.map((t) => ({
        id: String(t.id),
        subject: t.subject,
        status: t.status,
        requester: t.user?.email,
        createdAt: t.createdAt.toISOString(),
        messages: t.messages.map((m) => ({
          fromAdmin: m.fromAdmin,
          body: m.body,
          at: m.createdAt.toISOString(),
        })),
      })),
    });
  } catch {
    return NextResponse.json({ error: "Chưa đọc được dữ liệu của web" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  if (!aiAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const subject = String(body?.subject ?? "").trim();
  const content = String(body?.body ?? "").trim();
  const email = String(body?.requester ?? "").trim().toLowerCase();
  if (!subject || !content || !email) {
    return NextResponse.json(
      { error: "Cần subject, body và email tài khoản của khách", code: "MISSING_FIELDS" },
      { status: 422 },
    );
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json(
      { error: "Không tìm thấy tài khoản theo email người gửi", code: "USER_NOT_FOUND" },
      { status: 422 },
    );
  }
  const ticket = await prisma.ticket.create({
    data: {
      userId: user.id,
      subject: subject.slice(0, 200),
      category: "other",
      messages: { create: { fromAdmin: false, body: content } },
    },
  });
  return NextResponse.json({ ticketId: String(ticket.id), status: ticket.status });
}
