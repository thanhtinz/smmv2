import { prisma } from "@/lib/db";
import { applyBalance } from "@/lib/wallet";
import { claimPassGift } from "@/lib/pass";
import { consumePromo } from "@/lib/promo";
import { sanitizeHtml } from "@/lib/sanitize";
import { setSetting, getSettings } from "@/lib/settings";

async function main() {
  const results: string[] = [];
  // --- 1. applyBalance: 2 lần trừ 80k đồng thời trên số dư 100k -> chỉ 1 thành công
  const suf = String(Date.now()).slice(-6);
  const u = await prisma.user.create({ data: { username: "racetest" + suf, email: `race${suf}@t.local`, passwordHash: "x", apiKey: "racekey" + suf, depositCode: "RC" + suf, refCode: "RF" + suf, balance: 100000 } });
  const attempt = () => prisma.$transaction(async (tx) => { await applyBalance(tx, u.id, -80000, "SMM_ORDER" as any, "TEST", "race"); }).then(() => "ok").catch(() => "fail");
  const [a, b] = await Promise.all([attempt(), attempt()]);
  const after = await prisma.user.findUnique({ where: { id: u.id }, select: { balance: true } });
  results.push(`applyBalance race: ${[a, b].sort().join("+")} balance=${after?.balance} ${[a, b].filter((x) => x === "ok").length === 1 && after?.balance === 20000 ? "PASS" : "FAIL"}`);

  // --- 2. claimPassGift: 2 lần nhận quà tháng đồng thời -> chỉ 1 đơn quà
  // (guard = khoá duy nhất userId+monthKey của PassGiftClaim; thay mục race
  // hoàn tiền SMM đã gỡ cùng engine SMM — đợt gỡ 2026-11-12.)
  const oldGiftP = (await prisma.setting.findUnique({ where: { key: "pass_gift_product_id" } }))?.value ?? null;
  const oldGiftV = (await prisma.setting.findUnique({ where: { key: "pass_gift_variant_id" } }))?.value ?? null;
  const oldEnabled = (await prisma.setting.findUnique({ where: { key: "pass_enabled" } }))?.value ?? null;
  const gcat = await prisma.premiumCategory.create({ data: { name: "RaceGift " + suf, slug: "racegift-" + suf } });
  const gprod = await prisma.premiumProduct.create({ data: { categoryId: gcat.id, name: "RaceGift Prod " + suf, slug: "racegift-prod-" + suf, fulfillment: "AUTO_STOCK" } });
  const gvar = await prisma.premiumVariant.create({ data: { productId: gprod.id, name: "Quà race", price: 10000, cost: 1000 } });
  await prisma.premiumStock.createMany({ data: [{ variantId: gvar.id, payload: "RACE-1-" + suf }, { variantId: gvar.id, payload: "RACE-2-" + suf }] });
  await setSetting("pass_enabled", "1");
  await setSetting("pass_gift_product_id", String(gprod.id));
  await setSetting("pass_gift_variant_id", String(gvar.id));
  await prisma.user.update({ where: { id: u.id }, data: { passExpiresAt: new Date(Date.now() + 30 * 86400_000) } });
  const claims = await Promise.allSettled([claimPassGift(u.id), claimPassGift(u.id)]);
  const okClaims = claims.filter((c) => c.status === "fulfilled").length;
  const giftOrders = await prisma.premiumOrder.count({ where: { userId: u.id } });
  const stockLeft = await prisma.premiumStock.count({ where: { variantId: gvar.id, status: "AVAILABLE" } });
  results.push(`gift claim race: ok=${okClaims} orders=${giftOrders} stockLeft=${stockLeft} ${okClaims === 1 && giftOrders === 1 && stockLeft === 1 ? "PASS" : "FAIL"}`);
  // dọn fixture quà + khôi phục setting
  await prisma.passGiftClaim.deleteMany({ where: { userId: u.id } });
  await prisma.premiumOrder.deleteMany({ where: { userId: u.id } });
  await prisma.premiumStock.deleteMany({ where: { variantId: gvar.id } });
  await prisma.premiumVariant.deleteMany({ where: { id: gvar.id } });
  await prisma.premiumProduct.deleteMany({ where: { id: gprod.id } });
  await prisma.premiumCategory.deleteMany({ where: { id: gcat.id } });
  const restore = async (k: string, v: string | null) => { if (v === null) await prisma.setting.deleteMany({ where: { key: k } }); else await setSetting(k, v); };
  await restore("pass_gift_product_id", oldGiftP); await restore("pass_gift_variant_id", oldGiftV); await restore("pass_enabled", oldEnabled);

  // --- 3. consumePromo: limit 1, 2 lần dùng đồng thời -> 1 thành công
  const dc = await prisma.discountCode.create({ data: { code: "RACE" + suf, type: "FIXED", value: 1000, usageLimit: 1, usedCount: 0, active: true } });
  const use = () => prisma.$transaction(async (tx) => { await consumePromo(tx, dc.id); }).then(() => "ok").catch(() => "fail");
  const [c1, c2] = await Promise.all([use(), use()]);
  const dcAfter = await prisma.discountCode.findUnique({ where: { id: dc.id } });
  results.push(`promo race: ${[c1, c2].sort().join("+")} usedCount=${dcAfter?.usedCount} ${[c1, c2].filter((x) => x === "ok").length === 1 && dcAfter?.usedCount === 1 ? "PASS" : "FAIL"}`);

  // --- 4. sanitizeHtml
  const x1 = sanitizeHtml('<p>Chào <b>bạn</b></p><script>alert(1)</script><img src="x" onerror="alert(2)"><a href="javascript:alert(3)">click</a><a href="https://ok.vn" target="_blank">ok</a>');
  const pass1 = !x1.includes("<script") && !x1.includes("onerror") && !x1.includes("javascript:") && x1.includes("<b>bạn</b>") && x1.includes('href="https://ok.vn"');
  results.push(`sanitize: ${pass1 ? "PASS" : "FAIL"} -> ${x1}`);

  // --- 5. secret-box: lưu mã hoá, đọc giải mã (cần APP_ENC_KEY trong env)
  await setSetting("sepay_secret", "s3cr3t-value");
  const raw = await prisma.setting.findUnique({ where: { key: "sepay_secret" } });
  const back = (await getSettings()).sepay_secret;
  const encOn = !!process.env.APP_ENC_KEY;
  results.push(`secret-box: stored=${raw?.value.slice(0, 4)}... read=${back} ${back === "s3cr3t-value" && (!encOn || raw?.value.startsWith("enc:")) ? "PASS" : "FAIL"} (enc ${encOn ? "on" : "off"})`);

  console.log(results.join("\n"));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
