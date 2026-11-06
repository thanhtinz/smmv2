import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { AuthShell } from "@/components/auth-shell";
import { getSettings } from "@/lib/settings";
import { authCardClass } from "@/lib/auth-style";
import { Flash } from "@/components/ui";
import { panelRegisterAction } from "@/app/actions/auth";

export const dynamic = "force-dynamic";

/** Đăng ký tại panel con — cùng khung với trang đăng ký của web mẹ */
export default async function PanelRegister({ params, searchParams }: { params: { slug: string }; searchParams: { err?: string; msg?: string; ref?: string } }) {
  const panel = await prisma.childPanel.findUnique({ where: { slug: params.slug } });
  if (!panel || panel.status !== "ACTIVE") notFound();
  const settings = await getSettings().catch(() => null);
  const style = panel.authStyle || settings?.auth_style;
  return (
    <AuthShell style={style} brandName={panel.name} tagline={panel.tagline} panel={{ name: panel.name, slug: panel.slug }} announcement={panel.announcement} accent={panel.accent}>
        <div className={authCardClass(style)}>
          <h1 className="text-2xl font-extrabold text-slate-900">Đăng ký tài khoản</h1>
          <p className="text-sm text-slate-500 mt-1.5 mb-6">Tại <b className="text-slate-700">{panel.name}</b> — tài khoản thuộc về panel này và mua theo bảng giá của panel.</p>
          <Flash msg={searchParams.msg} err={searchParams.err} />
          <form action={panelRegisterAction} className="space-y-4">
            <input type="hidden" name="slug" value={panel.slug} />
            <input type="hidden" name="ref" value={(searchParams.ref || "").trim().toUpperCase()} />
            <div>
              <label className="lbl">Tên đăng nhập *</label>
              <input className="inp" name="username" required autoComplete="username" placeholder="vd: nguyenvana" />
            </div>
            <div>
              <label className="lbl">Email *</label>
              <input className="inp" name="email" type="email" required autoComplete="email" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="lbl">Họ tên</label>
                <input className="inp" name="fullName" autoComplete="name" />
              </div>
              <div>
                <label className="lbl">Số điện thoại</label>
                <input className="inp" name="phone" autoComplete="tel" />
              </div>
            </div>
            <div>
              <label className="lbl">Mật khẩu *</label>
              <input className="inp" name="password" type="password" required minLength={6} autoComplete="new-password" />
            </div>
            <button className="btn-primary w-full !py-3">Đăng ký</button>
          </form>
          <p className="text-sm text-slate-500 mt-6 text-center">Đã có tài khoản? <Link href="/login" className="text-brand-600 font-semibold">Đăng nhập</Link></p>
          <p className="text-xs text-slate-400 mt-2 text-center"><Link href={`/cua-hang/${panel.slug}`}>← Về trang panel {panel.name}</Link></p>
        </div>
    </AuthShell>
  );
}
