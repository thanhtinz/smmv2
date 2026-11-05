import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { applyBalance } from "@/lib/wallet";
import { getSettings, calcBonus, pickBonusTiers } from "@/lib/settings";
import { genCode } from "@/lib/format";

/**
 * Webhook cộng tiền tự động — tương thích SePay (và mọi hệ thống bắn JSON tương tự).
 * Bảo mật: header Authorization: Apikey <secret> hoặc query ?secret=<secret>.
 * Một endpoint dùng chung: secret của WEB MẸ (env SEPAY_WEBHOOK_SECRET) hoặc secret
 * SePay RIÊNG của từng panel (chủ panel nối SePay của họ — tiền về ngân hàng của panel).
 * Nhận diện khách bằng nội dung CK chứa mã nạp (depositCode, vd "SMM AB12CD").
 * Chống cộng trùng: mỗi giao dịch (id phía ngân hàng/SePay) chỉ xử lý 1 lần (lưu ở ApiLog.ref).
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const motherSecret = process.env.SEPAY_WEBHOOK_SECRET || "";
  const auth = req.headers.get("authorization") || "";
  const qSecret = req.nextUrl.searchParams.get("secret") || "";
  const presented = auth.startsWith("Apikey ") ? auth.slice(7) : qSecret;
  let viaPanelId: number | null = null;
  let authorized = !motherSecret && !presented;
  if (motherSecret && presented === motherSecret) authorized = true;
  if (!authorized && presented) {
    const p = await prisma.childPanel.findFirst({ where: { sepayEnabled: true, sepaySecret: presented }, select: { id: true } }).catch(() => null);
    if (p) { authorized = true; viaPanelId = p.id; }
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
  if (txId) {
    const dup = await prisma.apiLog.findFirst({ where: { kind: "webhook", ref: txId } });
    if (dup) return NextResponse.json({ success: true, skipped: "duplicate" });
  }

  // Tìm mã nạp trong nội dung: mã 6 ký tự sau "SMM" hoặc đứng một mình
  const users = await prisma.user.findMany({ select: { id: true, depositCode: true, panelId: true } });
  const norm = content.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const matched = users.find((u) => norm.includes(u.depositCode.toUpperCase()));
  if (!matched) {
    await prisma.apiLog.create({ data: { kind: "webhook", ref: txId || "no-id", ok: false, detail: `Không khớp mã nạp. content=${content} amount=${amount}` } });
    return NextResponse.json({ success: true, skipped: "user not matched" });
  }

  const settings = await getSettings();
  const matchedPanel = matched.panelId ? await prisma.childPanel.findUnique({ where: { id: matched.panelId }, select: { depositBonusTiers: true } }) : null;
  const bonus = calcBonus(amount, pickBonusTiers(matchedPanel?.depositBonusTiers, settings.deposit_bonus_tiers));
  const dep = await prisma.$transaction(async (tx) => {
    const d = await tx.deposit.create({
      data: { code: "TMP", userId: matched.id, method: isMomo ? "MOMO" : "BANK", amount, bonus, status: "APPROVED", content, auto: true },
    });
    const code = genCode("NAP", d.id);
    await tx.deposit.update({ where: { id: d.id }, data: { code } });
    await applyBalance(tx, matched.id, amount, "DEPOSIT", code, isMomo ? "Nạp tiền tự động qua SePay (MoMo)" : "Nạp tiền tự động qua SePay");
    if (bonus > 0) await applyBalance(tx, matched.id, bonus, "BONUS", code, "Thưởng nạp tiền");
    return { ...d, code };
  });
  await prisma.apiLog.create({ data: { kind: "webhook", ref: txId || dep.code, detail: `user=${matched.id} amount=${amount} bonus=${bonus} deposit=${dep.code}${viaPanelId ? ` viaPanel=${viaPanelId}` : ""}` } });
  const { alertMother, alertPanelOwner } = await import("@/lib/alerts");
  await alertMother("deposit_success", "Nạp tiền thành công", `+${amount.toLocaleString("vi-VN")}đ${bonus > 0 ? ` (+${bonus.toLocaleString("vi-VN")}đ thưởng)` : ""} — khách #${matched.id}, mã ${dep.code}`);
  if (matched.panelId) await alertPanelOwner(matched.panelId, "deposit_success", "Khách của panel nạp tiền thành công", `+${amount.toLocaleString("vi-VN")}đ — khách #${matched.id}, mã ${dep.code}`);
  return NextResponse.json({ success: true, deposit: dep.code });
}
