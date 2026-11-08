import Link from "next/link";
import { getServerI18n } from "@/lib/lang-server";

export default async function NotFound() {
  const { L } = await getServerI18n();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="text-6xl font-black text-slate-200">404</div>
      <h1 className="mt-3 text-2xl font-black text-slate-900">{L("Không tìm thấy trang")}</h1>
      <p className="mt-2 max-w-md text-slate-500">{L("Trang bạn tìm không tồn tại hoặc đã được di chuyển.")}</p>
      <Link href="/" className="btn btn-primary mt-6">{L("Về trang chủ")}</Link>
    </div>
  );
}
