import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * Webhook FazerCards — bám đúng tài liệu (reseller.fazercards.com/en/docs/
 * webhooks + cookbook, đối chiếu lại 2026-11-09):
 *  - Envelope JSON: { event, event_id, timestamp, data }. Sự kiện:
 *    order.created, order.status_changed, manual_service.chat.message,
 *    manual_service.chat.waiting_reply; endpoint test bắn webhook.test.
 *  - data của sự kiện đơn: { order_id, type, status, previous_status } —
 *    body CỐ Ý không mang nội dung giao; khi đơn completed phải lấy nội
 *    dung bằng GET /orders/{order_id} (hàm này làm đúng như vậy).
 *  - Chữ ký: header X-Webhook-Signature = "sha256=" + HMAC-SHA256 hex trên
 *    RAW body bằng webhook secret (Setting fzr_webhook_secret, admin nhập ở
 *    form nhà cung cấp FZR). Kiểm timing-safe TRƯỚC khi xử lý; chữ ký
 *    sai/thiếu → 401, KHÔNG đổi trạng thái nào.
 *  - Lượt giao lỗi được FZR thử lại sau 1, 5, 30 phút với CÙNG event_id —
 *    khử trùng theo event_id (bản ghi ApiLog cũ có "processed":true).
 *  - Sự kiện chat: kéo thread mới nhất từ NCC qua cùng đường hợp nhất của
 *    khung chat (syncManualChat) + thông báo cho khách khi có tin mới.
 * URL cấu hình phía FZR: https://<domain>/api/webhooks/fzr
 */
const CAP = 64 * 1024;

function hmacHex(secret: string, raw: string): string {
  return createHmac("sha256", secret).update(raw, "utf8").digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

async function findOrderByProviderId(providerOrderId: string) {
  if (!providerOrderId) return null;
  const candidates = await prisma.premiumOrder.findMany({
    where: { providerOrderId: { contains: providerOrderId } },
    take: 5,
  });
  return candidates.find((o) => (o.providerOrderId || "").split(",").map((x) => x.trim()).includes(providerOrderId)) || null;
}

export async function POST(req: NextRequest) {
  const raw = await req.text().catch(() => "");
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => { headers[k] = v.slice(0, 500); });

  let evt: any = null;
  try { evt = JSON.parse(raw); } catch { /* body không phải JSON — vẫn ghi mẫu, xử lý như không hợp lệ */ }
  // Envelope theo tài liệu: event / event_id / data.order_id. Các tên cũ
  // (type / id / data.id, header x-webhook-*) chỉ là fallback phòng thủ.
  const eventId = String(evt?.event_id || evt?.id || headers["x-webhook-id"] || "");
  const eventType = String(evt?.event || evt?.type || headers["x-webhook-event"] || "");
  const data = evt?.data || {};
  const providerOrderId = String(data?.order_id || data?.id || "");

  const settings = await getSettings().catch(() => null);
  const secret = (settings?.fzr_webhook_secret || "").trim();
  // Tài liệu: giá trị header có tiền tố "sha256=" trước hex HMAC.
  const signature = String(headers["x-webhook-signature"] || "").trim().toLowerCase().replace(/^sha256=/, "");
  const signatureValid = !!secret && !!signature && safeEqual(hmacHex(secret, raw), signature);

  const log = async (ok: boolean, processed: boolean, note: string) => {
    const detail = JSON.stringify({
      eventId, event: eventType, valid: signatureValid, processed, note,
      providerOrderId, status: data?.status || null,
      headers, body: raw.slice(0, CAP), truncated: raw.length > CAP,
    }).slice(0, CAP);
    await prisma.apiLog.create({ data: { kind: "fzr_webhook", ref: eventId.slice(0, 90) || "capture", ok, detail } }).catch(() => {});
  };

  if (!signatureValid) {
    await log(false, false, !secret ? "chưa cấu hình fzr_webhook_secret" : "chữ ký sai/thiếu");
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }

  // Khử trùng theo event_id: FZR thử lại lượt giao lỗi với CÙNG event_id.
  if (eventId) {
    const prior = await prisma.apiLog.findFirst({
      where: { kind: "fzr_webhook", ref: eventId.slice(0, 90) },
      select: { detail: true },
    }).catch(() => null);
    if (prior && (prior.detail || "").includes('"processed":true')) {
      await log(true, false, "trùng event_id — bỏ qua");
      return NextResponse.json({ ok: true, deduped: true });
    }
  }

  let processed = false;
  let note = "không khớp đơn nào";
  try {
    if (eventType === "webhook.test") {
      // Sự kiện thử từ POST /account/webhook/test — chỉ xác nhận đã nhận.
      processed = true;
      note = "webhook.test — đã nhận, không đổi trạng thái";
    } else if (providerOrderId && (eventType === "order.status_changed" || eventType === "order.created")) {
      const order = await findOrderByProviderId(providerOrderId);
      if (order) {
        const { applyFzrOrderStatus } = await import("@/lib/fzr-orders");
        const { fzrOrderStatus, fzrGetOrder } = await import("@/lib/fzr");
        // Tài liệu: body webhook không mang nội dung giao — lấy chi tiết
        // đơn (trạng thái + nội dung giao THẬT) bằng GET /orders/{id} cho
        // TỪNG id của đơn. Lấy không được thì vẫn áp trạng thái từ sự kiện
        // nhưng cấm đổ JSON envelope vào nội dung giao của khách.
        let applied = false;
        const provider = order.providerId ? await prisma.provider.findUnique({ where: { id: order.providerId } }).catch(() => null) : null;
        if (provider && provider.driver === "FZR") {
          try {
            const ids = (order.providerOrderId || "").split(",").map((x) => x.trim()).filter(Boolean);
            const raws: any[] = [];
            const statuses: string[] = [];
            for (const pid of ids) {
              const detail = await fzrGetOrder(provider as any, pid);
              raws.push(detail);
              statuses.push(fzrOrderStatus(detail));
            }
            if (ids.length) {
              await applyFzrOrderStatus(order as any, statuses, raws, { fromWebhook: true });
              applied = true;
            }
          } catch { /* rơi xuống đường áp trạng thái từ sự kiện */ }
        }
        if (!applied) {
          const status = fzrOrderStatus({ status: data?.status });
          await applyFzrOrderStatus(order as any, [status], [{ id: providerOrderId, status: data?.status }], { fromWebhook: true, allowRawDelivery: false });
        }
        processed = true;
        note = `đã áp trạng thái ${String(data?.status || "")} cho đơn ${order.code}`;
      }
    } else if (providerOrderId && (eventType === "manual_service.chat.message" || eventType === "manual_service.chat.waiting_reply")) {
      const order = await findOrderByProviderId(providerOrderId);
      if (order) {
        const { syncManualChat } = await import("@/lib/manual-chat");
        const { notifyUser } = await import("@/lib/notify");
        const res = await syncManualChat(order.id);
        processed = true;
        if (eventType === "manual_service.chat.message" && (res.newIn || 0) > 0) {
          await notifyUser(order.userId, "Tin nhắn mới cho đơn dịch vụ thủ công", `Đơn ${order.code}: nhà cung cấp vừa nhắn — mở lịch sử đơn để xem và trả lời`, "/dashboard/manual-services/don-hang").catch(() => {});
          note = `chat: ${res.newIn} tin mới từ NCC cho đơn ${order.code}, đã báo khách`;
        } else if (eventType === "manual_service.chat.waiting_reply") {
          await notifyUser(order.userId, "Nhà cung cấp đang chờ phản hồi", `Đơn ${order.code}: nhà cung cấp đang chờ bạn trả lời trong khung chat của đơn`, "/dashboard/manual-services/don-hang").catch(() => {});
          note = `chat: NCC chờ phản hồi ở đơn ${order.code}, đã báo khách`;
        } else {
          note = `chat: đã đồng bộ thread đơn ${order.code} (không có tin đến mới)`;
        }
      }
    }
  } catch (e: any) {
    note = `lỗi xử lý: ${String(e?.message || e).slice(0, 200)}`;
  }
  await log(true, processed, note);
  return NextResponse.json({ ok: true, processed });
}
