import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/components/site";
import { Flash } from "@/components/ui";
import { registerAction } from "@/app/actions/auth";

export default function RegisterPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <SiteHeader />
      <main className="flex-1 flex items-center justify-center px-4 py-14">
        <div className="card p-8 w-full max-w-md">
          <h1 className="text-2xl font-extrabold text-slate-900">Đăng ký tài khoản</h1>
          <p className="text-sm text-slate-500 mt-1.5 mb-6">Miễn phí — có ngay API key cho đại lý sau khi đăng ký.</p>
          <Flash msg={searchParams.msg} err={searchParams.err} />
          <form action={registerAction} className="space-y-4">
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
