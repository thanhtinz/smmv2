import { prisma } from "@/lib/db";
import { applyBalance } from "@/lib/wallet";
import { refundSmmOrder } from "@/lib/orders";
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

  // --- 2. refundSmmOrder: 2 lần hoàn đồng thời -> tổng hoàn = đúng charge
  const svc = await prisma.smmService.findFirst();
  const ord = await prisma.smmOrder.create({ data: { code: "TEST-RACE-" + suf, userId: u.id, serviceId: svc!.id, link: "https://x", quantity: 1000, charge: 50000, status: "PROCESSING", fulfillment: "MANUAL" } });
  const balBefore = (await prisma.user.findUnique({ where: { id: u.id }, select: { balance: true } }))!.balance;
  await Promise.all([refundSmmOrder(ord.id, 50000, "test1", "REFUNDED"), refundSmmOrder(ord.id, 50000, "test2", "REFUNDED")]);
  const ordAfter = await prisma.smmOrder.findUnique({ where: { id: ord.id } });
  const balAfter = (await prisma.user.findUnique({ where: { id: u.id }, select: { balance: true } }))!.balance;
  results.push(`refund race: refundedAmount=${ordAfter?.refundedAmount} credited=${balAfter - balBefore} ${ordAfter?.refundedAmount === 50000 && balAfter - balBefore === 50000 ? "PASS" : "FAIL"}`);

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
