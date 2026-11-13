/**
 * Test TỈ GIÁ MỘT NGUỒN (lệnh chủ shop 2026-11-08): tỉ giá USD→VNĐ của nhà
 * cung cấp FZR chỉ lưu ở Provider.exchangeRate (nhập tại Admin → Nhà cung
 * cấp). Kiểm bằng mock FZR (scripts/mock-fzr.mjs):
 *   1) Đặt tỉ giá X -> giá đồng bộ (Telegram Stars + Premium) và giá chốt
 *      tươi (refreshFzrQuotePrice) đều theo X.
 *   2) Chỉ sửa exchangeRate trên hồ sơ nhà cung cấp sang Y (không sửa gì
 *      khác) -> đồng bộ lại + chốt tươi đều theo Y.
 *   3) Markup riêng theo khu (fix11) vẫn ghi đè ĐÈ LÊN cùng một tỉ giá đó.
 *   npx tsx scripts/test-rate-source.ts
 */
import { spawn, type ChildProcess } from "node:child_process";
import { prisma } from "../src/lib/db";
import { syncFzrCatalog } from "../src/lib/fzr-sync";
import { refreshFzrQuotePrice } from "../src/lib/fzr-orders";
import { fzrMarkupResolver } from "../src/lib/fzr-markup";
import { setSetting } from "../src/lib/settings";

const MOCK = "http://127.0.0.1:3998";
const PID = 999003;
const X = 25000, Y = 30000, MARKUP = 20;
const sell = (usd: number, rate: number, markup: number) => Math.ceil(usd * rate * (1 + markup / 100));

let failures = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
};

async function waitMock(tries = 30) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`${MOCK}/__log`); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("Mock FZR không khởi động được");
}

async function cleanup() {
  const vs = (await prisma.premiumVariant.findMany({ where: { providerId: PID }, select: { id: true } })).map((v) => v.id);
  if (vs.length) {
    await prisma.premiumOrder.deleteMany({ where: { variantId: { in: vs } } });
    await prisma.premiumVariant.deleteMany({ where: { id: { in: vs } } });
  }
  await prisma.premiumProduct.deleteMany({ where: { providerId: PID } });
  await prisma.provider.deleteMany({ where: { id: PID } });
  await prisma.setting.deleteMany({ where: { key: "fzr_markup_telegram_stars" } });
}

async function main() {
  const proc: ChildProcess = spawn("node", ["scripts/mock-fzr.mjs"], { stdio: "ignore" });
  try {
    await waitMock();
    await cleanup();
    await prisma.provider.create({
      data: { id: PID, kind: "PREMIUM", driver: "FZR", name: "MockRate", apiUrl: MOCK, apiKey: "fc_test_mock", currency: "USD", exchangeRate: X, markupPercent: MARKUP, active: true },
    });
    const fresh = async () => (await prisma.provider.findUnique({ where: { id: PID } }))!;
    const starsPrice = async () => {
      const p = await prisma.premiumProduct.findFirst({ where: { providerId: PID, providerProductId: "telegram-stars" }, include: { variants: true } });
      // Đọc đúng variant "1 sao" theo providerItemId — KHÔNG dùng variants[0]:
      // include không orderBy trả hàng theo thứ tự heap của Postgres, thứ tự
      // này ĐỔI sau mỗi lần sync UPDATE (bắt được 2026-11-13: variants[0] có
      // lúc là gói 10000 sao -> giá lệch 10000 lần dù giá sync hoàn toàn đúng).
      return p?.variants.find((v) => v.providerItemId === "stars");
    };
    const premium12 = async () => {
      const p = await prisma.premiumProduct.findFirst({ where: { providerId: PID, providerProductId: "telegram-premium" }, include: { variants: true } });
      return p?.variants.find((v) => v.providerItemId === "12");
    };
    const syncTg = async () => {
      const p = await fresh();
      await syncFzrCatalog(p as any, { groups: ["telegram_stars", "telegram_premium"], markupFor: await fzrMarkupResolver(p) });
    };

    /* 1) Tỉ giá X */
    await syncTg();
    const s1 = await starsPrice();
    ok(s1?.price === sell(0.015, X, MARKUP), `sync @X: giá 1 sao = ${s1?.price} (kỳ vọng ${sell(0.015, X, MARKUP)})`);
    const pr1 = await premium12();
    ok(pr1?.price === sell(35.99, X, MARKUP), `sync @X: Premium 12 tháng = ${pr1?.price} (kỳ vọng ${sell(35.99, X, MARKUP)})`);
    const q1 = await refreshFzrQuotePrice(s1 as any, await fresh() as any);
    ok(q1.price === sell(0.015, X, MARKUP), `chốt tươi @X: ${q1.price} (kỳ vọng ${sell(0.015, X, MARKUP)})`);

    /* 2) Chỉ sửa exchangeRate trên hồ sơ nhà cung cấp -> Y */
    await prisma.provider.update({ where: { id: PID }, data: { exchangeRate: Y } });
    await syncTg();
    const s2 = await starsPrice();
    ok(s2?.price === sell(0.015, Y, MARKUP), `sync @Y: giá 1 sao = ${s2?.price} (kỳ vọng ${sell(0.015, Y, MARKUP)})`);
    const pr2 = await premium12();
    ok(pr2?.price === sell(35.99, Y, MARKUP), `sync @Y: Premium 12 tháng = ${pr2?.price} (kỳ vọng ${sell(35.99, Y, MARKUP)})`);
    const q2 = await refreshFzrQuotePrice(s2 as any, await fresh() as any);
    ok(q2.price === sell(0.015, Y, MARKUP), `chốt tươi @Y: ${q2.price} (kỳ vọng ${sell(0.015, Y, MARKUP)})`);

    /* 3) Markup riêng khu vẫn đè lên cùng tỉ giá Y */
    await setSetting("fzr_markup_telegram_stars", "50");
    const q3 = await refreshFzrQuotePrice(s2 as any, await fresh() as any);
    ok(q3.price === sell(0.015, Y, 50), `chốt tươi @Y + markup khu 50%: ${q3.price} (kỳ vọng ${sell(0.015, Y, 50)})`);
    await syncTg();
    const s3 = await starsPrice();
    ok(s3?.price === sell(0.015, Y, 50), `sync @Y + markup khu 50%: giá 1 sao = ${s3?.price} (kỳ vọng ${sell(0.015, Y, 50)})`);
    const pr3 = await premium12();
    ok(pr3?.price === sell(35.99, Y, MARKUP), `nhóm khác (Premium) vẫn markup chung ${MARKUP}%: ${pr3?.price} (kỳ vọng ${sell(35.99, Y, MARKUP)})`);

    await cleanup();
    console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAIL`);
    process.exitCode = failures === 0 ? 0 : 1;
  } finally {
    proc.kill();
  }
}

main().catch(async (e) => {
  console.error(e);
  await cleanup().catch(() => {});
  process.exitCode = 1;
});
