import { getCurrentUser, adminIpBlocked } from "@/lib/auth";
import { logoutAction } from "@/app/actions/auth";
import { getLang } from "@/lib/lang-server";
import { trd } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/** Trang báo chặn khi IP hiện tại không nằm trong whitelist khu quản trị.
 *  Trang này KHÔNG qua guard /admin nên người bị chặn vẫn đọc được lý do + đăng xuất.
 *  Dịch server-side bằng trd (trang độc lập, không có DisplayEngine bọc ngoài đáng tin). */
export default async function AdminBlockedPage() {
  const user = await getCurrentUser().catch(() => null);
  const wl = await adminIpBlocked().catch(() => ({ blocked: false, ip: "?", list: [] as string[] }));
  const lang = getLang();
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="card w-full max-w-md space-y-4 p-8 text-center">
        <div className="text-xl font-extrabold text-slate-900">{trd(lang, "Khu quản trị đã khoá theo IP")}</div>
        <p className="text-sm leading-relaxed text-slate-500">
          {trd(lang, "Địa chỉ IP hiện tại của bạn")} (<b className="font-mono text-slate-800">{wl.ip}</b>) {trd(lang, "không nằm trong danh sách IP được phép vào khu quản trị. Hãy kết nối từ một IP đã được duyệt, hoặc nhờ quản trị viên thêm IP này vào danh sách tại Admin → Bảo mật.")}
        </p>
        {user ? (
          <p className="text-xs text-slate-400">{trd(lang, "Đang đăng nhập:")} @{user.username} {trd(lang, "— khu khách hàng vẫn dùng bình thường.")}</p>
        ) : null}
        <div className="flex justify-center gap-3 pt-2">
          <a href="/dashboard" className="btn-primary">{trd(lang, "Về khu khách hàng")}</a>
          <form action={logoutAction}><button className="btn-ghost">{trd(lang, "Đăng xuất")}</button></form>
        </div>
      </div>
    </div>
  );
}
