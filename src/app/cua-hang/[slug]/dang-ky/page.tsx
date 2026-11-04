import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { SiteHeader, SiteFooter } from "@/components/site";
import { Flash } from "@/components/ui";
import { panelRegisterAction } from "@/app/actions/auth";

export const dynamic = "force-dynamic";

export default async function PanelRegister({ params, searchParams }: { params: { slug: string }; searchParams: { err?: string; msg?: string } }) {
  const panel = await prisma.childPanel.findUnique({ where: { slug: params.slug } });
  if (!panel || panel.status !== "ACTIVE") notFound();
  return (
    <div data-accent={panel.accent}>
      <SiteHeader />
      <main className="max-w-md mx-auto px-4 py-12">
        <Flash msg={searchParams.msg} err={searchParams.err} />
        <div className="card p-7">
          <div className="w-12 h-12 rounded-2xl bg-brand-600 text-white font-black text-xl flex items-center justify-center">{panel.name.charAt(0).toUpperCase()}</div>
          <h1 className="mt-4 text-xl font-extrabold text-slate-900">Đăng ký tại {panel.name}</h1>
          <p className="text-sm text-slate-500 mt-1">Tài khoản của bạn thuộc về panel này và mua theo bảng giá của panel.</p>
          <form action={panelRegisterAction} className="mt-6 space-y-4">
            <input type="hidden" name="slug" value={panel.slug} />
            <div><label className="lbl">Tên đăng nhập</label><input className="inp" name="username" required autoComplete="username" /></div>
            <div><label className="lbl">Email</label><input className="inp" name="email" type="email" required autoComplete="email" /></div>
            <div><label className="lbl">Họ tên (tuỳ chọn)</label><input className="inp" name="fullName" /></div>
            <div><label className="lbl">Mật khẩu</label><input className="inp" name="password" type="password" required minLength={6} autoComplete="new-password" /></div>
            <button className="btn-primary w-full !py-3" type="submit">Tạo tài khoản</button>
          </form>
          <p className="text-sm text-slate-500 mt-5 text-center">Đã có tài khoản? <Link href="/login" className="text-brand-600 font-semibold">Đăng nhập</Link></p>
          <p className="text-xs text-slate-400 mt-2 text-center"><Link href={`/cua-hang/${panel.slug}`}>← Về trang panel</Link></p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
