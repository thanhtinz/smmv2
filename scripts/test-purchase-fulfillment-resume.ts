/**
 * Test tái-audit 0e15517 P2-A: recovery của thanh toán trực tiếp KHÔNG
 * được coi "có PremiumOrder theo khoá" là đã xử lý xong — đơn API còn
 * PENDING phải được đối soát/tiếp tục bước giao hàng còn thiếu.
 *   npx tsx scripts/test-purchase-fulfillment-resume.ts
 * Mô phỏng crash: tạo sẵn PurchasePayment PROCESSING (dòng pending) +
 * PremiumOrder PENDING mang khoá của phiên ở các trạng thái giao hàng
 * khác nhau, rồi chạy settlePurchasePayment (đường recovery dùng):
 *   A) FZR chưa hề gửi (không claim, không mã) -> thực thi gửi FZR.
 *   B) FZR claim đã hết hạn lease -> gỡ claim, thực thi lại (FZR có
 *      Idempotency-Key = id đơn nên an toàn).
 *   C) FZR claim còn tươi -> KHÔNG đụng vào (lượt khác có thể đang chạy).
 *   D) NCC chuẩn chưa hề gửi -> gọi buy, đơn DELIVERED kèm mã + nội dung.
 *   E) NCC chuẩn claim hết hạn, chưa mã -> KHÔNG mua lại (không có
 *      idempotency), đơn bị gắn cờ đối soát tay.
 *   F) NCC chuẩn đã có mã -> đối soát history -> DELIVERED.
 * FZR chạy trên mock scripts/mock-fzr.mjs (port 3998); NCC chuẩn chạy
 * trên stub HTTP trong chính test này (port 3997).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import { prisma } from "../src/lib/db";
import { settlePurchasePayment } from "../src/lib/purchase";

let failures = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
};

const FZR_MOCK = "http://127.0.0.1:3998";
const STD_PORT = 3997;
let stdBuyCount = 0;

async function waitMock() {
  for (let i = 0; i < 30; i++) {
    try { const r = await fetch(`${FZR_MOCK}/__log`); if (r.ok) return; } catch { /* chua len */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("Mock FZR không khởi động được");
}
async function fzrLog(): Promise<any[]> {
  const r = await fetch(`${FZR_MOCK}/__log`);
  const j: any = await r.json();
  return j.log || [];
}

async function main() {
  const proc: ChildProcess = spawn("node", ["scripts/mock-fzr.mjs"], { stdio: "ignore" });
  const std = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const params = new URLSearchParams(body);
      const action = params.get("action");
      res.setHeader("Content-Type", "application/json");
      if (action === "buy") {
        stdBuyCount++;
        res.end(JSON.stringify({ status: "success", data: { order_code: `STD-${stdBuyCount}`, data: "STD-DELIVERY-1" } }));
      } else if (action === "history") {
        res.end(JSON.stringify({ status: "success", data: [{ order_code: "STD-X1", status: "completed", data: "STD-HIST-DELIVERY" }], pagination: { last_page: 1 } }));
      } else if (action === "balance") {
        res.end(JSON.stringify({ balance: "1000000", currency: "VND" }));
      } else {
        res.end(JSON.stringify({ status: "success", data: [] }));
      }
    });
  });
  await new Promise<void>((resolve) => std.listen(STD_PORT, "127.0.0.1", resolve));

  try {
    await waitMock();
    const demo = await prisma.user.findUnique({ where: { username: "demo" } });
    if (!demo) throw new Error("Chưa seed demo user");
    const startBalance = demo.balance;
    const anyProduct = await prisma.premiumProduct.findFirst({ select: { categoryId: true } });
    if (!anyProduct) throw new Error("Thiếu category mẫu từ seed");

    // --- Nhà cung cấp + sản phẩm test (id riêng, dọn sạch sau test) ---
    // Dọn tàn dư của lần chạy chết trước (slug là unique toàn cục).
    const leftovers = await prisma.premiumProduct.findMany({ where: { slug: { in: ["resume-gk-999101", "resume-std-999102"] } }, select: { id: true } });
    if (leftovers.length) {
      const lvIds = leftovers.map((x) => x.id);
      const lvVariants = (await prisma.premiumVariant.findMany({ where: { productId: { in: lvIds } }, select: { id: true } })).map((v) => v.id);
      await prisma.premiumOrder.deleteMany({ where: { variantId: { in: lvVariants } } });
      await prisma.premiumVariant.deleteMany({ where: { id: { in: lvVariants } } });
      await prisma.premiumProduct.deleteMany({ where: { id: { in: lvIds } } });
    }
    await prisma.purchasePayment.deleteMany({ where: { code: { startsWith: "RSUM" } } });
    const fzr = await prisma.provider.upsert({
      where: { id: 999101 },
      create: { id: 999101, kind: "PREMIUM", driver: "FZR", name: "MockFZR-Resume", apiUrl: FZR_MOCK, apiKey: "fc_test_mock", currency: "USD", exchangeRate: 25000, markupPercent: 20, active: true },
      update: { driver: "FZR", apiUrl: FZR_MOCK, active: true },
    });
    const stdProv = await prisma.provider.upsert({
      where: { id: 999102 },
      create: { id: 999102, kind: "PREMIUM", driver: "STANDARD", name: "MockSTD-Resume", apiUrl: `http://127.0.0.1:${STD_PORT}/api/product`, apiKey: "std_test", currency: "VND", exchangeRate: 1, markupPercent: 0, active: true },
      update: { driver: "STANDARD", apiUrl: `http://127.0.0.1:${STD_PORT}/api/product`, active: true },
    });
    const fzrProduct = await prisma.premiumProduct.create({
      data: { categoryId: anyProduct.categoryId, name: "Resume GK", slug: "resume-gk-999101", fulfillment: "API", providerId: fzr.id, providerProductId: "gk-1" },
    });
    const fzrVariant = await prisma.premiumVariant.create({
      data: { productId: fzrProduct.id, name: "Standard", price: 50000, cost: 40000, providerId: fzr.id, providerGroup: "gamekeys", providerItemId: "gk-1-std" },
    });
    const stdProduct = await prisma.premiumProduct.create({
      data: { categoryId: anyProduct.categoryId, name: "Resume STD", slug: "resume-std-999102", fulfillment: "API", providerId: stdProv.id, providerProductId: "std-1" },
    });
    const stdVariant = await prisma.premiumVariant.create({
      data: { productId: stdProduct.id, name: "1 Tháng", price: 60000, cost: 50000, providerId: stdProv.id, providerCycle: 1 },
    });

    const createdPP: number[] = [];
    let seq = 0;
    /** Dựng cặp (phiên PROCESSING pending + đơn PENDING mang khoá) đúng
     *  trạng thái tiến trình chết để lại sau commit đơn. */
    const makeCrashPair = async (variantId: number, price: number, orderPatch: Record<string, any>) => {
      seq++;
      const pp0 = await prisma.purchasePayment.create({
        data: {
          code: "TMP", userId: demo.id, method: "SEPAY", amount: price, status: "PENDING",
          snapshot: JSON.stringify({ lines: [{ variantId, qty: 1, custom: {}, buyerInfo: demo.email, share: price }], promo: null }),
          expiresAt: new Date(Date.now() + 30 * 60000),
        },
      });
      const pp = await prisma.purchasePayment.update({
        where: { id: pp0.id },
        data: {
          code: `RSUM${pp0.id}`, status: "PROCESSING", paidAt: new Date(), updatedAt: new Date(Date.now() - 15 * 60000),
          providerData: JSON.stringify({ receivedVnd: price, execution: [{ variantId, ok: false, pending: true, startedAt: Date.now() - 15 * 60000 }], creditedTotal: 0 }),
        },
      });
      createdPP.push(pp.id);
      const o0 = await prisma.premiumOrder.create({
        data: {
          code: "TMP", userId: demo.id, variantId, quantity: 1, total: price, status: "PENDING",
          providerId: orderPatch.providerId, buyerInfo: demo.email,
          purchasePaymentId: pp.id, purchaseLineNo: 0, ...orderPatch,
        },
      });
      const order = await prisma.premiumOrder.update({ where: { id: o0.id }, data: { code: `PRE-R${seq}-${o0.id}` } });
      return { pp, order };
    };
    const freshOrder = (id: number) => prisma.premiumOrder.findUnique({ where: { id } });
    const fzrCallsFor = async (orderId: number) =>
      (await fzrLog()).filter((l) => l.path === "/api/v2/gamekeys/order" && l.idem === String(orderId));

    /* A) FZR chưa hề gửi -> recovery thực thi gửi */
    {
      const { pp, order } = await makeCrashPair(fzrVariant.id, fzrVariant.price, { providerId: fzr.id });
      const r = await settlePurchasePayment(pp.id);
      const after = await freshOrder(order.id);
      ok(r.ok && !!(await fzrCallsFor(order.id)).length, "A: recovery đã gọi tạo đơn FZR cho đơn chưa gửi");
      ok(!!after?.providerOrderId, `A: đơn có mã phía FZR (${after?.providerOrderId || "trống"})`);
    }

    /* B) FZR claim hết hạn lease -> gỡ claim + thực thi lại */
    {
      const stale = new Date(Date.now() - 20 * 60000).toISOString();
      const { pp, order } = await makeCrashPair(fzrVariant.id, fzrVariant.price, {
        providerId: fzr.id, providerRaw: JSON.stringify({ fzrClaimAt: stale }),
      });
      const r = await settlePurchasePayment(pp.id);
      const after = await freshOrder(order.id);
      ok(r.ok && (await fzrCallsFor(order.id)).length === 1, "B: claim hết hạn -> thực thi lại đúng 1 lần (idempotency theo id đơn)");
      ok(!!after?.providerOrderId, "B: đơn có mã phía FZR sau thực thi lại");
    }

    /* C) FZR claim còn tươi -> không đụng */
    {
      const freshClaim = new Date().toISOString();
      const { pp, order } = await makeCrashPair(fzrVariant.id, fzrVariant.price, {
        providerId: fzr.id, providerRaw: JSON.stringify({ fzrClaimAt: freshClaim }),
      });
      const r = await settlePurchasePayment(pp.id);
      const after = await freshOrder(order.id);
      ok(r.ok && (await fzrCallsFor(order.id)).length === 0, "C: claim còn tươi -> KHÔNG gọi FZR");
      ok(after?.status === "PENDING" && !after?.providerOrderId, "C: đơn giữ nguyên PENDING chờ lượt thực thi kia");
    }

    /* D) NCC chuẩn chưa hề gửi -> buy + DELIVERED */
    {
      const before = stdBuyCount;
      const { pp, order } = await makeCrashPair(stdVariant.id, stdVariant.price, { providerId: stdProv.id });
      const r = await settlePurchasePayment(pp.id);
      const after = await freshOrder(order.id);
      ok(r.ok && stdBuyCount === before + 1, "D: recovery gọi buy phía NCC chuẩn đúng 1 lần");
      ok(after?.status === "DELIVERED" && (after?.deliveryData || "").includes("STD-DELIVERY"), `D: đơn DELIVERED kèm nội dung giao (${after?.status})`);
      ok(!!after?.providerOrderId, "D: đơn có mã phía NCC");
    }

    /* E) NCC chuẩn claim hết hạn, chưa mã -> KHÔNG mua lại, gắn cờ */
    {
      const before = stdBuyCount;
      const stale = new Date(Date.now() - 20 * 60000).toISOString();
      const { pp, order } = await makeCrashPair(stdVariant.id, stdVariant.price, {
        providerId: stdProv.id, providerRaw: JSON.stringify({ stdClaimAt: stale }),
      });
      const r = await settlePurchasePayment(pp.id);
      const after = await freshOrder(order.id);
      ok(r.ok && stdBuyCount === before, "E: claim dở dang phía NCC chuẩn -> KHÔNG mua lại");
      ok(after?.status === "PENDING" && (after?.adminNote || "").includes("chưa rõ trạng thái"), "E: đơn được gắn cờ đối soát tay");
    }

    /* F) NCC chuẩn đã có mã -> đối soát history -> DELIVERED */
    {
      const before = stdBuyCount;
      const { pp, order } = await makeCrashPair(stdVariant.id, stdVariant.price, {
        providerId: stdProv.id, providerOrderId: "STD-X1",
        providerRaw: JSON.stringify({ stdClaimAt: new Date(Date.now() - 20 * 60000).toISOString() }),
      });
      const r = await settlePurchasePayment(pp.id);
      const after = await freshOrder(order.id);
      ok(r.ok && stdBuyCount === before, "F: đã có mã -> không mua thêm");
      ok(after?.status === "DELIVERED" && (after?.deliveryData || "").includes("STD-HIST-DELIVERY"), `F: đối soát history -> DELIVERED (${after?.status})`);
    }

    // Dọn dẹp
    await prisma.premiumOrder.deleteMany({ where: { purchasePaymentId: { in: createdPP } } });
    await prisma.purchasePayment.deleteMany({ where: { id: { in: createdPP } } });
    await prisma.premiumVariant.deleteMany({ where: { id: { in: [fzrVariant.id, stdVariant.id] } } });
    await prisma.premiumProduct.deleteMany({ where: { id: { in: [fzrProduct.id, stdProduct.id] } } });
    await prisma.provider.deleteMany({ where: { id: { in: [999101, 999102] } } });
    await prisma.user.update({ where: { id: demo.id }, data: { balance: startBalance } });
  } finally {
    try { proc.kill(); } catch { /* noop */ }
    std.close();
  }
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAIL`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
