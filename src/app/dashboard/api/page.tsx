import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PageHead, Flash } from "@/components/ui";
import { CopyBtn } from "@/components/client";
import { regenApiKeyAction } from "@/app/actions/user";

export default async function ApiPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const user = (await getCurrentUser())!;
  const s = await getSettings();
  const endpoint = `${process.env.NEXT_PUBLIC_SITE_URL || ""}/api/v2`;
  void s;
  return (
    <div className="max-w-3xl">
      <PageHead title="API đại lý" desc="Dùng key này để tích hợp panel của bạn hoặc công cụ tự động — chuẩn SMM API v2." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className="card p-6 space-y-5">
        <div>
          <label className="lbl">Endpoint</label>
          <div className="flex gap-2"><input className="inp font-mono" readOnly value={endpoint} /><CopyBtn text={endpoint} /></div>
        </div>
        <div>
          <label className="lbl">API Key của bạn</label>
          <div className="flex gap-2">
            <input className="inp font-mono" readOnly value={user.apiKey} />
            <CopyBtn text={user.apiKey} />
            <form action={regenApiKeyAction}><button className="btn-danger btn-sm !py-2.5 whitespace-nowrap">Đổi key mới</button></form>
          </div>
          <p className="text-xs text-slate-400 mt-2">Giữ key bí mật như mật khẩu. Đổi key sẽ làm key cũ hết hiệu lực ngay.</p>
        </div>
        <div>
          <div className="font-semibold text-slate-800 mb-2 text-sm">Ví dụ gọi nhanh</div>
          <pre className="bg-slate-950 text-slate-100 rounded-2xl p-4 text-xs overflow-x-auto">{`# Số dư
POST ${endpoint}
key=${user.apiKey}&action=balance

# Đặt đơn
key=...&action=add&service=12&link=https://...&quantity=1000

# Trạng thái
key=...&action=status&order=48213`}</pre>
        </div>
        <a href="/api-docs" className="btn-ghost">Xem tài liệu API đầy đủ</a>
      </div>
    </div>
  );
}
