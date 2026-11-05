import Link from "next/link";
import { SiteHeader, SiteFooter, PublicHeader } from "@/components/site";
import { Flash } from "@/components/ui";
import { registerAction } from "@/app/actions/auth";
import { prisma } from "@/lib/db";

export default async function RegisterPage({ searchParams }: { searchParams: { msg?: string; err?: string; ref?: string } }) {
  const ref = (searchParams.ref || "").trim().toUpperCase();
  const referrer = ref ? await prisma.user.findUnique({ where: { refCode: ref }, select: { username: true } }) : null;
  return (
    <div className="dark pub-dark bg-[#07090d] text-slate-300 min-h-screen flex flex-col">
      <PublicHeader />
      <main className="flex-1 flex items-center justify-center px-4 py-14">
        <div className="card p-8 w-full max-w-md">
          <h1 className="text-2xl font-extrabold text-slate-900">Đăng ký tài khoản</h1>
          <p className="text-sm text-slate-500 mt-1.5 mb-6">Miễn phí — có ngay API key cho đại lý sau khi đăng ký.</p>
          {referrer && <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm text-emerald-700">Bạn được <b>{referrer.username}</b> giới thiệu</div>}
          <Flash msg={searchParams.msg} err={searchParams.err} />
          <form action={registerAction} className="space-y-4">
            <input type="hidden" name="ref" value={referrer ? ref : ""} />
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
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
