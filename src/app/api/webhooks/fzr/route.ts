import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * Webhook FazerCards (theo docs reseller.fazercards.com/en/docs/webhooks):
 *  - Sự kiện: order.created + order.status_changed; trạng thái nằm trong
 *    data.status (pending/processing/completed/failed/refund/refunded/partial/cancelled).
 *  - Chữ ký: header X-Webhook-Signature = HMAC-SHA256 hex trên RAW body bằng
 *    webhook secret (Setting fzr_webhook_secret, admin nhập ở Cài đặt Telegram;
 *    Tín lấy từ panel FZR → Settings → Webhooks). Kiểm timing-safe TRƯỚC khi xử lý.
 *  - Mọi lượt giao đều được ghi ApiLog kind="fzr_webhook" (mẫu đối soát); chữ ký
 *    sai/thiếu → 401, KHÔNG đổi trạng thái nào. Hợp lệ → khử trùng theo webhook
 *    id, tìm đơn theo data.id = PremiumOrder.providerOrderId rồi áp trạng thái
 *    qua applyFzrOrderStatus — CÙNG hàm với cron poll, chuyển trạng thái chỉ đi
 *    tới (không bao giờ thụt lùi đơn đã kết thúc).
 * URL cấu hình phía FZR: https://smmv2-zeta.vercel.app/api/webhooks/fzr
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

export async function POST(req: NextRequest) {
  const raw = await req.text().catch(() => "");
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => { headers[k] = v.slice(0, 500); });

  let evt: any = null;
  try { evt = JSON.parse(raw); } catch { /* body không phải JSON — vẫn ghi mẫu, xử lý như không hợp lệ */ }
  const webhookId = String(evt?.id || headers["x-webhook-id"] || "");
  const eventType = String(evt?.type || headers["x-webhook-event"] || "");
  const data = evt?.data || {};
  const providerOrderId = String(data?.id || "");

  const settings = await getSettings().catch(() => null);
  const secret = (settings?.fzr_webhook_secret || "").trim();
  const signature = String(headers["x-webhook-signature"] || "");
  const signatureValid = !!secret && !!signature && safeEqual(hmacHex(secret, raw), signature.toLowerCase());

  const log = async (ok: boolean, processed: boolean, note: string) => {
    const detail = JSON.stringify({
      webhookId, event: eventType, valid: signatureValid, processed, note,
      providerOrderId, status: data?.status || null,
      headers, body: raw.slice(0, CAP), truncated: raw.length > CAP,
    }).slice(0, CAP);
    await prisma.apiLog.create({ data: { kind: "fzr_webhook", ref: webhookId.slice(0, 90) || "capture", ok, detail } }).catch(() => {});
  };

  if (!signatureValid) {
    await log(false, false, !secret ? "chưa cấu hình fzr_webhook_secret" : "chữ ký sai/thiếu");
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }

  // Khử trùng: cùng webhook id đã xử lý rồi -> ghi nhận trùng, không áp lại.
  if (webhookId) {
    const prior = await prisma.apiLog.findFirst({
      where: { kind: "fzr_webhook", ref: webhookId.slice(0, 90) },
      select: { detail: true },
    }).catch(() => null);
    if (prior && (prior.detail || "").includes('"processed":true')) {
      await log(true, false, "trùng webhook id — bỏ qua");
      return NextResponse.json({ ok: true, deduped: true });
    }
  }

  let processed = false;
  let note = "không khớp đơn nào";
  try {
    if (providerOrderId && (eventType === "order.status_changed" || eventType === "order.created")) {
      // providerOrderId của mình có thể chứa nhiều id cách nhau dấu phẩy (telegram premium nhiều lượt)
      const candidates = await prisma.premiumOrder.findMany({
        where: { providerOrderId: { contains: providerOrderId } },
        take: 5,
      });
      const order = candidates.find((o) => (o.providerOrderId || "").split(",").map((x) => x.trim()).includes(providerOrderId));
      if (order) {
        const { applyFzrOrderStatus } = await import("@/lib/fzr-orders");
        const { fzrOrderStatus } = await import("@/lib/fzr");
        const payload = data?.payload && typeof data.payload === "object" ? data.payload : data;
        const status = fzrOrderStatus({ ...payload, status: data?.status || payload?.status });
        await applyFzrOrderStatus(order as any, [status], [payload], { fromWebhook: true });
        processed = true;
        note = `đã áp trạng thái ${String(data?.status || "")} cho đơn ${order.code}`;
      }
    }
  } catch (e: any) {
    note = `lỗi xử lý: ${String(e?.message || e).slice(0, 200)}`;
  }
  await log(true, processed, note);
  return NextResponse.json({ ok: true, processed });
}
