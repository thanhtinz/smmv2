import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getBoltConfig, boltVerifySignature, settleBoltutilDeposit, parseBoltData } from "@/lib/boltutil";

export const dynamic = "force-dynamic";

/**
 * Webhook BoltUtil: POST JSON kèm X-Bolt-Timestamp + X-Bolt-Signature
 * (HMAC-SHA256 bằng webhook secret trên "<ts>.<raw body>", lệch tối đa 5 phút).
 * Chữ ký sai -> 401 + ghi mẫu, không đổi trạng thái. Hợp lệ -> đối soát qua
 * settleBoltutilDeposit (claim nguyên tử nên webhook giao trùng cũng chỉ cộng
 * 1 lần). BoltUtil KHÔNG tự gửi lại webhook — cron poll là đường dự phòng.
 * URL cấu hình phía BoltUtil: https://smmv2-zeta.vercel.app/api/webhooks/boltutil
 */
const CAP = 64 * 1024;

export async function POST(req: NextRequest) {
  const raw = await req.text().catch(() => "");
  const cfg = await getBoltConfig().catch(() => null);
  const ts = req.headers.get("x-bolt-timestamp") || "";
  const sig = req.headers.get("x-bolt-signature") || "";
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

  let processed = false;
  let note = "không khớp yêu cầu nạp nào";
  try {
    if (externalOrderId) {
      const dep = await prisma.deposit.findUnique({ where: { externalId: `bolt:${externalOrderId}` } });
      if (dep) {
        void parseBoltData(dep);
        const r = await settleBoltutilDeposit(dep.id, payload);
        processed = r.ok;
        note = `${dep.code}: ${r.reason}`;
      }
    }
  } catch (e: any) {
    note = `lỗi xử lý: ${String(e?.message || e).slice(0, 200)}`;
  }
  await log(true, processed, note);
  return NextResponse.json({ ok: true, processed });
}
