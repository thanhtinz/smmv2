"use server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser, getSession, destroySession } from "@/lib/auth";

function back(key: "msg" | "err", text: string): never {
  redirect(`/dashboard/ho-so?tab=security&${key}=${encodeURIComponent(text)}`);
}

/** Đăng xuất một phiên khác của chính mình (đăng xuất từ xa từng thiết bị) */
export async function revokeSessionAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = parseInt(String(formData.get("id") || "0"));
  if (!id) back("err", "Phiên không hợp lệ");
  const sess = await prisma.userSession.findFirst({ where: { id, userId: user.id } });
  if (!sess) back("err", "Không tìm thấy phiên đăng nhập");
  const cur = await getSession();
  if (cur?.sid && sess.sid === cur.sid) {
    // Bấm nhầm vào phiên hiện tại -> coi như đăng xuất thiết bị này
    await destroySession();
    redirect("/");
  }
  await prisma.userSession.update({ where: { id: sess.id }, data: { revokedAt: new Date() } });
  back("msg", "Đã đăng xuất thiết bị đó");
}

/** Đăng xuất mọi thiết bị khác, giữ phiên hiện tại */
export async function revokeOtherSessionsAction() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const cur = await getSession();
  await prisma.userSession.updateMany({
    where: { userId: user.id, revokedAt: null, ...(cur?.sid ? { sid: { not: cur.sid } } : {}) },
    data: { revokedAt: new Date() },
  });
  back("msg", "Đã đăng xuất tất cả thiết bị khác");
}
