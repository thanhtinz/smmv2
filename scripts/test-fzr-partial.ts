/**
 * Test hồi quy P2-07 (audit BNT Shop, Tín chốt 2026-11-13): trạng thái
 * PARTIAL "Giao một phần" cho đơn FZR — gọi thẳng applyFzrOrderStatus:
 *   npx tsx scripts/test-fzr-partial.ts   (chỉ cần DB local, không cần server)
 * Ca kiểm:
 *  1) PENDING + [partial] -> PARTIAL: lưu phần nội dung đã giao + ghi chú
 *     admin đối soát; KHÔNG cộng điểm, KHÔNG có log points_earn.
 *  2) PARTIAL + [completed] qua đường webhook -> DELIVERED, điểm cộng đúng
 *     1 lần (200.000đ x points_per_100k=1 -> +2 điểm).
 *  3) DELIVERED + [partial] đến muộn -> giữ nguyên DELIVERED + nội dung cũ
 *     (không lùi trạng thái).
 *  4) Đơn 2 phần [completed, partial] -> PARTIAL; rồi [completed, completed]
 *     -> DELIVERED.
 */
import { prisma } from "../src/lib/db";
import { setSetting } from "../src/lib/settings";
import { applyFzrOrderStatus } from "../src/lib/fzr-orders";

let pass = 0, fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) { pass++; console.log("  PASS", label); }
  else { fail++; console.log("  FAIL", label); }
}

async function main() {
  const demo: any = await prisma.user.findUnique({ where: { username: "demo" } });
  if (!demo) throw new Error("thiếu user demo (chạy seed trước)");
  const variant: any = await prisma.premiumVariant.findFirst();
  if (!variant) throw new Error("thiếu variant mẫu (chạy seed trước)");
  await setSetting("points_per_100k", "1");
  const PID = 777207;
  await prisma.provider.upsert({
    where: { id: PID },
    create: { id: PID, name: "Mock FZR Partial", kind: "PREMIUM", driver: "FZR", apiUrl: "http://127.0.0.1:9", apiKey: "fc_test_partial", currency: "USD", exchangeRate: 25000, markupPercent: 0, active: true } as any,
    update: { driver: "FZR", active: true },
  });
  const basePoints = (await prisma.user.findUnique({ where: { id: demo.id } }))!.points;
  const stamp = Date.now().toString().slice(-8);
  const mkOrder = async (code: string, providerOrderId: string) =>
    prisma.premiumOrder.create({
      data: { code, userId: demo.id, variantId: variant.id, quantity: 1, total: 200000, cost: 150000, status: "PENDING", providerId: PID, providerOrderId } as any,
    });
  const orderA: any = await mkOrder(`PA${stamp}`, "fzr-pa-1");
  const orderB: any = await mkOrder(`PB${stamp}`, "fzr-pb-1,fzr-pb-2");
  try {
    // 1) partial lần đầu
    const a1: any = await applyFzrOrderStatus(orderA, ["partial"], [{ status: "partial", cards: ["KEY-PART-1"] }]);
    ok(a1.status === "PARTIAL", `A: PENDING+partial -> PARTIAL (thực tế ${a1.status})`);
    ok((a1.deliveryData || "").includes("KEY-PART-1"), "A: nội dung đã giao được lưu cho khách xem");
    ok((a1.adminNote || "").includes("MỘT PHẦN"), "A: adminNote ghi đối soát phần còn lại");
    const ptsAfterPartial = (await prisma.user.findUnique({ where: { id: demo.id } }))!.points;
    ok(ptsAfterPartial === basePoints, `A: điểm KHÔNG đổi khi giao một phần (${basePoints} -> ${ptsAfterPartial})`);
    const logA = await prisma.apiLog.findFirst({ where: { kind: "points_earn", ref: `premium-${orderA.id}` } });
    ok(!logA, "A: chưa có log points_earn");
    const a1b: any = await applyFzrOrderStatus(a1, ["partial"], [{ status: "partial", cards: ["KEY-PART-1"] }]);
    ok(a1b.status === "PARTIAL" && ((a1b.adminNote || "").match(/MỘT PHẦN/g) || []).length === 1, "A: áp partial lần 2 — ghi chú không nhân đôi");

    // 2) hoàn tất qua webhook từ PARTIAL
    const a2: any = await applyFzrOrderStatus(a1, ["completed"], [{ status: "completed", cards: ["KEY-FULL-1"] }], { fromWebhook: true });
    ok(a2.status === "DELIVERED", `A: PARTIAL+completed (webhook) -> DELIVERED (thực tế ${a2.status})`);
    ok((a2.deliveryData || "").includes("KEY-FULL-1"), "A: nội dung giao đầy đủ được cập nhật");
    const ptsAfterDone = (await prisma.user.findUnique({ where: { id: demo.id } }))!.points;
    ok(ptsAfterDone === basePoints + 2, `A: điểm cộng đúng 1 lần khi hoàn tất (${basePoints} -> ${ptsAfterDone})`);

    // 3) partial đến muộn sau khi đã giao — không lùi trạng thái
    const a3: any = await applyFzrOrderStatus(a2, ["partial"], [{ status: "partial", cards: ["KEY-LATE"] }]);
    ok(a3.status === "DELIVERED", `A: DELIVERED+partial muộn -> giữ DELIVERED (thực tế ${a3.status})`);
    ok((a3.deliveryData || "").includes("KEY-FULL-1") && !(a3.deliveryData || "").includes("KEY-LATE"), "A: nội dung giao không bị ghi đè bởi lượt partial muộn");

    // 4) đơn 2 phần
    const b1: any = await applyFzrOrderStatus(orderB, ["completed", "partial"], [{ status: "completed", cards: ["K1"] }, { status: "partial", cards: ["K2"] }]);
    ok(b1.status === "PARTIAL", `B: [completed, partial] -> PARTIAL (thực tế ${b1.status})`);
    const b2: any = await applyFzrOrderStatus(b1, ["completed", "completed"], [{ status: "completed", cards: ["K1"] }, { status: "completed", cards: ["K2"] }], { fromWebhook: true });
    ok(b2.status === "DELIVERED", `B: [completed, completed] -> DELIVERED (thực tế ${b2.status})`);
  } finally {
    await prisma.premiumOrder.deleteMany({ where: { id: { in: [orderA.id, orderB.id] } } });
    await prisma.apiLog.deleteMany({ where: { kind: "points_earn", ref: { in: [`premium-${orderA.id}`, `premium-${orderB.id}`] } } });
    await prisma.notification.deleteMany({ where: { userId: demo.id, link: "/dashboard/don-premium", createdAt: { gte: new Date(Date.now() - 600000) } } });
    await prisma.user.update({ where: { id: demo.id }, data: { points: basePoints } });
    await prisma.provider.delete({ where: { id: PID } }).catch(() => {});
  }
  console.log(`\nKẾT QUẢ: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
