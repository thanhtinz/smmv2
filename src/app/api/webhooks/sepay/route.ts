import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { applyBalance } from "@/lib/wallet";
import { getSettings, calcBonus, bonusTiersFor } from "@/lib/settings";
import { genCode } from "@/lib/format";

/**
 * Webhook cộng tiền tự động — tương thích SePay (và mọi hệ thống bắn JSON tương tự).
 * Bảo mật: header Authorization: Apikey <secret> (chỉ nhận qua header).
 * Một endpoint dùng chung: secret của WEB MẸ (cấu hình ở Admin, lưu DB; env SEPAY_WEBHOOK_SECRET chỉ là dự phòng) hoặc secret
 * SePay RIÊNG của từng panel (chủ panel nối SePay của họ — tiền về ngân hàng của panel).
 * Nhận diện khách bằng nội dung CK chứa mã nạp (depositCode, vd "SMM AB12CD").
 * Chống cộng trùng: mỗi giao dịch được claim nguyên tử ở WebhookReceipt.ref (unique) trong cùng transaction cộng tiền.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const settings = await getSettings();
  const motherSecret = settings.sepay_secret || process.env.SEPAY_WEBHOOK_SECRET || "";
  const auth = req.headers.get("authorization") || "";
  const presented = auth.startsWith("Apikey ") ? auth.slice(7) : ""; // chỉ nhận qua header (query sẽ lọt vào access log)
  let viaPanelId: number | null = null;
  // Fail-closed: KHÔNG có secret nào khớp (của mẹ ở env, hoặc của panel) là từ chối —
  // không bao giờ mở khi chưa cấu hình secret nào (tránh bị bắn giao dịch giả cộng tiền).
  let authorized = false;
  if (motherSecret && presented) {
    const { timingSafeEqual } = await import("crypto");
    const a = Buffer.from(presented);
    const b = Buffer.from(motherSecret);
    if (a.length === b.length && timingSafeEqual(a, b)) authorized = true;
  }
  if (!authorized && presented) {
    // Secret panel có thể đã mã hoá (enc:) — không tra equality được, phải quét + giải mã + so khớp
    const { decryptSecret } = await import("@/lib/secret-box");
    const { timingSafeEqual } = await import("crypto");
    const panels = await prisma.childPanel.findMany({ where: { sepayEnabled: true, sepaySecret: { not: null } }, select: { id: true, sepaySecret: true }, take: 500 }).catch(() => []);
    for (const cand of panels) {
      const dec = cand.sepaySecret ? decryptSecret(cand.sepaySecret) : "";
      if (!dec) continue;
      const a = Buffer.from(presented); const b = Buffer.from(dec);
      if (a.length === b.length && timingSafeEqual(a, b)) { authorized = true; viaPanelId = cand.id; break; }
    }
  }
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body: any = await req.json().catch(() => null);
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

  // Tìm mã nạp trong nội dung bằng truy vấn theo index: sinh mọi cửa sổ 6 ký tự
  // của nội dung đã chuẩn hoá rồi tra depositCode trong số đó (không nạp toàn bộ user vào RAM)
  const norm = content.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const windows = new Set<string>();
  for (let i = 0; i + 6 <= norm.length; i++) windows.add(norm.slice(i, i + 6));
  const candidates = await prisma.user.findMany({
    where: { depositCode: { in: Array.from(windows) } },
    select: { id: true, depositCode: true, panelId: true },
  });
  // Webhook xác thực bằng secret của panel nào thì CHỈ cộng cho khách của panel
  // đó — tiền vào ngân hàng của chủ panel A không được cộng cho khách panel B/mẹ.
  const scoped = viaPanelId ? candidates.filter((u) => u.panelId === viaPanelId) : candidates;
  const matched = scoped.find((u) => norm.includes(u.depositCode.toUpperCase()));
  if (!matched) {
    await prisma.apiLog.create({ data: { kind: "webhook", ref: txId || "no-id", ok: false, detail: `Không khớp mã nạp. content=${content} amount=${amount}` } });
    return NextResponse.json({ success: true, skipped: "user not matched" });
  }

  const matchedPanel = matched.panelId ? await prisma.childPanel.findUnique({ where: { id: matched.panelId }, select: { depositBonusTiers: true } }) : null;
  const bonus = calcBonus(amount, bonusTiersFor(matchedPanel?.depositBonusTiers, !!matched.panelId, settings.deposit_bonus_tiers));
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
  await prisma.apiLog.create({ data: { kind: "webhook", ref: txId || dep.code, detail: `user=${matched.id} amount=${amount} bonus=${bonus} deposit=${dep.code}${viaPanelId ? ` viaPanel=${viaPanelId}` : ""}` } });
  const { alertMother, alertPanelOwner } = await import("@/lib/alerts");
  await alertMother("deposit_success", "Nạp tiền thành công", `+${amount.toLocaleString("vi-VN")}đ${bonus > 0 ? ` (+${bonus.toLocaleString("vi-VN")}đ thưởng)` : ""} — khách #${matched.id}, mã ${dep.code}`);
  if (matched.panelId) await alertPanelOwner(matched.panelId, "deposit_success", "Khách của panel nạp tiền thành công", `+${amount.toLocaleString("vi-VN")}đ — khách #${matched.id}, mã ${dep.code}`);
  return NextResponse.json({ success: true, deposit: dep.code });
}
