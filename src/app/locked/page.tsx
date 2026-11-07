import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { getSettings } from "@/lib/settings";
import { panelByHost } from "@/lib/panel-host";
import { authCardClass } from "@/lib/auth-style";
import { lockdownState } from "@/lib/lockdown";
import { I, AuthBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Trang thông báo khoá khẩn cấp (GĐ2): khách thường bị dẫn tới đây khi hệ thống
 *  đang khoá. Quản trị vẫn đăng nhập được bình thường qua /login. */
export default async function LockedPage() {
  const settings = await getSettings().catch(() => null);
  const panel = await panelByHost().catch(() => null);
  const style = panel?.authStyle || settings?.auth_style;
  const ld = await lockdownState();
  return (
    <AuthShell style={style} brandName={panel?.name || settings?.site_name || "SMMv2"} tagline={panel?.tagline || settings?.site_tagline} panel={panel ? { name: panel.name, slug: panel.slug } : undefined} announcement={panel?.announcement} accent={panel?.accent}>
      <div className={authCardClass(style)}>
        {ld.on ? <AuthBadge icon={I.lock} cls="bg-rose-50 text-rose-600 ring-rose-100" /> : <AuthBadge icon={I.check} cls="bg-emerald-50 text-emerald-600 ring-emerald-200" />}
        <h1 className="text-center text-2xl font-extrabold text-slate-900">Hệ thống đang tạm khoá</h1>
        <p className="mt-1.5 mb-6 text-center text-sm text-slate-500">
          {ld.on
            ? <>Để bảo vệ an toàn cho tài khoản và số dư của khách hàng, hệ thống đang tạm khoá khẩn cấp{ld.reason ? <>: <b className="text-slate-800">{ld.reason}</b></> : null}. Đăng nhập mới, đặt đơn, nạp tiền và mua hàng đang tạm dừng. Vui lòng quay lại sau.</>
            : <>Hệ thống hiện không còn ở trạng thái khoá. Bạn có thể đăng nhập và sử dụng bình thường.</>}
        </p>
        <Link href="/login" className="btn-primary w-full">Về trang đăng nhập</Link>
      </div>
    </AuthShell>
  );
}
