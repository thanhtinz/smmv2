/**
 * Kiểm chứng đợt 119 — EMAIL TỰ ĐỘNG CHO KHÁCH (lib/customer-mail.ts):
 *  (a) sự kiện gửi đúng người / đúng mẫu / đúng biến, thư có khung brand +
 *      logo ngang, không lộ "{{...}}";
 *  (b) tắt công tắc SỰ KIỆN -> không gửi + MailLog SKIPPED; tắt TỔNG ->
 *      im lặng hoàn toàn (không mail, không log);
 *  (c) khách tắt "Nhận email thông báo" -> announcement bị chặn (SKIPPED)
 *      nhưng login_alert (thiết yếu) vẫn gửi;
 *  (d) login_alert qua recordLoginEvent: thiết bị cũ -> không cảnh báo,
 *      IP/UA mới -> có cảnh báo, lặp lại thiết bị đó -> không cảnh báo nữa;
 *  (e) đợt phát thông báo: chia lô đúng 50/lượt, đếm đúng, khách bị khoá /
 *      tắt nhận bị bỏ qua, khách đăng ký SAU khi tạo đợt không nhận;
 *  (f) biến không có dữ liệu -> không lộ "{{...}}", dòng chỉ chứa 1 biến
 *      trống bị bỏ khỏi thư;
 *  (g) SMTP hỏng -> sendCustomerMail FAILED + log FAILED, và luồng nghiệp
 *      vụ (tạo đơn) vẫn thành công;
 *  (h) móc thật: createPremiumOrder (AUTO_STOCK -> created + delivered;
 *      MANUAL -> chỉ created), creditExternalDeposit -> deposit_success,
 *      buyPass -> pass_purchased, processPassAutoRenewals -> pass_auto_renew
 *      + pass_auto_renew_failed.
 * Bắt mail bằng transporter giả (vá nodemailer CJS qua createRequire như
 * test-alerts-routing) — KHÔNG gửi mail thật.
 * Chạy: npx tsx scripts/test-customer-mail.ts (cần DATABASE_URL local)
 */
export {};
let pass = 0, fail = 0;
const check = (n: string, c: boolean, x = "") => { if (c) { pass++; console.log(`PASS  ${n}${x ? " — " + x : ""}`); } else { fail++; console.log(`FAIL  ${n}${x ? " — " + x : ""}`); } };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // ---- Transporter giả (ném lỗi khi transportThrows = true) ----
  let transportThrows = false;
  const sentMails: { bcc: string[]; subject: string; html: string; text: string }[] = [];
  const stubTransport = () => ({
    sendMail: async (opts: any) => {
      if (transportThrows) throw new Error("SMTP stub: connection refused");
      sentMails.push({ bcc: opts.bcc || [], subject: String(opts.subject || ""), html: String(opts.html || ""), text: String(opts.text || "") });
      return { messageId: "stub" };
    },
  });
  const { createRequire } = await import("node:module");
  (createRequire(import.meta.url)("nodemailer") as any).createTransport = stubTransport;
  ((await import("nodemailer")).default as any).createTransport = stubTransport;

  const { prisma } = await import("../src/lib/db");
  const { randomKey } = await import("../src/lib/format");
  const { sendCustomerMail, renderMailTemplate, createMailCampaign, processMailCampaignBatch } = await import("../src/lib/customer-mail");
  const { recordLoginEvent, deviceHashOf } = await import("../src/lib/login-events");
  const { createPremiumOrder } = await import("../src/lib/orders");
  const { creditExternalDeposit } = await import("../src/lib/payments");
  const { buyPass, processPassAutoRenewals } = await import("../src/lib/pass");

  const waitFor = async (cond: () => Promise<boolean> | boolean, ms = 6000) => { const t0 = Date.now(); while (!(await cond())) { if (Date.now() - t0 > ms) return false; await sleep(60); } return true; };
  const logsOf = (userId: number, event: string) => prisma.mailLog.findMany({ where: { userId, event }, orderBy: { id: "asc" } });
  const mailsTo = (email: string) => sentMails.filter((m) => m.bcc.includes(email));

  // ---- Settings fixture: lưu cũ -> đặt -> cuối test khôi phục ----
  const KEYS = [
    "smtp_enabled", "smtp_host", "smtp_user", "smtp_from", "smtp_pass", "smtp_port", "smtp_secure",
    "customer_mail_enabled", "customer_mail_ev_order_created",
    "customer_mail_ev_announcement", "customer_mail_ev_login_alert",
    "mailtpl_order_created_body_vi", "default_lang", "langs_enabled",
    "pass_enabled", "pass_name", "pass_price_1m", "pass_price_3m", "pass_price_12m",
    "telegram_notify", "alert_discord_enabled", "alert_email_enabled",
  ];
  const old: Record<string, string | null> = {};
  for (const k of KEYS) old[k] = (await prisma.setting.findUnique({ where: { key: k } }))?.value ?? null;
  const set = async (kv: Record<string, string>) => { for (const [k, v] of Object.entries(kv)) await prisma.setting.upsert({ where: { key: k }, create: { key: k, value: v }, update: { value: v } }); };
  await set({
    smtp_enabled: "1", smtp_host: "stub.local", smtp_user: "stub@test.local", smtp_from: "noreply@test.local", smtp_pass: "x", smtp_port: "587", smtp_secure: "0",
    customer_mail_enabled: "1",
    default_lang: "vi", langs_enabled: JSON.stringify(["vi", "en"]),
    pass_enabled: "1", pass_name: "Pass VIP", pass_price_1m: "49000", pass_price_3m: "129000", pass_price_12m: "399000",
    telegram_notify: "0", alert_discord_enabled: "0", alert_email_enabled: "0",
  });

  const suffix = randomKey(6).toLowerCase();
  const mkUser = async (tag: string, extra: any = {}) =>
    prisma.user.create({
      data: {
        username: `cm${tag}${suffix}`, email: `cm${tag}${suffix}@test.local`, passwordHash: "x",
        balance: 100000000, apiKey: randomKey(32), depositCode: randomKey(6).toUpperCase(), ...extra,
      },
    });

  try {
    const userA = await mkUser("a");
    const userOptOut = await mkUser("opt", { emailNotify: false });
    const userBanned = await mkUser("ban", { status: "BANNED" });

    // ---- (a) gửi đúng người/đúng mẫu/đúng biến ----
    sentMails.length = 0;
    const r1 = await sendCustomerMail(userA.id, "order_created", { order_code: "PRE999001", product_name: "Netflix Premium", variant_name: "Gói 1 tháng", quantity: 2, total: "198.000đ" });
    check("(a) order_created trả SENT", r1 === "SENT", r1);
    check("(a) đúng 1 mail tới đúng khách", sentMails.length === 1 && sentMails[0].bcc.includes(userA.email), JSON.stringify(sentMails[0]?.bcc));
    check("(a) tiêu đề chứa mã đơn, không còn biến thô", (sentMails[0]?.subject || "").includes("PRE999001") && !sentMails[0].subject.includes("{{"), sentMails[0]?.subject);
    check("(a) thân thư chứa sản phẩm + tổng tiền", (sentMails[0]?.html || "").includes("Netflix Premium") && sentMails[0].html.includes("198.000đ"));
    check("(a) thư có logo ngang brand + bản text thuần", (sentMails[0]?.html || "").includes("/brand/logo-full.jpg") && (sentMails[0]?.text || "").includes("PRE999001"));
    const logsA = await logsOf(userA.id, "order_created");
    check("(a) MailLog ghi SENT", logsA.length === 1 && logsA[0].status === "SENT", JSON.stringify(logsA.map((l) => l.status)));

    // ---- (f) biến trống / biến lạ không lộ "{{...}}" + bỏ dòng chỉ có biến trống ----
    const rendered = renderMailTemplate("Dòng 1 {{a}}\n{{b}}\nCuối {{c}} {{thieu}}", { a: "X", b: "", c: "Y" });
    check("(f) render: dòng chỉ chứa biến trống bị bỏ, biến lạ thành trống", rendered === "Dòng 1 X\nCuối Y ", JSON.stringify(rendered));
    sentMails.length = 0;
    const r2 = await sendCustomerMail(userA.id, "order_delivered", { order_code: "PRE999002", product_name: "HBO", variant_name: "Gói 1 tháng", delivery_content: "" });
    check("(f) order_delivered không có nội dung giao vẫn gửi, không lộ biến", r2 === "SENT" && !(sentMails[0]?.html || "").includes("{{"));

    // ---- (b) tắt sự kiện -> SKIPPED + log; tắt tổng -> im lặng ----
    await set({ customer_mail_ev_order_created: "0" });
    sentMails.length = 0;
    const before = await prisma.mailLog.count({ where: { userId: userA.id, event: "order_created" } });
    const r3 = await sendCustomerMail(userA.id, "order_created", { order_code: "PRE999003" });
    const after = await logsOf(userA.id, "order_created");
    check("(b) tắt sự kiện: không gửi + log SKIPPED", r3 === "SKIPPED" && sentMails.length === 0 && after.length === before + 1 && after[after.length - 1].status === "SKIPPED", r3);
    await set({ customer_mail_ev_order_created: "1", customer_mail_enabled: "0" });
    const logCount0 = await prisma.mailLog.count({ where: { userId: userA.id } });
    const r4 = await sendCustomerMail(userA.id, "order_created", { order_code: "PRE999004" });
    const logCount1 = await prisma.mailLog.count({ where: { userId: userA.id } });
    check("(b) tắt tổng: OFF, không mail, không log mới", r4 === "OFF" && sentMails.length === 0 && logCount1 === logCount0, r4);
    await set({ customer_mail_enabled: "1" });

    // ---- (c) khách tắt nhận thông báo: announcement chặn, login_alert vẫn gửi ----
    sentMails.length = 0;
    const r5 = await sendCustomerMail(userOptOut.id, "announcement", {});
    const logsOpt = await logsOf(userOptOut.id, "announcement");
    check("(c) announcement bị chặn khi khách tắt nhận + log SKIPPED", r5 === "SKIPPED" && sentMails.length === 0 && logsOpt.length === 1 && logsOpt[0].status === "SKIPPED", r5);
    const r6 = await sendCustomerMail(userOptOut.id, "login_alert", { time: "13/11/2026 10:00", ip: "198.51.100.7", device: "UA test" });
    check("(c) login_alert vẫn gửi cho khách đã tắt nhận thông báo", r6 === "SENT" && mailsTo(userOptOut.email).length === 1, r6);

    // ---- (d) login_alert qua recordLoginEvent ----
    const userD = await mkUser("d");
    // lần đăng nhập thành công đầu tiên trong lịch sử -> chỉ ghi nhận, không cảnh báo
    await recordLoginEvent({ userId: userD.id, username: userD.username, success: true, ip: "10.0.0.1", userAgent: "UA-OLD" });
    await sleep(300);
    check("(d) lần đăng nhập đầu tiên: không cảnh báo", (await logsOf(userD.id, "login_alert")).length === 0);
    // cùng thiết bị -> không cảnh báo
    await recordLoginEvent({ userId: userD.id, username: userD.username, success: true, ip: "10.0.0.1", userAgent: "UA-OLD" });
    await sleep(300);
    check("(d) thiết bị cũ: không cảnh báo", (await logsOf(userD.id, "login_alert")).length === 0);
    // thiết bị mới -> cảnh báo
    await recordLoginEvent({ userId: userD.id, username: userD.username, success: true, ip: "203.0.113.9", userAgent: "UA-NEW" });
    check("(d) IP/UA mới: có mail cảnh báo", await waitFor(async () => (await logsOf(userD.id, "login_alert")).some((l) => l.status === "SENT")));
    check("(d) nội dung cảnh báo có IP mới", mailsTo(userD.email).some((m) => m.html.includes("203.0.113.9")));
    // lặp lại đúng thiết bị mới đó -> không cảnh báo thêm
    await recordLoginEvent({ userId: userD.id, username: userD.username, success: true, ip: "203.0.113.9", userAgent: "UA-NEW" });
    await sleep(300);
    check("(d) lặp lại thiết bị đã thấy: không cảnh báo thêm", (await logsOf(userD.id, "login_alert")).length === 1);
    void deviceHashOf;

    // ---- (h1) móc createPremiumOrder ----
    const cat = await prisma.premiumCategory.create({ data: { name: `CMTest ${suffix}`, slug: `cmtest-${suffix}` } });
    const prodAuto = await prisma.premiumProduct.create({ data: { categoryId: cat.id, name: `CMAuto ${suffix}`, slug: `cmauto-${suffix}`, fulfillment: "AUTO_STOCK" } });
    const vAuto = await prisma.premiumVariant.create({ data: { productId: prodAuto.id, name: "Gói tự giao", price: 10000, cost: 1000 } });
    await prisma.premiumStock.create({ data: { variantId: vAuto.id, payload: `ACC-CM-${suffix}` } });
    const prodManual = await prisma.premiumProduct.create({ data: { categoryId: cat.id, name: `CMManual ${suffix}`, slug: `cmmanual-${suffix}`, fulfillment: "MANUAL" } });
    const vManual = await prisma.premiumVariant.create({ data: { productId: prodManual.id, name: "Gói giao tay", price: 10000, cost: 1000 } });
    const buyer = await mkUser("buy");
    const oAuto = await createPremiumOrder({ user: buyer, variantId: vAuto.id, quantity: 1, buyerInfo: "buyer@test.local" });
    check("(h1) đơn AUTO_STOCK giao ngay", oAuto.status === "DELIVERED", oAuto.status);
    check("(h1) mail order_created đã ghi", await waitFor(async () => (await logsOf(buyer.id, "order_created")).some((l) => l.status === "SENT" && l.subject.includes(oAuto.code))));
    check("(h1) mail order_delivered kèm nội dung giao của khách", await waitFor(async () => (await logsOf(buyer.id, "order_delivered")).some((l) => l.status === "SENT")) && mailsTo(buyer.email).some((m) => m.html.includes(`ACC-CM-${suffix}`)));
    const oManual = await createPremiumOrder({ user: buyer, variantId: vManual.id, quantity: 1, buyerInfo: "buyer@test.local" });
    check("(h1) đơn MANUAL chờ giao", oManual.status === "PENDING", oManual.status);
    await sleep(500);
    check("(h1) đơn MANUAL: có order_created, chưa có delivered của đơn này", (await logsOf(buyer.id, "order_created")).filter((l) => l.subject.includes(oManual.code)).length === 1 && (await logsOf(buyer.id, "order_delivered")).length === 1);

    // ---- (h2) móc deposit qua creditExternalDeposit (Stripe/PayPal) ----
    const depUser = await mkUser("dep");
    const dep = await prisma.deposit.create({ data: { code: `NAPCM${suffix}`.slice(0, 16), userId: depUser.id, method: "STRIPE", amount: 250000, usdCents: 1000, status: "PENDING", auto: true, externalId: `ext-cm-${suffix}` } });
    const cr = await creditExternalDeposit(`ext-cm-${suffix}`, 1000);
    check("(h2) creditExternalDeposit cộng tiền", cr.ok === true, cr.reason);
    check("(h2) mail deposit_success đã gửi đúng mã + số tiền", await waitFor(async () => (await logsOf(depUser.id, "deposit_success")).some((l) => l.status === "SENT")) && mailsTo(depUser.email).some((m) => m.html.includes(dep.code) && m.html.includes("250.000đ")));
    void dep;

    // ---- (h3) Pass: mua + tự gia hạn ----
    const passBuyer = await mkUser("pass");
    await buyPass(passBuyer.id, 1);
    check("(h3) buyPass -> mail pass_purchased", await waitFor(async () => (await logsOf(passBuyer.id, "pass_purchased")).some((l) => l.status === "SENT")) && mailsTo(passBuyer.email).some((m) => m.html.includes("Pass VIP")));
    const soon = new Date(Date.now() + 3600 * 1000);
    const renewOk = await mkUser("rok", { balance: 1000000, passExpiresAt: soon, passTermMonths: 1, passAutoRenew: true, passCancelledAt: null });
    const renewFail = await mkUser("rfail", { balance: 100, passExpiresAt: soon, passTermMonths: 1, passAutoRenew: true, passCancelledAt: null });
    const rr = await processPassAutoRenewals();
    check("(h3) vòng tự gia hạn chạy (1 thành công + 1 thất bại)", rr.renewed >= 1 && rr.failed >= 1, JSON.stringify(rr));
    check("(h3) mail pass_auto_renew cho khách đủ số dư", await waitFor(async () => (await logsOf(renewOk.id, "pass_auto_renew")).some((l) => l.status === "SENT")));
    check("(h3) mail pass_auto_renew_failed cho khách thiếu số dư", await waitFor(async () => (await logsOf(renewFail.id, "pass_auto_renew_failed")).some((l) => l.status === "SENT")));

    // ---- (g) SMTP hỏng: FAILED + nghiệp vụ không hỏng ----
    transportThrows = true;
    const rFail = await sendCustomerMail(userA.id, "order_created", { order_code: "PRE999005" });
    const failLogs = await logsOf(userA.id, "order_created");
    check("(g) SMTP hỏng -> FAILED + log FAILED", rFail === "FAILED" && failLogs[failLogs.length - 1].status === "FAILED", rFail);
    let orderOk = false;
    try {
      const o = await createPremiumOrder({ user: buyer, variantId: vManual.id, quantity: 1, buyerInfo: "buyer@test.local" });
      orderOk = !!o.id;
    } catch { orderOk = false; }
    check("(g) tạo đơn vẫn thành công khi SMTP hỏng", orderOk);
    await waitFor(async () => (await logsOf(buyer.id, "order_created")).some((l) => l.status === "FAILED"));
    transportThrows = false;

    // ---- (e) đợt phát thông báo theo lô ----
    const batchUsers: any[] = [];
    for (let i = 0; i < 55; i++) batchUsers.push(await mkUser(`b${i}`));
    const totalUsers = await prisma.user.count();
    const campaign = await createMailCampaign({ createdBy: userA.id, subjectVi: `Thông báo thử ${suffix}`, bodyVi: "Chào {{username}}, đây là thông báo thử nghiệm." });
    check("(e) đợt phát chụp đúng tổng khách + mốc id", campaign.totalCount === totalUsers && campaign.maxUserId >= batchUsers[54].id, `${campaign.totalCount}/${totalUsers}`);
    const lateUser = await mkUser("late"); // đăng ký SAU khi tạo đợt -> không nhận
    const b1: any = await processMailCampaignBatch();
    check("(e) lượt 1 xử lý đúng 50 khách", b1.processed === 50, JSON.stringify(b1));
    let guard = 0;
    let lastBatch: any = b1;
    while (!lastBatch.done && guard++ < 10) lastBatch = await processMailCampaignBatch();
    const campAfter = await prisma.mailCampaign.findUnique({ where: { id: campaign.id } });
    check("(e) đợt phát hoàn tất (DONE)", campAfter?.status === "DONE", campAfter?.status);
    check("(e) đếm khớp: sent+failed+skipped = tổng", (campAfter!.sentCount + campAfter!.failedCount + campAfter!.skippedCount) === campAfter!.totalCount, `${campAfter!.sentCount}+${campAfter!.failedCount}+${campAfter!.skippedCount} vs ${campAfter!.totalCount}`);
    const campLogs = await prisma.mailLog.findMany({ where: { campaignId: campaign.id } });
    check("(e) khách thường nhận SENT", campLogs.some((l) => l.userId === batchUsers[0].id && l.status === "SENT"));
    check("(e) khách tắt nhận -> SKIPPED trong đợt", campLogs.some((l) => l.userId === userOptOut.id && l.status === "SKIPPED"));
    check("(e) khách bị khoá -> SKIPPED trong đợt", campLogs.some((l) => l.userId === userBanned.id && l.status === "SKIPPED"));
    check("(e) khách đăng ký sau mốc tạo đợt -> KHÔNG có log của đợt", !campLogs.some((l) => l.userId === lateUser.id));
    check("(e) thư thông báo chứa tên khách (biến username)", mailsTo(batchUsers[0].email).some((m) => m.html.includes(batchUsers[0].username)));
  } finally {
    for (const k of KEYS) {
      const v = old[k];
      if (v === null || v === undefined) await prisma.setting.deleteMany({ where: { key: k } });
      else await prisma.setting.upsert({ where: { key: k }, create: { key: k, value: v }, update: { value: v } });
    }
    await prisma.$disconnect();
  }
  console.log(`\n== test-customer-mail: ${pass} PASS, ${fail} FAIL ==`);
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => { console.error("FATAL", e); process.exit(1); });
