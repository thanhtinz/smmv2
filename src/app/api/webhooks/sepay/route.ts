import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { applyBalance } from "@/lib/wallet";
import { getSettings, calcBonus, bonusTiersFor } from "@/lib/settings";
import { genCode } from "@/lib/format";

/**
 * Webhook cộng tiền tự động — tương thích SePay (và mọi hệ thống bắn JSON tương tự).
 * Bảo mật: header Authorization: Apikey <secret> (chỉ nhận qua header).
 * Secret của WEB MẸ (cấu hình ở Admin, lưu DB; env SEPAY_WEBHOOK_SECRET chỉ là dự phòng).
 * Nhận diện khách bằng nội dung CK chứa mã nạp (depositCode, vd "SMM AB12CD").
 * Chống cộng trùng: mỗi giao dịch được claim nguyên tử ở WebhookReceipt.ref (unique) trong cùng transaction cộng tiền.
 */
export const dynamic = "force-dynamic";

// Lease của claim receipt PUR:<txId> (full-audit 3d1309c P2-03): claim
// quá 10 phút mà phiên chưa chốt được coi là MỒ CÔI (process bị kill sau
// khi tạo receipt, trước settle — catch nhả receipt không chạy được khi
// bị kill) và được một lượt retry tiếp quản bằng CAS. Cùng họ lease 10
// phút với PURCHASE_STALE_MS của lib/purchase.
const PURCHASE_RECEIPT_LEASE_MS = 10 * 60 * 1000;

export async function POST(req: NextRequest) {
  const settings = await getSettings();
  const motherSecret = settings.sepay_secret || process.env.SEPAY_WEBHOOK_SECRET || "";
  const auth = req.headers.get("authorization") || "";
  const presented = auth.startsWith("Apikey ") ? auth.slice(7) : ""; // chỉ nhận qua header (query sẽ lọt vào access log)
  // Fail-closed: secret của web mẹ không khớp là từ chối —
  // không bao giờ mở khi chưa cấu hình secret nào (tránh bị bắn giao dịch giả cộng tiền).
  let authorized = false;
  if (motherSecret && presented) {
    const { timingSafeEqual } = await import("crypto");
    const a = Buffer.from(presented);
    const b = Buffer.from(motherSecret);
    if (a.length === b.length && timingSafeEqual(a, b)) authorized = true;
  }
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // P3-02 (full-audit 6750109): đọc body có cap byte cứng rồi mới parse.
  const { readBodyCapped } = await import("@/lib/http-body");
  const rawBody = await readBodyCapped(req);
  if (rawBody === null) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  let body: any = null;
  try { body = JSON.parse(rawBody); } catch { body = null; }
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const content: string = body.content || body.description || body.transferContent || "";
  const amount: number = Number(body.transferAmount || body.amount || 0);
  const txId: string = String(body.id || body.referenceCode || body.transactionId || "");
  const gateway: string = String(body.gateway || "");
  const isMomo = /momo/i.test(gateway); // cả ngân hàng và MoMo đều đối soát qua SePay, chỉ khác kênh ghi sổ
  const type: string = String(body.transferType || "in");
  if (type !== "in" || !amount || amount <= 0) return NextResponse.json({ success: true, skipped: "not a credit" });
  // Bắt buộc có id giao dịch: chống cộng trùng dựa vào nó (claim nguyên tử bên dưới)
  if (!txId) return NextResponse.json({ success: true, skipped: "missing tx id" });

  // Thanh toán TRỰC TIẾP mua giỏ hàng: nội dung chứa mã phiên MUAxxxxxx ->
  // xử lý như một PurchasePayment (thực thi đơn), KHÔNG cộng ví như nạp thường.
  // Tra phiên ở MỌI trạng thái: webhook bắn TRÙNG sau khi phiên đã EXECUTED
  // vẫn phải bị chặn tại đây (claim PUR:<txId>), tuyệt đối không rơi xuống
  // nhánh khớp mã nạp ví bên dưới.
  {
    const normP = content.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const windows9 = new Set<string>();
    for (let i = 0; i + 9 <= normP.length; i++) windows9.add(normP.slice(i, i + 9));
    const purchases = windows9.size ? await prisma.purchasePayment.findMany({
      where: { code: { in: Array.from(windows9) } },
      select: { id: true, code: true, status: true },
    }) : [];
    const hit = purchases.find((p) => normP.includes(p.code.toUpperCase()));
    if (hit) {
      const receiptRef = `PUR:${txId}`;
      let claimed = false;
      try {
        await prisma.webhookReceipt.create({ data: { ref: receiptRef } });
        claimed = true;
      } catch {
        // Trùng claim: hoặc lượt gốc còn đang chạy (claim tươi -> chặn
        // như cũ), hoặc claim MỒ CÔI quá lease + phiên chưa chốt -> CAS
        // làm mới createdAt để tiếp quản; chỉ một lượt retry thắng CAS.
        const oldReceipt = await prisma.webhookReceipt.findUnique({ where: { ref: receiptRef } });
        const settleable = hit.status === "PENDING" || hit.status === "EXPIRED" || hit.status === "PROCESSING";
        if (oldReceipt && settleable && Date.now() - oldReceipt.createdAt.getTime() > PURCHASE_RECEIPT_LEASE_MS) {
          const cas = await prisma.webhookReceipt.updateMany({
            where: { ref: receiptRef, createdAt: oldReceipt.createdAt },
            data: { createdAt: new Date() },
          });
          if (cas.count === 1) {
            claimed = true;
            await prisma.apiLog.create({ data: { kind: "webhook", ref: txId, ok: true, detail: `purchase=${hit.code} tiếp quản receipt mồ côi (claim cũ ${Math.round((Date.now() - oldReceipt.createdAt.getTime()) / 60000)} phút)` } }).catch(() => {});
          }
        }
      }
      if (!claimed) {
        return NextResponse.json({ success: true, skipped: "duplicate purchase tx" });
      }
      // PROCESSING cũng phải tới được settle (P2-01 audit đợt 2): settle tự
      // phân biệt "đang chạy khoẻ" (trả processing, không đụng vào) với
      // "kẹt quá lease" (tiếp quản chạy tiếp) — chặn ở đây thì phiên chết
      // giữa chừng không bao giờ được SePay retry cứu. Chỉ trạng thái đã
      // CHỐT (EXECUTED/FAILED) mới dừng tại đây.
      if (hit.status !== "PENDING" && hit.status !== "EXPIRED" && hit.status !== "PROCESSING") {
        return NextResponse.json({ success: true, skipped: "purchase already settled" });
      }
      let r;
      try {
        const { settlePurchasePayment } = await import("@/lib/purchase");
        r = await settlePurchasePayment(hit.id, { paidVnd: amount, paidTxRef: txId, finalIfUnderpaid: "wait" });
      } catch (e) {
        // P2-01 (audit đợt 2): lỗi TẠM THỜI lúc thực thi (DB timeout, lỗi
        // hạ tầng) không được giữ claim — NHẢ receipt + trả 500 để SePay
        // gửi lại cùng txId và settlement chạy lại từ đầu. Trước bản vá,
        // receipt PUR:<txId> kẹt vĩnh viễn: khách đã chuyển tiền nhưng
        // mọi lần SePay retry đều bị chặn ở "duplicate purchase tx".
        await prisma.webhookReceipt.delete({ where: { ref: `PUR:${txId}` } }).catch(() => {});
        await prisma.apiLog.create({ data: { kind: "webhook", ref: txId, ok: false, detail: `purchase=${hit.code} settle lỗi tạm thời: ${String((e as any)?.message || e).slice(0, 160)}` } }).catch(() => {});
        return NextResponse.json({ success: false, error: "temporary failure, retry" }, { status: 500 });
      }
      await prisma.apiLog.create({ data: { kind: "webhook", ref: txId, ok: r.ok, detail: `purchase=${hit.code} amount=${amount} -> ${r.reason}` } });
      return NextResponse.json({ success: true, purchase: hit.code, result: r.reason });
    }
  }

  // Tìm mã nạp trong nội dung bằng truy vấn theo index: sinh mọi cửa sổ 6 ký tự
  // của nội dung đã chuẩn hoá rồi tra depositCode trong số đó (không nạp toàn bộ user vào RAM)
  const norm = content.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const windows = new Set<string>();
  for (let i = 0; i + 6 <= norm.length; i++) windows.add(norm.slice(i, i + 6));
  const candidates = await prisma.user.findMany({
    where: { depositCode: { in: Array.from(windows) } },
    select: { id: true, depositCode: true },
  });
  const matched = candidates.find((u) => norm.includes(u.depositCode.toUpperCase()));
  if (!matched) {
    await prisma.apiLog.create({ data: { kind: "webhook", ref: txId || "no-id", ok: false, detail: `Không khớp mã nạp. content=${content} amount=${amount}` } });
    return NextResponse.json({ success: true, skipped: "user not matched" });
  }

  const bonus = calcBonus(amount, bonusTiersFor(null, false, settings.deposit_bonus_tiers));
  let dep;
  try {
    dep = await prisma.$transaction(async (tx) => {
    // Claim giao dịch TRƯỚC trong cùng transaction: ref unique -> webhook trùng
    // (dù đến đồng thời) sẽ văng lỗi và bị bỏ qua, không cộng tiền lần hai.
    await tx.webhookReceipt.create({ data: { ref: txId } });
    const d = await tx.deposit.create({
      data: { code: "TMP", userId: matched.id, method: isMomo ? "MOMO" : "BANK", amount, bonus, status: "APPROVED", content, auto: true },
    });
    const code = genCode("NAP", d.id);
    await tx.deposit.update({ where: { id: d.id }, data: { code } });
    await applyBalance(tx, matched.id, amount, "DEPOSIT", code, isMomo ? "Nạp tiền tự động qua SePay (MoMo)" : "Nạp tiền tự động qua SePay");
    if (bonus > 0) await applyBalance(tx, matched.id, bonus, "BONUS", code, "Thưởng nạp tiền");
    return { ...d, code };
    });
  } catch {
    return NextResponse.json({ success: true, skipped: "duplicate" });
  }
  await prisma.apiLog.create({ data: { kind: "webhook", ref: txId || dep.code, detail: `user=${matched.id} amount=${amount} bonus=${bonus} deposit=${dep.code}` } });
  const { alertMother } = await import("@/lib/alerts");
  await alertMother("deposit_success", "Nạp tiền thành công", `+${amount.toLocaleString("vi-VN")}đ${bonus > 0 ? ` (+${bonus.toLocaleString("vi-VN")}đ thưởng)` : ""} — khách #${matched.id}, mã ${dep.code}`);
  // Đợt 119: mail nạp tiền thành công cho khách (SePay cộng tự động).
  const { sendCustomerMail } = await import("@/lib/customer-mail");
  const { vnd } = await import("@/lib/format");
  const freshUser = await prisma.user.findUnique({ where: { id: matched.id }, select: { balance: true } }).catch(() => null);
  void sendCustomerMail(matched.id, "deposit_success", {
    deposit_code: dep.code, amount: vnd(amount), bonus: vnd(bonus), balance: vnd(freshUser?.balance ?? 0),
  });
  return NextResponse.json({ success: true, deposit: dep.code });
}
