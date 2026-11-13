/** CHỨNG MINH ĐỢT 120 — email khách + siteOrigin dựng từ site_url/site_name
 *  đã cấu hình. Script TỰ đặt trạng thái kiểm chứng vào DB local
 *  (site_name="Shop Kiểm Chứng", site_url="https://kiemchung.example.com/"
 *  — cố ý có "/" cuối để chứng minh chuẩn hoá lúc đọc), chạy xong KHÔNG tự
 *  dọn (đợt kiểm chứng seed lại DB sau). Bắt mail bằng transporter giả
 *  (vá nodemailer CJS qua createRequire như test-customer-mail).
 *  Chạy: npx tsx scripts/test-site-url-120.ts */
export {};
let pass = 0, fail = 0;
const check = (n: string, c: boolean, x = "") => { if (c) { pass++; console.log(`PASS  ${n}${x ? " — " + x : ""}`); } else { fail++; console.log(`FAIL  ${n}${x ? " — " + x : ""}`); } };

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const sent: { to: string; subject: string; html: string; text: string }[] = [];
  // Stub ĐỒNG BỘ như test-customer-mail: mailer gọi createTransport() rồi
  // dùng thẳng .sendMail — stub async sẽ trả Promise và làm gãy luồng.
  const stub = () => ({
    sendMail: async (opts: any) => {
      sent.push({ to: String((opts.bcc || []).join(",") || opts.to || ""), subject: String(opts.subject || ""), html: String(opts.html || ""), text: String(opts.text || "") });
      return { messageId: "stub-120" };
    },
  });
  const { createRequire } = await import("node:module");
  (createRequire(import.meta.url)("nodemailer") as any).createTransport = stub;
  ((await import("nodemailer")).default as any).createTransport = stub;

  const { setSetting } = await import("../src/lib/settings");
  // Tự đặt trạng thái kiểm chứng + bật mail khách/SMTP giả (DB local).
  for (const [k, v] of Object.entries({
    site_name: "Shop Kiểm Chứng", site_url: "https://kiemchung.example.com/",
    customer_mail_enabled: "1", smtp_enabled: "1", smtp_host: "stub.local",
    smtp_user: "stub@test.local", smtp_from: "noreply@test.local", smtp_pass: "x", smtp_port: "587", smtp_secure: "0",
  })) await setSetting(k, v);

  const sName = await prisma.setting.findUnique({ where: { key: "site_name" } });
  const sUrl = await prisma.setting.findUnique({ where: { key: "site_url" } });
  check("DB đang ở giá trị kiểm chứng", sName?.value === "Shop Kiểm Chứng" && sUrl?.value === "https://kiemchung.example.com/", `${sName?.value} / ${sUrl?.value}`);

  const user = await prisma.user.findFirst({ where: { username: "demo" }, select: { id: true, email: true } })
    || await prisma.user.findFirst({ where: { role: "USER" }, select: { id: true, email: true } });
  if (!user) throw new Error("không thấy user mẫu");

  const { sendCustomerMail } = await import("../src/lib/customer-mail");
  const r = await sendCustomerMail(user.id, "order_created", {
    order_code: "PRE120001", product_name: "Sản phẩm kiểm chứng", variant_name: "Gói 1 tháng", quantity: 1, total: "99.000đ",
  });
  check("sendCustomerMail -> SENT", r === "SENT", String(r));
  const m = sent[0];
  check("có đúng 1 thư bắt được", sent.length === 1, `to=${m?.to}`);
  check("tiêu đề thư chứa TÊN WEB mới", (m?.subject || "").includes("Shop Kiểm Chứng"), m?.subject);
  check("thân thư: link đơn hàng bắt đầu bằng DOMAIN mới", (m?.html || "").includes("https://kiemchung.example.com/dashboard/don-premium") || (m?.text || "").includes("https://kiemchung.example.com/dashboard/don-premium"));
  check("thân thư: biến site_url = domain mới", (m?.text || "").includes("https://kiemchung.example.com") || (m?.html || "").includes("https://kiemchung.example.com"));
  check("thân thư: logo trỏ về domain mới", (m?.html || "").includes("https://kiemchung.example.com/brand/logo-full.jpg"));
  check("không còn link localhost trong thư", !(m?.html || "").includes("localhost") && !(m?.text || "").includes("localhost"));

  // siteOrigin (URL quay về thanh toán) phải thắng bằng site_url đã cấu hình.
  const { siteOrigin } = await import("../src/lib/payments");
  let origin = "";
  try { origin = await siteOrigin(); } catch (e: any) { origin = `THREW: ${e?.message}`; }
  check("siteOrigin() = domain đã cấu hình (thắng host/env)", origin === "https://kiemchung.example.com", origin);

  console.log(`\n== verify-mail-120: ${pass} PASS, ${fail} FAIL ==`);
  await prisma.$disconnect();
  process.exitCode = fail ? 1 : 0;
}
main().catch((e) => { console.error("ERR", e); process.exitCode = 1; });
