import { SiteFooter, PublicHeader } from "@/components/site";

/**
 * Khung trang auth — MỘT thiết kế duy nhất theo mẫu shopkey (lệnh Tín
 * 2026-11-07): trang nằm trong khung site đầy đủ (PublicHeader + SiteFooter),
 * nền nhạt theo hệ theme chung (tối khi khách bật dark mode), MỘT cột giữa
 * gồm thẻ chính trắng ~600px (viền mảnh, bo ~12px, đổ bóng nhẹ) và MỘT thẻ
 * phụ riêng phía dưới chứa link chuyển đổi đăng nhập/đăng ký.
 * Hệ 5 kiểu auth cũ (classic/glass/minimal/app/split + auth_style) đã bỏ hẳn.
 */
export function AuthShell(props: { children: React.ReactNode; switchCard?: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="flex flex-1 items-start justify-center px-4 py-10 sm:py-14">
        <div className="w-full max-w-[600px]">
          {props.children}
          {props.switchCard}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
