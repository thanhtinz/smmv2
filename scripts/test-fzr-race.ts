/**
 * Test hồi quy audit đợt 2 P2-02: race cron poll <-> webhook trong
 * applyFzrOrderStatus — chuyển trạng thái phải qua CAS (updateMany có
 * điều kiện), hiệu ứng chỉ chạy ĐÚNG MỘT LẦN dù hai lượt áp đồng thời.
 *   npx tsx scripts/test-fzr-race.ts   (chỉ cần DB local)
 * Ca kiểm (mỗi ca bắn 2 lượt apply SONG SONG bằng Promise.all):
 *   R1 completed x2 (1 cron + 1 webhook) -> DELIVERED, điểm +2 đúng 1
 *      lần, đúng 1 log points_earn, đúng 1 thông báo "đã được giao".
 *   R2 partial x2 -> PARTIAL, ghi chú đối soát đúng 1 bản, đúng 1
 *      thông báo "giao một phần".
 *   R3 partial + completed đua nhau từ PENDING -> trạng thái cuối là
 *      PARTIAL hoặc DELIVERED (không lỗi, không trạng thái lạ); nếu
 *      DELIVERED thì điểm vẫn đúng 1 lần.
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
  const PID = 777208;
  await prisma.provider.upsert({
    where: { id: PID },
    create: { id: PID, name: "Mock FZR Race", kind: "PREMIUM", driver: "FZR", apiUrl: "http://127.0.0.1:9", apiKey: "fc_test_race", currency: "USD", exchangeRate: 25000, markupPercent: 0, active: true } as any,
    update: { driver: "FZR", active: true },
  });
  const stamp = Date.now().toString().slice(-8);
  const mkOrder = async (code: string) =>
    prisma.premiumOrder.create({
      data: { code, userId: demo.id, variantId: variant.id, quantity: 1, total: 200000, cost: 150000, status: "PENDING", providerId: PID, providerOrderId: `fzr-race-${code}` } as any,
    });
  const notifCount = async (orderCode: string, frag: string) =>
    prisma.notification.count({ where: { userId: demo.id, body: { contains: orderCode }, title: { contains: frag } } });

  const created: number[] = [];
  try {
    // ---------- R1: completed đua completed ----------
    const o1: any = await mkOrder(`R1${stamp}`); created.push(o1.id);
    const p0 = (await prisma.user.findUnique({ where: { id: demo.id } }))!.points;
    await Promise.all([
      applyFzrOrderStatus(o1, ["completed"], [{ status: "completed", cards: ["KEY-R1"] }]),
      applyFzrOrderStatus(o1, ["completed"], [{ status: "completed", cards: ["KEY-R1"] }], { fromWebhook: true }),
    ]);
    const f1: any = await prisma.premiumOrder.findUnique({ where: { id: o1.id } });
    ok(f1.status === "DELIVERED", `R1: trạng thái cuối DELIVERED (thực tế ${f1.status})`);
    const p1 = (await prisma.user.findUnique({ where: { id: demo.id } }))!.points;
    ok(p1 - p0 === 2, `R1: điểm cộng đúng 1 lần (+2): ${p0} -> ${p1}`);
    ok((await prisma.apiLog.count({ where: { kind: "points_earn", ref: `premium-${o1.id}` } })) === 1, "R1: đúng 1 log points_earn");
    ok((await notifCount(o1.code, "đã được giao")) === 1, "R1: đúng 1 thông báo đã giao");

    // ---------- R2: partial đua partial ----------
    const o2: any = await mkOrder(`R2${stamp}`); created.push(o2.id);
    await Promise.all([
      applyFzrOrderStatus(o2, ["partial"], [{ status: "partial", cards: ["KEY-R2"] }]),
      applyFzrOrderStatus(o2, ["partial"], [{ status: "partial", cards: ["KEY-R2"] }], { fromWebhook: true }),
    ]);
    const f2: any = await prisma.premiumOrder.findUnique({ where: { id: o2.id } });
    ok(f2.status === "PARTIAL", `R2: trạng thái cuối PARTIAL (thực tế ${f2.status})`);
    ok(((f2.adminNote || "").match(/MỘT PHẦN/g) || []).length === 1, "R2: ghi chú đối soát đúng 1 bản");
    ok((await notifCount(o2.code, "giao một phần")) === 1, "R2: đúng 1 thông báo giao một phần");

    // ---------- R3: partial đua completed ----------
    const o3: any = await mkOrder(`R3${stamp}`); created.push(o3.id);
    const q0 = (await prisma.user.findUnique({ where: { id: demo.id } }))!.points;
    await Promise.all([
      applyFzrOrderStatus(o3, ["partial"], [{ status: "partial", cards: ["KEY-R3-P"] }]),
      applyFzrOrderStatus(o3, ["completed"], [{ status: "completed", cards: ["KEY-R3-F"] }], { fromWebhook: true }),
    ]);
    const f3: any = await prisma.premiumOrder.findUnique({ where: { id: o3.id } });
    ok(f3.status === "PARTIAL" || f3.status === "DELIVERED", `R3: trạng thái cuối hợp lệ (${f3.status})`);
    const q1 = (await prisma.user.findUnique({ where: { id: demo.id } }))!.points;
    ok(q1 - q0 === (f3.status === "DELIVERED" ? 2 : 0), `R3: điểm khớp trạng thái cuối (delta ${q1 - q0}, status ${f3.status})`);
    ok((await prisma.apiLog.count({ where: { kind: "points_earn", ref: `premium-${o3.id}` } })) <= 1, "R3: tối đa 1 log points_earn");
  } finally {
    for (const id of created) {
      await prisma.apiLog.deleteMany({ where: { kind: "points_earn", ref: `premium-${id}` } });
      await prisma.premiumOrder.delete({ where: { id } }).catch(() => {});
    }
    await prisma.notification.deleteMany({ where: { userId: demo.id, body: { contains: stamp } } });
  }
  console.log(fail === 0 ? `\nALL PASS (${pass})` : `\n${fail} FAIL / ${pass} PASS`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
