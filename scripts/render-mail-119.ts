/** Dựng 1 thư mẫu order_delivered bằng ĐÚNG hàm của lib/customer-mail
 *  (renderMailTemplate + customerMailShell + mẫu mặc định trong
 *  DEFAULT_SETTINGS) -> ghi HTML vào ~/workspace/smm-anh để chụp ảnh soi
 *  trình bày. Không gửi thư thật.
 *  Chạy: npx tsx scripts/render-mail-119.ts */
import { writeFileSync } from "node:fs";
import { renderMailTemplate, customerMailShell } from "../src/lib/customer-mail";
import { DEFAULT_SETTINGS } from "../src/lib/settings";
import { wideLogoUrl } from "../src/lib/brand";
import { siteBaseUrl } from "../src/lib/email-verify";

function main() {
  const base = siteBaseUrl();
  const vars: Record<string, string> = {
    site_name: DEFAULT_SETTINGS.site_name || "BNT Shop",
    username: "demo",
    site_url: base,
    order_url: `${base}/dashboard/don-premium`,
    deposit_url: `${base}/dashboard/nap-tien`,
    pass_url: `${base}/pass`,
    password_url: `${base}/dashboard/ho-so?tab=security`,
    order_code: "PRE100001",
    product_name: "Netflix Premium 4K",
    variant_name: "Gói 1 tháng",
    delivery_content: "Tài khoản: khachhang@example.com\nMật khẩu: DemoPass#2026\nHồ sơ: Hồ sơ 3 — dùng tới 13/12/2026",
  };
  const subject = renderMailTemplate(DEFAULT_SETTINGS.mailtpl_order_delivered_subject_vi, vars).replace(/\s*\n\s*/g, " ").trim();
  const bodyText = renderMailTemplate(DEFAULT_SETTINGS.mailtpl_order_delivered_body_vi, vars);
  const logoRel = wideLogoUrl("", "");
  const logoAbsUrl = /^https?:\/\//i.test(logoRel) ? logoRel : `${base}${logoRel.startsWith("/") ? "" : "/"}${logoRel}`;
  const html = customerMailShell({ siteName: vars.site_name, logoAbsUrl, bodyText });
  const doc = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${subject}</title></head><body style="margin:0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif"><div style="max-width:760px;margin:0 auto;padding:10px 14px 0;color:#475569;font-size:13px">Tiêu đề thư: <b style="color:#0f172a">${subject}</b></div>${html}</body></html>`;
  const out = "/home/hatch/workspace/smm-anh/2026-11-13-mail-mau-order-delivered.html";
  writeFileSync(out, doc);
  console.log("WROTE", out, "| subject:", subject, "| logo:", logoAbsUrl);
}

main();
