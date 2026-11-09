"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { syncManualChat, postManualChat, type ChatMsgDTO, type ChatFlags } from "@/lib/manual-chat";

/* Actions cho khung chat đơn Manual Services (đợt 2026-11-08).
 * Phân quyền: khách chỉ xem/gửi trên ĐƠN CỦA MÌNH; STAFF/ADMIN xem/gửi
 * trên mọi đơn manual (cùng một thread phía nhà cung cấp). */
type ChatResult =
  | { ok: true; flags: ChatFlags | null; messages: ChatMsgDTO[]; providerError?: string }
  | { ok: false; error: string };

async function authorize(orderId: number): Promise<{ error?: string }> {
  const me = await getCurrentUser();
  if (!me) return { error: "Bạn cần đăng nhập." };
  const order = await prisma.premiumOrder.findUnique({
    where: { id: orderId },
    select: { userId: true, variant: { select: { providerGroup: true } } },
  });
  if (!order || order.variant.providerGroup !== "manual") return { error: "Đơn này không có chat nhà cung cấp." };
  if (me.role === "USER" && order.userId !== me.id) return { error: "Bạn không có quyền xem đơn này." };
  return {};
}

export async function loadManualChatAction(orderId: number): Promise<ChatResult> {
  const a = await authorize(orderId);
  if (a.error) return { ok: false, error: a.error };
  try {
    const t = await syncManualChat(orderId);
    return { ok: true, flags: t.flags, messages: t.messages, providerError: t.providerError };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e).slice(0, 200) };
  }
}

export async function sendManualChatAction(orderId: number, body: string): Promise<{ ok: boolean; error?: string; message?: ChatMsgDTO }> {
  const a = await authorize(orderId);
  if (a.error) return { ok: false, error: a.error };
  const text = String(body || "").trim();
  if (!text) return { ok: false, error: "Tin nhắn trống." };
  if (text.length > 2000) return { ok: false, error: "Tin nhắn tối đa 2.000 ký tự." };
  try {
    const message = await postManualChat(orderId, text);
    return { ok: true, message };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e).slice(0, 200) };
  }
}
