import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/components/site";
import { Flash } from "@/components/ui";
import { loginAction } from "@/app/actions/auth";

export default function LoginPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <SiteHeader />
      <main className="flex-1 flex items-center justify-center px-4 py-14">
        <div className="card p-8 w-full max-w-md">
          <h1 className="text-2xl font-extrabold text-slate-900">Đăng nhập</h1>
          <p className="text-sm text-slate-500 mt-1.5 mb-6">Vào bảng điều khiển để đặt đơn và quản lý số dư.</p>
          <Flash msg={searchParams.msg} err={searchParams.err} />
          <form action={loginAction} className="space-y-4">
            <div>
              <label className="lbl">Tên đăng nhập hoặc email</label>
              <input className="inp" name="login" required autoComplete="username" />
            </div>
            <div>
              <label className="lbl">Mật khẩu</label>
              <input className="inp" name="password" type="password" required autoComplete="current-password" />
            </div>
            <button className="btn-primary w-full !py-3">Đăng nhập</button>
          </form>
          <p className="text-sm text-slate-500 mt-6 text-center">Chưa có tài khoản? <Link href="/register" className="text-brand-600 font-semibold">Đăng ký miễn phí</Link></p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
