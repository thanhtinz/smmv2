import { createHash } from "crypto";
import type { PremiumOrder, Provider } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fzrManualChatGet, fzrManualChatPost, type FzrChatMessage } from "@/lib/fzr";

/* Chat đơn Manual Services <-> nhà cung cấp FZR (đợt 2026-11-08).
 * Nguồn sự thật hiển thị = bảng ManualChatMessage của web; mỗi lần mở
 * khung chat (hoặc bấm Làm mới) hệ thống GET thread từ NCC và hợp nhất
 * vào DB theo dedupeKey nên không nhân đôi. Tài liệu webhook (đối chiếu
 * lại 2026-11-09) CÓ hai sự kiện chat — manual_service.chat.message và
 * manual_service.chat.waiting_reply — webhook route nhận sự kiện rồi gọi
 * đúng syncManualChat ở đây để kéo tin về + báo khách, không chờ khách mở
 * khung chat; đường mở khung chat vẫn giữ làm dự phòng khi webhook lỡ.
 * Phân chiều: tin do web POST lên được lưu OUT ngay lúc gửi (khớp
 * dedupeKey khi GET về); tin lạ phía NCC phân theo sender thô: chứa
 * provider/seller/support -> IN (phía NCC), chứa customer/reseller/
 * buyer -> OUT (phía web), còn lại mặc định IN. */

export type ChatFlags = { frozen: boolean; opened: boolean; readOnly: boolean };
export type ChatMsgDTO = {
  id: number;
  direction: "OUT" | "IN";
  body: string | null;
  imageUrl: string | null;
  senderRaw: string | null;
  at: string; // ISO
};

const dedupeOf = (m: { sender: string; created_at: string | null; body: string | null; image_url: string | null }) =>
  createHash("sha256").update(`${m.sender}|${m.created_at || ""}|${m.body || ""}|${m.image_url || ""}`).digest("hex");

export function classifyDirection(senderRaw: string): "OUT" | "IN" {
  const x = (senderRaw || "").toLowerCase();
  if (/provider|seller|support|vendor|fazer|fzr/.test(x)) return "IN";
  if (/customer|reseller|buyer|client|user/.test(x)) return "OUT";
  return "IN";
}

type OrderWithVariant = PremiumOrder & { variant: { providerGroup: string | null; providerId: number | null } };

async function loadOrder(orderId: number): Promise<OrderWithVariant | null> {
  return prisma.premiumOrder.findUnique({
    where: { id: orderId },
    include: { variant: { select: { providerGroup: true, providerId: true } } },
  }) as Promise<OrderWithVariant | null>;
}

async function resolveProvider(order: OrderWithVariant): Promise<Provider | null> {
  const pid = order.providerId || order.variant.providerId;
  if (!pid) return null;
  const p = await prisma.provider.findUnique({ where: { id: pid } });
  return p && p.driver === "FZR" && p.active ? p : null;
}

async function storedMessages(orderId: number): Promise<ChatMsgDTO[]> {
  const rows = await prisma.manualChatMessage.findMany({ where: { orderId }, orderBy: [{ id: "asc" }], take: 500 });
  return rows.map((r) => ({
    id: r.id,
    direction: (r.direction === "OUT" ? "OUT" : "IN") as "OUT" | "IN",
    body: r.body,
    imageUrl: r.imageUrl,
    senderRaw: r.senderRaw,
    at: (r.providerTs ? new Date(r.providerTs) : r.createdAt).toISOString(),
  }));
}

/** Kéo thread mới nhất từ NCC, hợp nhất vào DB, trả về để hiển thị.
 *  newIn = số tin ĐẾN (phía NCC) mới xuất hiện trong lần kéo này — webhook
 *  chat dùng để quyết định có báo khách hay không. */
export async function syncManualChat(orderId: number): Promise<{ flags: ChatFlags | null; messages: ChatMsgDTO[]; providerError?: string; newIn?: number }> {
  const order = await loadOrder(orderId);
  if (!order) throw new Error("Không tìm thấy đơn");
  if (order.variant.providerGroup !== "manual") throw new Error("Đơn này không thuộc khu Manual Services");
  const provider = await resolveProvider(order);
  if (!provider || !order.providerOrderId) {
    return { flags: null, messages: await storedMessages(orderId), providerError: "Đơn chưa có mã đơn phía nhà cung cấp hoặc nhà cung cấp chưa sẵn sàng — chưa mở được chat." };
  }
  const beforeIds = new Set((await storedMessages(orderId)).map((m) => m.id));
  let thread;
  try {
    thread = await fzrManualChatGet(provider, order.providerOrderId);
  } catch (e: any) {
    return { flags: null, messages: await storedMessages(orderId), providerError: String(e?.message || e).slice(0, 200) };
  }
  for (const m of thread.messages) {
    const key = dedupeOf(m);
    const img = m.image_url || (Array.isArray(m.image_urls) && m.image_urls.length ? m.image_urls[0] : null);
    await prisma.manualChatMessage.upsert({
      where: { orderId_dedupeKey: { orderId, dedupeKey: key } },
      create: {
        orderId,
        direction: classifyDirection(String(m.sender ?? "")),
        senderRaw: m.sender ? String(m.sender).slice(0, 80) : null,
        body: m.body ?? null,
        imageUrl: img,
        providerTs: m.created_at ? String(m.created_at).slice(0, 40) : null,
        dedupeKey: key,
      },
      update: {}, // đã có (kể cả tin OUT do web gửi) -> giữ nguyên chiều đã lưu
    }).catch(() => {});
  }
  const after = await storedMessages(orderId);
  return {
    flags: { frozen: thread.chat_frozen, opened: thread.chat_opened, readOnly: thread.chat_read_only },
    messages: after,
    newIn: after.filter((m) => !beforeIds.has(m.id) && m.direction === "IN").length,
  };
}

/** Gửi 1 tin văn bản lên NCC và lưu OUT ngay (để lần GET sau khớp dedupe). */
export async function postManualChat(orderId: number, body: string): Promise<ChatMsgDTO> {
  const order = await loadOrder(orderId);
  if (!order) throw new Error("Không tìm thấy đơn");
  if (order.variant.providerGroup !== "manual") throw new Error("Đơn này không thuộc khu Manual Services");
  const provider = await resolveProvider(order);
  if (!provider || !order.providerOrderId) throw new Error("Đơn chưa có mã đơn phía nhà cung cấp — chưa gửi được tin nhắn.");
  const sent = await fzrManualChatPost(provider, order.providerOrderId, body);
  const key = dedupeOf(sent);
  const row = await prisma.manualChatMessage.upsert({
    where: { orderId_dedupeKey: { orderId, dedupeKey: key } },
    create: {
      orderId,
      direction: "OUT",
      senderRaw: sent.sender ? String(sent.sender).slice(0, 80) : null,
      body: sent.body ?? body,
      imageUrl: sent.image_url ?? null,
      providerTs: sent.created_at ? String(sent.created_at).slice(0, 40) : null,
      dedupeKey: key,
    },
    update: {},
  });
  return {
    id: row.id,
    direction: "OUT",
    body: row.body,
    imageUrl: row.imageUrl,
    senderRaw: row.senderRaw,
    at: (row.providerTs ? new Date(row.providerTs) : row.createdAt).toISOString(),
  };
}
