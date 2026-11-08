/**
 * FIX11 TASK 3 — Kiểm chứng đồng bộ THEO KHU + markup override theo nhóm
 * (tầng lib, mock FZR): sync groups:["gamekeys"] với markupFor 50% chỉ tạo
 * sản phẩm gamekeys giá theo 50%, KHÔNG đụng nhóm khác; sync giftcards sau
 * đó không đổi số lượng gamekeys; fzrMarkupFor đọc override trong Settings
 * và rơi về markupPercent của provider khi chưa đặt.
 * Chạy: npx tsx scripts/test-fzr-area.ts (tự bật mock ở cổng 3998).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { prisma } from "../src/lib/db";
import { syncFzrCatalog } from "../src/lib/fzr-sync";
import { fzrMarkupFor, fzrMarkupResolver, fzrMarkupKey } from "../src/lib/fzr-markup";
import { setSetting } from "../src/lib/settings";

const MOCK = "http://127.0.0.1:3998";
const RATE = 1000, MARKUP = 30;
let failures = 0;
const ok = (cond: boolean, label: string) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; };
const sell = (usd: number, m: number) => Math.ceil(usd * RATE * (1 + m / 100));

async function waitMock() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${MOCK}/__log`); if (r.ok) return; } catch { /* chưa lên */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Mock FZR không lên");
}

async function main() {
  const proc: ChildProcess = spawn("node", ["scripts/mock-fzr.mjs"], { stdio: "ignore" });
  try {
    await waitMock();
    const PID = 999003;
    const oldVariants = (await prisma.premiumVariant.findMany({ where: { providerId: PID }, select: { id: true } })).map((v) => v.id);
    if (oldVariants.length) {
      await prisma.premiumOrder.deleteMany({ where: { variantId: { in: oldVariants } } });
      await prisma.premiumVariant.deleteMany({ where: { id: { in: oldVariants } } });
    }
    await prisma.premiumProduct.deleteMany({ where: { providerId: PID } });
    await prisma.provider.deleteMany({ where: { id: PID } });
    await prisma.setting.deleteMany({ where: { key: { in: [fzrMarkupKey("telegram_stars"), fzrMarkupKey("gamekeys")] } } });

    const provider = await prisma.provider.create({
      data: { id: PID, kind: "PREMIUM", driver: "FZR", name: "MockFZR-Area", apiUrl: MOCK, apiKey: "fc_test_mock", currency: "USD", exchangeRate: RATE, markupPercent: MARKUP, active: true },
    });
    const fresh = async () => (await prisma.provider.findUnique({ where: { id: PID } }))!;

    /* 1) Resolver: chưa đặt override -> markup chung; đặt -> override thắng */
    ok((await fzrMarkupFor(provider, "telegram_stars")) === MARKUP, "chưa đặt override: markup = markup chung 30%");
    await setSetting(fzrMarkupKey("telegram_stars"), "50");
    ok((await fzrMarkupFor(await fresh(), "telegram_stars")) === 50, "đặt override telegram_stars=50: hiệu lực 50%");
    ok((await fzrMarkupFor(await fresh(), "steam_gift")) === MARKUP, "nhóm khác chưa đặt vẫn 30%");

    /* 2) Sync RIÊNG gamekeys với markupFor (gamekeys 50, còn lại 30) */
    const resolver = await fzrMarkupResolver(await fresh());
    const markupFor = (g: string) => (g === "gamekeys" ? 50 : resolver(g));
    const r1 = await syncFzrCatalog(await fresh(), { groups: ["gamekeys"], markupFor });
    const gkCount = await prisma.premiumProduct.count({ where: { providerId: PID, variants: { some: { providerGroup: "gamekeys" } } } });
    const otherCount = await prisma.premiumProduct.count({ where: { providerId: PID, variants: { some: { providerGroup: { not: "gamekeys" } } } } });
    ok(gkCount > 0 && otherCount === 0, `sync riêng gamekeys: ${gkCount} sản phẩm gamekeys, ${otherCount} sản phẩm nhóm khác (phải 0)`);
    const gkV = await prisma.premiumVariant.findFirst({ where: { providerId: PID, providerGroup: "gamekeys", providerItemId: "gk-1-std" } });
    ok(gkV?.price === sell(59.99, 50), `giá gk-1-std theo markup khu 50%: ${gkV?.price} (kỳ vọng ${sell(59.99, 50)})`);
    ok(r1.total === gkCount, "kết quả sync chỉ gồm item gamekeys");

    /* 3) Sync RIÊNG giftcards: gamekeys không đổi, giftcards giá 30% */
    await syncFzrCatalog(await fresh(), { groups: ["giftcards"], markupFor });
    const gkCount2 = await prisma.premiumProduct.count({ where: { providerId: PID, variants: { some: { providerGroup: "gamekeys" } } } });
    const gcV = await prisma.premiumVariant.findFirst({ where: { providerId: PID, providerGroup: "giftcards", providerItemId: "gc-tr-50" } });
    ok(gkCount2 === gkCount, `sync giftcards không đụng gamekeys (${gkCount} -> ${gkCount2})`);
    ok(gcV?.price === sell(0.89, 30), `giá gc-tr-50 theo markup chung 30%: ${gcV?.price} (kỳ vọng ${sell(0.89, 30)})`);

    console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);

    /* Dọn dẹp */
    const variantIds = (await prisma.premiumVariant.findMany({ where: { providerId: PID }, select: { id: true } })).map((v) => v.id);
    const productIds = (await prisma.premiumProduct.findMany({ where: { providerId: PID }, select: { id: true } })).map((p) => p.id);
    await prisma.premiumOrder.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.premiumVariant.deleteMany({ where: { id: { in: variantIds } } });
    await prisma.premiumProduct.deleteMany({ where: { id: { in: productIds } } });
    await prisma.premiumCategory.deleteMany({ where: { slug: { endsWith: `-${PID}` }, products: { none: {} } } });
    await prisma.provider.delete({ where: { id: PID } });
    await prisma.setting.deleteMany({ where: { key: { in: [fzrMarkupKey("telegram_stars"), fzrMarkupKey("gamekeys")] } } });
    console.log("CLEANUP done");
  } finally {
    proc.kill();
  }
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
