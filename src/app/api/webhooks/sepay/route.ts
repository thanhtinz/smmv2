import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { applyBalance } from "@/lib/wallet";
import { getSettings, calcBonus } from "@/lib/settings";
import { genCode } from "@/lib/format";

/**
 * Webhook cộng tiền tự động — tương thích SePay (và mọi hệ thống bắn JSON tương tự).
 * Bảo mật: header Authorization: Apikey <SEPAY_WEBHOOK_SECRET>
 * hoặc query ?secret=<SEPAY_WEBHOOK_SECRET>.
 * Nhận diện khách bằng nội dung CK chứa mã nạp (depositCode, vd "SMM AB12CD").
 * Chống cộng trùng: mỗi giao dịch (id phía ngân hàng/SePay) chỉ xử lý 1 lần (lưu ở ApiLog.ref).
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const secret = process.env.SEPAY_WEBHOOK_SECRET || "";
  const auth = req.headers.get("authorization") || "";
  const qSecret = req.nextUrl.searchParams.get("secret") || "";
  if (secret && auth !== `Apikey ${secret}` && qSecret !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body: any = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const content: string = body.content || body.description || body.transferContent || "";
  const amount: number = Number(body.transferAmount || body.amount || 0);
  const txId: string = String(body.id || body.referenceCode || body.transactionId || "");
  const type: string = String(body.transferType || "in");
  if (type !== "in" || !amount || amount <= 0) return NextResponse.json({ success: true, skipped: "not a credit" });
  if (txId) {
    const dup = await prisma.apiLog.findFirst({ where: { kind: "webhook", ref: txId } });
    if (dup) return NextResponse.json({ success: true, skipped: "duplicate" });
  }

  // Tìm mã nạp trong nội dung: mã 6 ký tự sau "SMM" hoặc đứng một mình
  const users = await prisma.user.findMany({ select: { id: true, depositCode: true } });
  const norm = content.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const matched = users.find((u) => norm.includes(u.depositCode.toUpperCase()));
  if (!matched) {
    await prisma.apiLog.create({ data: { kind: "webhook", ref: txId || "no-id", ok: false, detail: `Không khớp mã nạp. content=${content} amount=${amount}` } });
    return NextResponse.json({ success: true, skipped: "user not matched" });
  }

  const settings = await getSettings();
  const bonus = calcBonus(amount, settings.deposit_bonus_tiers);
  const dep = await prisma.$transaction(async (tx) => {
    const d = await tx.deposit.create({
      data: { code: "TMP", userId: matched.id, method: "BANK", amount, bonus, status: "APPROVED", content, auto: true },
    });
    const code = genCode("NAP", d.id);
    await tx.deposit.update({ where: { id: d.id }, data: { code } });
    await applyBalance(tx, matched.id, amount, "DEPOSIT", code, "Nạp tiền tự động qua chuyển khoản");
    if (bonus > 0) await applyBalance(tx, matched.id, bonus, "BONUS", code, "Thưởng nạp tiền");
    return { ...d, code };
  });
  await prisma.apiLog.create({ data: { kind: "webhook", ref: txId || dep.code, detail: `user=${matched.id} amount=${amount} bonus=${bonus} deposit=${dep.code}` } });
  return NextResponse.json({ success: true, deposit: dep.code });
}
