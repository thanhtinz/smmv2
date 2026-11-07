import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { clientIp } from "@/lib/rate-limit";

/** Xoá 1 passkey của chính người đang đăng nhập (không xoá được của người khác). */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Bạn cần đăng nhập để xoá passkey" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "Passkey không hợp lệ" }, { status: 400 });
  }
  const passkey = await prisma.userPasskey.findFirst({
    where: { id, userId: user.id },
    select: { id: true, deviceName: true },
  });
  if (!passkey) {
    return NextResponse.json({ ok: false, error: "Không tìm thấy passkey" }, { status: 404 });
  }
  await prisma.userPasskey.delete({ where: { id: passkey.id } });
  await writeAudit({
    actorId: user.id,
    actorName: user.username,
    role: user.role,
    scope: user.panelId ? "panel" : "mother",
    panelId: user.panelId ?? null,
    action: "passkey.remove",
    targetType: "UserPasskey",
    targetId: passkey.id,
    detail: `Xoá passkey "${passkey.deviceName}"`,
    ip: clientIp(req.headers),
  });
  return NextResponse.json({ ok: true });
}
