import Link from "next/link";
import { verifyEmailByToken } from "@/lib/email-verify";

export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({ searchParams }: { searchParams: { token?: string } }) {
  const result = searchParams.token ? await verifyEmailByToken(searchParams.token) : "invalid";
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="card w-full max-w-md p-8 text-center">
        {result === "ok" ? (
          <>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-600">✓</div>
            <h1 className="text-xl font-bold text-slate-900">Đã xác thực email</h1>
            <p className="mt-2 text-sm text-slate-500">Địa chỉ email của bạn đã được xác thực thành công.</p>
          </>
        ) : (
          <>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-2xl text-rose-600">!</div>
            <h1 className="text-xl font-bold text-slate-900">{result === "expired" ? "Liên kết đã hết hạn" : "Liên kết không hợp lệ"}</h1>
            <p className="mt-2 text-sm text-slate-500">Hãy đăng nhập rồi bấm &quot;Gửi lại email xác thực&quot; trong mục Hồ sơ để nhận liên kết mới.</p>
          </>
        )}
        <Link href="/dashboard/ho-so" className="btn-primary mt-6 inline-flex">Về trang Hồ sơ</Link>
      </div>
    </div>
  );
}
