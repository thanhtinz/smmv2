/**
 * Test chat đơn Manual Services với mock FZR (scripts/mock-fzr.mjs):
 *   npx tsx scripts/test-manual-chat.ts
 * Kiểm theo đúng hợp đồng OpenAPI FZR (đợt 2026-11-08):
 *  - syncManualChat kéo thread GET /manual-services/orders/{id}/chat về,
 *    tin phía NCC (sender "provider") phân chiều IN, cờ chat_* đi qua.
 *  - postManualChat POST multipart field "body" lên NCC, tin lưu OUT.
 *  - Đồng bộ lặp KHÔNG nhân đôi tin (dedupeKey), tin OUT giữ nguyên chiều.
 *  - Đơn không thuộc nhóm manual -> lỗi rõ ràng, không gọi NCC.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { prisma } from "../src/lib/db";
import { syncFzrCatalog } from "../src/lib/fzr-sync";
import { createPremiumOrder } from "../src/lib/orders";
import { syncManualChat, postManualChat } from "../src/lib/manual-chat";

const MOCK = "http://127.0.0.1:3998";
const PID = 999004;

let failures = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
};

async function mockLog(): Promise<any[]> {
  const r = await fetch(`${MOCK}/__log`);
  return (await r.json()).log;
}
async function waitMock(tries = 30) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`${MOCK}/__log`); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("Mock FZR không khởi động được");
}

async function main() {
  const proc: ChildProcess = spawn("node", ["scripts/mock-fzr.mjs"], { stdio: "ignore" });
  try {
    await waitMock();
    const demo = await prisma.user.findUnique({ where: { username: "demo" } });
    if (!demo) throw new Error("Chưa seed demo user");
    const startBalance = demo.balance;

    // Dọn artifact lần chạy dở + fixture
    const oldVariants = (await prisma.premiumVariant.findMany({ where: { providerId: PID }, select: { id: true } })).map((v) => v.id);
    if (oldVariants.length) {
      const oldOrders = (await prisma.premiumOrder.findMany({ where: { variantId: { in: oldVariants } }, select: { id: true } })).map((o) => o.id);
      await prisma.manualChatMessage.deleteMany({ where: { orderId: { in: oldOrders } } });
      await prisma.premiumOrder.deleteMany({ where: { id: { in: oldOrders } } });
      await prisma.premiumVariant.deleteMany({ where: { id: { in: oldVariants } } });
    }
    await prisma.premiumProduct.deleteMany({ where: { providerId: PID } });
    await prisma.provider.deleteMany({ where: { id: PID } });
    await prisma.user.update({ where: { id: demo.id }, data: { balance: 50000000 } });

    const provider = await prisma.provider.create({
      data: { id: PID, kind: "PREMIUM", driver: "FZR", name: "MockFZR-Chat", apiUrl: MOCK, apiKey: "fc_test_mock", currency: "USD", exchangeRate: 25000, markupPercent: 20, active: true },
    });
    await syncFzrCatalog(provider as any);
    const ms = await prisma.premiumProduct.findFirst({ where: { providerId: PID, providerProductId: "ms-1" }, include: { variants: true } });
    ok(!!ms && ms.variants.length > 0, "fixture: sản phẩm manual ms-1 đã đồng bộ");

    /* 1) Mua 1 đơn manual -> có providerOrderId để mở chat */
    const order: any = await createPremiumOrder({ user: demo, variantId: ms!.variants[0].id, quantity: 1, buyerInfo: demo.email, customData: {} });
    ok(order.status === "PENDING" && !!order.providerOrderId, `đơn manual tạo xong, providerOrderId=${order.providerOrderId}`);

    /* 2) Sync lần đầu: tin NCC có sẵn về DB, chiều IN, cờ đi qua */
    const t1 = await syncManualChat(order.id);
    ok(t1.flags?.opened === true && t1.flags?.readOnly === false && t1.flags?.frozen === false, `cờ chat từ NCC: ${JSON.stringify(t1.flags)}`);
    ok(t1.messages.length === 1 && t1.messages[0].direction === "IN" && (t1.messages[0].body || "").includes("đang xử lý"), `tin NCC -> IN: ${JSON.stringify(t1.messages.map((m) => m.direction))}`);
    const getCalls = (await mockLog()).filter((l) => l.method === "GET" && l.path.endsWith("/chat"));
    ok(getCalls.length === 1, `GET chat đúng 1 lần (log: ${getCalls.length})`);

    /* 3) Gửi tin: POST multipart lên NCC + lưu OUT */
    const sent = await postManualChat(order.id, "Xin chào, đơn của tôi xử lý đến đâu rồi?");
    ok(sent.direction === "OUT" && sent.body?.includes("đến đâu"), `tin gửi lưu OUT: ${sent.body}`);
    const postCalls = (await mockLog()).filter((l) => l.method === "POST" && l.path.endsWith("/chat"));
    ok(postCalls.length === 1 && (postCalls[0].body?.body || "").includes("đến đâu"), `mock nhận POST chat multipart field body: ${JSON.stringify(postCalls[0]?.body)}`);

    /* 4) Sync lặp: không nhân đôi, tin OUT giữ chiều */
    const t2 = await syncManualChat(order.id);
    ok(t2.messages.length === 2, `sau sync lại: 2 tin (thực tế ${t2.messages.length})`);
    ok(t2.messages.filter((m) => m.direction === "OUT").length === 1 && t2.messages.filter((m) => m.direction === "IN").length === 1, "phân chiều giữ nguyên: 1 OUT + 1 IN");
    const t3 = await syncManualChat(order.id);
    ok(t3.messages.length === 2, `sync lần 3 vẫn 2 tin (dedupe): ${t3.messages.length}`);
    const dbCount = await prisma.manualChatMessage.count({ where: { orderId: order.id } });
    ok(dbCount === 2, `DB có đúng 2 dòng chat: ${dbCount}`);

    /* 5) Đơn không phải manual -> lỗi rõ, không gọi NCC */
    const other = await prisma.premiumOrder.findFirst({ where: { variant: { providerGroup: { not: "manual" } } }, select: { id: true } });
    if (other) {
      let threw = false;
      try { await syncManualChat(other.id); } catch { threw = true; }
      ok(threw, "sync chat trên đơn không-manual bị chặn");
    }

    /* Dọn dẹp */
    await prisma.manualChatMessage.deleteMany({ where: { orderId: order.id } });
    await prisma.premiumOrder.deleteMany({ where: { id: order.id } });
    await prisma.premiumVariant.deleteMany({ where: { providerId: PID } });
    await prisma.premiumProduct.deleteMany({ where: { providerId: PID } });
    await prisma.provider.deleteMany({ where: { id: PID } });
    await prisma.user.update({ where: { id: demo.id }, data: { balance: startBalance } });
    ok((await prisma.user.findUnique({ where: { id: demo.id } }))!.balance === startBalance, "số dư demo khôi phục");
  } finally {
    proc.kill();
  }
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAIL`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
