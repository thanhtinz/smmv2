import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { authCardCls } from "@/lib/auth-ui";
import { verifyEmailByToken } from "@/lib/email-verify";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({ searchParams }: { searchParams: { token?: string } }) {
  const result = searchParams.token ? await verifyEmailByToken(searchParams.token) : "invalid";
  const { L } = await getServerI18n();
  return (
    <AuthShell>
      <div className={`${authCardCls} text-center`}>
        {result === "ok" ? (
          <>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-600">✓</div>
            <h1 className="text-2xl font-extrabold text-slate-900">{L("Đã xác thực email")}</h1>
            <p className="mt-2 text-sm text-slate-500">{L("Địa chỉ email của bạn đã được xác thực thành công.")}</p>
          </>
        ) : (
          <>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-2xl text-rose-600">!</div>
            <h1 className="text-2xl font-extrabold text-slate-900">{result === "expired" ? L("Liên kết đã hết hạn") : L("Liên kết không hợp lệ")}</h1>
            <p className="mt-2 text-sm text-slate-500">{L("Hãy đăng nhập rồi bấm \"Gửi lại email xác thực\" trong mục Hồ sơ để nhận liên kết mới.")}</p>
          </>
        )}
        <Link href="/dashboard/ho-so" className="btn-primary mt-6 inline-flex">{L("Về trang Hồ sơ")}</Link>
      </div>
    </AuthShell>
  );
}
