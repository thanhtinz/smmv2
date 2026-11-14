import { headers } from "next/headers";
import { PublicFrame } from "@/components/public-frame";
import { getSettings } from "@/lib/settings";
import { guardSetupDone } from "@/lib/setup";
import { wideLogoUrl } from "@/lib/brand";

/**
 * Khung trang auth — MỘT thiết kế duy nhất theo mẫu shopkey (lệnh Tín
 * 2026-11-07): trang nằm trong khung site đầy đủ (PublicFrame — header trắng
 * khu khách hàng + footer sáng, lệnh 2026-11-07 23:03), nền nhạt theo hệ theme
 * chung (tối khi khách bật dark mode), MỘT cột giữa gồm thẻ chính trắng ~600px
 * (viền mảnh, bo ~12px, đổ bóng nhẹ) và MỘT thẻ phụ riêng phía dưới chứa link
 * chuyển đổi đăng nhập/đăng ký.
 * Hệ 5 kiểu auth cũ (classic/glass/minimal/app/split + auth_style) đã bỏ hẳn.
 *
 * NGOẠI LỆ THEO BỀ MẶT (đợt 127 + lệnh Tín 2026-11-13 "login admin lại có
 * header, footer của home"): trên host admin.<miền gốc>, các trang auth là
 * cổng vào KHU QUẢN TRỊ nên dùng khung ĐỘC LẬP — nền slate sáng, logo ở
 * giữa phía trên thẻ, KHÔNG header/footer/menu của khu khách. Cổng thiết
 * lập lần đầu (guardSetupDone) giữ nguyên như PublicFrame ở cả hai khung.
 */
export async function AuthShell(props: { children: React.ReactNode; switchCard?: React.ReactNode; skipSetupGate?: boolean }) {
  const host = (headers().get("host") || "").split(":")[0].toLowerCase();
  const parts = host.split(".");
  const onAdminHost = parts.length > 2 && parts[0] === "admin";

  if (onAdminHost) {
    if (!props.skipSetupGate) await guardSetupDone();
    const s = await getSettings().catch(() => null);
    const logo = wideLogoUrl(s?.logo_menu_url, s?.logo_url);
    const siteName = (s?.site_name || "").trim() || "BNT Shop";
    return (
      <div className="flex min-h-screen flex-col bg-slate-100">
        <main className="flex flex-1 items-start justify-center px-4 py-10 sm:py-14">
          <div className="w-full max-w-[600px]">
            <div className="mb-6 flex justify-center">
              <img src={logo} alt={siteName} className="h-10 w-auto max-w-[180px] object-contain" />
            </div>
            {props.children}
            {props.switchCard}
          </div>
        </main>
      </div>
    );
  }

  return (
    <PublicFrame skipSetupGate={props.skipSetupGate}>
      <main className="flex flex-1 items-start justify-center px-4 py-10 sm:py-14">
        <div className="w-full max-w-[600px]">
          {props.children}
          {props.switchCard}
        </div>
      </main>
    </PublicFrame>
  );
}
