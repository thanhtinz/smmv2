import { redirect } from "next/navigation";
import { Flash } from "@/components/ui";
import { setupAction } from "@/app/actions/setup";
import { isSetupNeeded } from "@/lib/setup";
import { prisma } from "@/lib/db";
import { authCardCls, authInpCls, authBtnCls } from "@/lib/auth-ui";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

/* THIẾT LẬP LẦN ĐẦU (lệnh Tín 2026-11-11): bản cài mới không có tài khoản mẫu
   nào — trang này chỉ tồn tại khi bảng users còn trống (lib/setup.ts chốt cả
   ở trang lẫn trong action). Chủ site đặt tên website + tạo tài khoản quản
   trị đầu tiên, xong được đăng nhập thẳng vào khu quản trị. Đã thiết lập rồi
   thì /setup tự chuyển về trang chủ.
   Màn hình ĐỘC LẬP kiểu trình cài đặt (chỉnh theo lệnh Tín 2026-11-11 09:13
   "Sao lại có header, footer ở đó"): KHÔNG khung site — không header, không
   footer, không dải thông báo, không trang trí mùa, không nút liên hệ nổi.
   Website chưa cấu hình thì chưa có gì để đưa lên header; chỉ nền trơn phớt
   màu thương hiệu + thẻ thiết lập ở giữa.
   KHÔNG nhận diện mẫu nào (chỉnh theo lệnh Tín 2026-11-11 09:28 "Vẫn còn
   kìa"): site chưa có tên hay logo cho tới khi chủ site tự gõ — ô tên
   website mở ra TRỐNG (đọc setting THÔ trong DB, không lấy giá trị dự
   phòng "SMMv2" trong code qua getSettings) và thẻ KHÔNG có ô logo/chữ cái. */
export default async function SetupPage( { searchParams: searchParamsPromise }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const searchParams = await searchParamsPromise;
  if (!(await isSetupNeeded())) redirect("/");
  // Chỉ đọc dòng setting site_name THÔ: bản cài mới chưa hề có dòng này
  // (seed-prod không trồng tên) -> ô nhập trống; tuyệt đối không để giá trị
  // mặc định trong code (DEFAULT_SETTINGS.site_name) chảy vào trang setup.
  const rawSiteName = await prisma.setting.findUnique({ where: { key: "site_name" }, select: { value: true } }).catch(() => null);
  const { L, Ld } = await getServerI18n();
  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 py-10"
      style={{ background: "linear-gradient(180deg,#e8effe 0%,#f4f7fe 45%,#f8fafc 100%)" }}
    >
      <main className="w-full max-w-[600px]">
        <div className={authCardCls}>
          <h1 className="text-center text-2xl font-extrabold text-slate-900">{L("Thiết lập lần đầu")}</h1>
          <p className="mb-7 mt-2 text-center text-sm text-slate-500">{L("Tạo tài khoản quản trị đầu tiên để bắt đầu sử dụng website")}</p>
          <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
          <form action={setupAction} className="space-y-4">
            <input className={authInpCls} name="siteName" required maxLength={80} defaultValue={rawSiteName?.value || ""} placeholder={L("Tên website")} aria-label={L("Tên website")} />
            <input className={authInpCls} name="username" required autoComplete="username" placeholder={L("Tài khoản đăng nhập")} aria-label={L("Tài khoản đăng nhập")} />
            <input className={authInpCls} name="email" type="email" required autoComplete="email" placeholder={L("Địa chỉ Email")} aria-label={L("Địa chỉ Email")} />
            <input className={authInpCls} name="password" type="password" required autoComplete="new-password" placeholder={L("Mật khẩu")} aria-label={L("Mật khẩu")} />
            <input className={authInpCls} name="confirmPassword" type="password" required autoComplete="new-password" placeholder={L("Nhập lại mật khẩu")} aria-label={L("Nhập lại mật khẩu")} />
            <button className={authBtnCls}>{L("Tạo tài khoản quản trị")}</button>
          </form>
        </div>
      </main>
    </div>
  );
}
