import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="text-6xl font-black text-slate-200">404</div>
      <h1 className="mt-3 text-2xl font-black text-slate-900">Không tìm thấy trang</h1>
      <p className="mt-2 max-w-md text-slate-500">Trang bạn tìm không tồn tại hoặc đã được di chuyển.</p>
      <Link href="/" className="btn btn-primary mt-6">Về trang chủ</Link>
    </div>
  );
}
