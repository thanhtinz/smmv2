import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getBoltConfig, boltVerifySignature, settleBoltutilDeposit, parseBoltData } from "@/lib/boltutil";

export const dynamic = "force-dynamic";

/**
 * Webhook BoltUtil: POST JSON phẳng kèm header theo tài liệu
 * X-Bolt-Webhook-Timestamp + X-Bolt-Webhook-Signature (HMAC-SHA256 bằng
 * webhook secret trên "<ts>.<raw body>", lệch tối đa 5 phút; vẫn chấp nhận
 * cặp header X-Bolt-Timestamp/X-Bolt-Signature kiểu request để tương
 * thích). Payload có eventId — dedupe bền vững bằng WebhookReceipt
 * (ref "bolt:<eventId>") TRƯỚC khi xử lý; cộng tiền vẫn qua
 * settleBoltutilDeposit với claim nguyên tử nên trùng lặp ở mọi lớp đều
 * chỉ cộng 1 lần. Mọi HTTP 2xx được BoltUtil coi là đã nhận.
 * URL cấu hình phía BoltUtil: <Liên kết web đã cấu hình>/api/webhooks/boltutil
 * (giá trị cụ thể hiện sẵn tại Admin → Cấu hình nạp tiền).
 */
const CAP = 64 * 1024;

export async function POST(req: NextRequest) {
  const raw = await req.text().catch(() => "");
  const cfg = await getBoltConfig().catch(() => null);
  const ts = req.headers.get("x-bolt-webhook-timestamp") || req.headers.get("x-bolt-timestamp") || "";
  const sig = req.headers.get("x-bolt-webhook-signature") || req.headers.get("x-bolt-signature") || "";
  const valid = !!cfg && boltVerifySignature(cfg.webhookSecret, ts, raw, sig);

  let payload: any = null;
  try { payload = JSON.parse(raw); } catch { /* body hỏng — vẫn ghi mẫu */ }
  const externalOrderId = String(payload?.externalOrderId || "");

  const log = (ok: boolean, processed: boolean, note: string) =>
    prisma.apiLog.create({
      data: {
        kind: "bolt_webhook", ref: externalOrderId.slice(0, 90) || "capture", ok,
        detail: JSON.stringify({ valid, processed, note, status: payload?.status || null, body: raw.slice(0, CAP) }).slice(0, CAP),
      },
    }).catch(() => {});

  if (!valid) {
    await log(false, false, !cfg?.webhookSecret ? "chưa cấu hình boltutil_webhook_secret" : "chữ ký sai/hết hạn");
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }

  // Dedupe theo eventId (tài liệu: lưu bền vững + dedupe theo eventId).
  const eventId = String(payload?.eventId || "");
  if (eventId) {
    try {
      await prisma.webhookReceipt.create({ data: { ref: `bolt:${eventId}`.slice(0, 120) } });
    } catch {
      await log(true, false, `eventId trùng ${eventId} — bỏ qua`);
      return NextResponse.json({ ok: true, duplicate: true });
    }
  }

  let processed = false;
  let note = "không khớp yêu cầu nạp nào";
  // P2-01 (audit 2026-11-13): lỗi TẠM THỜI (exception khi settle, hoặc phiên
  // mua đang PROCESSING ở luồng khác) phải được xử lý lại — nhả claim
  // WebhookReceipt và trả HTTP 500 để BoltUtil gửi lại event này. Kết quả
  // CUỐI (không khớp phiên nào / trạng thái chưa chốt / đã cộng tiền) vẫn
  // giữ receipt + 200 như cũ: sự kiện cuối tiếp theo mang eventId mới.
  let retryable = false;
  try {
    if (externalOrderId) {
      const dep = await prisma.deposit.findUnique({ where: { externalId: `bolt:${externalOrderId}` } });
      if (dep) {
        void parseBoltData(dep);
        const r = await settleBoltutilDeposit(dep.id, payload);
        processed = r.ok;
        note = `${dep.code}: ${r.reason}`;
      } else {
        // Không phải phiên nạp -> có thể là thanh toán trực tiếp mua giỏ hàng
        const pp = await prisma.purchasePayment.findUnique({ where: { providerRef: `bolt:${externalOrderId}` } });
        if (pp) {
          const { settleBoltPurchase } = await import("@/lib/purchase");
          const r = await settleBoltPurchase(pp.id, payload);
          processed = r.ok;
          note = `purchase ${pp.code}: ${r.reason}`;
          if (!r.ok && r.reason === "processing") retryable = true;
        }
      }
    }
  } catch (e: any) {
    note = `lỗi xử lý: ${String(e?.message || e).slice(0, 200)}`;
    retryable = true;
  }
  if (retryable) {
    if (eventId) await prisma.webhookReceipt.delete({ where: { ref: `bolt:${eventId}`.slice(0, 120) } }).catch(() => {});
    await log(false, false, `${note} — nhả receipt, trả 500 để BoltUtil gửi lại`);
    return NextResponse.json({ ok: false, error: "processing failed, retry" }, { status: 500 });
  }
  await log(true, processed, note);
  return NextResponse.json({ ok: true, processed });
}
